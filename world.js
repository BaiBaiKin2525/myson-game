'use strict';
// マップ：100年 だれも いない けんきゅう室（なか）と そと（ネオンスポアで よごれた 水ろ・あれた はたけ）

const TL = { GRASS: 0, PATH: 1, WATER: 2, SAND: 3, FLOOR: 4, WALL: 5, FACE: 6, PAVE: 7, PIER: 8 }; // PAVE：いしだたみ・コンクリート、PIER：ていぼう・はし（水の うえを あるける）
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

// ---------- そとの エリア（どれも 40×28）：水ろが きれずに つながる ----------
// 水ろは 北（上流：鉱山）から 南（下流：海）へ ながれる。エリアの 端で 水ろと 川ぞいの 道の ばしょが そろう ように する。
// 川ぞいの 道は 水の 2マス 西（水ろの まんなか − 4 〜 − 3）。端の 1れつに 立つと となりの エリアへ（m.doors の x0〜x1）

const AW = 40, AH = 28;

// そとの オイル草が さいている か
const wildReady = (save, id) => {
  const d = (save.wild || {})[id];
  return d == null || save.day - d >= CFG.wildRegrow;
};

// おなじ えが ならばない ように いろちがい・はんてんを えらぶ
const variant = (spr, r) => (spr === 'car' ? ['car', 'car2', 'carB'][(r() * 3) | 0] : spr === 'wallBroken' ? (r() < 0.5 ? 'wallBroken' : 'wall2') : spr);

// 水ろの まんなか（y ごとに すこし まがる）。エリアの 端どうしで おなじ x に なる
const canalX = (y) => 32 + Math.round(Math.sin(y * 0.3) * 2);              // けんきゅう室まわり：上 32 → 下 34
const plazaCanalX = (y) => 32 + Math.round(Math.sin((AH - 1 - y) * 0.3) * 2); // ちゅうおう広場：下の 端で 32
const seaCanalX = (y) => 34 + Math.round(Math.sin(y * 0.35) * 1.5);         // 海：上の 端で 34
const roadX = (cx) => cx - 4;                                              // 川ぞいの 道の ひだりの マス

// 水ろ・すなの きし・川ぞいの 道を つくる（水ろは y0〜y1、道は y0〜roadY1）
function layCanal(m, cxf, y0, y1, roadY1 = y1) {
  const water = (x, y) => y >= y0 && y <= y1 && Math.abs(x - cxf(y)) <= 1;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (water(x, y)) setTile(m, x, y, TL.WATER);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.tiles[y * m.w + x] === TL.WATER) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (water(x + dx, y + dy)) near = true;
      if (near) setTile(m, x, y, TL.SAND);
    }
  }
  for (let y = y0; y <= roadY1; y++) {
    const rx = roadX(cxf(y));
    for (const x of [rx, rx + 1]) setTile(m, x, y, TL.PATH);
    // まがりかどで 道が とぎれない ように
    if (y > y0) {
      const px = roadX(cxf(y - 1));
      for (let x = Math.min(px, rx); x <= Math.max(px, rx) + 1; x++) setTile(m, x, y, TL.PATH);
    }
  }
}

// まわりの 2マスを とおれなく する（道は のこす）
function ringWall(m) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!(x < 2 || y < 2 || x >= m.w - 2 || y >= m.h - 2)) continue;
      if (m.tiles[y * m.w + x] === TL.PATH || m.tiles[y * m.w + x] === TL.PAVE) continue;
      m.tsolid[y * m.w + x] = 1;
      refreshCell(m, y * m.w + x);
    }
  }
}

