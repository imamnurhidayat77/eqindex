-- EQIndex security hardening — migration 034
-- Supabase flagged every public table as publicly accessible (RLS off +
-- full grants to anon/authenticated → anyone with the project URL + anon
-- key could read/write/delete everything via PostgREST).
--
-- All app traffic goes through the Node API as role `postgres`
-- (BYPASSRLS) — never via PostgREST/Supabase Auth — so locking down
-- anon/authenticated does not affect the app:
--   1. ENABLE ROW LEVEL SECURITY on every public table (no permissive
--      policies = deny-all for anon/authenticated).
--   2. REVOKE ALL on existing tables/views/sequences/functions from
--      anon + authenticated (defense in depth; also locks down the
--      postgres-owned views, which otherwise run with owner rights and
--      bypass underlying RLS).
--   3. Strip anon/authenticated from DEFAULT PRIVILEGES so future
--      migrations don't silently re-expose new objects.
-- service_role grants are intentionally left untouched (Supabase
-- dashboard + admin tooling).

-- ---- 1. RLS on (deny by default: zero permissive policies) ----
ALTER TABLE public.admin_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.breeder_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correction_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horse_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.series_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- ---- 2. Revoke existing grants (tables incl. views, sequences, functions) ----
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;

-- ---- 3. Fix default privileges for future objects ----
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
-- NOTE: defaults owned by supabase_admin can only be changed by a
-- superuser via the Supabase dashboard SQL editor; all repo migrations
-- run as postgres, so the rules above cover every object we create.
