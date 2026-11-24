// Builds the warm and lightweight rugs, the saddle pad and the ear bonnet
// straight from the horse's body and writes
// public/models/horse/{warm-rug,lightweight-rug,saddle-pad,ear-bonnet}-on-horse.glb:
//   node scripts/build-horse-rugs.mjs
// The client rug GLBs (generator output) wrinkled, zig-zagged and let the
// mane through once wrapped onto the horse, so the rugs are generated here
// instead: a clean surface that follows the back from the withers to the
// tail, hangs straight down from the widest point of the barrel (cloth does
// not tuck under the belly), closes round the chest and leaves the neck free.
// One mesh: the rug body (quilted or plain albedo) plus a gold binding tube
// along the neckline and hem, textured from a gold strip of the same image so
// the shared rug recolour keeps the trim gold. Re-run when the horse changes.
import { Document, NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import sharp from 'sharp';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';
import { NodeIO as ReadIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

THREE.Mesh.prototype.raycast = acceleratedRaycast;

const HORSE = 'public/models/horse/horse-warmblood.glb';
const OUT_DIR = 'public/models/horse';

// ---- horse + rays
const src = await new ReadIO().registerExtensions(ALL_EXTENSIONS).read(HORSE);
const prim = src.getRoot().listMeshes()[0].listPrimitives()[0];
const hg = new THREE.BufferGeometry();
hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(prim.getAttribute('POSITION').getArray()), 3));
hg.setIndex(new THREE.BufferAttribute(new Uint32Array(prim.getIndices().getArray()), 1));
hg.boundsTree = new MeshBVH(hg);
const horse = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
horse.updateMatrixWorld();
const caster = new THREE.Raycaster();
function cast(o, d, far = 1e4) {
  caster.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
  caster.far = far;
  return caster.intersectObject(horse, false);
}

// ---- landmarks (horse space: head +z, up +y, ground y 0)
const Z_FRONT = 0.35; // last barrel slice before the chest cap (front legs)
const Z_REAR = -0.75; // croup: the rear cap fans out from here
// Neck opening: rug stays below this line from the withers down to the chest.
const neckY = (z) => (z < 0.12 ? Infinity : 1.47 - (z - 0.12) * 0.45);

// Body outline in one vertical plane through (0, *, z0) along horizontal
// direction (hx, hz): from the top of the back round to the widest point.
function planeProfile(z0, hx, hz) {
  const down = cast([0, 3, z0], [0, -1, 0]);
  const top = down[0].point.y;
  const bot = (down.find((h) => h.point.y < top - 0.12) || down[down.length - 1]).point.y;
  const yc = (top + bot) / 2;
  const pts = [];
  let lastD = null;
  for (let a = 0; a <= 150; a += 1.5) {
    const t = (a * Math.PI) / 180;
    // Tail hair behind the buttocks is skipped: wrapping it bulged the rear
    // wall into a lobe. The tail hangs out over the rug instead, like a real
    // tail flap.
    const h = cast([0, yc, z0], [Math.sin(t) * hx, Math.cos(t), Math.sin(t) * hz], 1.6)
      .find((q) => !(q.point.z < -0.97 && Math.abs(q.point.x) < 0.1));
    if (!h) break;
    // A jump in radius means the ray slipped onto a leg or the tail. Near
    // the top the rays comb through mane strands instead, so jumps there
    // are ignored (the cloth lies over the mane at the withers anyway).
    if (a > 70 && lastD !== null && Math.abs(h.distance - lastD) > 0.04) break;
    lastD = h.distance;
    pts.push([h.point.x * hx + (h.point.z - z0) * hz, h.point.y]);
  }
  // Widest point below the neck opening only: the neck and head reach
  // further forward than the chest and would hang a curtain off the throat.
  const free = (q) => q[1] <= neckY(z0 + q[0] * hz);
  let iw = 0;
  for (let i = 1; i < pts.length; i++) if (free(pts[i]) && (!free(pts[iw]) || pts[i][0] > pts[iw][0])) iw = i;
  const out = [[0, top], ...pts.slice(1, iw + 1)];
  const s = [0];
  for (let i = 1; i < out.length; i++) s.push(s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, s, top, rw: out[out.length - 1][0], yw: out[out.length - 1][1], z0, hx, hz };
}

