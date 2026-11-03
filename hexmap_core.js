"use strict";
/* Shared by Map_maker.html and Battlemap.html: hex geometry, template art,
   map rendering, storage and map-file loading.
   Pages that load this must declare the globals `S` (the current map) and `bgImg`. */
/* =========================================================================
   CONSTANTS & GEOMETRY  (pointy-top hexes, "odd-r" offset layout)
   ========================================================================= */
const SQRT3 = Math.sqrt(3), TAU = Math.PI * 2, HEX = 50;   // HEX = hex radius in world px
const DIRS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];       // DIRS[i] is the neighbour across edge i
const COVER = {
  light: { fill:'rgba(70,185,85,0.55)', ring:'rgba(160,255,170,0.35)', label:'Light cover' },
  hard:  { fill:'rgba(62,66,74,0.92)',  ring:'rgba(185,195,210,0.40)', label:'Hard cover'  },
};
// Zones sit on their own layer, so a hex can be both cover and part of a zone
const ZONES = {
  deploy:  { col:'61,139,255', label:'Deployment zone', up:false, dash:null },
  extract: { col:'255,194,61', label:'Extraction zone', up:true,  dash:[0.22, 0.14] },
};
// Effects change what movement costs. Difficult terrain covers hexes (S.effects); a climb sits on
// the border between two neighbouring hexes (S.edges)
const EFFECTS = {
  difficult: { col:'214,160,90', label:'Difficult terrain' },
  dangerous: { col:'236,84,60',  label:'Dangerous terrain' },
  climb:     { col:'170,180,192', label:'Climb' },
};

const gridW = () => HEX * SQRT3 * (S.cols + 0.5);
const gridH = () => HEX * (1.5 * S.rows + 0.5);
const axToPx = (q, r) => ({ x: HEX*SQRT3*(q + r/2) + HEX*SQRT3/2, y: HEX*1.5*r + HEX });
const offToAx = (c, r) => ({ q: c - (r - (r & 1)) / 2, r });
const axToOff = (q, r) => ({ c: q + (r - (r & 1)) / 2, r });
const keyOf = (q, r) => { const o = axToOff(q, r); return o.c + ',' + o.r; };
function inB(q, r) { const o = axToOff(q, r); return o.r >= 0 && o.r < S.rows && o.c >= 0 && o.c < S.cols; }

function axRound(fq, fr) {
  const fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr), s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q, r };
}
function pxToAx(x, y) {
  const px = x - HEX*SQRT3/2, py = y - HEX;
  return axRound((px/SQRT3 - py/3) / HEX, (2/3 * py) / HEX);
}
// A border is stored under its two hexes' keys, in a fixed order
function edgeKey(a, b) { const ka = keyOf(a.q, a.r), kb = keyOf(b.q, b.r); return ka < kb ? ka + '|' + kb : kb + '|' + ka; }
function edgeEnds(key) {
  const [a, b] = key.split('|').map(k => { const [c, r] = k.split(',').map(Number); return offToAx(c, r); });
  const i = DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r); if (i < 0) return null;
  const p = axToPx(a.q, a.r); return [hexCorner(p.x, p.y, HEX, i), hexCorner(p.x, p.y, HEX, (i + 1) % 6)];
}
// The border nearest a point; dist is how far the point is from the border's midpoint
function edgeNear(x, y) {
  const a = pxToAx(x, y), p = axToPx(a.q, a.r);
  const i = ((Math.round(Math.atan2(y - p.y, x - p.x) / (Math.PI/3)) % 6) + 6) % 6;
  const b = { q: a.q + DIRS[i][0], r: a.r + DIRS[i][1] }, m = HEX*SQRT3/2;
  return { a, b, key: edgeKey(a, b), dist: Math.hypot(x - p.x - Math.cos(i*Math.PI/3)*m, y - p.y - Math.sin(i*Math.PI/3)*m) };
}
function rotAx(q, r, n) { n = ((n % 6) + 6) % 6; for (let i = 0; i < n; i++) { const t = q; q = -r; r = t + r; } return [q, r]; }
function brushCells(h, rad) {
  const out = [];
  for (let dq = -rad; dq <= rad; dq++)
    for (let dr = Math.max(-rad, -dq - rad); dr <= Math.min(rad, -dq + rad); dr++)
      out.push({ q: h.q + dq, r: h.r + dr });
  return out;
}
function footprint(type, q, r, rot) {
  return TEMPLATES[type].fp.map(([dq, dr]) => {
    const [a, b] = rotAx(dq, dr, rot); const Q = q + a, R = r + b; const p = axToPx(Q, R);
    return { q: Q, r: R, x: p.x, y: p.y };
  });
}

/* =========================================================================
   DRAWING HELPERS
   ========================================================================= */
function hexCorner(x, y, s, i) { const a = Math.PI/180 * (60*i - 30); return [x + s*Math.cos(a), y + s*Math.sin(a)]; }
function hexSub(ctx, x, y, s) {
  for (let i = 0; i < 6; i++) { const [px, py] = hexCorner(x, y, s, i); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath();
}
function footprintPath(ctx, cells, s) { ctx.beginPath(); cells.forEach(c => hexSub(ctx, c.x, c.y, s)); }
function outerEdges(cells, s) {
  const set = new Set(cells.map(c => c.q + ',' + c.r)), edges = [];
  cells.forEach(c => { for (let i = 0; i < 6; i++)
    if (!set.has((c.q + DIRS[i][0]) + ',' + (c.r + DIRS[i][1])))
      edges.push([hexCorner(c.x, c.y, s, i), hexCorner(c.x, c.y, s, (i + 1) % 6)]); });
  return edges;
}
function strokeEdges(ctx, edges, w, col) {
  ctx.beginPath(); edges.forEach(([a, b]) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}
function bbox(cells, s) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  cells.forEach(c => { x0 = Math.min(x0, c.x - s); y0 = Math.min(y0, c.y - s); x1 = Math.max(x1, c.x + s); y1 = Math.max(y1, c.y + s); });
  return { x0, y0, x1, y1 };
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w/2, h/2); ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
const rotV = (x, y, a) => [x*Math.cos(a) - y*Math.sin(a), x*Math.sin(a) + y*Math.cos(a)];
function rng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function light(ctx, x, y, r, col) {
  ctx.save(); ctx.globalAlpha *= 0.3; circle(ctx, x, y, r * 2.4); ctx.fillStyle = col; ctx.fill(); ctx.restore();
  circle(ctx, x, y, r); ctx.fillStyle = col; ctx.fill();
}
function vent(ctx, x, y, r, rot = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  circle(ctx, 0, 0, r); ctx.fillStyle = '#181d24'; ctx.fill(); ctx.lineWidth = r*0.2; ctx.strokeStyle = '#9aa3ad'; ctx.stroke();
  ctx.fillStyle = '#56606b';
  for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.ellipse(r*0.42, 0, r*0.38, r*0.15, 0.5, 0, TAU); ctx.fill(); }
  circle(ctx, 0, 0, r*0.18); ctx.fillStyle = '#9aa3ad'; ctx.fill();
  ctx.restore();
}
function acUnit(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const w = s*0.46, h = s*0.34;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w/2 + s*0.05, -h/2 + s*0.06, w, h);
  ctx.fillStyle = '#5b6470'; ctx.fillRect(-w/2, -h/2, w, h);
  ctx.strokeStyle = '#1c2026'; ctx.lineWidth = s*0.03; ctx.strokeRect(-w/2, -h/2, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = s*0.02;
  for (let i = 1; i < 5; i++) { const yy = -h/2 + h*i/5; ctx.beginPath(); ctx.moveTo(-w/2 + s*0.04, yy); ctx.lineTo(w*0.05, yy); ctx.stroke(); }
  circle(ctx, w*0.24, 0, h*0.32); ctx.fillStyle = '#2a3038'; ctx.fill(); ctx.strokeStyle = '#8b95a1'; ctx.stroke();
  ctx.restore();
}

