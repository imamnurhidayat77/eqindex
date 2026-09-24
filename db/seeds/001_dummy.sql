-- Seed dummy: 1 event + 1 class + 1 horse + 1 rider + 1 round (validasi Step 1)

INSERT INTO users (id, name, email, role) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Seed Admin', 'admin@eqindex.local', 'ADMIN')
ON CONFLICT (id) DO NOTHING;

INSERT INTO horses (id, name, normalized_name, age, breed, gender, sire, dam, breeder, owner_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Count Contend', 'COUNT CONTEND', 10, 'Warmblood', 'Gelding', 'Contendro', 'Annie', 'Seed Breeder',
   '11111111-1111-1111-1111-111111111111')
ON CONFLICT (id) DO NOTHING;

INSERT INTO riders (id, name, normalized_name, region) VALUES
  ('33333333-3333-3333-3333-333333333333', 'Marco Wowiling', 'MARCO WOWILING', 'DK Jakarta')
ON CONFLICT (id) DO NOTHING;

INSERT INTO events (id, name, date_start, date_end, venue, venue_country, region, arena_type, season, source, external_show_id, external_event_id) VALUES
  ('44444444-4444-4444-4444-444444444444', 'FEI CSI1*-W SEA League Pulomas', '2025-06-19', '2025-06-22',
   'Jakarta International Equestrian Park', 'IDN', 'DK Jakarta', 'Outdoor', '2025-2026', 'CSV', 'seed-show-001', 'seed-event-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO classes (id, event_id, name, class_date, height_cm, level, field_size, source, external_class_id) VALUES
  ('55555555-5555-5555-5555-555555555555', '44444444-4444-4444-4444-444444444444',
   'CSI1*-W 140cm Jump Off', '2025-06-22', 140, 'FEI Art. 238.2.2', 9, 'CSV', 'seed-class-001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO raw_results (id, source, external_show_id, external_class_id, source_result_id, payload, status) VALUES
  ('66666666-6666-6666-6666-666666666666', 'CSV', 'seed-show-001', 'seed-class-001', 'seed-row-001',
   '{"rider": "Marco Wowiling", "horse": "Count Contend", "jump_faults": 0, "time_faults": 0, "time_seconds": 78.45, "placing": 1}'::jsonb,
   'cleaned')
ON CONFLICT (id) DO NOTHING;

INSERT INTO round_results (id, event_id, class_id, horse_id, rider_id, jump_faults, time_faults, total_faults, time_seconds, finish_place, clear_round, height_cm, source, source_result_id, raw_result_id) VALUES
  ('77777777-7777-7777-7777-777777777777', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555',
   '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   0, 0, 0, 78.45, 1, TRUE, 140, 'CSV', 'seed-row-001', '66666666-6666-6666-6666-666666666666')
ON CONFLICT (id) DO NOTHING;

INSERT INTO training_records (horse_id, rider_id, date, type, intensity, notes, created_by) VALUES
  ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
   '2025-06-18', 'Jumping gridwork', 'Medium', 'Seed training session', '11111111-1111-1111-1111-111111111111')
ON CONFLICT DO NOTHING;