// Point and outward normal at arc length s (past the widest point the cloth
// drops straight down).
function along(p, s) {
  const { pts, s: S } = p;
  const last = S[S.length - 1];
  if (s >= last) return { r: p.rw, y: p.yw - (s - last), nr: 1, ny: 0 };
  let i = 1;
  while (S[i] < s) i++;
  const t = (s - S[i - 1]) / (S[i] - S[i - 1] || 1);
  const r = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]);
  const y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
  const tr = pts[i][0] - pts[i - 1][0];
  const ty = pts[i][1] - pts[i - 1][1];
  const l = Math.hypot(tr, ty) || 1;
  return { r, y, nr: -ty / l, ny: tr / l };
}
const to3 = (p, q, off) => [
  (q.r + q.nr * off) * p.hx,
  q.y + q.ny * off,
  p.z0 + (q.r + q.nr * off) * p.hz,
];

function buildRug({ off, hem, rows, binding, neckLift = 0, NC = 22, NB = 80, quilt = null }) {
  // Right-hand columns, front centre -> rear centre.
  const cols = [];
  for (let i = 0; i < NC; i++) {
    const phi = (i / NC) * (Math.PI / 2);
    cols.push({ p: planeProfile(Z_FRONT, Math.sin(phi), Math.cos(phi)), cap: 'front', t: i / NC });
  }
  for (let i = 0; i <= NB; i++) {
    const z = Z_FRONT + (Z_REAR - Z_FRONT) * (i / NB);
    cols.push({ p: planeProfile(z, 1, 0), cap: null, t: 0 });
  }
  for (let i = 1; i <= NC; i++) {
    const phi = Math.PI / 2 + (i / NC) * (Math.PI / 2);
    cols.push({ p: planeProfile(Z_REAR, Math.sin(phi), Math.cos(phi)), cap: 'rear', t: i / NC });
  }
  // Start (neckline) and end (hem) arc lengths per column.
  for (const c of cols) {
    const { p } = c;
    let s0 = 0;
    for (let s = 0; s < p.s[p.s.length - 1] + 0.6; s += 0.004) {
      const q = along(p, s);
      const P = to3(p, q, 0);
      if (P[1] <= neckY(P[2]) + neckLift) { s0 = s; break; }
    }
    c.s0 = s0;
    // Hem: level under the barrel, lifted in front of the chest (clear of
    // the forearms) and a touch at the rear.
    const hy = c.cap === 'front' ? hem + 0.17 * Math.pow(1 - c.t, 1.6)
      : c.cap === 'rear' ? hem + 0.04 * c.t : hem;
    c.hemY = hy;
    const last = p.s[p.s.length - 1];
    c.s1 = hy < p.yw ? last + (p.yw - hy) : last;
  }
  // No smoothing of s0 itself: the columns have very different lengths, so
  // averaging arc lengths bends the neckline into a zig-zag. The raw
  // crossings of neckY already lie on one smooth curve.

  // Grid: loop right (front->rear) then left mirrored (rear->front).
  const right = cols;
  const loop = [...right.map((c) => ({ c, m: 1 })), ...right.slice(1, -1).reverse().map((c) => ({ c, m: -1 }))];
  const NU = loop.length;
  const grid = [];
  for (const { c, m } of loop) {
    const colPts = [];
    for (let j = 0; j < rows; j++) {
      const s = c.s0 + (c.s1 - c.s0) * (j / (rows - 1));
      const P = to3(c.p, along(c.p, s), off);
      colPts.push([P[0] * m, P[1], P[2]]);
    }
    grid.push(colPts);
  }
  // Cloth bridges dips between columns and rows.
  // Enough passes to iron the tail lobe out of the rear wall.
  for (let k = 0; k < 10; k++) {
    const prev = grid.map((col) => col.map((p) => [...p]));
    for (let i = 0; i < NU; i++) {
      for (let j = 1; j < rows - 1; j++) {
        const a = prev[(i - 1 + NU) % NU][j];
        const b = prev[(i + 1) % NU][j];
        const u = prev[i][j - 1];
        const d = prev[i][j + 1];
        for (let x = 0; x < 3; x++) grid[i][j][x] = 0.5 * prev[i][j][x] + 0.125 * (a[x] + b[x] + u[x] + d[x]);
      }
    }
  }
  // Keep the smoothed cloth outside the body.
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < rows; j++) {
      const P = grid[i][j];
      const up = cast(P, [0, 1, 0]);
      if (up.length % 2 === 1) {
        const n = loop[i].c;
        const q = along(n.p, n.s0 + (n.s1 - n.s0) * (j / (rows - 1)));
        const Q = to3(n.p, q, off);
        grid[i][j] = [Q[0] * loop[i].m, Q[1], Q[2]];
      }
    }
  }

  // UVs in metres: u along the body (mirrored sides share it), v down from
  // the spine / neckline.
  const uOf = [0];
  const mid = Math.floor(rows * 0.45);
  for (let i = 1; i < right.length; i++) {
    const a = grid[i - 1][mid];
    const b = grid[i][mid];
    uOf.push(uOf[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  const Umax = uOf[uOf.length - 1];
  const loopU = [...uOf, ...uOf.slice(1, -1).reverse()];
  const vLen = loop.map(({ c }) => c.s1 - c.s0);
  const Vmax = Math.max(...vLen);

  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < rows; j++) {
      pos.push(...grid[i][j]);
      uv.push((loopU[i] / Umax) * 0.96, ((vLen[i] * j) / (rows - 1)) / Vmax);
    }
  }
  for (let i = 0; i < NU; i++) {
    const i2 = (i + 1) % NU;
    for (let j = 0; j < rows - 1; j++) {
      const a = i * rows + j;
      const b = i2 * rows + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();
  // Normals face out (away from the horse's centre line).
  const nrm = body.attributes.normal;
  let flip = 0;
  for (let k = 0; k < nrm.count; k++) {
    const x = pos[k * 3];
    if (Math.abs(x) > 0.1) flip += Math.sign(x) * nrm.getX(k);
  }
  if (flip < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    body.setIndex(idx);
    body.computeVertexNormals();
  }
  // The spine is a zip between the two halves: one shared upward normal.
  for (let k = 0; k < nrm.count; k++) {
    if (Math.abs(pos[k * 3]) < 1e-5) {
      const v = new THREE.Vector3(0, nrm.getY(k), nrm.getZ(k)).normalize();
      nrm.setXYZ(k, v.x, v.y, v.z);
    }
  }

  // Quilted rugs: puff each diamond outward between the stitch lines, in
  // the same metres as the albedo so shading and shape line up.
  if (quilt) {
    const { cell, amp } = quilt;
    const P = body.attributes.position;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < rows; j++) {
        const u = loopU[i];
        const v = (vLen[i] * j) / (rows - 1);
        const d1 = (((u + v) / cell) % 1 + 1) % 1;
        const d2 = (((u - v) / cell) % 1 + 1) % 1;
        const dist = Math.min(d1, 1 - d1, d2, 1 - d2) * cell;
        // Edges stay flat under the binding.
        const edge = Math.min(1, j / 3, (rows - 1 - j) / 3);
        const h = amp * Math.sin((Math.min(1, dist / (cell * 0.3)) * Math.PI) / 2) * edge;
        const k = i * rows + j;
        P.setXYZ(k, P.getX(k) + nrm.getX(k) * h, P.getY(k) + nrm.getY(k) * h, P.getZ(k) + nrm.getZ(k) * h);
        grid[i][j] = [P.getX(k), P.getY(k), P.getZ(k)];
      }
    }
    body.computeVertexNormals();
    const n2 = body.attributes.normal;
    for (let k = 0; k < n2.count; k++) {
      if (Math.abs(P.getX(k)) < 1e-5) {
        const v = new THREE.Vector3(0, n2.getY(k), n2.getZ(k)).normalize();
        n2.setXYZ(k, v.x, v.y, v.z);
      }
    }
  }

  // Binding: neckline (top row of the columns that start below the neck)
  // and the full hem.
  const necks = [];
  let run = [];
  for (let i = 0; i < NU; i++) {
    if (loop[i].c.s0 > 0.002) run.push(grid[i][0]);
    else if (run.length) { necks.push(run); run = []; }
  }
  if (run.length) necks.push(run);
  // The neckline runs through the front centre (loop index 0): stitch the
  // wrap-around pieces into one polyline.
  if (necks.length > 1 && loop[0].c.s0 > 0.002 && loop[NU - 1].c.s0 > 0.002) {
    const last = necks.pop();
    necks[0] = [...last, ...necks[0]];
  }
  const hemLine = grid.map((col) => col[rows - 1]);
  const tubes = [
    ...necks.map((l) => tube(l, false, binding)),
    tube(hemLine, true, binding),
  ];
  return { body, tubes, UM: Umax, VM: Vmax };
}