/* Generic sci-fi building roof: fills the footprint, adds inset trim, accent edge and drop shadow */
const PAL = {
  bunker: { roof:'#6b7480', trim:'#4a525c', accent:'#4fd1ff' },
  hab:    { roof:'#aab5c1', trim:'#7b8794', accent:'#4fd1ff' },
  ware:   { roof:'#857558', trim:'#5c513e', accent:'#ffb347' },
  hq:     { roof:'#4b5563', trim:'#323a45', accent:'#ff6b3d' },
  barracks:{ roof:'#6f7a5a', trim:'#4c543d', accent:'#9be564' },
  reactor:{ roof:'#5d6670', trim:'#3c434c', accent:'#7dffb0' },
  factory:{ roof:'#7a5a46', trim:'#523b2e', accent:'#ffb347' },
  hangar: { roof:'#6f7a87', trim:'#4a535e', accent:'#4fd1ff' },
  arco:   { roof:'#4a5260', trim:'#2f3540', accent:'#c58bff' },
  arcoTop:{ roof:'#6a7484', trim:'#454d5a', accent:'#4fd1ff' },
};
function buildingBase(ctx, cells, s, pal) {
  ctx.save(); ctx.translate(s*0.12, s*0.16); footprintPath(ctx, cells, s);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.restore();
  footprintPath(ctx, cells, s); ctx.fillStyle = pal.roof; ctx.fill();
  const b = bbox(cells, s);
  ctx.save(); footprintPath(ctx, cells, s); ctx.clip();
  const g = ctx.createLinearGradient(b.x0, b.y0, b.x1, b.y1);
  g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.24)');
  ctx.fillStyle = g; ctx.fillRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
  ctx.restore();
  buildingTrim(ctx, cells, s, pal);
}
function buildingTrim(ctx, cells, s, pal) {
  const e = outerEdges(cells, s);
  ctx.save(); footprintPath(ctx, cells, s); ctx.clip();
  strokeEdges(ctx, e, s*0.40, 'rgba(0,0,0,0.45)');
  strokeEdges(ctx, e, s*0.35, pal.trim);
  strokeEdges(ctx, e, s*0.13, pal.accent);
  ctx.restore();
  strokeEdges(ctx, e, s*0.05, '#0a0c10');
}
/* Roof detail for big buildings: drawn in a frame centred on the building and turned with it,
   clipped to the whole footprint, then the edge trim is redrawn over it */
function roofDetail(ctx, cells, s, pal, rot, fn) {
  const m = centroid(cells);
  ctx.save(); footprintPath(ctx, cells, s); ctx.clip();
  ctx.translate(m.x, m.y); ctx.rotate(rot * Math.PI/3); fn();
  ctx.restore();
  buildingTrim(ctx, cells, s, pal);
}

