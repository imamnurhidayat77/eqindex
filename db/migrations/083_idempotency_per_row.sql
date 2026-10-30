-- 083: idempotency keys are per-cart-per-buyer, but each cart holds MANY
-- purchase rows sharing one key. The old global UNIQUE(idempotency_key)
-- 500'd every multi-item batch/combined checkout on the 2nd row.
-- Scope uniqueness to the row identity instead; replay protection stays in
-- the endpoint pre-checks (pending/paid lookup by key+buyer).
DROP INDEX IF EXISTS purchases_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_idempotency_key
  ON purchases (idempotency_key, buyer_user_id, media_id, package_id)
  WHERE idempotency_key IS NOT NULL;
-- NOTE: NULLs never conflict in Postgres, so reel/credit rows (which key
-- off reel_order_id / credit_bundle_id, covered by their endpoints' own
-- SELECT reuse checks) are unaffected.
