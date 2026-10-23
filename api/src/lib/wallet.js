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
  const split = computeSplit(row.amount_cents, platform, organizer, !!ctx.organizer_id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE purchases SET platform_fee_cents = $2, photographer_payout_cents = $3,
          organizer_payout_cents = $4, organizer_id = $5
        WHERE id = $1 AND platform_fee_cents IS NULL`,
      [purchaseId, split.platformFee, split.photographerPayout, split.organizerPayout, ctx.organizer_id]
    );
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

module.exports = { computeSplit, getRates, resolvePurchaseContext, recordPurchaseSplit, markPurchasesPaid, reserveBalance, releaseHold, expireHolds };