/* Concrete jersey-barrier style bar with hazard-striped ends */
function drawBar(ctx, x, y, ang, L, W, s) {
  ctx.save(); ctx.translate(x + s*0.07, y + s*0.1); ctx.rotate(ang);
  rr(ctx, -L/2, -W/2, L, W, W*0.25); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.restore();

  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const g = ctx.createLinearGradient(0, -W/2, 0, W/2);
  g.addColorStop(0, '#b6bdc5'); g.addColorStop(0.5, '#8f979f'); g.addColorStop(1, '#5e656d');
  rr(ctx, -L/2, -W/2, L, W, W*0.25); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  const hz = Math.min(W*1.1, L*0.2), inner = L - 2*hz;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -L/2 : L/2 - hz;
    ctx.save(); ctx.beginPath(); ctx.rect(x0, -W/2, hz, W); ctx.clip();
    ctx.fillStyle = '#f2c230'; ctx.fillRect(x0, -W/2, hz, W);
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = W*0.22; ctx.lineCap = 'butt';
    for (let t = -W*2; t < hz + W*2; t += W*0.55) { ctx.beginPath(); ctx.moveTo(x0 + t, -W/2); ctx.lineTo(x0 + t + W, W/2); ctx.stroke(); }
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = W*0.07;
  const segs = Math.max(1, Math.round(inner / (W*1.8)));
  for (let i = 1; i < segs; i++) { const px = -L/2 + hz + inner*i/segs; ctx.beginPath(); ctx.moveTo(px, -W/2); ctx.lineTo(px, W/2); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(-L/2 + hz, -W*0.14, inner, W*0.13);
  ctx.fillStyle = 'rgba(79,209,255,0.9)'; ctx.fillRect(-L/2 + hz + W*0.25, W*0.2, Math.max(0, inner - W*0.5), W*0.08);
  ctx.restore();
  rr(ctx, -L/2, -W/2, L, W, W*0.25); ctx.strokeStyle = '#1c2026'; ctx.lineWidth = W*0.09; ctx.stroke();
  ctx.restore();
}

/* =========================================================================
   TEMPLATES (2D art)
   ========================================================================= */
function drawBarricade(ctx, cells, s, o) { const c = cells[0]; drawBar(ctx, c.x, c.y, o.rot * Math.PI/6, s*1.5, s*0.34, s); }
function drawWall(ctx, cells, s) {
  const a = cells[0], b = cells[cells.length - 1];
  drawBar(ctx, (a.x + b.x)/2, (a.y + b.y)/2, Math.atan2(b.y - a.y, b.x - a.x), Math.hypot(b.x - a.x, b.y - a.y) + s*1.2, s*0.38, s);
}
function drawCrates(ctx, cells, s, o) {
  const c = cells[0], rnd = rng(o.id*31 + o.rot), ang = o.rot * Math.PI/3;
  const cols = ['#6b705c', '#56606e', '#7a6248', '#5f6b52'];
  const [sx, sy] = rotV(s*0.07, s*0.1, -ang);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  [[-0.28, -0.2, 0.48], [0.27, 0.02, 0.42], [-0.05, 0.37, 0.34]].forEach(([bx, by, bs]) => {
    const a = (rnd() - 0.5) * 0.5, w = bs*s;
    ctx.save(); ctx.translate(bx*s, by*s); ctx.rotate(a);
    const [lx, ly] = rotV(sx, sy, -a);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-w/2 + lx, -w/2 + ly, w, w);
    ctx.fillStyle = cols[Math.floor(rnd() * cols.length)]; ctx.fillRect(-w/2, -w/2, w, w);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(-w/2, -w/2, w, w*0.45);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = s*0.025;
    ctx.strokeRect(-w*0.36, -w*0.36, w*0.72, w*0.72);
    ctx.beginPath(); ctx.moveTo(-w*0.36, -w*0.36); ctx.lineTo(w*0.36, w*0.36); ctx.moveTo(w*0.36, -w*0.36); ctx.lineTo(-w*0.36, w*0.36); ctx.stroke();
    ctx.fillStyle = '#ff8a3d'; ctx.fillRect(-w/2, -w/2, w, w*0.1);
    ctx.strokeStyle = '#1c2026'; ctx.lineWidth = s*0.035; ctx.strokeRect(-w/2, -w/2, w, w);
    ctx.restore();
  });
  ctx.restore();
}
function drawDebris(ctx, cells, s, o) {
  const c = cells[0], rnd = rng(o.id*7 + 3 + o.rot);
  const tones = ['#6e6a64', '#857c70', '#5b5f66', '#77706a'];
  const pieces = [];
  for (let i = 0; i < 8; i++) {
    const a = rnd()*TAU, d = Math.sqrt(rnd()) * s*0.55, r = s*(0.1 + rnd()*0.16), n = 5 + Math.floor(rnd()*3), pr = rnd()*TAU;
    const col = tones[Math.floor(rnd()*tones.length)], pts = [];
    for (let k = 0; k < n; k++) { const aa = pr + k/n*TAU, rad = r*(0.6 + rnd()*0.5); pts.push([Math.cos(a)*d + Math.cos(aa)*rad, Math.sin(a)*d + Math.sin(aa)*rad]); }
    pieces.push({ pts, col });
  }
  const poly = (pts, dx, dy) => { ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)); ctx.closePath(); };
  ctx.save(); ctx.translate(c.x, c.y);
  circle(ctx, 0, 0, s*0.72); ctx.fillStyle = 'rgba(95,85,72,0.3)'; ctx.fill();
  pieces.forEach(p => { poly(p.pts, s*0.06, s*0.08); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill(); });
  pieces.forEach(p => { poly(p.pts, 0, 0); ctx.fillStyle = p.col; ctx.fill(); ctx.strokeStyle = '#2a2826'; ctx.lineWidth = s*0.025; ctx.stroke(); });
  ctx.strokeStyle = '#a06a42'; ctx.lineWidth = s*0.028; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = rnd()*TAU, d = rnd()*s*0.4, x = Math.cos(a)*d, y = Math.sin(a)*d, b = rnd()*TAU;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(b)*s*0.3, y + Math.sin(b)*s*0.3); ctx.stroke();
  }
  ctx.restore();
}
function drawFlora(ctx, cells, s, o) {
  const c = cells[0], rnd = rng(o.id*13 + o.rot);
  const blobs = [];
  for (let i = 0; i < 7; i++) {
    const a = rnd()*TAU, d = Math.sqrt(rnd()) * s*0.45;
    blobs.push({ x: Math.cos(a)*d, y: Math.sin(a)*d, r: s*(0.17 + rnd()*0.14), p: rnd() < 0.65 });
  }
  ctx.save(); ctx.translate(c.x, c.y);
  blobs.forEach(b => { circle(ctx, b.x + s*0.07, b.y + s*0.09, b.r); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); });
  blobs.forEach(b => {
    const g = ctx.createRadialGradient(b.x - b.r*0.3, b.y - b.r*0.3, b.r*0.1, b.x, b.y, b.r);
    if (b.p) { g.addColorStop(0, '#6ff0d0'); g.addColorStop(1, '#126b5a'); } else { g.addColorStop(0, '#c99cff'); g.addColorStop(1, '#4a2a7a'); }
    circle(ctx, b.x, b.y, b.r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = s*0.02; ctx.stroke();
  });
  for (let i = 0; i < 6; i++) { const a = rnd()*TAU, d = rnd()*s*0.5; light(ctx, Math.cos(a)*d, Math.sin(a)*d, s*0.025, '#c8fff4'); }
  ctx.restore();
}
function drawContainer(ctx, cells, s, o) {
  const [a, b] = cells, ang = Math.atan2(b.y - a.y, b.x - a.x);
  const L = Math.hypot(b.x - a.x, b.y - a.y) + s*1.0, W = s*0.78, mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
  const col = ['#b5542d', '#2f6db0', '#4f8a3a', '#c99a22', '#7a3fa0'][Math.floor(rng(o.id*5 + 1)() * 5)];
  ctx.save(); ctx.translate(mx + s*0.08, my + s*0.11); ctx.rotate(ang); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-L/2, -W/2, L, W); ctx.restore();
  ctx.save(); ctx.translate(mx, my); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.fillRect(-L/2, -W/2, L, W);
  const g = ctx.createLinearGradient(0, -W/2, 0, W/2);
  g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(0,0,0,0.28)'); ctx.fillStyle = g; ctx.fillRect(-L/2, -W/2, L, W);
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = s*0.03;
  for (let x = -L/2 + s*0.2; x < L/2 - s*0.15; x += s*0.11) { ctx.beginPath(); ctx.moveTo(x, -W/2 + s*0.05); ctx.lineTo(x, W/2 - s*0.05); ctx.stroke(); }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-L/2, -W/2, s*0.12, W); ctx.fillRect(L/2 - s*0.12, -W/2, s*0.12, W);
  ctx.fillStyle = '#d8dde3';
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => ctx.fillRect(i*L/2 - (i > 0 ? s*0.1 : 0), j*W/2 - (j > 0 ? s*0.1 : 0), s*0.1, s*0.1));
  ctx.fillStyle = 'rgba(240,240,240,0.85)'; ctx.fillRect(-s*0.4, -s*0.07, s*0.8, s*0.14);
  ctx.fillStyle = '#1c2026'; for (let i = 0; i < 5; i++) ctx.fillRect(-s*0.34 + i*s*0.14, -s*0.035, s*0.08, s*0.07);
  ctx.strokeStyle = '#15181c'; ctx.lineWidth = s*0.04; ctx.strokeRect(-L/2, -W/2, L, W);
  ctx.restore();
}
function drawTanks(ctx, cells, s, o) {
  const c = cells[0], ang = o.rot * Math.PI/3, [sx, sy] = rotV(s*0.07, s*0.1, -ang);
  const tanks = [[-0.27, -0.13, 0.4], [0.37, 0.23, 0.3]];
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.strokeStyle = '#2d333b'; ctx.lineWidth = s*0.13; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-0.27*s, -0.13*s); ctx.lineTo(0.37*s, 0.23*s); ctx.stroke();
  ctx.strokeStyle = '#7d8793'; ctx.lineWidth = s*0.07; ctx.stroke();
  tanks.forEach(([tx, ty, tr]) => { circle(ctx, tx*s + sx, ty*s + sy, tr*s); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); });
  tanks.forEach(([tx, ty, tr]) => {
    const x = tx*s, y = ty*s, r = tr*s;
    const g = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.1, x, y, r);
    g.addColorStop(0, '#eef1f4'); g.addColorStop(0.6, '#a9b2bc'); g.addColorStop(1, '#5f6873');
    circle(ctx, x, y, r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1f242a'; ctx.lineWidth = s*0.04; ctx.stroke();
    circle(ctx, x, y, r*0.68); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = s*0.025; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, r*0.86, -0.6, 0.6); ctx.strokeStyle = '#ff6b3d'; ctx.lineWidth = s*0.05; ctx.stroke();
    circle(ctx, x, y, r*0.2); ctx.fillStyle = '#3a414a'; ctx.fill();
  });
  ctx.restore();
}
function drawComms(ctx, cells, s, o) {
  const c = cells[0], ang = o.rot * Math.PI/3, [sx, sy] = rotV(s*0.08, s*0.11, -ang);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.beginPath(); hexSub(ctx, sx, sy, s*0.62); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
  ctx.beginPath(); hexSub(ctx, 0, 0, s*0.62); ctx.fillStyle = '#39404a'; ctx.fill(); ctx.strokeStyle = '#1b1f25'; ctx.lineWidth = s*0.04; ctx.stroke();
  ctx.beginPath(); hexSub(ctx, 0, 0, s*0.5); ctx.strokeStyle = '#f2c230'; ctx.setLineDash([s*0.08, s*0.08]); ctx.lineWidth = s*0.04; ctx.stroke(); ctx.setLineDash([]);
  const dx = s*0.05, dy = -s*0.05, R = s*0.43;
  circle(ctx, dx + sx*1.4, dy + sy*1.4, R); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill();
  const g = ctx.createRadialGradient(dx - R*0.3, dy - R*0.3, R*0.1, dx, dy, R);
  g.addColorStop(0, '#f3f5f7'); g.addColorStop(0.7, '#aab3bd'); g.addColorStop(1, '#6b7480');
  circle(ctx, dx, dy, R); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#22272e'; ctx.lineWidth = s*0.04; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = s*0.018;
  circle(ctx, dx, dy, R*0.66); ctx.stroke();
  for (let i = 0; i < 8; i++) { const a = i/8*TAU; ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx + Math.cos(a)*R, dy + Math.sin(a)*R); ctx.stroke(); }
  const fx = dx + R*0.2, fy = dy - R*0.2;
  ctx.strokeStyle = '#2b3038'; ctx.lineWidth = s*0.035;
  [Math.PI/2, Math.PI*7/6, -Math.PI/6].forEach(a => { ctx.beginPath(); ctx.moveTo(dx + Math.cos(a)*R*0.95, dy + Math.sin(a)*R*0.95); ctx.lineTo(fx, fy); ctx.stroke(); });
  circle(ctx, fx, fy, s*0.07); ctx.fillStyle = '#2b3038'; ctx.fill();
  light(ctx, fx, fy, s*0.03, '#ff4040');
  ctx.restore();
}
function drawBunker(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.bunker);
  const c = cells[0];
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(o.rot * Math.PI/3);
  ctx.beginPath(); hexSub(ctx, 0, 0, s*0.46); ctx.fillStyle = '#7f8995'; ctx.fill(); ctx.lineWidth = s*0.04; ctx.strokeStyle = '#2b3038'; ctx.stroke();
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(s*0.47, -s*0.24, s*0.14, s*0.48);
  ctx.fillStyle = 'rgba(79,209,255,0.9)'; ctx.fillRect(s*0.53, -s*0.2, s*0.035, s*0.4);
  circle(ctx, 0, 0, s*0.2); ctx.fillStyle = '#59616c'; ctx.fill(); ctx.strokeStyle = '#2b3038'; ctx.lineWidth = s*0.035; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s*0.13, 0); ctx.lineTo(s*0.13, 0); ctx.moveTo(0, -s*0.13); ctx.lineTo(0, s*0.13); ctx.stroke();
  light(ctx, -s*0.3, -s*0.42, s*0.035, '#ff6b3d');
  ctx.restore();
}
function drawHab(ctx, cells, s) {
  buildingBase(ctx, cells, s, PAL.hab);
  const [a, b] = cells, ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = '#2c333c'; ctx.lineWidth = s*0.36; ctx.stroke();
  ctx.strokeStyle = '#8995a3'; ctx.lineWidth = s*0.28; ctx.stroke();
  ctx.strokeStyle = 'rgba(79,209,255,0.85)'; ctx.lineWidth = s*0.04; ctx.lineCap = 'butt'; ctx.stroke();
  [a, b].forEach(c => vent(ctx, c.x, c.y, s*0.27, ang));
  ctx.save(); ctx.translate((a.x + b.x)/2, (a.y + b.y)/2); ctx.rotate(ang);
  ctx.fillStyle = '#26384a';
  for (const side of [-1, 1]) for (let i = -1; i <= 1; i++) {
    ctx.fillRect(i*s*0.2 - s*0.07, side*s*0.42 - s*0.08, s*0.14, s*0.16);
    ctx.fillStyle = 'rgba(79,209,255,0.35)'; ctx.fillRect(i*s*0.2 - s*0.07, side*s*0.42 - s*0.08, s*0.14, s*0.05); ctx.fillStyle = '#26384a';
  }
  ctx.restore();
}
function drawWarehouse(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.ware);
  const cx = cells.reduce((t, c) => t + c.x, 0) / cells.length, cy = cells.reduce((t, c) => t + c.y, 0) / cells.length;
  ctx.save(); footprintPath(ctx, cells, s*0.8); ctx.clip();
  ctx.translate(cx, cy); ctx.rotate(o.rot * Math.PI/3);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = s*0.035;
  for (let x = -2.5*s; x <= 2.5*s; x += s*0.16) { ctx.beginPath(); ctx.moveTo(x, -2.5*s); ctx.lineTo(x, 2.5*s); ctx.stroke(); }
  ctx.restore();
  vent(ctx, cells[0].x, cells[0].y, s*0.32, o.rot);
  for (const c of [cells[1], cells[2]]) {
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(o.rot * Math.PI/3 + Math.PI/2);
    ctx.fillStyle = '#1c2a35'; ctx.fillRect(-s*0.3, -s*0.14, s*0.6, s*0.28);
    ctx.fillStyle = 'rgba(120,215,255,0.5)'; ctx.fillRect(-s*0.27, -s*0.11, s*0.54, s*0.1);
    ctx.strokeStyle = '#2d2a24'; ctx.lineWidth = s*0.03; ctx.strokeRect(-s*0.3, -s*0.14, s*0.6, s*0.28);
    ctx.beginPath(); ctx.moveTo(0, -s*0.14); ctx.lineTo(0, s*0.14); ctx.stroke();
    ctx.restore();
  }
  light(ctx, cx, cy, s*0.05, PAL.ware.accent);
}
function drawHQ(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.hq);
  const c = cells[0];
  for (let i = 1; i < cells.length; i++) {
    const k = cells[i], ang = Math.atan2(k.y - c.y, k.x - c.x);
    if (i % 2) vent(ctx, k.x, k.y, s*0.25, ang); else acUnit(ctx, k.x, k.y, s, ang);
    light(ctx, c.x + (k.x - c.x)*1.42, c.y + (k.y - c.y)*1.42, s*0.05, PAL.hq.accent);
  }
  ctx.beginPath(); hexSub(ctx, c.x, c.y, s*0.95); ctx.fillStyle = '#39414d'; ctx.fill(); ctx.lineWidth = s*0.06; ctx.strokeStyle = '#1b2028'; ctx.stroke();
  circle(ctx, c.x, c.y, s*0.6); ctx.fillStyle = '#262c35'; ctx.fill(); ctx.lineWidth = s*0.06; ctx.strokeStyle = '#f2c230'; ctx.stroke();
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(o.rot * Math.PI/3);
  ctx.strokeStyle = '#f2c230'; ctx.lineWidth = s*0.09; ctx.lineCap = 'butt'; ctx.beginPath();
  ctx.moveTo(-s*0.2, -s*0.28); ctx.lineTo(-s*0.2, s*0.28); ctx.moveTo(s*0.2, -s*0.28); ctx.lineTo(s*0.2, s*0.28);
  ctx.moveTo(-s*0.2, 0); ctx.lineTo(s*0.2, 0); ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 8; i++) { const a = i/8*TAU; light(ctx, c.x + Math.cos(a)*s*0.77, c.y + Math.sin(a)*s*0.77, s*0.035, '#4fd1ff'); }
}