// まわりの あれた 町なみ（くずれた ビル・かべ・はいしゃ・かれ木）。sides：'n' 'e' 's' 'w' の どこに おくか
function ringRuins(m, seed, sides = 'nesw') {
  const W = m.w, H = m.h;
  const er = RNG(seed);
  const dry = (x0, x1, y) => {
    for (let x = x0; x <= x1; x++) {
      const t = tileAt(m, x, y);
      if (t === TL.WATER || t === TL.SAND || t === TL.PATH || t === TL.PAVE || t === TL.PIER || t === -1 || objAt(m, x, y)) return false;
    }
    return true;
  };
  if (sides.includes('n')) {
    for (let x = 0; x < W;) {
      const tall = er() < 0.6;
      const w = tall ? 3 : 2;
      if (!dry(x, x + w - 1, 1) || !dry(x, x + w - 1, 0)) { x++; continue; }
      addObj(m, { t: 'ruinB', spr: tall ? `tower${1 + ((er() * 3) | 0)}` : `shop${1 + ((er() * 2) | 0)}`, x, y: 1, w, h: 1, act: 'look' });
      x += w + (er() < 0.25 ? 1 : 0);
    }
  }
  if (sides.includes('s')) {
    for (let x = 0; x < W;) {
      const k = er();
      const spr = k < 0.35 ? 'wallBroken' : k < 0.55 ? 'car' : k < 0.8 ? 'rubbleBig' : 'deadTree';
      const w = spr === 'deadTree' ? 1 : 2;
      if (!dry(x, x + w - 1, H - 2)) { x++; continue; }
      addObj(m, { t: { wallBroken: 'wall', car: 'car', rubbleBig: 'rubble', deadTree: 'deadTree' }[spr], spr: variant(spr, er), x, y: H - 2, w, h: 1, act: 'look' });
      x += w + (er() < 0.4 ? 1 : 0);
    }
  }
  for (const [side, x] of [['w', 0], ['e', W - 2]]) {
    if (!sides.includes(side)) continue;
    for (let y = 3; y < H - 3;) {
      const k = er();
      if (k < 0.4 && dry(x, x + 1, y)) { addObj(m, { t: 'ruinB', spr: `shop${1 + ((er() * 2) | 0)}`, x, y, w: 2, h: 1, act: 'look' }); y += 3; continue; }
      const spr = k < 0.6 ? 'deadTree' : k < 0.85 ? 'rubble' : 'barrel';
      const xx = x + (er() < 0.5 ? 0 : 1);
      if (dry(xx, xx, y)) addObj(m, { t: spr, spr, x: xx, y, act: 'look' });
      y += 2;
    }
  }
}

// エリアの なかに ちらばる がれき・かれ木・はいしゃ と、じめんの ごみ
function scatterRuins(m, seed, n, busy) {
  const W = m.w, H = m.h;
  const tr = RNG(seed);
  let put = 0;
  for (let k = 0; k < n * 20 && put < n; k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    if (busy(x, y)) continue;
    const kind = tr();
    if (m.ruin) {
      const spr = kind < 0.28 ? 'deadTree' : kind < 0.5 ? 'rubble' : kind < 0.62 ? 'car' : kind < 0.76 ? 'barrel' : kind < 0.88 ? 'wallBroken' : kind < 0.95 ? 'rubbleBig' : 'bush2';
      const w = ['car', 'wallBroken', 'rubbleBig'].includes(spr) ? 2 : 1;
      if (w === 2 && busy(x + 1, y)) continue;
      const t = { deadTree: 'deadTree', rubble: 'rubble', rubbleBig: 'rubble', car: 'car', barrel: 'barrel', wallBroken: 'wall', bush2: 'bush' }[spr];
      addObj(m, { t, spr: variant(spr, tr), x, y, w, h: 1, solid: true, act: t === 'bush' ? undefined : 'look' });
    } else if (kind < 0.55) addObj(m, { t: 'tree', spr: kind < 0.15 ? 'pine' : kind < 0.35 ? 'tree' : 'tree2', x, y, solid: true });
    else addObj(m, { t: 'bush', spr: kind < 0.8 ? 'bush' : 'bush2', x, y, solid: true });
    put++;
  }
  for (let k = 0; k < 70; k++) {
    const x = 2 + ((tr() * (W - 4)) | 0);
    const y = 2 + ((tr() * (H - 4)) | 0);
    const t = tileAt(m, x, y);
    if (t === TL.WATER || t === TL.PIER || objAt(m, x, y) || (m.id === 'out' && inFarm(x, y))) continue;
    const f = tr();
    const spr = m.ruin ? (f < 0.9 ? (f < 0.45 ? 'debris' : 'debris2') : f < 0.95 ? 'flowerA' : 'flowerB') : f < 0.5 ? 'flowerA' : 'flowerB';
    if (spr.startsWith('flower') && t !== TL.GRASS) continue;
    addObj(m, { t: 'deco', spr, x, y, flat: true });
  }
}

