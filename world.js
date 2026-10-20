'use strict';
// マップ：100年 だれも いない けんきゅう室（なか）と そと（ネオンスポアで よごれた 水ろ・あれた はたけ）

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

// ---------- けんきゅう室の なか（14×10） ----------

function buildHouse(save) {
  const m = newMap('house', 14, 10);
  m.name = 'はかせの けんきゅう{室|しつ}';
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

  addObj(m, { t: 'deco', spr: 'window', x: 5, y: 1, flat: true });
  addObj(m, { t: 'deco', spr: 'rug', x: 5, y: 6, w: 3, h: 2, flat: true });
  if ((save.tidy.stored || []).length < 5) {
    addObj(m, { t: 'deco', spr: 'cobweb', x: 1, y: 1, flat: true, web: true });
    addObj(m, { t: 'deco', spr: 'cobweb', x: 12, y: 1, flat: true, web: true, mirror: true });
  }

  const fixed = save.fixed || {};
  addObj(m, { t: 'bed', spr: 'bed', x: 1, y: 2, w: 2, h: 2, solid: true, act: 'bed' });
  // ロボが とまっていた じゅう電き（ここに かみなりが おちて 目を さます）
  addObj(m, { t: 'charger', spr: 'charger', x: 3, y: 2, w: 2, h: 1, solid: true, act: 'charger' });
  // かべの メインパネル（電池を 入れると うごき、はかせの ビデオが 見られる）
  addObj(m, { t: 'panel', spr: fixed.panel ? 'panelOn' : 'panelOff', x: 6, y: 1, w: 2, h: 1, solid: true, act: 'panel' });
  // オイル しぼりき・ごうせい そうち・サイバーか そうち（ちりょう ポッド）
  addObj(m, { t: 'press', spr: fixed.press ? 'pressOk' : 'press', x: 8, y: 2, w: 2, h: 1, solid: true, act: 'press' });
  addObj(m, { t: 'synth', spr: 'synth', x: 11, y: 2, w: 2, h: 1, solid: true, act: 'synth' });
  addObj(m, { t: 'pod', spr: fixed.pod ? 'podOn' : 'podOff', x: 11, y: 4, w: 2, h: 2, solid: true, act: 'pod' });
  // しつない プランター（4つ）
  for (let i = 0; i < 4; i++) addObj(m, { t: 'pot', spr: fixed.planter ? 'potOk' : 'potBroken', x: 8 + i, y: 8, solid: true, act: 'pot', pid: i });

  const gone = new Set([...(save.tidy.stored || []), save.tidy.carry]);
  for (const c of CLUTTER) {
    if (gone.has(c.id)) continue;
    addObj(m, { t: 'clutter', spr: `c_${c.kind}`, x: c.x, y: c.y, solid: true, act: 'clutter', cid: c.id });
  }
  return m;
}

// ---------- そと（40×28） ----------

// そとの オイル草が さいている か
const wildReady = (save, id) => {
  const d = (save.wild || {})[id];
  return d == null || save.day - d >= CFG.wildRegrow;
};

// おなじ えが ならばない ように いろちがい・はんてんを えらぶ
const variant = (spr, r) => (spr === 'car' ? ['car', 'car2', 'carB'][(r() * 3) | 0] : spr === 'wallBroken' ? (r() < 0.5 ? 'wallBroken' : 'wall2') : spr);

// 水ろの まんなか（y ごとに すこし まがる）
const canalX = (y) => 32 + Math.round(Math.sin(y * 0.3) * 2);