/* ---------- Large buildings ---------- */
function centroid(cells) { return { x: cells.reduce((t, c) => t + c.x, 0) / cells.length, y: cells.reduce((t, c) => t + c.y, 0) / cells.length }; }
function solar(ctx, x, y, s, ang) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  const w = s*0.62, h = s*0.4;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-w/2 + s*0.05, -h/2 + s*0.06, w, h);
  const g = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2); g.addColorStop(0, '#2c5a8c'); g.addColorStop(1, '#14284a');
  ctx.fillStyle = g; ctx.fillRect(-w/2, -h/2, w, h);
  ctx.strokeStyle = 'rgba(140,195,255,0.45)'; ctx.lineWidth = s*0.015; ctx.beginPath();
  for (let i = 1; i < 4; i++) { const xx = -w/2 + w*i/4; ctx.moveTo(xx, -h/2); ctx.lineTo(xx, h/2); }
  ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = s*0.03; ctx.strokeRect(-w/2, -h/2, w, h);
  ctx.restore();
}
function tank(ctx, x, y, r, s) {
  circle(ctx, x + s*0.07, y + s*0.1, r); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  const g = ctx.createRadialGradient(x - r*0.35, y - r*0.35, r*0.1, x, y, r);
  g.addColorStop(0, '#eef1f4'); g.addColorStop(0.6, '#a9b2bc'); g.addColorStop(1, '#5f6873');
  circle(ctx, x, y, r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1f242a'; ctx.lineWidth = s*0.035; ctx.stroke();
  circle(ctx, x, y, r*0.3); ctx.fillStyle = '#3a414a'; ctx.fill();
}
function smokestack(ctx, x, y, r, s, seed) {
  const rnd = rng(seed);
  ctx.save(); ctx.globalAlpha *= 0.28;
  for (let i = 0; i < 4; i++) { circle(ctx, x + s*(0.25 + i*0.22) + rnd()*s*0.1, y - s*(0.15 + i*0.18), r*(1 + i*0.35)); ctx.fillStyle = '#c9ccd1'; ctx.fill(); }
  ctx.restore();
  circle(ctx, x + s*0.18, y + s*0.24, r); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  const g = ctx.createRadialGradient(x - r*0.4, y - r*0.4, r*0.1, x, y, r);
  g.addColorStop(0, '#a9aeb5'); g.addColorStop(1, '#4b5058');
  circle(ctx, x, y, r); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1c2026'; ctx.lineWidth = s*0.035; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r*0.85, 0, TAU); ctx.strokeStyle = '#d8443a'; ctx.lineWidth = r*0.18; ctx.stroke();
  circle(ctx, x, y, r*0.55); ctx.fillStyle = '#0b0d10'; ctx.fill();
}

function drawBarracks(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.barracks);
  const m = centroid(cells), ang = o.rot * Math.PI/3;
  roofDetail(ctx, cells, s, PAL.barracks, o.rot, () => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-4*s, -s*0.05, 8*s, s*0.1);
    ctx.fillStyle = 'rgba(255,255,255,0.13)'; ctx.fillRect(-4*s, -s*0.13, 8*s, s*0.08);
  });
  cells.forEach((c, i) => {
    const kind = i % 3;
    if (kind === 0) solar(ctx, c.x, c.y, s, ang); else if (kind === 1) vent(ctx, c.x, c.y, s*0.24, ang); else acUnit(ctx, c.x, c.y, s, ang);
  });
  light(ctx, m.x, m.y, s*0.05, PAL.barracks.accent);
}
function drawReactor(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.reactor);
  const c = cells[0], ang = o.rot * Math.PI/3;
  ctx.lineCap = 'round';
  for (let i = 1; i < cells.length; i++) {
    const k = cells[i];
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(k.x, k.y);
    ctx.strokeStyle = '#2d333b'; ctx.lineWidth = s*0.2; ctx.stroke();
    ctx.strokeStyle = '#8b95a1'; ctx.lineWidth = s*0.12; ctx.stroke();
    if (i % 2) tank(ctx, k.x, k.y, s*0.36, s); else vent(ctx, k.x, k.y, s*0.27, Math.atan2(k.y - c.y, k.x - c.x));
  }
  // cooling tower
  circle(ctx, c.x + s*0.2, c.y + s*0.28, s*1.02); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  const g = ctx.createRadialGradient(c.x - s*0.4, c.y - s*0.4, s*0.1, c.x, c.y, s*1.02);
  g.addColorStop(0, '#dde2e7'); g.addColorStop(0.7, '#9aa3ad'); g.addColorStop(1, '#5f6873');
  circle(ctx, c.x, c.y, s*1.02); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#1f242a'; ctx.lineWidth = s*0.05; ctx.stroke();
  circle(ctx, c.x, c.y, s*0.72); ctx.fillStyle = '#14181d'; ctx.fill();
  const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, s*0.7);
  glow.addColorStop(0, 'rgba(160,255,200,0.95)'); glow.addColorStop(0.45, 'rgba(60,220,140,0.45)'); glow.addColorStop(1, 'rgba(60,220,140,0)');
  circle(ctx, c.x, c.y, s*0.7); ctx.fillStyle = glow; ctx.fill();
  ctx.setLineDash([s*0.12, s*0.12]); circle(ctx, c.x, c.y, s*0.87);
  ctx.strokeStyle = '#f2c230'; ctx.lineWidth = s*0.07; ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.fillStyle = '#3a414a'; ctx.fillRect(-s*0.95, -s*0.07, s*1.9, s*0.14);
  ctx.strokeStyle = '#1c2026'; ctx.lineWidth = s*0.03; ctx.strokeRect(-s*0.95, -s*0.07, s*1.9, s*0.14);
  ctx.restore();
}
function drawLandingPad(ctx, cells, s, o) {
  const c = cells[0], ang = o.rot * Math.PI/3, e = outerEdges(cells, s);
  footprintPath(ctx, cells, s); ctx.fillStyle = '#2a2f36'; ctx.fill();
  ctx.save(); footprintPath(ctx, cells, s); ctx.clip();
  ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = s*0.03; ctx.beginPath();
  for (let x = -3*s; x <= 3*s; x += s*0.5) { ctx.moveTo(x, -3*s); ctx.lineTo(x, 3*s); ctx.moveTo(-3*s, x); ctx.lineTo(3*s, x); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (const [x, y, r] of [[-0.9, 0.5, 0.35], [0.7, -0.8, 0.25], [1.1, 0.9, 0.3]]) { circle(ctx, x*s, y*s, r*s); ctx.fill(); }
  ctx.restore();
  strokeEdges(ctx, e, s*0.16, '#f2c230');
  ctx.setLineDash([s*0.18, s*0.18]); strokeEdges(ctx, e, s*0.16, '#1a1a1a'); ctx.setLineDash([]);
  strokeEdges(ctx, e, s*0.04, '#0a0c10');
  circle(ctx, c.x, c.y, s*1.25); ctx.strokeStyle = '#d8dde3'; ctx.lineWidth = s*0.1; ctx.stroke();
  ctx.setLineDash([s*0.25, s*0.15]); circle(ctx, c.x, c.y, s*1.02); ctx.lineWidth = s*0.04; ctx.stroke(); ctx.setLineDash([]);
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  ctx.strokeStyle = '#d8dde3'; ctx.lineWidth = s*0.14; ctx.lineCap = 'butt'; ctx.beginPath();
  ctx.moveTo(-s*0.3, -s*0.45); ctx.lineTo(-s*0.3, s*0.45); ctx.moveTo(s*0.3, -s*0.45); ctx.lineTo(s*0.3, s*0.45);
  ctx.moveTo(-s*0.3, 0); ctx.lineTo(s*0.3, 0); ctx.stroke();
  ctx.fillStyle = '#f2c230'; ctx.beginPath(); ctx.moveTo(s*1.55, 0); ctx.lineTo(s*1.35, -s*0.16); ctx.lineTo(s*1.35, s*0.16); ctx.closePath(); ctx.fill();
  ctx.restore();
  for (let i = 1; i < cells.length; i++) {
    const k = cells[i];
    light(ctx, c.x + (k.x - c.x)*1.45, c.y + (k.y - c.y)*1.45, s*0.05, i % 2 ? '#4fd1ff' : '#ff6b3d');
  }
}
function drawFactory(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.factory);
  const m = centroid(cells), ang = o.rot * Math.PI/3;
  roofDetail(ctx, cells, s, PAL.factory, o.rot, () => {
    for (let x = -5*s; x < 5*s; x += s*0.5) {      // sawtooth roof with skylights
      ctx.fillStyle = 'rgba(255,255,255,0.09)'; ctx.fillRect(x, -5*s, s*0.25, 10*s);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + s*0.25, -5*s, s*0.05, 10*s);
      ctx.fillStyle = 'rgba(120,215,255,0.28)'; ctx.fillRect(x + s*0.3, -5*s, s*0.1, 10*s);
    }
  });
  [5, 6].forEach(i => acUnit(ctx, cells[i].x, cells[i].y, s, ang));
  [9, 10].forEach(i => vent(ctx, cells[i].x, cells[i].y, s*0.27, ang));
  [1, 2].forEach(i => smokestack(ctx, cells[i].x, cells[i].y, s*0.36, s, o.id*3 + i));
  [0, 3, 8, 11].forEach(i => light(ctx, cells[i].x, cells[i].y, s*0.05, PAL.factory.accent));
}
function drawHangar(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.hangar);
  const m = centroid(cells), ang = o.rot * Math.PI/3;
  roofDetail(ctx, cells, s, PAL.hangar, o.rot, () => {
  const g = ctx.createLinearGradient(0, -2.2*s, 0, 2.2*s);           // barrel roof shading
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(0.4, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = g; ctx.fillRect(-5*s, -2.5*s, 10*s, 5*s);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = s*0.04; ctx.beginPath();
  for (let x = -5*s; x <= 5*s; x += s*0.42) { ctx.moveTo(x, -2.5*s); ctx.lineTo(x, 2.5*s); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-5*s, -s*0.38, 10*s, s*0.06);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.font = `bold ${s*0.9}px Consolas, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('H-' + String(o.id % 100).padStart(2, '0'), 0, s*0.6);
  });
  // big door on the +x end
  ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
  const dx = SQRT3*s*2 + s*0.55, dw = s*0.28, dh = s*1.5;
  ctx.fillStyle = '#1c2026'; ctx.fillRect(dx - dw, -dh/2, dw, dh);
  ctx.save(); ctx.beginPath(); ctx.rect(dx - dw, -dh/2, dw, dh); ctx.clip();
  ctx.strokeStyle = '#f2c230'; ctx.lineWidth = s*0.07;
  for (let t = -dh; t < dh; t += s*0.2) { ctx.beginPath(); ctx.moveTo(dx - dw, t); ctx.lineTo(dx, t + dw); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#0a0c10'; ctx.lineWidth = s*0.04; ctx.strokeRect(dx - dw, -dh/2, dw, dh);
  for (const y of [-1, 1]) light(ctx, dx - dw/2, y*(dh/2 + s*0.1), s*0.05, '#ff6b3d');
  ctx.restore();
}
function drawArcology(ctx, cells, s, o) {
  buildingBase(ctx, cells, s, PAL.arco);
  const c = cells[0], ang = o.rot * Math.PI/3, rnd = rng(o.id*17 + 5);
  for (let i = 7; i < cells.length; i++) {          // outer ring: rooftop gardens, solar, plant
    const k = cells[i], a = Math.atan2(k.y - c.y, k.x - c.x), roll = rnd();
    if (roll < 0.3) {
      for (let j = 0; j < 4; j++) {
        const bx = k.x + (rnd() - 0.5)*s*0.6, by = k.y + (rnd() - 0.5)*s*0.6, br = s*(0.14 + rnd()*0.1);
        const g = ctx.createRadialGradient(bx - br*0.3, by - br*0.3, br*0.1, bx, by, br);
        g.addColorStop(0, '#8fe08a'); g.addColorStop(1, '#2d6a35');
        circle(ctx, bx, by, br); ctx.fillStyle = g; ctx.fill();
      }
    } else if (roll < 0.6) solar(ctx, k.x, k.y, s, a + Math.PI/2);
    else if (roll < 0.8) acUnit(ctx, k.x, k.y, s, a);
    else vent(ctx, k.x, k.y, s*0.25, a);
  }
  // raised second tier (the inner 7 hexes, scaled about the centre)
  ctx.save(); ctx.translate(c.x, c.y); ctx.scale(0.86, 0.86); ctx.translate(-c.x, -c.y);
  ctx.save(); ctx.translate(s*0.15, s*0.2); footprintPath(ctx, cells.slice(0, 7), s); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.restore();
  buildingBase(ctx, cells.slice(0, 7), s, PAL.arcoTop);
  for (let i = 1; i < 7; i++) {
    const k = cells[i], a = Math.atan2(k.y - c.y, k.x - c.x);
    if (i % 2) vent(ctx, k.x, k.y, s*0.26, a); else acUnit(ctx, k.x, k.y, s, a);
  }
  ctx.restore();
  // central spire
  ctx.beginPath(); hexSub(ctx, c.x + s*0.12, c.y + s*0.16, s*0.72); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
  ctx.beginPath(); hexSub(ctx, c.x, c.y, s*0.72); ctx.fillStyle = '#2a313b'; ctx.fill(); ctx.strokeStyle = '#c58bff'; ctx.lineWidth = s*0.06; ctx.stroke();
  for (let i = 0; i < 6; i++) { const [x, y] = hexCorner(c.x, c.y, s*0.6, i); light(ctx, x, y, s*0.035, '#4fd1ff'); }
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(ang);
  circle(ctx, 0, 0, s*0.28); ctx.fillStyle = '#59616c'; ctx.fill(); ctx.strokeStyle = '#1c2026'; ctx.lineWidth = s*0.035; ctx.stroke();
  ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = s*0.05; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s*0.5, 0); ctx.stroke();
  light(ctx, s*0.5, 0, s*0.045, '#ff4040');
  ctx.restore();
}

// footprint helpers: FLOWER = centre + 6 neighbours (centre first), RING2 = radius-2 hexagon (inner 7 first),
// rowsFp([[r, qFrom, qTo], ...]) = rows of hexes
const FLOWER = [[0,0], ...DIRS];
const hexDist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
const RING2 = brushCells({ q:0, r:0 }, 2).map(c => [c.q, c.r]).sort((a, b) => hexDist(a) - hexDist(b));
const rowsFp = rows => rows.flatMap(([r, q0, q1]) => Array.from({ length: q1 - q0 + 1 }, (_, i) => [q0 + i, r]));

const TEMPLATES = {
  barricade: { name:'Barricade',       cat:'Cover',     fp:[[0,0]],                 cover:'hard',  rotStep:30, draw:drawBarricade },
  wall:      { name:'Barricade Wall',  cat:'Cover',     fp:[[-1,0],[0,0],[1,0]],    cover:'hard',  rotStep:60, draw:drawWall },
  crates:    { name:'Cargo Crates',    cat:'Cover',     fp:[[0,0]],                 cover:'hard',  rotStep:60, draw:drawCrates },
  debris:    { name:'Debris',          cat:'Cover',     fp:[[0,0]],                 cover:'light', rotStep:60, draw:drawDebris },
  flora:     { name:'Alien Flora',     cat:'Cover',     fp:[[0,0]],                 cover:'light', rotStep:60, draw:drawFlora },
  container: { name:'Cargo Container', cat:'Props',     fp:[[0,0],[1,0]],           cover:'hard',  rotStep:60, draw:drawContainer },
  tanks:     { name:'Fuel Tanks',      cat:'Props',     fp:[[0,0]],                 cover:'hard',  rotStep:60, draw:drawTanks },
  comms:     { name:'Comms Dish',      cat:'Props',     fp:[[0,0]],                 cover:'hard',  rotStep:60, draw:drawComms },
  bunker:    { name:'Bunker',          cat:'Buildings', fp:[[0,0]],                 cover:'hard',  roof:true, rotStep:60, draw:drawBunker },
  hab:       { name:'Hab Module',      cat:'Buildings', fp:[[0,0],[1,0]],           cover:'hard',  roof:true, rotStep:60, draw:drawHab },
  warehouse: { name:'Warehouse',       cat:'Buildings', fp:[[0,0],[1,0],[0,1]],     cover:'hard',  roof:true, rotStep:60, draw:drawWarehouse },
  hq:        { name:'Command Center',  cat:'Buildings', fp:FLOWER, cover:'hard', roof:true, rotStep:60, draw:drawHQ },
  barracks:  { name:'Barracks',        cat:'Large Buildings', fp:[[0,0],[1,0],[2,0],[-1,1],[0,1],[1,1]], cover:'hard', roof:true, rotStep:60, draw:drawBarracks },
  reactor:   { name:'Reactor',         cat:'Large Buildings', fp:FLOWER,  cover:'hard', roof:true, rotStep:60, draw:drawReactor },
  pad:       { name:'Landing Pad',     cat:'Large Buildings', fp:FLOWER,  cover:null,   rotStep:60, draw:drawLandingPad },
  factory:   { name:'Factory',         cat:'Large Buildings', fp:rowsFp([[-1,-1,2],[0,-2,1],[1,-2,1]]), cover:'hard', roof:true, rotStep:60, draw:drawFactory },
  hangar:    { name:'Hangar',          cat:'Large Buildings', fp:rowsFp([[-1,-1,2],[0,-2,2],[1,-2,1]]), cover:'hard', roof:true, rotStep:60, draw:drawHangar },
  arcology:  { name:'Arcology',        cat:'Large Buildings', fp:RING2,   cover:'hard', roof:true, rotStep:60, draw:drawArcology },
};

// Buildings (templates with roof:true) can be climbed onto and walked across.
// The borders around a building's footprint, as climb keys; borders on the map's edge are left out
function outlineEdges(cells) {
  const own = new Set(cells.map(c => c.q + ',' + c.r)), out = [];
  for (const c of cells) for (const [dq, dr] of DIRS) {
    const n = { q: c.q + dq, r: c.r + dr };
    if (!own.has(n.q + ',' + n.r) && inB(n.q, n.r)) out.push(edgeKey(c, n));
  }
  return out;
}
// Lines (S.lines) are drawn freely across the map, like a cliff edge or a wall. Each one is a single
// object, and its kind decides what it does to the hex borders it runs through (for now: makes them climbs).
// Points are in map pixels; `closed` joins the last point back to the first.
const LINE_KINDS = {
  climb: { label:'Climb line', col:'170,180,192', edge:'climb' },
};
// The borders a line runs through: those where the line crosses the step between the two hex centres an odd
// number of times (so a sharp bend that crosses it twice doesn't count, and a closed shape gives a closed ring).
// Consecutive borders share a corner, so the climbs form an unbroken chain, also where two lines meet.
function lineEdges(pts, closed) {
  const odd = new Set(), n = pts.length, segs = closed && n > 2 ? n : n - 1;
  const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  for (let i = 0; i < segs; i++) {
    const P = pts[i], Q = pts[(i + 1) % n];
    if (Math.hypot(Q.x - P.x, Q.y - P.y) < 1e-6) continue;
    const pad = HEX * 3, r0 = Math.max(0, Math.floor((Math.min(P.y, Q.y) - pad) / (HEX*1.5))), r1 = Math.min(S.rows - 1, Math.ceil((Math.max(P.y, Q.y) + pad) / (HEX*1.5)));
    const c0 = Math.max(0, Math.floor((Math.min(P.x, Q.x) - pad) / (HEX*SQRT3))), c1 = Math.min(S.cols - 1, Math.ceil((Math.max(P.x, Q.x) + pad) / (HEX*SQRT3)));
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const a = offToAx(col, row), A = axToPx(a.q, a.r), sa = cross(P, Q, A) >= 0;
      for (const [dq, dr] of DIRS.slice(0, 3)) {     // each border once
        const b = { q: a.q + dq, r: a.r + dr }; if (!inB(b.q, b.r)) continue;
        const B = axToPx(b.q, b.r); if ((cross(P, Q, B) >= 0) === sa) continue;
        const dp = cross(A, B, P), dqq = cross(A, B, Q); if (dp === dqq) continue;
        // where the line crosses the step between the two centres; a crossing exactly on a point counts once
        const t = dp / (dp - dqq), k = edgeKey(a, b);
        if (t >= 0 && (t < 1 || (i === segs - 1 && !closed))) odd.has(k) ? odd.delete(k) : odd.add(k);
      }
    }
  }
  return [...odd];
}
// The climbs that belong to a building or a line (climbs drawn by hand belong to neither)
function ownedClimbs() { return new Set(S.objects.concat(S.lines).flatMap(x => x.climbs || [])); }
// Map keys of every hex that is part of a building's roof
function roofHexes() {
  const out = new Set();
  for (const o of S.objects) if (TEMPLATES[o.type] && TEMPLATES[o.type].roof)
    footprint(o.type, o.q, o.r, o.rot).forEach(c => out.add(keyOf(c.q, c.r)));
  return out;
}

/* =========================================================================
   MAP RENDERING
   ========================================================================= */
// The finished map, without any cursor previews
function drawMapLayers(ctx, lw) {
  const W = gridW(), H = gridH();
  ctx.fillStyle = '#1a1f27'; ctx.fillRect(0, 0, W, H);
  if (bgImg) { ctx.globalAlpha = S.bgOpacity; ctx.drawImage(bgImg, 0, 0, W, H); ctx.globalAlpha = 1; }

  // cover fills, batched per type
  for (const type of ['light', 'hard']) {
    const fill = new Path2D(), ring = new Path2D(); let any = false;
    for (const k in S.cells) {
      if (S.cells[k] !== type) continue;
      const [c, r] = k.split(',').map(Number), a = offToAx(c, r), p = axToPx(a.q, a.r);
      hexSub(fill, p.x, p.y, HEX); hexSub(ring, p.x, p.y, HEX*0.78); any = true;
    }
    if (!any) continue;
    ctx.fillStyle = COVER[type].fill; ctx.fill(fill);
    ctx.strokeStyle = COVER[type].ring; ctx.lineWidth = HEX*0.05; ctx.stroke(ring);
  }

  drawDifficult(ctx);
  drawDangerous(ctx);
  drawZones(ctx);

  if (S.showGrid) {
    const g = new Path2D();
    for (let r = 0; r < S.rows; r++) for (let c = 0; c < S.cols; c++) { const a = offToAx(c, r), p = axToPx(a.q, a.r); hexSub(g, p.x, p.y, HEX); }
    ctx.strokeStyle = `rgba(210,225,245,${S.gridOpacity})`; ctx.lineWidth = lw; ctx.stroke(g);
  }

  for (const o of S.objects) {
    const T = TEMPLATES[o.type]; if (!T) continue;
    ctx.save(); T.draw(ctx, footprint(o.type, o.q, o.r, o.rot), HEX, o); ctx.restore();
  }
  for (const k in S.edges) { const e = edgeEnds(k); if (e) drawClimb(ctx, e[0], e[1]); }

  ctx.strokeStyle = 'rgba(255,107,61,0.5)'; ctx.lineWidth = lw * 1.5; ctx.strokeRect(0, 0, W, H);
}

function drawDifficult(ctx) {
  const cells = [], col = EFFECTS.difficult.col;
  for (const k in S.effects) {
    if (S.effects[k] !== 'difficult') continue;
    const [c, r] = k.split(',').map(Number), a = offToAx(c, r), p = axToPx(a.q, a.r);
    cells.push({ q: a.q, r: a.r, x: p.x, y: p.y });
  }
  if (!cells.length) return;
  const path = new Path2D(); cells.forEach(c => hexSub(path, c.x, c.y, HEX));
  ctx.fillStyle = `rgba(${col},0.16)`; ctx.fill(path);
  ctx.save(); ctx.clip(path);   // cross-hatching, so it reads differently from the zones' stripes
  const b = bbox(cells, HEX), h = b.y1 - b.y0;
  ctx.beginPath();
  for (let t = b.x0 - h; t < b.x1; t += HEX*0.4) { ctx.moveTo(t, b.y1); ctx.lineTo(t + h, b.y0); ctx.moveTo(t, b.y0); ctx.lineTo(t + h, b.y1); }
  ctx.strokeStyle = `rgba(${col},0.38)`; ctx.lineWidth = HEX*0.045; ctx.stroke();
  ctx.restore();
  ctx.setLineDash([HEX*0.16, HEX*0.1]); strokeEdges(ctx, outerEdges(cells, HEX), HEX*0.05, `rgba(${col},0.85)`); ctx.setLineDash([]);
}
// Dangerous terrain: a red tint with a hazard triangle in every hex
function drawDangerous(ctx) {
  const cells = [], col = EFFECTS.dangerous.col;
  for (const k in S.effects) {
    if (S.effects[k] !== 'dangerous') continue;
    const [c, r] = k.split(',').map(Number), a = offToAx(c, r), p = axToPx(a.q, a.r);
    cells.push({ q: a.q, r: a.r, x: p.x, y: p.y });
  }
  if (!cells.length) return;
  footprintPath(ctx, cells, HEX); ctx.fillStyle = `rgba(${col},0.18)`; ctx.fill();
  ctx.setLineDash([HEX*0.16, HEX*0.1]); strokeEdges(ctx, outerEdges(cells, HEX), HEX*0.05, `rgba(${col},0.9)`); ctx.setLineDash([]);
  const tri = new Path2D(), bang = new Path2D(), s = HEX*0.3;
  cells.forEach(c => {
    tri.moveTo(c.x, c.y - s); tri.lineTo(c.x + s*0.95, c.y + s*0.65); tri.lineTo(c.x - s*0.95, c.y + s*0.65); tri.closePath();
    bang.moveTo(c.x, c.y - s*0.45); bang.lineTo(c.x, c.y + s*0.12); bang.moveTo(c.x, c.y + s*0.36); bang.lineTo(c.x, c.y + s*0.38);
  });
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = `rgba(${col},0.28)`; ctx.fill(tri);
  ctx.strokeStyle = `rgba(${col},0.85)`; ctx.lineWidth = HEX*0.05; ctx.stroke(tri);
  ctx.lineWidth = HEX*0.07; ctx.stroke(bang);
  ctx.restore();
}
// A climb: a muted, see-through line along the border with ladder rungs across it
function drawClimb(ctx, A, B) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), nx = -dy / L * HEX*0.14, ny = dx / L * HEX*0.14;
  const rungs = new Path2D(), rail = new Path2D();
  for (const t of [0.2, 0.4, 0.6, 0.8]) { const x = A[0] + dx*t, y = A[1] + dy*t; rungs.moveTo(x - nx, y - ny); rungs.lineTo(x + nx, y + ny); }
  rail.moveTo(A[0], A[1]); rail.lineTo(B[0], B[1]);
  ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = HEX*0.13; ctx.stroke(rail); ctx.lineWidth = HEX*0.08; ctx.stroke(rungs);
  ctx.strokeStyle = `rgb(${EFFECTS.climb.col})`; ctx.lineWidth = HEX*0.04; ctx.stroke(rungs); ctx.lineWidth = HEX*0.06; ctx.stroke(rail);
  ctx.restore();
}
function zoneIcon(ctx, x, y, s, Z) {
  ctx.save(); ctx.translate(x, y); if (Z.up) ctx.rotate(Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = s*0.14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const chev = () => { ctx.beginPath(); for (const dy of [-0.16, 0.1]) { ctx.moveTo(-s*0.24, (dy - 0.1)*s); ctx.lineTo(0, (dy + 0.1)*s); ctx.lineTo(s*0.24, (dy - 0.1)*s); } };
  chev(); ctx.stroke();
  chev(); ctx.strokeStyle = `rgba(${Z.col},0.95)`; ctx.lineWidth = s*0.075; ctx.stroke();
  ctx.restore();
}
function drawZones(ctx) {
  for (const type in ZONES) {
    const Z = ZONES[type], cells = [];
    for (const k in S.zones) {
      if (S.zones[k] !== type) continue;
      const [c, r] = k.split(',').map(Number), a = offToAx(c, r), p = axToPx(a.q, a.r);
      cells.push({ q: a.q, r: a.r, x: p.x, y: p.y });
    }
    if (!cells.length) continue;
    const path = new Path2D(); cells.forEach(c => hexSub(path, c.x, c.y, HEX));
    ctx.fillStyle = `rgba(${Z.col},0.2)`; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    const b = bbox(cells, HEX), h = b.y1 - b.y0;
    ctx.beginPath();
    for (let t = b.x0 - h; t < b.x1; t += HEX*0.45) { ctx.moveTo(t, b.y1); ctx.lineTo(t + h, b.y0); }
    ctx.strokeStyle = `rgba(${Z.col},0.22)`; ctx.lineWidth = HEX*0.12; ctx.stroke();
    const e = outerEdges(cells, HEX);
    strokeEdges(ctx, e, HEX*0.3, `rgba(${Z.col},0.35)`);   // inner glow (clipped to the zone)
    ctx.restore();
    if (Z.dash) ctx.setLineDash(Z.dash.map(v => v*HEX));
    strokeEdges(ctx, e, HEX*0.08, `rgb(${Z.col})`);
    ctx.setLineDash([]);
    cells.forEach(c => zoneIcon(ctx, c.x, c.y, HEX, Z));
  }
}

/* =========================================================================
   STORAGE  (IndexedDB autosave, falls back to localStorage)
   ========================================================================= */
// Some browsers never answer IndexedDB requests on file:// pages, so give up after a short wait.
// Both stores are read on load and the newest save wins.
const store = {
  db: null,
  async init() {
    try {
      this.db = await new Promise((res, rej) => {
        setTimeout(() => rej(new Error('IndexedDB timed out')), 1500);
        const rq = indexedDB.open('lancer-hexmap', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('maps');
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      });
    } catch (e) { console.warn('IndexedDB unavailable, using localStorage', e); this.db = null; }
  },
  idbGet(k) {
    return new Promise((res, rej) => {
      const rq = this.db.transaction('maps').objectStore('maps').get(k);
      rq.onsuccess = () => res(rq.result || null); rq.onerror = () => rej(rq.error);
    });
  },
  idbPut(k, v) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction('maps', 'readwrite'); tx.objectStore('maps').put(v, k);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  },
  async get(k) {
    let a = null, b = null;
    if (this.db) try { a = await this.idbGet(k); } catch (e) { console.warn(e); }
    try { const v = localStorage.getItem('lhm_' + k); b = v ? JSON.parse(v) : null; } catch (e) { console.warn(e); }
    if (!a || !b) return a || b;
    return (b.savedAt || 0) > (a.savedAt || 0) ? b : a;
  },
  async put(k, v) {
    v.savedAt = Date.now();
    if (this.db) {
      try { await this.idbPut(k, v); try { localStorage.removeItem('lhm_' + k); } catch (e) {} return; }
      catch (e) { console.warn('IndexedDB save failed, trying localStorage', e); }
    }
    localStorage.setItem('lhm_' + k, JSON.stringify(v));
  },
};

/* =========================================================================
   MAP FILES
   ========================================================================= */
function readImageFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Could not read file'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('That file is not a supported image'));
      img.onload = () => {
        // keep saves small enough for browser storage: shrink/compress big images
        const MAX = 3000; let url = fr.result;
        if (Math.max(img.width, img.height) > MAX || url.length > 2500000) {
          const k = Math.min(1, MAX / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); url = c.toDataURL('image/jpeg', 0.9);
        }
        res({ url, w: img.width, h: img.height });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function normalizeMap(d) {
  if (!d || typeof d !== 'object' || !(d.cols >= 1) || !(d.rows >= 1)) throw new Error('Not a valid map file');
  return {
    version: 1, name: String(d.name || 'Untitled map'),
    cols: Math.min(100, Math.round(d.cols)), rows: Math.min(100, Math.round(d.rows)),
    bg: typeof d.bg === 'string' ? d.bg : null,
    bgOpacity: typeof d.bgOpacity === 'number' ? d.bgOpacity : 1,
    showGrid: d.showGrid !== false, gridOpacity: typeof d.gridOpacity === 'number' ? d.gridOpacity : 0.45,
    cells: d.cells && typeof d.cells === 'object' ? d.cells : {},
    zones: d.zones && typeof d.zones === 'object' ? Object.fromEntries(Object.entries(d.zones).filter(([, v]) => ZONES[v])) : {},
    effects: d.effects && typeof d.effects === 'object' ? Object.fromEntries(Object.entries(d.effects).filter(([, v]) => v === 'difficult' || v === 'dangerous')) : {},
    edges: d.edges && typeof d.edges === 'object' ? Object.fromEntries(Object.entries(d.edges).filter(([k, v]) => v === 'climb' && k.includes('|'))) : {},
    objects: Array.isArray(d.objects) ? d.objects.filter(o => o && TEMPLATES[o.type]) : [],
    lines: Array.isArray(d.lines) ? d.lines.filter(okLine) : [],
    nextId: d.nextId || (Array.isArray(d.objects) ? d.objects.length + 1 : 1),
  };
}
const okLine = l => l && LINE_KINDS[l.kind] && Array.isArray(l.pts) && l.pts.length >= 2
  && l.pts.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) && (!l.climbs || Array.isArray(l.climbs));