// ふさがった 道（がれきの バリケード と ネオンスポアの きり）。しょうが すすむと なくなる
// flag の ある 道は、しょうが すすんで いて、その ことを した あと（toSea：ろかそうちを なおす）
const gateOpen = (save, id) => {
  const g = GATES[id], f = save.flags || {};
  return !!f.allOpen || ((save.ch || 1) >= g.ch && (!g.flag || !!f[g.flag]));
};
// line：{ row: y } なら その ぎょう、{ col: x } なら その れつの とおれる マスを ぜんぶ ふさぐ（まわりの じめんから まわりこめない ように）。
// 道の 上は バリケード、それ いがいは がれき
function addGate(m, save, id, line) {
  if (gateOpen(save, id)) return;
  const n = line.row != null ? m.w : m.h;
  for (let k = 0; k < n; k++) {
    const x = line.row != null ? k : line.col, y = line.row != null ? line.row : k;
    if (!walkable(m, x, y)) continue;
    const o = objAt(m, x, y);
    if (o) removeObj(m, o); // くさ など とおれる もの
    const road = [TL.PATH, TL.PAVE, TL.PIER].includes(tileAt(m, x, y));
    const spr = road ? ((x + y) % 2 ? 'barricade' : 'barricade2') : 'rubble';
    addObj(m, { t: 'gate', spr, x, y, solid: true, act: 'gate', gid: id, road });
  }
}

// まわりに ある もの が ない か（き・がれきを おく ときに よける）
function busyFn(m, extra) {
  return (x, y) => {
    if (x < 3 || y < 3 || x > m.w - 4 || y > m.h - 4) return true;
    if (extra && extra(x, y)) return true;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const t = tileAt(m, x + dx, y + dy);
      if (t === TL.WATER || t === TL.SAND || t === TL.PATH || t === TL.PAVE || t === TL.PIER) return true;
    }
    return !!objAt(m, x, y);
  };
}

function newArea(id, save) {
  const m = newMap(id, AW, AH);
  m.name = AREAS[id].name;
  m.ruin = !save.flags.airClean; // 100年 だれも いない あれた 町（4しょうの 空気じょうか ツリーで みどりが もどる よてい）
  const r = RNG(id.length * 977 + 2024);
  for (let i = 0; i < AW * AH; i++) m.v[i] = (r() * 4) | 0;
  return m;
}

// ---------- けんきゅう室 まわり（1〜2しょう） ----------

