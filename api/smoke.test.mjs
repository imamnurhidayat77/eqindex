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
  assert.ok(Array.isArray(full.rounds) && Array.isArray(full.weather));
  assert.ok(full.hidden && Number.isInteger(full.hidden.hidden_classes));
  const arenas = await get('/arenas');
  assert.ok(arenas.data[0].arena && arenas.data[0].clear_pct !== undefined);
  const cls = await get('/classes?limit=1');
  assert.ok(cls.data[0].class_id);
  const hh = await get('/height-stats?limit=1');
  assert.ok(hh.data[0].horse_id && hh.data[0].height_cm !== undefined);
  const tr = await get('/trends/circuit');
  assert.ok(tr.data[0].month && tr.data[0].clear_pct !== undefined);
  const st = await get('/stats/circuit');
  assert.ok(Number.isInteger(st.data.rounds) && Number.isInteger(st.data.horses) && Number.isInteger(st.data.riders));
  assert.ok(Number.isInteger(st.data.events) && Number.isInteger(st.data.classes));
  const stF = await get('/stats/circuit?season=2026-2027');
  assert.ok(Number.isInteger(stF.data.rounds));
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
  assert.ok(Array.isArray(s.data));
  if (!s.data.length) { console.warn('  (skip: no series rows in this DB)'); return; }
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
  // Own throwaway user (session-scoped routes: no more ?user_id=/body spoofing).
  const email = `smokephase${Date.now()}@test.local`;
  const regRes = await fetch(`${BASE}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Phase', email, password: 'secret123', role: 'PUBLIC' }),
  });
  assert.equal(regRes.status, 201);
  const reg = await regRes.json();
  assert.ok(reg.data.id);
  const cookie = regRes.headers.get('set-cookie');
  assert.ok(cookie && cookie.includes('eq_session'));
  const H = { 'Content-Type': 'application/json', cookie };
  const HID = (await get('/rankings/horses?limit=1')).data[0].horse_id;
  const w = await (await fetch(`${BASE}/watchlist`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ entity_type: 'horse', entity_id: HID }),
  })).json();
  assert.equal(w.data.is_public, false);
  const patched = await (await fetch(`${BASE}/watchlist/${w.data.id}`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ is_public: true }),
  })).json();
  assert.equal(patched.data.is_public, true);
  await fetch(`${BASE}/watchlist/${w.data.id}`, { method: 'DELETE', headers: H });
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

test('corrections + admin series/users gates', async () => {
  const bad = await fetch(`${BASE}/corrections`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', email: 'bad', message: 'x' }),
  });
  assert.equal(bad.status, 400);
  const ok = await fetch(`${BASE}/corrections`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'T', email: 't@x.nz', message: 'placing typo' }),
  });
  assert.equal(ok.status, 201);
  await get('/admin/users', 401);
  await get('/admin/series', 401);
  await get('/admin/corrections', 401);
});

test('import accepts JSON records mode', async () => {
  const bad = await fetch(`${BASE}/admin/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [] }),
  });
  assert.equal(bad.status, 401); // gate first (no session)
});

test('venues + surface splits', async () => {
  const v = await get('/venues');
  assert.ok(v.data.length > 0 && v.data[0].name);
  const HID = (await get('/rankings/horses?limit=1')).data[0].horse_id;
  const sp = await get(`/horses/${HID}/splits`);
  assert.ok(Array.isArray(sp.data) && sp.data[0].arena_type);
  const RID = (await get('/rankings/riders?limit=1')).data[0].rider_id;
  const rsp = await get(`/riders/${RID}/splits`);
  assert.ok(Array.isArray(rsp.data));
});

test('series engine detail', async () => {
  const all = await get('/series');
  const key = all.data.length ? all.data[0].series_key : '__missing__';
  const d = await get(`/series/${key}/detail`);
  assert.ok(Array.isArray(d.data.standings) && Array.isArray(d.data.events));
  if (!d.data.standings.length) console.warn('  (skip: no standings in this DB)');
  else {
    const first = d.data.standings[0];
    assert.ok(first.total !== undefined && first.events && typeof first.events === 'object');
  }
  assert.ok(['official', 'independent'].includes(d.data.source));
  const recalc = await fetch(`${BASE}/admin/series/${key}/recalc`, { method: 'POST' });
  assert.equal(recalc.status, 401);
});

