-- Whole-event photo package: always available, price set once in admin.
-- The package row is managed (auto=true, no horse/rider) and materialized on
-- demand at checkout; the global price lives in admin_settings so no manual
-- per-event package creation is needed. Empty value = auto rule per event.
-- Additive only.
INSERT INTO admin_settings (key, value) VALUES ('event_package_price_cents', '')
ON CONFLICT (key) DO NOTHING;

-- One managed whole-event package per event (race-free upsert at checkout).
CREATE UNIQUE INDEX IF NOT EXISTS packages_event_auto_uidx ON packages (event_id)
WHERE auto IS TRUE AND horse_id IS NULL AND rider_id IS NULL;