// ---- Saddle pad: a square show pad under the saddle. Sits behind the
// withers, follows the back over the spine and hangs to a level lower edge
// with rounded corners; the front edge leans forward over the shoulder.
function buildPad({ off, rows, cols, binding }) {
  const cache = new Map();
  const prof = (z) => {
    const k = Math.round(z * 200);
    if (!cache.has(k)) cache.set(k, planeProfile(k / 200, 1, 0));
    return cache.get(k);
  };
  const arcTo = (p, y) => {
    for (let i = 1; i < p.pts.length; i++) {
      if (p.pts[i][1] <= y) {
        const t = (p.pts[i - 1][1] - y) / (p.pts[i - 1][1] - p.pts[i][1] || 1);
        return p.s[i - 1] + t * (p.s[i] - p.s[i - 1]);
      }
    }
    return p.s[p.s.length - 1] + Math.max(0, p.yw - y);
  };
  const zf = (q) => 0.15 + 0.07 * q;
  const zr = (q) => -0.42 - 0.01 * q;
  const BOTTOM = 1.03;
  const R = 0.1;
  const L = zf(1) - zr(1);
  // Rounded bottom corners: lift the lower edge near both ends.
  const bottomAt = (t) => {
    const d = Math.min(t, 1 - t) * L;
    return d >= R ? BOTTOM : BOTTOM + R - Math.sqrt(R * R - (R - d) * (R - d));
  };
  // One line per column: left lower edge -> spine -> right lower edge.
  const lines = [];
  for (let i = 0; i < cols; i++) {
    const t = i / (cols - 1);
    const line = [];
    for (let j = 0; j < 2 * rows - 1; j++) {
      const q = Math.abs(j - (rows - 1)) / (rows - 1);
      const m = j < rows - 1 ? -1 : 1;
      const z = zf(q) + (zr(q) - zf(q)) * t;
      const p = prof(z);
      const P = to3(p, along(p, q * arcTo(p, bottomAt(t))), off);
      line.push([P[0] * m, P[1], P[2]]);
    }
    lines.push(line);
  }
  const NJ = 2 * rows - 1;
  // Iron out muscle bumps, then keep the cloth outside the body.
  for (let k = 0; k < 4; k++) {
    const prev = lines.map((l) => l.map((p) => [...p]));
    for (let i = 1; i < cols - 1; i++) {
      for (let j = 1; j < NJ - 1; j++) {
        for (let x = 0; x < 3; x++) {
          lines[i][j][x] = 0.5 * prev[i][j][x] + 0.125 * (prev[i - 1][j][x] + prev[i + 1][j][x] + prev[i][j - 1][x] + prev[i][j + 1][x]);
        }
      }
    }
  }
  for (const l of lines) {
    for (let j = 0; j < NJ; j++) {
      if (cast(l[j], [0, 1, 0]).length % 2 === 1) l[j][1] += off;
    }
  }
  // UVs in metres along (u) and across (v) the pad.
  const uLen = [0];
  for (let i = 1; i < cols; i++) {
    const a = lines[i - 1][rows - 1];
    const b = lines[i][rows - 1];
    uLen.push(uLen[i - 1] + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  const pos = [];
  const uv = [];
  const idx = [];
  const UM = 0.9;
  const VM = 1.4;
  for (let i = 0; i < cols; i++) {
    let v = 0;
    for (let j = 0; j < NJ; j++) {
      if (j > 0) {
        const a = lines[i][j - 1];
        const b = lines[i][j];
        v += Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      }
      pos.push(...lines[i][j]);
      uv.push((uLen[i] / UM) * 0.96, v / VM);
    }
  }
  for (let i = 0; i < cols - 1; i++) {
    for (let j = 0; j < NJ - 1; j++) {
      const a = i * NJ + j;
      const b = (i + 1) * NJ + j;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  body.setIndex(idx);
  body.computeVertexNormals();
  // Outward normals (the spine sample of the mid column points up).
  const nrm = body.attributes.normal;
  const mid = Math.floor(cols / 2) * NJ + (rows - 1);
  if (nrm.getY(mid) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    body.setIndex(idx);
    body.computeVertexNormals();
  }
  // Binding round the whole outline.
  const rim = [
    ...lines[0],
    ...lines.slice(1, -1).map((l) => l[NJ - 1]),
    ...[...lines[cols - 1]].reverse(),
    ...lines.slice(1, -1).reverse().map((l) => l[0]),
  ];
  return { body, tubes: [tube(rim, true, binding)] };
}

// ---- Ear bonnet (show fly veil): a crochet cap over the poll from just
// behind the ears to the browband line, hanging down the sides of the head,
// two knitted ear socks that cover each ear to the tip, and a gold cord
// along the browband edge and round each ear base.
function buildBonnet({ off = 0.006, cord = 0.0085 } = {}) {
  const A = new THREE.Vector3(0, 1.77, 0.87); // head centre line (poll)
  const B = new THREE.Vector3(0, 1.45, 1.12); // towards the muzzle
  const ax = B.clone().sub(A);
  const L = ax.length();
  ax.normalize();
  const side = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3().crossVectors(ax, side).normalize();
  const NT = 22;
  const NP = 45;
  const T0 = -0.34; // behind the ears (headpiece)
  const T1 = 0.06; // browband line
  const PHI = (72 * Math.PI) / 180;
  const dist = [];
  const cen = [];
  const dirs = [];
  for (let i = 0; i < NT; i++) {
    const t = T0 + (T1 - T0) * (i / (NT - 1));
    const C = A.clone().addScaledVector(ax, t * L);
    cen.push(C);
    const dr = [];
    const row = [];
    for (let j = 0; j < NP; j++) {
      const a = -PHI + (2 * PHI * j) / (NP - 1);
      const d = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
      const h = cast(C.toArray(), d.toArray(), 0.4)[0];
      row.push(h ? h.distance : NaN);
      dr.push(d);
    }
    dist.push(row);
    dirs.push(dr);
  }
  // Fill misses, then let the crochet bridge small dips (it is stretched).
  for (const row of dist) for (let j = 0; j < NP; j++) if (Number.isNaN(row[j])) row[j] = Math.max(...row.filter((v) => !Number.isNaN(v)));
  for (let k = 0; k < 4; k++) {
    const prev = dist.map((r) => [...r]);
    for (let i = 1; i < NT - 1; i++) {
      for (let j = 1; j < NP - 1; j++) {
        dist[i][j] = Math.max(prev[i][j], (prev[i - 1][j] + prev[i + 1][j] + prev[i][j - 1] + prev[i][j + 1]) / 4);
      }
    }
  }
  const capPos = [];
  const capUv = [];
  const capIdx = [];
  const capGrid = [];
  for (let i = 0; i < NT; i++) {
    const r = [];
    for (let j = 0; j < NP; j++) {
      const P = cen[i].clone().addScaledVector(dirs[i][j], dist[i][j] + off);
      r.push(P.toArray());
      capPos.push(P.x, P.y, P.z);
      capUv.push(0.02 + 0.44 * (j / (NP - 1)), 0.02 + 0.6 * (i / (NT - 1)));
    }
    capGrid.push(r);
  }
  // The browband rows follow forelock strands and read as a torn edge when
  // the bonnet is shown on its own: relax the last rows along the edge
  // (fully at the edge, fading out over four rows) so the crochet ends in
  // the same clean curve as its cord.
  for (let i = NT - 4; i < NT; i++) {
    const w = (i - (NT - 4) + 1) / 4;
    const row = capGrid[i].map((p) => [...p]);
    for (let it = 0; it < 12; it++) {
      const pv = row.map((p) => [...p]);
      for (let j = 1; j < NP - 1; j++) for (let c = 0; c < 3; c++) row[j][c] = (pv[j - 1][c] + 2 * pv[j][c] + pv[j + 1][c]) / 4;
    }
    for (let j = 0; j < NP; j++) {
      for (let c = 0; c < 3; c++) capGrid[i][j][c] = capGrid[i][j][c] * (1 - w) + row[j][c] * w;
      capPos.splice((i * NP + j) * 3, 3, ...capGrid[i][j]);
    }
  }
  for (let i = 0; i < NT - 1; i++) {
    for (let j = 0; j < NP - 1; j++) {
      const a = i * NP + j;
      const b = (i + 1) * NP + j;
      capIdx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const cap = orientOut(capPos, capUv, capIdx, A);

  // Ear socks: a smooth knitted cone per ear. Each ring along the ear is
  // measured (rays outward from the ear axis), reduced to an ellipse
  // (centre + half widths across and along the head), smoothed along the
  // ear and forced to taper, then closed with a rounded tip just past the
  // ear tip. The sock starts below the ear base, inside the crochet, so no
  // bare ear shows between cap and sock.
  function sock(sx) {
    const base = new THREE.Vector3(0.083 * sx, 1.918, 0.913);
    const tip = new THREE.Vector3(0.069 * sx, 2.021, 0.951);
    const e = tip.clone().sub(base);
    const len = e.length();
    e.normalize();
    const f1 = new THREE.Vector3().crossVectors(e, new THREE.Vector3(0, 0, 1)).normalize();
    const f2 = new THREE.Vector3().crossVectors(e, f1).normalize();
    const NM = 14; // measured rings, q 0.12..0.9 of the ear
    const meas = [];
    for (let k = 0; k < NM; k++) {
      const q = 0.12 + (0.78 * k) / (NM - 1);
      const C = base.clone().addScaledVector(e, q * len);
      let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity;
      for (let m = 0; m < 36; m++) {
        const a = (2 * Math.PI * m) / 36;
        const d = f1.clone().multiplyScalar(Math.cos(a)).addScaledVector(f2, Math.sin(a));
        const h = cast(C.toArray(), d.toArray(), 0.045)[0];
        if (!h) continue;
        const v = h.point.clone().sub(C);
        const x = v.dot(f1);
        const y = v.dot(f2);
        lo1 = Math.min(lo1, x); hi1 = Math.max(hi1, x);
        lo2 = Math.min(lo2, y); hi2 = Math.max(hi2, y);
      }
      if (!Number.isFinite(lo1)) { meas.push(null); continue; }
      meas.push({ q, c1: (lo1 + hi1) / 2, c2: (lo2 + hi2) / 2, r1: (hi1 - lo1) / 2, r2: (hi2 - lo2) / 2 });
    }
    // Fill gaps, smooth along the ear, then taper (never wider than below).
    const ok = meas.filter(Boolean);
    const M = meas.map((m, k) => m || ok.reduce((b, o) => (Math.abs(o.q - (0.12 + (0.78 * k) / (NM - 1))) < Math.abs(b.q - (0.12 + (0.78 * k) / (NM - 1))) ? o : b)));
    for (let it = 0; it < 4; it++) {
      const pv = M.map((m) => ({ ...m }));
      for (let k = 1; k < NM - 1; k++) {
        for (const f of ['c1', 'c2', 'r1', 'r2']) M[k][f] = (pv[k - 1][f] + 2 * pv[k][f] + pv[k + 1][f]) / 4;
      }
    }
    for (let k = 1; k < NM; k++) {
      M[k].r1 = Math.min(M[k].r1, M[k - 1].r1);
      M[k].r2 = Math.min(M[k].r2, M[k - 1].r2);
    }
    const at = (q) => {
      const t = Math.min(NM - 1, Math.max(0, ((q - 0.12) / 0.78) * (NM - 1)));
      const k = Math.min(NM - 2, Math.floor(t));
      const w = t - k;
      const o = {};
      for (const f of ['c1', 'c2', 'r1', 'r2']) o[f] = M[k][f] * (1 - w) + M[k + 1][f] * w;
      return o;
    };
    const Q0 = -0.25; // start inside the crochet, below the ear base
    const QT = 1.08; // soft point just past the ear tip
    const NR = 22;
    const NS = 28;
    const ease = 0.007 + off; // knit sits clear of the ear
    const pos = [];
    const uv = [];
    const idx = [];
    const u0 = sx > 0 ? 0.5 : 0.73;
    const rings = [];
    for (let k = 0; k < NR; k++) {
      const q = Q0 + ((QT - Q0) * k) / (NR - 1);
      const o = at(Math.max(0.12, Math.min(0.9, q)));
      // Soft point: from q 0.6 the ellipse narrows like the ear itself,
      // rounding off only at the very tip.
      const qq = Math.max(0, (q - 0.6) / (QT - 0.6));
      const shrink = Math.max(0, 1 - qq ** 1.7) ** 0.6;
      const C = base.clone().addScaledVector(e, q * len).addScaledVector(f1, o.c1).addScaledVector(f2, o.c2);
      const r1 = (o.r1 + ease) * shrink;
      const r2 = (o.r2 + ease) * shrink;
      const ring = [];
      for (let m = 0; m <= NS; m++) {
        const a = (2 * Math.PI * (m % NS)) / NS;
        const P = C.clone().addScaledVector(f1, Math.cos(a) * r1).addScaledVector(f2, Math.sin(a) * r2);
        pos.push(P.x, P.y, P.z);
        uv.push(u0 + 0.21 * (m / NS), 0.02 + 0.9 * (k / (NR - 1)));
        ring.push([P.x, P.y, P.z]);
      }
      rings.push(ring);
    }
    const W = NS + 1;
    for (let k = 0; k < NR - 1; k++) {
      for (let m = 0; m < NS; m++) {
        const a = k * W + m;
        const b = (k + 1) * W + m;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = orientOut(pos, uv, idx, base.clone().addScaledVector(e, len * 0.4));
    // The ring seam (m 0 and m NS share a position) gets one normal, or a
    // crease runs up the back of the sock.
    const nr = g.attributes.normal;
    for (let k = 0; k < NR; k++) {
      const i0 = k * W;
      const i1 = k * W + NS;
      const v = new THREE.Vector3(nr.getX(i0) + nr.getX(i1), nr.getY(i0) + nr.getY(i1), nr.getZ(i0) + nr.getZ(i1)).normalize();
      nr.setXYZ(i0, v.x, v.y, v.z);
      nr.setXYZ(i1, v.x, v.y, v.z);
    }
    // Cord where the sock leaves the crochet (ear base).
    const kb = Math.round(((0.02 - Q0) / (QT - Q0)) * (NR - 1));
    return { g, ring0: rings[kb].slice(0, NS) };
  }
  const left = sock(1);
  const right = sock(-1);
  // Browband cord: the edge row follows forelock strands; relax it so the
  // cord runs as one clean curve.
  const front = capGrid[NT - 1].map((p) => [...p]);
  for (let it = 0; it < 12; it++) {
    const pv = front.map((p) => [...p]);
    for (let j = 1; j < front.length - 1; j++) {
      for (let c = 0; c < 3; c++) front[j][c] = (pv[j - 1][c] + 2 * pv[j][c] + pv[j + 1][c]) / 4;
    }
  }
  // Trim round the rest of the cap: down each side and across the back
  // (behind the ears), relaxed the same way.
  const relax = (line, n) => {
    const out = line.map((p) => [...p]);
    for (let it = 0; it < n; it++) {
      const pv = out.map((p) => [...p]);
      for (let j = 1; j < out.length - 1; j++) for (let c = 0; c < 3; c++) out[j][c] = (pv[j - 1][c] + 2 * pv[j][c] + pv[j + 1][c]) / 4;
    }
    return out;
  };
  const back = relax([
    ...capGrid.map((r) => r[0]).reverse(),
    ...capGrid[0].slice(1, -1),
    ...capGrid.map((r) => r[NP - 1]),
  ], 6);
  const tubes = [
    tube(front, false, cord),
    tube(back, false, cord * 0.7),
    tube(left.ring0, true, cord * 0.6),
    tube(right.ring0, true, cord * 0.6),
  ];
  return { body: cap, tubes: [left.g, right.g, ...tubes] };
}

// Index triangles so normals face away from `inside`.
function orientOut(pos, uv, idx, inside) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal;
  let sum = 0;
  for (let k = 0; k < n.count; k++) {
    sum += (pos[k * 3] - inside.x) * n.getX(k) + (pos[k * 3 + 1] - inside.y) * n.getY(k) + (pos[k * 3 + 2] - inside.z) * n.getZ(k);
  }
  if (sum < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

// Crochet cap (u 0..0.46: open net), knitted socks (u 0.5..0.94: rib),
// gold strip (u >= 0.97: cord).
async function bonnetAlbedo() {
  const W = 1024;
  const H = 1024;
  const px = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3;
      const U = x / W;
      const V = y / H;
      if (U >= 0.97) { px[k] = 212; px[k + 1] = 162; px[k + 2] = 38; continue; }
      let L;
      if (U < 0.48) {
        // Shell-stitch net: rows of round holes, offset every other row.
        // Coarse enough to read at preview distance: open holes, a bright
        // yarn ring round each, twisted strands between.
        const cu = 24 * U;
        const cv = 30 * V;
        const row = Math.floor(cv);
        const fu = (cu + (row % 2) * 0.5) % 1;
        const fv = cv % 1;
        const r = Math.hypot(fu - 0.5, (fv - 0.5) * 1.1);
        const twist = 0.03 * Math.sin((fu + fv) * Math.PI * 6);
        L = r < 0.26 ? 0.025 : r < 0.33 ? 0.07 : r < 0.42 ? 0.24 + twist : 0.17 + twist;
      } else {
        // Knit rib running up the ear.
        const rib = Math.sin(U * 2 * Math.PI * 40);
        L = 0.14 + 0.06 * rib + 0.02 * Math.sin(V * 2 * Math.PI * 70);
      }
      const c8 = Math.max(0, Math.min(255, Math.round(255 * Math.pow(L, 1 / 2.2))));
      px[k] = c8; px[k + 1] = c8; px[k + 2] = Math.min(255, c8 + 2);
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 90 }).toBuffer();
}

function tube(points, closed, radius, seg = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
  const n = Math.max(16, points.length * 2);
  const g = new THREE.TubeGeometry(curve, n, radius, seg, closed);
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.985, 0.5);
  return g;
}

// ---- albedo: dark neutral fabric (the rug recolour tints it to the buyer
// colour), gold strip at u 0.97..1 for the binding.
async function albedo(file, { quilt, UM = 2.9, VM = 1.15, cell = 0.15, W = 2048, H = 1024 }) {
  const px = Buffer.alloc(W * H * 3);
  // UM x VM: metres of cloth the texture spans (u along the body, v across).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = (y * W + x) * 3;
      const U = x / W;
      if (U >= 0.97) { px[k] = 212; px[k + 1] = 162; px[k + 2] = 38; continue; }
      const u = (U / 0.96) * UM;
      const v = (y / H) * VM;
      let L = 0.13;
      if (quilt) {
        const c = cell;
        const d1 = ((u + v) / c) % 1;
        const d2 = (((u - v) / c) % 1 + 1) % 1;
        const dist = Math.min(d1, 1 - d1, d2, 1 - d2) * c;
        const puff = Math.min(1, dist / 0.035);
        L = 0.07 + 0.12 * Math.sin((puff * Math.PI) / 2);
        if (dist < 0.003) L = 0.045;
      } else {
        // Ripstop: faint square grid, as on lightweight turnouts.
        const g = 0.012;
        const on = (u % g) < 0.0012 || (v % g) < 0.0012;
        L = on ? 0.115 : 0.135;
      }
      L += (rnd() - 0.5) * 0.012;
      const c8 = Math.max(0, Math.min(255, Math.round(255 * Math.pow(L, 1 / 2.2))));
      px[k] = c8; px[k + 1] = c8; px[k + 2] = Math.min(255, c8 + 2);
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 88 }).toBuffer();
}

async function write(file, { body, tubes }, tex) {
  const parts = [body, ...tubes].map((g) => (g.index ? g : g));
  // Merge into one indexed geometry.
  let vCount = 0;
  const P = [];
  const N = [];
  const T = [];
  const I = [];
  for (const g of parts) {
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const t = g.attributes.uv;
    for (let k = 0; k < p.count; k++) {
      P.push(p.getX(k), p.getY(k), p.getZ(k));
      N.push(n.getX(k), n.getY(k), n.getZ(k));
      T.push(t.getX(k), t.getY(k));
    }
    const ix = g.index.array;
    for (let k = 0; k < ix.length; k++) I.push(ix[k] + vCount);
    vCount += p.count;
  }
  const doc = new Document();
  const buf = doc.createBuffer();
  const texture = doc.createTexture('rug').setImage(new Uint8Array(tex)).setMimeType('image/webp');
  doc.createExtension((await import('@gltf-transform/extensions')).EXTTextureWebP).setRequired(true);
  const mat = doc.createMaterial('rug').setBaseColorTexture(texture).setRoughnessFactor(0.9).setMetallicFactor(0).setDoubleSided(true);
  const p = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(P)).setBuffer(buf))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(N)).setBuffer(buf))
    .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(T)).setBuffer(buf))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(vCount < 65536 ? new Uint16Array(I) : new Uint32Array(I)).setBuffer(buf))
    .setMaterial(mat);
  const mesh = doc.createMesh('rug').addPrimitive(p);
  const node = doc.createNode('rug').setMesh(mesh);
  doc.createScene('rug').addChild(node);
  await new NodeIO().registerExtensions(ALL_EXTENSIONS).write(file, doc);
  console.log('wrote', file, vCount, 'verts');
}

