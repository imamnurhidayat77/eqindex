-- 067: prod-ready photographer display name.
-- The 053 seed used a 'TBC Photographer' placeholder which leaks into
-- buyer-facing surfaces (photo credits + baked-in preview watermarks).
-- Set the real studio name. Admin can rename later via SQL (no UI yet).
-- Idempotent: only touches the placeholder row.

UPDATE photographers SET name = 'Boss Media' WHERE name = 'TBC Photographer';