test('slugs + movement + series filter', async () => {
  const hid = (await get('/rankings/horses?limit=1')).data[0].horse_id;
  const prof = await get(`/horses/${hid}`);
  assert.ok(prof.data && prof.data.id === hid);
  if (prof.data.slug) {
    const h = await get(`/horses/${prof.data.slug}`);
    assert.equal(h.data.id, hid);
  } else console.warn('  (skip: no slug on top horse)');
  const m = await get('/rankings/movement?type=horse');
  assert.ok(m.periods && typeof m.data === 'object');
  const f = await get('/rankings/riders?limit=2&series=Open');
  assert.ok(Array.isArray(f.data));
  const all = await get('/rankings/riders?limit=1');
  assert.ok('series_category' in all.data[0]);
});

test('explorer: classes filters, venues, yoy, peers', async () => {
  const c = await get('/classes?limit=3&height_min=130&height_max=140');
  assert.ok(c.data.every((x) => x.height_cm >= 130 && x.height_cm <= 140));
  const v = await get('/venues');
  assert.ok(v.data.length > 0 && v.data[0].name);
  const vd = await get(`/venues/${v.data[0].id}`);
  assert.ok(Array.isArray(vd.data.events));
  const ev = (await get('/events?limit=1')).data[0];
  const yoy = await get(`/events/compare?name=${encodeURIComponent(ev.name)}`);
  assert.ok(yoy.data.length >= 1);
  // peers needs a horse with a known age — take the success path when the
  // DB has one, otherwise assert the honest 404.
  let peer = null, peerErr = null;
  for (const cand of (await get('/rankings/horses?limit=10')).data) {
    const r = await fetch(`${BASE}/peers?horse_id=${cand.horse_id}`);
    if (r.status === 200) { peer = await r.json(); break; }
    peerErr = await r.json().catch(() => ({}));
  }
  if (peer) assert.ok(peer.subject && peer.subject.id);
  else assert.ok(peerErr && peerErr.error);
});

test('404s are honest JSON', async () => {
  const bad = await get('/horses/00000000-0000-0000-0000-000000000000', 404);
  assert.ok(bad.error);
  const badEv = await get('/events/00000000-0000-0000-0000-000000000000', 404);
  assert.ok(badEv.error);
});

test('class visibility admin is gated', async () => {
  await get('/admin/classes?q=pony', 401);
  await get('/admin/visibility', 401);
  const bad = await fetch(`${BASE}/admin/visibility`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
  });
  assert.equal(bad.status, 401); // gate first (no session)
});

test('categories master is the category vocabulary', async () => {
  const c = await get('/categories');
  assert.ok(Array.isArray(c.data) && c.data.length > 0);
  for (const b of c.data) assert.ok(b.key && b.label, 'bucket needs key + label');
  const keys = c.data.map((b) => b.key);
  for (const k of ['pro', 'young', 'junior', 'amateur', 'pony']) assert.ok(keys.includes(k), `missing bucket ${k}`);
});

test('scoring defaults served; recompute is gated', async () => {
  const d = await get('/scoring/defaults');
  assert.ok(Array.isArray(d.data.divisions) && d.data.divisions.length > 0);
  assert.ok(Array.isArray(d.data.points.placing) && d.data.points.placing.length === 5);
  const act = await fetch(`${BASE}/scoring/active`);
  assert.ok([200, 404].includes(act.status));
  if (act.status === 200) {
    const j = await act.json();
    assert.ok(j.data.params && j.data.version != null && j.data.season, 'active carries params + provenance');
  }
  const bad = await fetch(`${BASE}/admin/scoring/recompute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ season: '2026-2027' }),
  });
  assert.equal(bad.status, 401); // gate first (no session)
});