function buildOutside(save) {
  const W = AW, H = AH;
  const m = newArea('out', save);
  m.name = 'そと';
  m.glow = !save.flags.cleanWater; // ネオンスポアで よごれて 光って いる（2しょうで きれいに なる）

  layCanal(m, canalX, 0, H - 1);
  // みち
  const path = (x, y) => { if (m.tiles[y * W + x] === TL.GRASS) setTile(m, x, y, TL.PATH); };
  for (let x = 9; x <= 30; x++) path(x, 9);
  path(16, 8);
  for (let y = 10; y <= 11; y++) path(9, y);
  for (let x = 13; x <= 15; x++) path(x, 8);
  ringWall(m);

  // となりの エリアへ：きたは ちゅうおう広場、みなみは 海
  m.doors.push({ x0: roadX(canalX(0)), x1: roadX(canalX(0)) + 1, y: 0, to: 'plaza', ty: AH - 2, dir: 'up', gate: 'toPlaza' });
  m.doors.push({ x0: roadX(canalX(H - 1)), x1: roadX(canalX(H - 1)) + 1, y: H - 1, to: 'sea', ty: 1, dir: 'down', gate: 'toSea' });
  addGate(m, save, 'toPlaza', { row: 3 });
  addGate(m, save, 'toSea', { row: H - 4 });

  // けんきゅう室（ドアの マスだけ とおれる）
  addObj(m, { t: 'house', spr: 'house', x: 14, y: 3, w: 6, h: 5, solid: true });
  const di = 7 * W + 16;
  m.og[di] = null;
  refreshCell(m, di);
  m.doors.push({ x: 16, y: 7, to: 'house', tx: 6, ty: 8, dir: 'up' });

  // 水ろの ろかそうち（こわれて いる。2しょうで なおす）
  addObj(m, { t: 'filter', spr: save.fixed && save.fixed.filter ? 'filterOk' : 'filterBroken', x: 27, y: 5, w: 2, h: 2, solid: true, act: 'filter' });
  // 2しょう：きれいに なった 水ろを ながれて きた カワウソ（よわって いる）と、なおった あとの カワウソ
  // 道がわの きし（すな）で、ys の なかで はじめに あいて いる ところ
  const bank = (ys) => {
    for (const y of ys) for (let x = 2; x < W - 2; x++) if (tileAt(m, x, y) === TL.SAND && tileAt(m, x + 1, y) === TL.WATER && !objAt(m, x, y)) return [x, y];
    return null;
  };
  const wb = save.flags.cleanWater && !save.flags.otter && !save.carryOtter && bank([19, 20, 18, 21, 17]);
  if (wb) addObj(m, { t: 'otterWeak', spr: 'otterWeak', x: wb[0], y: wb[1], solid: true, act: 'otterWeak' });
  const ob = save.flags.otter && bank([13, 14, 12, 15, 16, 17]);
  if (ob) addObj(m, { t: 'otter', spr: 'otter', x: ob[0], y: ob[1], solid: true, act: 'otter' });
  // オイル草（とっても CFG.wildRegrow 日 たつと また さく）と、みちの こわれた きかい
  for (const w of WILD) addObj(m, { t: 'wild', spr: wildReady(save, w.id) ? 'wild' : 'wildPicked', x: w.x, y: w.y, solid: true, act: 'wild', wid: w.id });
  for (const sc of SCRAPS) {
    if (!(save.picked || []).includes(sc.id) && !objAt(m, sc.x, sc.y)) addObj(m, { t: 'scrap', spr: 'c_machine', x: sc.x, y: sc.y, solid: true, act: 'scrap', sid: sc.id });
  }
  addObj(m, { t: 'sign', spr: 'sign', x: 10, y: 10, solid: true, act: 'signFarm' });
  addObj(m, { t: 'sign', spr: 'sign', x: 26, y: 11, solid: true, act: 'signCanal' });

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

  ringRuins(m, 55);
  if (m.ruin) for (const [x, y] of [[22, 8], [12, 10], [18, 8]]) if (!objAt(m, x, y)) addObj(m, { t: 'lamp', spr: 'lampOff', x, y, solid: true, act: 'look' });
  scatterRuins(m, 9, m.ruin ? 24 : 26, busyFn(m, (x, y) =>
    (x >= FARM.x0 - 2 && x <= FARM.x1 + 2 && y >= FARM.y0 - 2 && y <= FARM.y1 + 2) ||
    (x >= 11 && x <= 25 && y >= 2 && y <= 11) || (x >= 25 && x <= 31 && y >= 3 && y <= 8)));
  return m;
}

// ---------- ちゅうおう広場（からっぽの かたち：4しょうで 空気じょうか ツリーと かじゅえん） ----------

function buildPlaza(save) {
  const W = AW, H = AH;
  const m = newArea('plaza', save);
  m.glow = !save.flags.airClean; // 上流は 4しょうまで よごれた まま
  layCanal(m, plazaCanalX, 0, H - 1);

  // まんなかの ひろば（石だたみ）と、川ぞいの 道からの みち
  const cx = 15, cy = 13;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - cx) / 1.25, y - cy);
    if (d <= 6.2 && m.tiles[y * W + x] === TL.GRASS) setTile(m, x, y, TL.PAVE, false);
  }
  for (let x = cx + 5; x < roadX(plazaCanalX(cy)); x++) for (const y of [cy, cy + 1]) setTile(m, x, y, TL.PAVE, false);
  // ひがしの しょう店がいへ：水ろを わたる はし と みち
  for (const y of [cy, cy + 1]) {
    for (let x = roadX(plazaCanalX(y)) + 2; x < W; x++) {
      const t = m.tiles[y * W + x];
      setTile(m, x, y, t === TL.WATER ? TL.PIER : TL.PAVE, false);
    }
  }
  ringWall(m);
  m.doors.push({ x0: roadX(plazaCanalX(H - 1)), x1: roadX(plazaCanalX(H - 1)) + 1, y: H - 1, to: 'out', ty: 1, dir: 'down' });
  m.doors.push({ x0: roadX(plazaCanalX(0)), x1: roadX(plazaCanalX(0)) + 1, y: 0, to: 'mine', ty: AH - 2, dir: 'up', gate: 'toMine' });
  m.doors.push({ x: W - 1, y0: cy, y1: cy + 1, to: 'shop', tx: 1, dir: 'right', gate: 'toShop' });
  addGate(m, save, 'toMine', { row: 3 });
  addGate(m, save, 'toShop', { col: W - 4 });

  // かれた 空気じょうか ツリー（4しょうで うごかす）・こわれた ベンチ・からっぽの かじゅえん
  addObj(m, { t: 'airTree', spr: 'airTreeDead', x: cx - 1, y: cy - 1, w: 3, h: 2, solid: true, act: 'airTree' });
  for (const [x, y] of [[cx - 4, cy + 3], [cx + 3, cy + 3], [cx - 4, cy - 3], [cx + 3, cy - 3]]) addObj(m, { t: 'bench', spr: 'benchBroken', x, y, solid: true, act: 'look' });
  for (let x = 4; x <= 10; x++) {
    addObj(m, { t: 'fence', spr: 'fence', x, y: 4, solid: true });
    addObj(m, { t: 'fence', spr: 'fence', x, y: 8, solid: true });
  }
  for (let y = 5; y <= 7; y++) {
    addObj(m, { t: 'fence', spr: 'fenceV', x: 4, y, solid: true });
    addObj(m, { t: 'fence', spr: 'fenceV', x: 10, y, solid: true });
  }
  for (const [x, y] of [[6, 6], [8, 6]]) addObj(m, { t: 'stump', spr: 'stump', x, y, solid: true, act: 'orchard' });
  addObj(m, { t: 'sign', spr: 'sign', x: 11, y: 7, solid: true, act: 'signOrchard' });
  addObj(m, { t: 'sign', spr: 'sign', x: roadX(plazaCanalX(20)) - 1, y: 20, solid: true, act: 'signPlaza' });

  ringRuins(m, 66);
  scatterRuins(m, 13, 18, busyFn(m, (x, y) => Math.hypot((x - cx) / 1.25, y - cy) < 8 || (x >= 3 && x <= 11 && y >= 3 && y <= 9)));
  return m;
}

