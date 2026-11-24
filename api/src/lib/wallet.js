// Wallet ledger + purchase split (docs/WALLET_PLAN.md, P0).
// Money rule: 10 platform / 10 organizer / 80 photographer, fractions of
// gross, admin-configurable. Without an active organizer on the event the
// organizer share stays with the platform.

const DEFAULT_PLATFORM_RATE = 0.10;
const DEFAULT_ORGANIZER_RATE = 0.10;

// Pure math, unit-tested: platform absorbs rounding pennies.
function computeSplit(grossCents, platformRate, organizerRate, hasOrganizer) {
  const gross = Math.max(0, Math.round(Number(grossCents) || 0));
  const photographer = Math.round(gross * (1 - platformRate - organizerRate));
  const organizer = hasOrganizer ? Math.round(gross * organizerRate) : 0;
  return {
    photographerPayout: photographer,
    organizerPayout: organizer,
    platformFee: gross - photographer - organizer,
  };
}

function parseRate(v, fallback) {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

async function getRates(pool) {
  const { rows } = await pool.query(
    `SELECT key, value FROM admin_settings WHERE key = ANY($1)`,
    [['platform_commission_rate', 'organizer_share_rate']]
  ).catch(() => ({ rows: [] }));
  const get = (k) => rows.find((r) => r.key === k)?.value;
  let platform = parseRate(get('platform_commission_rate'), DEFAULT_PLATFORM_RATE);
  let organizer = parseRate(get('organizer_share_rate'), DEFAULT_ORGANIZER_RATE);
  if (platform + organizer > 1) { // never let the photographer go negative
    organizer = Math.max(0, 1 - platform);
  }
  return { platform, organizer };
}

// Resolve which event (and organizer) a purchase belongs to, across all
// four item types. Returns { event_id, organizer_id, organizer_user_id }
// with nulls when unresolvable — never throws for missing links.
async function resolvePurchaseContext(pool, purchase) {
  const empty = { event_id: null, organizer_id: null, organizer_user_id: null };
  try {
    let eventId = null;
    if (purchase.media_id) {
      const r = await pool.query('SELECT event_id FROM media WHERE id = $1', [purchase.media_id]);
      eventId = r.rows[0]?.event_id || null;
    } else if (purchase.package_id) {
      const r = await pool.query('SELECT event_id FROM packages WHERE id = $1', [purchase.package_id]);
      eventId = r.rows[0]?.event_id || null;
    } else if (purchase.reel_order_id) {
      const r = await pool.query('SELECT event_id FROM reel_orders WHERE id = $1', [purchase.reel_order_id]);
      eventId = r.rows[0]?.event_id || null;
    } else if (purchase.credit_bundle_id) {
      const r = await pool.query('SELECT event_id FROM credit_bundles WHERE id = $1', [purchase.credit_bundle_id]);
      eventId = r.rows[0]?.event_id || null;
    }
    if (!eventId) return empty;
    const o = await pool.query(
      `SELECT o.id AS organizer_id, o.user_id AS organizer_user_id
         FROM events e JOIN organizers o ON o.id = e.organizer_id
        WHERE e.id = $1 AND o.is_active`,
      [eventId]
    );
    if (!o.rows.length) return { ...empty, event_id: eventId };
    return { event_id: eventId, organizer_id: o.rows[0].organizer_id, organizer_user_id: o.rows[0].organizer_user_id };
  } catch (e) {
    // Never fail a paid purchase over this: log loudly so a skipped
    // organizer share gets noticed and can be backfilled.
    console.error('[wallet] resolvePurchaseContext failed:', e.message);
    return empty;
  }
}

// Record the immutable split for a paid purchase and credit the organizer
// wallet. Idempotent: no-ops when platform_fee_cents is already set.
// Must be called right after the pending -> paid transition.
async function recordPurchaseSplit(pool, purchaseId, { rates } = {}) {
  const p = await pool.query('SELECT * FROM purchases WHERE id = $1', [purchaseId]);
  const row = p.rows[0];
  if (!row || row.status !== 'paid' || row.platform_fee_cents !== null) return null;
  const { platform, organizer } = rates || await getRates(pool);
  const ctx = await resolvePurchaseContext(pool, row);
  // Sponsor discount (Option 2): the photographer is paid on the FULL
  // original price; the platform absorbs the discount out of its own fee
  // and underwrites collection from the sponsor (billed later).
  const gross = row.original_amount_cents || row.amount_cents;
  const discount = row.sponsor_budget_id ? Math.max(0, gross - row.amount_cents) : 0;
  const split = computeSplit(gross, platform, organizer, !!ctx.organizer_id);
  split.platformFee = gross - split.photographerPayout - split.organizerPayout - discount;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE purchases SET platform_fee_cents = $2, photographer_payout_cents = $3,
          organizer_payout_cents = $4, organizer_id = $5
        WHERE id = $1 AND platform_fee_cents IS NULL`,
      [purchaseId, split.platformFee, split.photographerPayout, split.organizerPayout, ctx.organizer_id]
    );
    if (row.sponsor_budget_id && discount > 0) {
      // Lock the budget so concurrent paid purchases can't overspend it.
      const b = await client.query('SELECT * FROM sponsor_budgets WHERE id = $1 FOR UPDATE', [row.sponsor_budget_id]);
      if (b.rows.length && b.rows[0].status === 'active') {
        const remaining = Number(b.rows[0].agreed_cents) - Number(b.rows[0].spent_cents);
        const applied = Math.min(discount, Math.max(0, remaining));
        await client.query('UPDATE sponsor_budgets SET spent_cents = spent_cents + $2 WHERE id = $1', [row.sponsor_budget_id, applied]);
        await client.query(
          `INSERT INTO sponsored_redemptions (purchase_id, budget_id, discount_cents)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [purchaseId, row.sponsor_budget_id, applied]
        );
      }
    }
    if (split.organizerPayout > 0 && ctx.organizer_user_id) {
      const cur = await client.query('SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE', [ctx.organizer_user_id]);
      if (cur.rows.length) {
        const after = Number(cur.rows[0].balance_cents) + split.organizerPayout;
        await client.query('UPDATE users SET balance_cents = $2 WHERE id = $1', [ctx.organizer_user_id, after]);
        await client.query(
          `INSERT INTO wallet_transactions
             (user_id, kind, amount_cents, balance_after_cents, purchase_id)
           VALUES ($1, 'organizer_share', $2, $3, $4)`,
          [ctx.organizer_user_id, split.organizerPayout, after, purchaseId]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return { ...split, organizer_id: ctx.organizer_id };
}

// Shared paid-transition side effects: webhook (single + batch) and inline
// full-balance payment. Marks pending -> paid, bumps media counters, flips
// service rows, records the 10/10/80 split. Returns the paid purchase rows.
async function markPurchasesPaid(pool, ids, { paymentIntent = null, auditFn = null } = {}) {
  const { rows } = await pool.query(
    `UPDATE purchases SET status = 'paid', stripe_payment_intent = COALESCE(stripe_payment_intent, $2)
      WHERE id = ANY($1::UUID[]) AND status = 'pending' RETURNING id, media_id, package_id`,
    [ids, paymentIntent]
  );
  for (const r of rows) {
    await pool.query(
      `UPDATE media SET purchase_count = purchase_count + 1 WHERE id = $1
        OR id IN (SELECT media_id FROM package_items WHERE package_id = $2)`,
      [r.media_id, r.package_id]
    );
    await pool.query(
      `UPDATE reel_orders SET status = 'pending' WHERE purchase_id = $1 AND status = 'awaiting_payment'`,
      [r.id]
    ).catch(() => {});
    await pool.query(
      `UPDATE credit_bundles SET status = 'active' WHERE purchase_id = $1 AND status = 'awaiting_payment'`,
      [r.id]
    ).catch(() => {});
    try {
      await recordPurchaseSplit(pool, r.id);
    } catch (e) { console.error('[paid] split failed:', e.message); }
  }
  if (rows.length && auditFn) await auditFn(rows);
  return rows;
}

// Reserve balance for a pending purchase. MUST run inside the caller's DB
// transaction after that transaction locked the user row
// (SELECT ... FOR UPDATE). Sufficiency is measured against balance MINUS
// holds from the user's other pending purchases, so concurrent checkouts
// can't overspend the same cents.
async function reserveBalance(client, userId, amountCents, purchaseId) {
  const amt = Math.round(Number(amountCents) || 0);
  if (amt <= 0) return 0;
  const held = await client.query(
    `SELECT COALESCE(SUM(balance_used_cents), 0)::INT AS held FROM purchases
      WHERE buyer_user_id = $1 AND status = 'pending' AND id <> $2`,
    [userId, purchaseId]
  );
  const bal = await client.query('SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE', [userId]);
  if (!bal.rows.length) throw Object.assign(new Error('account not found'), { status: 404 });
  const available = Number(bal.rows[0].balance_cents) - Number(held.rows[0].held);
  if (amt > available) {
    throw Object.assign(new Error('insufficient balance for this checkout'), { status: 409 });
  }
  const after = Number(bal.rows[0].balance_cents) - amt;
  await client.query('UPDATE users SET balance_cents = $2 WHERE id = $1', [userId, after]);
  await client.query(
    `INSERT INTO wallet_transactions (user_id, kind, amount_cents, balance_after_cents, purchase_id)
     VALUES ($1, 'spend', $2, $3, $4)`,
    [userId, -amt, after, purchaseId]
  );
  return amt;
}

// Release an unpaid hold: cancel the pending purchase and return the
// reserved balance. Recorded as 'refund' with an explicit reason — this is
// a hold release, never a refund of a completed payment (those stay final).
async function releaseHold(pool, purchaseId, reason) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const p = await client.query(
      `SELECT buyer_user_id, balance_used_cents FROM purchases WHERE id = $1 AND status = 'pending'`,
      [purchaseId]
    );
    const row = p.rows[0];
    const amt = Number(row?.balance_used_cents) || 0;
    if (!row || amt <= 0) {
      await client.query('ROLLBACK');
      return null;
    }
    const bal = await client.query('SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE', [row.buyer_user_id]);
    if (!bal.rows.length) {
      await client.query('ROLLBACK');
      return null;
    }
    const after = Number(bal.rows[0].balance_cents) + amt;
    await client.query('UPDATE users SET balance_cents = $2 WHERE id = $1', [row.buyer_user_id, after]);
    await client.query(
      `INSERT INTO wallet_transactions (user_id, kind, amount_cents, balance_after_cents, purchase_id, reason)
       VALUES ($1, 'refund', $2, $3, $4, $5)`,
      [row.buyer_user_id, amt, after, purchaseId, reason || 'cancelled unpaid hold']
    );
    await client.query(`UPDATE purchases SET status = 'cancelled', balance_used_cents = 0 WHERE id = $1`, [purchaseId]);
    await client.query('COMMIT');
    return { refunded_cents: amt };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Janitor: release unpaid holds older than maxAgeHours (default 24, past any
// realistic Stripe redirect). Best-effort; callers ignore failures.
async function expireHolds(pool, maxAgeHours = 24) {
  const { rows } = await pool.query(
    `SELECT id FROM purchases WHERE status = 'pending' AND balance_used_cents > 0
      AND created_at < NOW() - ($1 || ' hours')::INTERVAL LIMIT 100`,
    [String(maxAgeHours)]
  ).catch(() => ({ rows: [] }));
  let n = 0;
  for (const r of rows) {
    try {
      const out = await releaseHold(pool, r.id, 'expired unpaid hold');
      if (out) n++;
    } catch (e) { console.error('[wallet] expire hold failed:', e.message); }
  }
  return n;
}

// Sponsor discounts are pre-agreed budgets billed to the sponsor later, so
// the platform fronts the money. Cap one discount at half the price so a
// sponsor setting can never give photos away (Charles/Imam, 2026-11-24).
const MAX_SPONSOR_DISCOUNT_RATE = 0.5;
function cappedSponsorDiscount(discountCents, priceCents) {
  const d = Math.round(Number(discountCents) || 0);
  const cap = Math.floor((Number(priceCents) || 0) * MAX_SPONSOR_DISCOUNT_RATE);
  return Math.max(0, Math.min(d, cap));
}

// SQL guard every "is this budget spendable" query shares (alias b).
const SPONSOR_BUDGET_LIVE_SQL = "b.status = 'active' AND (b.ends_on IS NULL OR b.ends_on >= CURRENT_DATE)";
// A budget funds either photo or merchandise discounts (migration 109).
const SPONSOR_BUDGET_KINDS = ['photo', 'merch'];
const budgetKindOf = (v) => (SPONSOR_BUDGET_KINDS.includes(v) ? v : 'photo');

// Late organizer claim: sales at an event with no linked organizer keep the
// organizer share inside platform_fee_cents. When an admin links an
// organizer within ORGANIZER_CLAIM_DAYS after the event ends, that share
// moves from the platform to the organizer. After the window it stays with
// the platform. Uses the current organizer rate (sale-time rate isn't stored).
const ORGANIZER_CLAIM_DAYS = 90;

// Pure: the share to move for one purchase, capped by what the platform
// actually kept (a sponsor discount can shrink the platform fee).
function lateOrganizerShare(grossCents, platformFeeCents, organizerRate) {
  const share = Math.round(Math.max(0, Number(grossCents) || 0) * (Number(organizerRate) || 0));
  return Math.max(0, Math.min(share, Number(platformFeeCents) || 0));
}

// Idempotent: purchases that already carry an organizer_id are skipped, so
// re-linking or relinking to someone else never pays twice.
async function releaseLateOrganizerShares(pool, eventId, { rates } = {}) {
  const { organizer: rate } = rates || await getRates(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `SELECT o.id AS organizer_id, o.user_id,
          (COALESCE(e.date_end, e.date_start) + $2::INT >= CURRENT_DATE) AS in_window
         FROM events e JOIN organizers o ON o.id = e.organizer_id
        WHERE e.id = $1 AND o.is_active`,
      [eventId, ORGANIZER_CLAIM_DAYS]);
    const org = ev.rows[0];
    if (!org || !org.in_window || !org.user_id || rate <= 0) {
      await client.query('ROLLBACK');
      return { released: 0, cents: 0, in_window: !!org?.in_window };
    }
    const { rows } = await client.query(
      `SELECT p.id, COALESCE(p.original_amount_cents, p.amount_cents) AS gross, p.platform_fee_cents
         FROM purchases p
        WHERE p.status = 'paid' AND p.organizer_id IS NULL AND p.platform_fee_cents IS NOT NULL
          AND (p.media_id IN (SELECT id FROM media WHERE event_id = $1)
            OR p.package_id IN (SELECT id FROM packages WHERE event_id = $1)
            OR p.reel_order_id IN (SELECT id FROM reel_orders WHERE event_id = $1)
            OR p.credit_bundle_id IN (SELECT id FROM credit_bundles WHERE event_id = $1))
        FOR UPDATE OF p`,
      [eventId]);
    const bal = await client.query('SELECT balance_cents FROM users WHERE id = $1 FOR UPDATE', [org.user_id]);
    if (!bal.rows.length) { await client.query('ROLLBACK'); return { released: 0, cents: 0, in_window: true }; }
    let balance = Number(bal.rows[0].balance_cents);
    let released = 0, cents = 0;
    for (const r of rows) {
      const share = lateOrganizerShare(r.gross, r.platform_fee_cents, rate);
      await client.query(
        `UPDATE purchases SET organizer_id = $2, organizer_payout_cents = $3,
            platform_fee_cents = platform_fee_cents - $3 WHERE id = $1`,
        [r.id, org.organizer_id, share]);
      if (share <= 0) continue;
      balance += share;
      await client.query(
        `INSERT INTO wallet_transactions (user_id, kind, amount_cents, balance_after_cents, purchase_id, event_id, reason)
         VALUES ($1, 'organizer_share', $2, $3, $4, $5, 'late claim: sale before your account was linked')`,
        [org.user_id, share, balance, r.id, eventId]);
      released++; cents += share;
    }
    await client.query('UPDATE users SET balance_cents = $2 WHERE id = $1', [org.user_id, balance]);
    await client.query('COMMIT');
    return { released, cents, in_window: true };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { computeSplit, getRates, resolvePurchaseContext, recordPurchaseSplit, markPurchasesPaid, reserveBalance, releaseHold, expireHolds,
  ORGANIZER_CLAIM_DAYS, lateOrganizerShare, releaseLateOrganizerShares,
  MAX_SPONSOR_DISCOUNT_RATE, cappedSponsorDiscount, SPONSOR_BUDGET_LIVE_SQL, SPONSOR_BUDGET_KINDS, budgetKindOf };