function buildOutside(save) {
  const W = 40, H = 28;
  const m = newMap('out', W, H);
  m.name = 'そと';
  m.glow = !save.flags.cleanWater; // ネオンスポアで よごれて 光って いる（2しょうで きれいに なる）
  m.ruin = !save.flags.airClean;   // 100年 だれも いない あれた 町（4しょうの 空気じょうか ツリーで みどりが もどる よてい）
  const r = RNG(2024);
  for (let i = 0; i < W * H; i++) m.v[i] = (r() * 4) | 0;

  // 水ろ（きたから みなみへ ながれる）と すなの きし
  const water = (x, y) => y >= 1 && y <= H - 2 && Math.abs(x - canalX(y)) <= 1;
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
  for (let x = 13; x <= 15; x++) path(x, 8);

  // まわりは くずれた ビルと がれき（とおれない）
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!(x < 2 || y < 2 || x >= W - 2 || y >= H - 2)) continue;
      m.tsolid[y * W + x] = 1;
      refreshCell(m, y * W + x);
    }
  }
  const er = RNG(55);
  const dry = (x0, x1, y) => { for (let x = x0; x <= x1; x++) if (tileAt(m, x, y) === TL.WATER || tileAt(m, x, y) === TL.SAND) return false; return true; };
  // きた：ビルが ならぶ
  for (let x = 0; x < W;) {
    const tall = er() < 0.6;
    const w = tall ? 3 : 2;
    if (!dry(x, x + w - 1, 1) || !dry(x, x + w - 1, 0)) { x++; continue; }
    addObj(m, { t: 'ruinB', spr: tall ? `tower${1 + ((er() * 3) | 0)}` : `shop${1 + ((er() * 2) | 0)}`, x, y: 1, w, h: 1, act: 'look' });
    x += w + (er() < 0.25 ? 1 : 0);
  }
  // みなみ：くずれた かべ・はいしゃ・がれき
  for (let x = 0; x < W;) {
    const k = er();
    const spr = k < 0.35 ? 'wallBroken' : k < 0.55 ? 'car' : k < 0.8 ? 'rubbleBig' : 'deadTree';
    const w = spr === 'deadTree' ? 1 : 2;
    if (!dry(x, x + w - 1, H - 2)) { x++; continue; }
    addObj(m, { t: { wallBroken: 'wall', car: 'car', rubbleBig: 'rubble', deadTree: 'deadTree' }[spr], spr: variant(spr, er), x, y: H - 2, w, h: 1, act: 'look' });
    x += w + (er() < 0.4 ? 1 : 0);
  }
  // にし と ひがし：ひくい ビル・かれ木・がれき・ドラムかん
  for (const x of [0, W - 2]) {
    for (let y = 3; y < H - 3;) {
      const k = er();
      if (k < 0.4 && dry(x, x + 1, y)) { addObj(m, { t: 'ruinB', spr: `shop${1 + ((er() * 2) | 0)}`, x, y, w: 2, h: 1, act: 'look' }); y += 3; continue; }
      const spr = k < 0.6 ? 'deadTree' : k < 0.85 ? 'rubble' : 'barrel';
      addObj(m, { t: spr === 'rubble' ? 'rubble' : spr, spr, x: x + (er() < 0.5 ? 0 : 1), y, act: 'look' });
      y += 2;
    }
  }

  // けんきゅう室（ドアの マスだけ とおれる）
  addObj(m, { t: 'house', spr: 'house', x: 14, y: 3, w: 6, h: 5, solid: true });
  const di = 7 * W + 16;
  m.og[di] = null;
  refreshCell(m, di);
  m.doors.push({ x: 16, y: 7, to: 'house', tx: 6, ty: 8, dir: 'up' });

  // 水ろの ろかそうち（こわれて いる。2しょうで なおす）
  addObj(m, { t: 'filter', spr: 'filterBroken', x: 28, y: 5, w: 2, h: 2, solid: true, act: 'filter' });
  // オイル草（とっても CFG.wildRegrow 日 たつと また さく）と、みちの こわれた きかい
  for (const w of WILD) addObj(m, { t: 'wild', spr: wildReady(save, w.id) ? 'wild' : 'wildPicked', x: w.x, y: w.y, solid: true, act: 'wild', wid: w.id });
  for (const sc of SCRAPS) {
    if (!(save.picked || []).includes(sc.id)) addObj(m, { t: 'scrap', spr: 'c_machine', x: sc.x, y: sc.y, solid: true, act: 'scrap', sid: sc.id });
  }
  addObj(m, { t: 'sign', spr: 'sign', x: 10, y: 10, solid: true, act: 'signFarm' });
  addObj(m, { t: 'sign', spr: 'sign', x: 28, y: 10, solid: true, act: 'signCanal' });

  // はたけの さく（2しょうで ひらく。いまは くさぼうぼう）
  for (let x = FARM.x0 - 1; x <= FARM.x1 + 1; x++) {
    if (x !== 9) addObj(m, { t: 'fence', spr: 'fence', x, y: FARM.y0 - 1, solid: true });
    addObj(m, { t: 'fence', spr: 'fence', x, y: FARM.y1 + 1, solid: true });
  }
  for (let y = FARM.y0; y <= FARM.y1; y++) {
    addObj(m, { t: 'fence', spr: 'fenceV', x: FARM.x0 - 1, y, solid: true });
    addObj(m, { t: 'fence', spr: 'fenceV', x: FARM.x1 + 1, y, solid: true });
  }
  const cleared = new Set(save.cleared || []);
  const fr = RNG(77);
  for (let y = FARM.y0; y <= FARM.y1; y++) {
    for (let x = FARM.x0; x <= FARM.x1; x++) {
      const n = fr();
      const key = `${x},${y}`;
      if (cleared.has(key) || save.plots[key]) continue;
      if (n < 0.07) addObj(m, { t: 'rock', spr: 'rock', x, y, solid: true, key });
      else if (n < 0.62) addObj(m, { t: 'weed', spr: m.ruin ? 'weedDry' : 'weed', x, y, key });
    }
  }

  // ガマ（すなの きし）
  const lr = RNG(31);
  const shore = [];
  for (let y = 3; y < H - 3; y++) {
    for (let x = 0; x < W; x++) {
      const around = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => tileAt(m, x + dx, y + dy));
      if (tileAt(m, x, y) === TL.SAND && around.includes(TL.WATER) && !objAt(m, x, y) && Math.abs(y - 9) > 2) shore.push([x, y]);
    }
  }
  for (let k = 0; k < (m.ruin ? 3 : 6) && shore.length; k++) {
    const [x, y] = shore.splice((lr() * shore.length) | 0, 1)[0];
    addObj(m, { t: 'reed', spr: 'reed', x, y });
  }

  // き・くさむら・はな
  const busy = (x, y) => {
    if (x < 3 || y < 3 || x > W - 4 || y > H - 4) return true;
    if (x >= FARM.x0 - 2 && x <= FARM.x1 + 2 && y >= FARM.y0 - 2 && y <= FARM.y1 + 2) return true;
    if (x >= 11 && x <= 25 && y >= 2 && y <= 11) return true;
    if (x >= 26 && x <= 31 && y >= 3 && y <= 8) return true; // ろかそうち
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = tileAt(m, x + dx, y + dy);
      if (t === TL.WATER || t === TL.SAND || t === TL.PATH) return true;
    }
    return !!objAt(m, x, y);
  };
  const tr = RNG(9);
  // みちの こわれた がいとう
  if (m.ruin) for (const [x, y] of [[22, 8], [27, 10], [12, 10], [18, 8]]) if (!objAt(m, x, y)) addObj(m, { t: 'lamp', spr: 'lampOff', x, y, solid: true, act: 'look' });
  let trees = 0;
  for (let k = 0; k < 500 && trees < (m.ruin ? 24 : 26); k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    if (busy(x, y)) continue;
    const kind = tr();
    if (m.ruin) {
      // かれ木・がれき・はいしゃ・ドラムかん・くずれた かべ。みどりの 木は ほんの すこし
      const spr = kind < 0.28 ? 'deadTree' : kind < 0.5 ? 'rubble' : kind < 0.62 ? 'car' : kind < 0.76 ? 'barrel' : kind < 0.88 ? 'wallBroken' : kind < 0.95 ? 'rubbleBig' : 'bush2';
      const w = ['car', 'wallBroken', 'rubbleBig'].includes(spr) ? 2 : 1;
      if (w === 2 && busy(x + 1, y)) continue;
      const t = { deadTree: 'deadTree', rubble: 'rubble', rubbleBig: 'rubble', car: 'car', barrel: 'barrel', wallBroken: 'wall', bush2: 'bush' }[spr];
      addObj(m, { t, spr: variant(spr, tr), x, y, w, h: 1, solid: true, act: t === 'bush' ? undefined : 'look' });
    } else if (kind < 0.55) addObj(m, { t: 'tree', spr: kind < 0.15 ? 'pine' : kind < 0.35 ? 'tree' : 'tree2', x, y, solid: true });
    else addObj(m, { t: 'bush', spr: kind < 0.8 ? 'bush' : 'bush2', x, y, solid: true });
    trees++;
  }
  for (let k = 0; k < 70; k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    if (tileAt(m, x, y) === TL.WATER || objAt(m, x, y) || inFarm(x, y)) continue;
    const f = tr();
    // あれた 町は ごみが ちらばり、はなは ほんの すこし
    const spr = m.ruin ? (f < 0.9 ? (f < 0.45 ? 'debris' : 'debris2') : f < 0.95 ? 'flowerA' : 'flowerB') : f < 0.5 ? 'flowerA' : 'flowerB';
    if (spr.startsWith('flower') && tileAt(m, x, y) !== TL.GRASS) continue;
    addObj(m, { t: 'deco', spr, x, y, flat: true });
  }
  return m;
}
