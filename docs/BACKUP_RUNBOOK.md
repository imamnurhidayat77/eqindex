# Backup & Restore Runbook — EQIndex

Status observed 2026-10-27 (dev DB probe): Postgres 17, `archive_mode=on`,
`wal_level=logical`, WALs archiving. R2 versioning: UNKNOWN (API token
lacks `GetBucketVersioning` — check in Cloudflare dashboard).

## What protects us today

- DB: WAL archiving is on → point-in-time recovery is possible IF the
  provider retains WAL + base backups (confirm below).
- Files: R2 only (no local disk). `mediaStore.deleteKeys` is permanent.

## Verify once (dashboard, 15 min)

1. DB provider console → confirm automated backups ON + retention ≥ 7 days
   + PITR window. Screenshot the settings into this doc.
2. Cloudflare R2 → bucket → Settings → Object versioning ON (protects
   against overwrite/delete accidents and bad deploys).
3. Confirm `STRIPE_WEBHOOK_SECRET` + `RESEND_API_KEY` + R2 keys exist
   outside the DB (password manager) — a DB restore without secrets
   is a dead shop.

## Manual snapshot (before risky migrations)

```bash
pg_dump "$DATABASE_URL" -Fc -f eqindex-$(date +%F).dump
# restore drill (throwaway DB!):
# createdb eqindex_restore && pg_restore -d eqindex_restore eqindex-YYYY-MM-DD.dump
```

## Restore drill (quarterly, 30 min)

1. Restore latest backup to `eqindex_restore`.
2. `SELECT COUNT(*) FROM purchases/media/users/reel_orders` matches prod ± drift.
3. Pick 1 paid purchase → confirm its R2 original key still HEADs.
4. Record date + result here.

## RPO / RTO targets

- RPO ≤ 24h (daily base + WAL), RTO ≤ 2h (restore + redeploy + DNS).
- Money tables (`purchases`, `wallet_transactions`, `reel_orders`)
  reconcile against Stripe dashboard after any restore.
