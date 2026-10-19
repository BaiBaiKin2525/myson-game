'use strict';
// マップ：はかせの いえ（なか）と そと（はたけ・いけ・じどう はんばいき）。だれも いなくなった さびれた むら

const TL = { GRASS: 0, PATH: 1, WATER: 2, SAND: 3, FLOOR: 4, WALL: 5, FACE: 6 };
const FARM = { x0: 4, y0: 12, x1: 13, y1: 21 }; // たがやせる ところ
const inFarm = (x, y) => x >= FARM.x0 && x <= FARM.x1 && y >= FARM.y0 && y <= FARM.y1;

function newMap(id, w, h) {
  return {
    id, w, h,
    tiles: new Uint8Array(w * h),
    v: new Uint8Array(w * h),        // くさの もようの ちがい
    tsolid: new Uint8Array(w * h),   // じめんで とおれない
    solid: new Uint8Array(w * h),    // じめん＋もので とおれない
    og: new Array(w * h).fill(null), // マスの うえの もの
    objs: [],
    doors: [],
  };
}

function setTile(m, x, y, t, solid = t === TL.WATER || t === TL.WALL || t === TL.FACE) {
  const i = y * m.w + x;
  m.tiles[i] = t;
  m.tsolid[i] = solid ? 1 : 0;
  refreshCell(m, i);
}

function refreshCell(m, i) {
  const o = m.og[i];
  m.solid[i] = m.tsolid[i] || (o && o.solid) ? 1 : 0;
}

function addObj(m, o) {
  o.w = o.w || 1;
  o.h = o.h || 1;
  m.objs.push(o);
  if (!o.flat) {
    for (let y = o.y; y < o.y + o.h; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
        const i = y * m.w + x;
        m.og[i] = o;
        refreshCell(m, i);
      }
    }
  }
  return o;
}

function removeObj(m, o) {
  const k = m.objs.indexOf(o);
  if (k >= 0) m.objs.splice(k, 1);
  for (let y = o.y; y < o.y + o.h; y++) {
    for (let x = o.x; x < o.x + o.w; x++) {
      const i = y * m.w + x;
      if (m.og[i] === o) {
        m.og[i] = null;
        refreshCell(m, i);
      }
    }
  }
}

function objAt(m, x, y) {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return null;
  return m.og[y * m.w + x];
}

const walkable = (m, x, y) => x >= 0 && y >= 0 && x < m.w && y < m.h && !m.solid[y * m.w + x];
const tileAt = (m, x, y) => (x < 0 || y < 0 || x >= m.w || y >= m.h ? -1 : m.tiles[y * m.w + x]);

// ---------- いえの なか（14×10） ----------

function buildHouse(save) {
  const m = newMap('house', 14, 10);
  m.name = 'はかせの いえ';
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      let t = TL.FLOOR;
      if (y === 0 || y === 9 || x === 0 || x === 13) t = TL.WALL;
      else if (y === 1) t = TL.FACE;
      setTile(m, x, y, t);
    }
  }
  // でぐち
  setTile(m, 6, 9, TL.FLOOR, false);
  addObj(m, { t: 'deco', spr: 'doorIn', x: 6, y: 9, flat: true });
  m.doors.push({ x: 6, y: 9, to: 'out', tx: 16, ty: 8, dir: 'down' });

  addObj(m, { t: 'deco', spr: 'window', x: 3, y: 1, flat: true });
  addObj(m, { t: 'deco', spr: 'window', x: 8, y: 1, flat: true });
  addObj(m, { t: 'deco', spr: 'rug', x: 5, y: 6, w: 3, h: 2, flat: true });
  if ((save.tidy.stored || []).length < 5) {
    addObj(m, { t: 'deco', spr: 'cobweb', x: 1, y: 1, flat: true, web: true });
    addObj(m, { t: 'deco', spr: 'cobweb', x: 12, y: 1, flat: true, web: true, mirror: true });
  }

  addObj(m, { t: 'bed', spr: 'bed', x: 1, y: 2, w: 2, h: 2, solid: true, act: 'bed' });
  addObj(m, { t: 'closet', spr: 'closet', x: 10, y: 2, w: 2, h: 1, solid: true, act: 'closet' });
  // ロボが とまっていた じゅうでんき（やねの アンテナと つながっている）
  addObj(m, { t: 'charger', spr: 'charger', x: 4, y: 2, w: 2, h: 1, solid: true, act: 'charger' });
  addObj(m, { t: 'table', spr: 'table', x: 7, y: 4, w: 2, h: 1, solid: true, act: 'table' });

  const gone = new Set([...(save.tidy.stored || []), save.tidy.carry]);
  for (const c of CLUTTER) {
    if (gone.has(c.id)) continue;
    addObj(m, { t: 'clutter', spr: `c_${c.kind}`, x: c.x, y: c.y, solid: true, act: 'clutter', cid: c.id });
  }
  return m;
}

// ---------- そと（40×28） ----------

