// API smoke test: verifies every endpoint family responds with the expected
// shape against a running API (default http://localhost:3001).
// Usage: API_BASE=http://localhost:3001 npm run test:smoke
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.API_BASE || 'http://localhost:3001';

async function get(path, expect = 200) {
  const res = await fetch(`${BASE}${path}`);
  assert.equal(res.status, expect, `${path} → ${res.status}`);
  return res.json();
}

let horseId, riderId, eventId, seriesKey;

test('health + rankings shape', async () => {
  const h = await get('/health');
  assert.equal(h.ok, true);
  const horses = await get('/rankings/horses?limit=3');
  assert.ok(Array.isArray(horses.data) && horses.data.length > 0);
  assert.ok(horses.data[0].horse_id && horses.data[0].clear_pct !== undefined);
  horseId = horses.data[0].horse_id;
  const riders = await get('/rankings/riders?limit=3');
  assert.ok(riders.data[0].rider_id);
  riderId = riders.data[0].rider_id;
  const parts = await get('/partnerships?limit=2');
  assert.ok(parts.data[0].rounds_together !== undefined);
});

test('events + classes + trends shape', async () => {
  const ev = await get('/events?limit=3');
  assert.ok(ev.data[0].id && ev.data[0].name);
  eventId = ev.data[0].id;
  const one = await get(`/events/${eventId}`);
  assert.ok(one.data && Array.isArray(one.classes));
  const full = await get(`/events/${eventId}/analytics`);
  assert.ok(Array.isArray(full.rounds) && Array.isArray(full.horses));
  const arenas = await get('/arenas');
  assert.ok(arenas.data[0].arena && arenas.data[0].clear_pct !== undefined);
  const cls = await get('/classes?limit=1');
  assert.ok(cls.data[0].class_id);
  const hh = await get('/height-stats?limit=1');
  assert.ok(hh.data[0].horse_id && hh.data[0].height_cm !== undefined);
  const tr = await get('/trends/circuit');
  assert.ok(tr.data[0].month && tr.data[0].clear_pct !== undefined);
});

test('profiles + comparison', async () => {
  const h = await get(`/horses/${horseId}`);
  assert.ok(h.data && h.stats && Array.isArray(h.history) && Array.isArray(h.partnerships));
  const t = await get(`/horses/${horseId}/trend`);
  assert.ok(Array.isArray(t.data));
  const tl = await get(`/horses/${horseId}/timeline`);
  assert.ok(Array.isArray(tl.data));
  const r = await get(`/riders/${riderId}`);
  assert.ok(r.data && Array.isArray(r.history));
});

test('comparison needs two distinct ids', async () => {
  const horses = await get('/rankings/horses?limit=2');
  const [x, y] = horses.data;
  const cmp = await get(`/comparison?type=horse&a=${x.horse_id}&b=${y.horse_id}`);
  assert.ok(cmp.a && cmp.b && cmp.a.horse_id !== cmp.b.horse_id);
  await get('/comparison?type=horse&a=x&b=y', 404);
});

test('points leaderboards (Briefing S5)', async () => {
  const h = await get('/rankings/horses?limit=3&metric=points&window=12m');
  assert.equal(h.metric, 'points');
  assert.ok(h.data[0].total_points !== undefined && h.data[0].podiums !== undefined);
  assert.ok(Number(h.data[0].points_12m) >= 0);
  const r = await get('/rankings/riders?limit=3&metric=points&window=3m');
  assert.ok(r.data[0].win_rate !== undefined);
  const dflt = await get('/rankings/horses?limit=1');
  assert.ok(dflt.metric === undefined && dflt.data[0].clear_pct !== undefined);
});

test('series shape', async () => {
  const s = await get('/series');
  assert.ok(s.data[0].series_key);
  seriesKey = s.data[0].series_key;
  const st = await get(`/series/${seriesKey}/standings?limit=2`);
  assert.ok(st.data[0].rank && st.data[0].total_points !== undefined);
});

test('review queue reads', async () => {
  const q = await get('/review?status=pending');
  assert.ok(Array.isArray(q.data));
});

test('auth: register/login/me/logout cycle', async () => {
  const email = `smoke${Date.now()}@test.local`;
  const reg = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke', email, password: 'secret123', role: 'COACH' }),
  });
  assert.equal(reg.status, 201);
  const cookie = reg.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes('eq_session'));
  const me = await fetch(`${BASE}/auth/me`, { headers: { cookie } });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).data.role, 'COACH');
  const dup = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke', email, password: 'secret123' }),
  });
  assert.equal(dup.status, 409);
  const bad = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'x', email: 'bad', password: 'short' }),
  });
  assert.equal(bad.status, 400);
  const out = await fetch(`${BASE}/auth/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(out.status, 200);
  const gone = await fetch(`${BASE}/auth/me`, { headers: { cookie } });
  assert.equal(gone.status, 401);
});

test('phase B: audit trail + visibility + activity gate', async () => {
  const U = '11111111-1111-1111-1111-111111111111';
  const HID = (await get('/rankings/horses?limit=1')).data[0].horse_id;
  const w = await (await fetch(`${BASE}/watchlist`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: U, entity_type: 'horse', entity_id: HID }),
  })).json();
  assert.equal(w.data.is_public, false);
  const patched = await (await fetch(`${BASE}/watchlist/${w.data.id}?user_id=${U}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_public: true }),
  })).json();
  assert.equal(patched.data.is_public, true);
  await fetch(`${BASE}/watchlist/${w.data.id}?user_id=${U}`, { method: 'DELETE' });
  await get('/admin/activity', 401);
});

test('arena & weather (spec v2 S12)', async () => {
  const EV = (await get('/events?limit=1')).data[0].id;
  const a = await get(`/events/${EV}/analytics`);
  assert.ok(Array.isArray(a.weather));
  const w = await get('/weather?venue=Glistening%20Waters');
  assert.ok(Array.isArray(w.data));
  const cls = await get('/classes?limit=1');
  assert.ok('arena_type' in cls.data[0] && 'surface' in cls.data[0]);
});

test('admin overview gate + password guard', async () => {
  await get('/admin/overview', 401);
  const bad = await fetch(`${BASE}/auth/password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(bad.status, 401);
});

test('admin results + lookup gates', async () => {
  await get('/admin/lookup?type=horse&q=ki', 401);
  const bad = await fetch(`${BASE}/admin/results`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(bad.status, 401);
});

test('admin manage gates + guards', async () => {
  await get('/admin/horses?q=kiwi', 401);
  const bad = await fetch(`${BASE}/admin/horses/00000000-0000-0000-0000-000000000000`, { method: 'PATCH' });
  assert.equal(bad.status, 401);
  const HID = (await get('/rankings/horses?limit=1')).data[0].horse_id;
  const del = await fetch(`${BASE}/admin/horses/${HID}`, { method: 'DELETE' });
  assert.equal(del.status, 401);
});

test('404s are honest JSON', async () => {
  const bad = await get('/horses/00000000-0000-0000-0000-000000000000', 404);
  assert.ok(bad.error);
  const badEv = await get('/events/00000000-0000-0000-0000-000000000000', 404);
  assert.ok(badEv.error);
});
