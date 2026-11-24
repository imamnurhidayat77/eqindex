-- 104: community moments go live only after Boss Media branding.
-- Additive only, idempotent. Approve marks the draft brand_queued_at; the
-- background job brands it, then flips it to published. A failed brand
-- clears the mark and records brand_error, so the draft returns to the
-- review queue instead of going public unbranded.
ALTER TABLE media ADD COLUMN IF NOT EXISTS brand_queued_at TIMESTAMPTZ NULL;
ALTER TABLE media ADD COLUMN IF NOT EXISTS brand_error TEXT NULL;