// Warm turnout: thick, quilted, high neck, long drop, heavy binding.
const warm = buildRug({ off: 0.032, hem: 0.72, rows: 96, binding: 0.015, neckLift: 0.09, NC: 30, NB: 110, quilt: { cell: 0.15, amp: 0.011 } });
await write(`${OUT_DIR}/warm-rug-on-horse.glb`, warm, await albedo('warm', { quilt: true, UM: warm.UM, VM: warm.VM, cell: 0.15 }));
// Lightweight sheet: thin ripstop, standard (lower) neck, shorter drop.
const light = buildRug({ off: 0.012, hem: 0.82, rows: 64, binding: 0.007, neckLift: -0.04 });
await write(`${OUT_DIR}/lightweight-rug-on-horse.glb`, light, await albedo('light', { quilt: false, UM: light.UM, VM: light.VM }));
const pad = buildPad({ off: 0.014, rows: 30, cols: 44, binding: 0.009 });
await write(`${OUT_DIR}/saddle-pad-on-horse.glb`, pad, await albedo('pad', { quilt: true, UM: 0.9, VM: 1.4, cell: 0.085, W: 1024, H: 1024 }));
const bonnet = buildBonnet();
await write(`${OUT_DIR}/ear-bonnet-on-horse.glb`, bonnet, await bonnetAlbedo());
