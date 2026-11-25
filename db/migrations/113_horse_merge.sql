-- Merge a duplicate horse into the real one, with an exact undo.
-- merge_horse(from, into, actor) moves every reference (results, media,
-- packages, watchlists, notes, aliases...) from the duplicate to the kept
-- horse, fills the kept horse's empty profile fields from the duplicate,
-- records the old name as an alias (future imports land on the kept horse),
-- deletes the duplicate and stores everything needed to reverse it in
-- horse_merges. unmerge_horse(merge_id) puts it all back.
-- Run inside the caller's transaction: a "preview" is merge + ROLLBACK.
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).

CREATE TABLE IF NOT EXISTS horse_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id UUID NOT NULL,
  into_id UUID NOT NULL,
  from_slug TEXT,
  from_row JSONB NOT NULL,          -- full deleted horse row
  filled JSONB NOT NULL,            -- kept-horse fields filled from the duplicate
  moved JSONB NOT NULL,             -- {table: [ids]} re-pointed rows
  removed JSONB NOT NULL,           -- rows deleted because the kept horse already had them
  alias_id UUID,                    -- alias row added for the old name
  merged_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ,
  undone_by UUID
);
CREATE INDEX IF NOT EXISTS horse_merges_from_idx ON horse_merges (from_id) WHERE undone_at IS NULL;
CREATE INDEX IF NOT EXISTS horse_merges_slug_idx ON horse_merges (from_slug) WHERE undone_at IS NULL;
ALTER TABLE horse_merges ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION merge_horse(p_from UUID, p_into UUID, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_from horses%ROWTYPE;
  v_into horses%ROWTYPE;
  v_moved JSONB := '{}'::JSONB;
  v_removed JSONB := '{}'::JSONB;
  v_filled JSONB := '{}'::JSONB;
  v_ids JSONB;
  v_clash INT;
  v_alias UUID;
  v_id UUID;
  f TEXT;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'cannot merge a horse into itself'; END IF;
  SELECT * INTO v_from FROM horses WHERE id = p_from FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'duplicate horse not found'; END IF;
  SELECT * INTO v_into FROM horses WHERE id = p_into FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'horse to keep not found'; END IF;

  -- Same horse + rider twice in one class would break the results table.
  SELECT COUNT(*) INTO v_clash FROM round_results a JOIN round_results b
    ON a.class_id = b.class_id AND a.rider_id = b.rider_id
    WHERE a.horse_id = p_from AND b.horse_id = p_into;
  IF v_clash > 0 THEN
    RAISE EXCEPTION 'both horses have a result in the same class with the same rider (% rows): fix those results first', v_clash;
  END IF;
  SELECT COUNT(*) INTO v_clash FROM packages a JOIN packages b
    ON a.event_id = b.event_id AND a.auto AND b.auto AND a.rider_id IS NULL AND b.rider_id IS NULL
    WHERE a.horse_id = p_from AND b.horse_id = p_into;
  IF v_clash > 0 THEN
    RAISE EXCEPTION 'both horses have an automatic photo package for the same event (% rows)', v_clash;
  END IF;

  -- Plain re-points (rows keyed by id).
  WITH m AS (UPDATE round_results SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('round_results', v_ids);
  WITH m AS (UPDATE health_records SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('health_records', v_ids);
  WITH m AS (UPDATE training_records SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('training_records', v_ids);
  WITH m AS (UPDATE media SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('media', v_ids);
  WITH m AS (UPDATE packages SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('packages', v_ids);
  WITH m AS (UPDATE credit_bundles SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('credit_bundles', v_ids);
  WITH m AS (UPDATE horse_aliases SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('horse_aliases', v_ids);
  WITH m AS (UPDATE correction_reports SET entity_id = p_into::TEXT
      WHERE entity_type = 'horse' AND entity_id = p_from::TEXT RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('correction_reports', v_ids);
  -- claimed_photos is keyed by (user_id, media_id).
  WITH m AS (UPDATE claimed_photos SET claimed_horse_id = p_into WHERE claimed_horse_id = p_from RETURNING user_id, media_id)
    SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', user_id, 'media_id', media_id)), '[]') INTO v_ids FROM m;
  v_moved := v_moved || jsonb_build_object('claimed_photos', v_ids);

  -- Watchlists: a user who already follows the kept horse keeps one row.
  WITH d AS (
    DELETE FROM watchlist_items w WHERE w.entity_type = 'horse' AND w.entity_id = p_from
      AND EXISTS (SELECT 1 FROM watchlist_items x WHERE x.user_id = w.user_id AND x.entity_type = 'horse' AND x.entity_id = p_into)
    RETURNING to_jsonb(w.*) AS r)
    SELECT COALESCE(jsonb_agg(r), '[]') INTO v_ids FROM d; v_removed := v_removed || jsonb_build_object('watchlist_items', v_ids);
  WITH d AS (
    DELETE FROM watchlist_items w WHERE w.entity_type = 'combination' AND w.horse_id = p_from
      AND EXISTS (SELECT 1 FROM watchlist_items x WHERE x.user_id = w.user_id AND x.entity_type = 'combination' AND x.horse_id = p_into AND x.rider_id = w.rider_id)
    RETURNING to_jsonb(w.*) AS r)
    SELECT COALESCE(v_removed->'watchlist_items', '[]') || COALESCE(jsonb_agg(r), '[]') INTO v_ids FROM d;
  v_removed := v_removed || jsonb_build_object('watchlist_items', v_ids);
  WITH m AS (UPDATE watchlist_items SET entity_id = p_into WHERE entity_type = 'horse' AND entity_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('watchlist_entity', v_ids);
  WITH m AS (UPDATE watchlist_items SET horse_id = p_into WHERE horse_id = p_from RETURNING id)
    SELECT COALESCE(jsonb_agg(id), '[]') INTO v_ids FROM m; v_moved := v_moved || jsonb_build_object('watchlist_horse', v_ids);

  -- Old rank snapshots of the duplicate mean nothing once merged.
  WITH d AS (DELETE FROM ranking_snapshots s WHERE s.entity_type = 'horse' AND s.entity_id = p_from RETURNING to_jsonb(s.*) AS r)
    SELECT COALESCE(jsonb_agg(r), '[]') INTO v_ids FROM d; v_removed := v_removed || jsonb_build_object('ranking_snapshots', v_ids);

  -- Fill empty profile fields on the kept horse (curated values always win).
  FOREACH f IN ARRAY ARRAY['age','breed','gender','sire','dam','damsire','breeder','fei_id','year_of_birth','color','height','country','image_url','owner_id'] LOOP
    IF to_jsonb(v_into)->f IS NULL OR to_jsonb(v_into)->>f IS NULL THEN
      IF to_jsonb(v_from)->>f IS NOT NULL THEN
        v_filled := v_filled || jsonb_build_object(f, to_jsonb(v_from)->f);
      END IF;
    END IF;
  END LOOP;
  -- fei_id is UNIQUE: free it on the duplicate before copying.
  IF v_filled ? 'fei_id' THEN UPDATE horses SET fei_id = NULL WHERE id = p_from; END IF;
  -- Typed copy via jsonb_populate_record, so no per-column casts.
  FOR f IN SELECT jsonb_object_keys(v_filled) LOOP
    EXECUTE format('UPDATE horses SET %1$I = COALESCE(%1$I, (jsonb_populate_record(NULL::horses, $2)).%1$I) WHERE id = $1', f)
      USING p_into, v_filled;
  END LOOP;

  -- Old name becomes an alias so future imports land on the kept horse.
  -- (source MANUAL: the source CHECK only allows FEI/EQUIPE/ESNZ/CSV/MANUAL;
  -- horse_merges.alias_id marks it as ours for undo.)
  INSERT INTO horse_aliases (horse_id, alias, normalized_alias, source)
    VALUES (p_into, v_from.name, v_from.normalized_name, 'MANUAL')
    ON CONFLICT (normalized_alias, source) DO NOTHING
    RETURNING id INTO v_alias;

  DELETE FROM horses WHERE id = p_from;

  INSERT INTO horse_merges (from_id, into_id, from_slug, from_row, filled, moved, removed, alias_id, merged_by)
    VALUES (p_from, p_into, v_from.slug, to_jsonb(v_from), v_filled, v_moved, v_removed, v_alias, p_actor)
    RETURNING id INTO v_id;

  RETURN jsonb_build_object('merge_id', v_id, 'filled', v_filled,
    'moved', (SELECT jsonb_object_agg(k, jsonb_array_length(v)) FROM jsonb_each(v_moved) AS e(k, v)),
    'removed', (SELECT jsonb_object_agg(k, jsonb_array_length(v)) FROM jsonb_each(v_removed) AS e(k, v)));
END;
$$;

CREATE OR REPLACE FUNCTION unmerge_horse(p_merge UUID, p_actor UUID)
RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  m horse_merges%ROWTYPE;
  f TEXT;
BEGIN
  SELECT * INTO m FROM horse_merges WHERE id = p_merge FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'merge not found'; END IF;
  IF m.undone_at IS NOT NULL THEN RAISE EXCEPTION 'merge already undone'; END IF;
  IF NOT EXISTS (SELECT 1 FROM horses WHERE id = m.into_id) THEN
    RAISE EXCEPTION 'the kept horse was merged or deleted later: undo that first';
  END IF;

  -- Bring the duplicate back (fei_id restored after the kept horse lets go).
  INSERT INTO horses SELECT * FROM jsonb_populate_record(NULL::horses, m.from_row - 'fei_id');

  UPDATE round_results SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'round_results'))::UUID);
  UPDATE health_records SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'health_records'))::UUID);
  UPDATE training_records SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'training_records'))::UUID);
  UPDATE media SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'media'))::UUID);
  UPDATE packages SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'packages'))::UUID);
  UPDATE credit_bundles SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'credit_bundles'))::UUID);
  UPDATE horse_aliases SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'horse_aliases'))::UUID);
  UPDATE correction_reports SET entity_id = m.from_id::TEXT WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'correction_reports'))::UUID);
  UPDATE claimed_photos c SET claimed_horse_id = m.from_id
    FROM jsonb_array_elements(m.moved->'claimed_photos') x
    WHERE c.user_id = (x->>'user_id')::UUID AND c.media_id = (x->>'media_id')::UUID;
  UPDATE watchlist_items SET entity_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'watchlist_entity'))::UUID);
  UPDATE watchlist_items SET horse_id = m.from_id WHERE id IN (SELECT (jsonb_array_elements_text(m.moved->'watchlist_horse'))::UUID);
  INSERT INTO watchlist_items SELECT * FROM jsonb_populate_recordset(NULL::watchlist_items, COALESCE(m.removed->'watchlist_items', '[]'))
    ON CONFLICT DO NOTHING;
  INSERT INTO ranking_snapshots SELECT * FROM jsonb_populate_recordset(NULL::ranking_snapshots, COALESCE(m.removed->'ranking_snapshots', '[]'))
    ON CONFLICT DO NOTHING;

  -- Give back the profile fields that were copied over (only if unchanged since).
  FOR f IN SELECT jsonb_object_keys(m.filled) LOOP
    EXECUTE format('UPDATE horses SET %I = NULL WHERE id = $1 AND %I::TEXT = $2', f, f)
      USING m.into_id, m.filled->>f;
  END LOOP;
  IF m.from_row ? 'fei_id' AND m.from_row->>'fei_id' IS NOT NULL THEN
    UPDATE horses SET fei_id = m.from_row->>'fei_id' WHERE id = m.from_id;
  END IF;
  IF m.alias_id IS NOT NULL THEN DELETE FROM horse_aliases WHERE id = m.alias_id; END IF;

  UPDATE horse_merges SET undone_at = NOW(), undone_by = p_actor WHERE id = p_merge;
  RETURN jsonb_build_object('restored', m.from_id);
END;
$$;