// ---------- 海と みなと（からっぽの かたち：2しょうで 行ける。ボートは 3しょう） ----------

const seaShore = (x) => 15 + Math.round(Math.sin(x * 0.45) * 0.8); // この y から したが 海

function buildSea(save) {
  const W = AW, H = AH;
  const m = newArea('sea', save);
  m.glow = !save.flags.cleanWater;
  m.oilMul = SEA_OIL; // しお風が つよい
  // 海（したの ほう ぜんぶ）
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (y >= seaShore(x)) setTile(m, x, y, TL.WATER);
  // 水ろは 海へ ながれこむ
  layCanal(m, seaCanalX, 0, 15, 10);
  // みなとの 岸ぺき（コンクリート）
  for (let x = 2; x < W - 2; x++) for (let y = 11; y < seaShore(x); y++) if (m.tiles[y * W + x] !== TL.WATER) setTile(m, x, y, TL.PAVE, false);
  // ていぼう：海に つきでた コンクリートの みち（ボートが ないうちは ここから だけ つれる）
  for (let y = 12; y <= 22; y++) for (const x of [18, 19]) setTile(m, x, y, TL.PIER, false);
  for (let x = 14; x <= 24; x++) for (const y of [22, 23]) setTile(m, x, y, TL.PIER, false);
  // まわり：うえと よこは かべ、海は そのまま
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = m.tiles[y * W + x];
      if (t === TL.WATER || t === TL.PIER || t === TL.PATH || t === TL.PAVE) continue;
      if (x < 2 || y < 2 || x >= W - 2) { m.tsolid[y * W + x] = 1; refreshCell(m, y * W + x); }
    }
  }
  m.doors.push({ x0: roadX(seaCanalX(0)), x1: roadX(seaCanalX(0)) + 1, y: 0, to: 'out', ty: AH - 2, dir: 'up' });

  // こわれた ボート（3しょうの メカ工房で なおして もらう）・さびた コンテナ・とうだい
  addObj(m, { t: 'boat', spr: 'boatBroken', x: 24, y: seaShore(24), w: 2, h: 1, solid: true, act: 'boat' });
  for (const [x, y] of [[6, 12], [8, 12], [7, 11]]) addObj(m, { t: 'crate', spr: 'c_crate', x, y, solid: true, act: 'look' });
  addObj(m, { t: 'sign', spr: 'sign', x: 17, y: 12, solid: true, act: 'signPier' });
  ringRuins(m, 77, 'new');
  scatterRuins(m, 21, 8, busyFn(m, (x, y) => y > 9));
  return m;
}

const AREA_BUILD = { out: buildOutside, plaza: buildPlaza, sea: buildSea };