function buildOutside(save) {
  const W = 40, H = 28;
  const m = newMap('out', W, H);
  m.name = 'そと';
  const r = RNG(2024);
  for (let i = 0; i < W * H; i++) m.v[i] = (r() * 4) | 0;

  // いけ
  const water = (x, y) => {
    const dx = (x - 32) / 5.6, dy = (y - 18) / 5.2;
    return dx * dx + dy * dy <= 1;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (water(x, y)) setTile(m, x, y, TL.WATER);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m.tiles[y * W + x] === TL.WATER) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water(x + dx, y + dy)) near = true;
      if (near) setTile(m, x, y, TL.SAND);
    }
  }

  // みち
  const path = (x, y) => { if (m.tiles[y * W + x] === TL.GRASS) setTile(m, x, y, TL.PATH); };
  for (let x = 9; x <= 30; x++) path(x, 9);
  path(16, 8);
  for (let y = 10; y <= 11; y++) path(9, y);
  for (const x of [21, 22, 23]) path(x, 8);
  for (let y = 10; y <= 12; y++) path(30, y);
  for (let x = 13; x <= 15; x++) path(x, 8);

  // まわりの もり（とおれない）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ring = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
      if (!ring) continue;
      m.tsolid[y * W + x] = 1;
      refreshCell(m, y * W + x);
      if ((x + y) % 2 === 0) {
        const k = (x * 7 + y * 3) % 5;
        addObj(m, { t: 'tree', spr: k === 0 ? 'pine' : k % 2 ? 'tree' : 'tree2', x, y });
      }
    }
  }

  // いえ（ドアの マスだけ とおれる）
  addObj(m, { t: 'house', spr: 'house', x: 14, y: 3, w: 6, h: 5, solid: true });
  const di = 7 * W + 16;
  m.og[di] = null;
  refreshCell(m, di);
  m.doors.push({ x: 16, y: 7, to: 'house', tx: 6, ty: 8, dir: 'up' });

  addObj(m, { t: 'bin', spr: 'bin', x: 12, y: 7, w: 2, h: 1, solid: true, act: 'bin' });
  addObj(m, { t: 'vend', spr: 'vend', x: 22, y: 7, w: 2, h: 1, solid: true, act: 'vend' });
  addObj(m, { t: 'sign', spr: 'sign', x: 10, y: 10, solid: true, act: 'signFarm' });
  addObj(m, { t: 'sign', spr: 'sign', x: 29, y: 11, solid: true, act: 'signPond' });

  // はたけの さく（うえの まんなかが いりぐち）
  for (let x = FARM.x0 - 1; x <= FARM.x1 + 1; x++) {
    if (x !== 9) addObj(m, { t: 'fence', spr: 'fence', x, y: FARM.y0 - 1, solid: true });
    addObj(m, { t: 'fence', spr: 'fence', x, y: FARM.y1 + 1, solid: true });
  }
  for (let y = FARM.y0; y <= FARM.y1; y++) {
    addObj(m, { t: 'fence', spr: 'fenceV', x: FARM.x0 - 1, y, solid: true });
    addObj(m, { t: 'fence', spr: 'fenceV', x: FARM.x1 + 1, y, solid: true });
  }

  // スイレンの は（みずの うえ）と ガマ（すなはま）
  const lr = RNG(31);
  const deep = [], shore = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tileAt(m, x, y);
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tileAt(m, x + dx, y + dy));
      if (t === TL.WATER && around.every((a) => a === TL.WATER)) deep.push([x, y]);
      if (t === TL.SAND && x > 31 && around.includes(TL.WATER)) shore.push([x, y]);
    }
  }
  for (let k = 0; k < 5 && deep.length; k++) {
    const [x, y] = deep.splice((lr() * deep.length) | 0, 1)[0];
    addObj(m, { t: 'deco', spr: k === 0 ? 'lotus' : 'lily', x, y, flat: true });
  }
  for (let k = 0; k < 5 && shore.length; k++) {
    const [x, y] = shore.splice((lr() * shore.length) | 0, 1)[0];
    addObj(m, { t: 'reed', spr: 'reed', x, y });
  }

  // はたけは くさと いしで おおわれている（かりとった ところは もう でない）
  const cleared = new Set(save.cleared || []);
  const fr = RNG(77);
  for (let y = FARM.y0; y <= FARM.y1; y++) {
    for (let x = FARM.x0; x <= FARM.x1; x++) {
      const n = fr();
      const key = `${x},${y}`;
      if (cleared.has(key) || save.plots[key]) continue;
      if (n < 0.07) addObj(m, { t: 'rock', spr: 'rock', x, y, solid: true, key });
      else if (n < 0.62) addObj(m, { t: 'weed', spr: 'weed', x, y, key });
    }
  }

  // き・くさむら・はな
  const busy = (x, y) => {
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) return true;
    if (x >= FARM.x0 - 2 && x <= FARM.x1 + 2 && y >= FARM.y0 - 2 && y <= FARM.y1 + 2) return true;
    if (x >= 11 && x <= 25 && y >= 2 && y <= 11) return true;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = tileAt(m, x + dx, y + dy);
      if (t === TL.WATER || t === TL.SAND || t === TL.PATH) return true;
    }
    return !!objAt(m, x, y);
  };
  const tr = RNG(9);
  let trees = 0;
  for (let k = 0; k < 400 && trees < 26; k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    if (busy(x, y)) continue;
    const kind = tr();
    if (kind < 0.55) addObj(m, { t: 'tree', spr: kind < 0.15 ? 'pine' : kind < 0.35 ? 'tree' : 'tree2', x, y, solid: true });
    else addObj(m, { t: 'bush', spr: kind < 0.8 ? 'bush' : 'bush2', x, y, solid: true });
    trees++;
  }
  for (let k = 0; k < 60; k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    if (tileAt(m, x, y) !== TL.GRASS || objAt(m, x, y) || inFarm(x, y)) continue;
    addObj(m, { t: 'deco', spr: tr() < 0.5 ? 'flowerA' : 'flowerB', x, y, flat: true });
  }
  return m;
}
