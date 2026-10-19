'use strict';
// ドット絵は ぜんぶ プログラムで かく（がぞう ファイルは つかわない）。1マス 32ドット。
// ものには こい いろの ふちどり、ひかりは ひだりうえから。
// SP[なまえ] … マップに かく え（したの まんなかを マスの したに あわせて かく）
// ICON[id] … もちもの・おみせに だす 32×32 の え
// bakeGround(m) … じめん（くさ・みち・すな・みず・ゆか・かべ）を 1まいの えに やきこむ

const SP = {};
const ICON = {};

// ---------- きほんの どうぐ ----------

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function make(w, h, fn) {
  const c = mk(w, h);
  fn(c.getContext('2d'));
  return c;
}
function R(g, col, x, y, w = 1, h = 1) {
  g.fillStyle = col;
  g.fillRect(x, y, w, h);
}
// だえん（ドットで）
function E(g, col, cx, cy, rx, ry) {
  for (let y = -ry; y <= ry; y++) {
    const dx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25))));
    R(g, col, cx - dx, cy + y, dx * 2 + 1, 1);
  }
}
function RNG(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function flipX(src) {
  return make(src.width, src.height, (g) => {
    g.translate(src.width, 0);
    g.scale(-1, 1);
    g.drawImage(src, 0, 0);
  });
}
function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.6 + vnoise(x * 2.1 + 7, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3 + 3) * 0.1;
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pickTone = (tones, t) => tones[Math.max(0, Math.min(tones.length - 1, Math.floor(t * tones.length)))];
// いろを あかるく（+）・くらく（-）
function shade(hex, k) {
  const c = hexRGB(hex).map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// ふちどり（すきまの となりに こい いろ）。え が 2ドット おおきく なる
function outline(src, col) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 120;
  return make(w + 2, h + 2, (g) => {
    g.fillStyle = col;
    for (let y = -1; y <= h; y++) {
      for (let x = -1; x <= w; x++) {
        if (op(x, y)) continue;
        if (op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1)) g.fillRect(x + 1, y + 1, 1, 1);
      }
    }
    g.drawImage(src, 1, 1);
  });
}
const osp = (w, h, fn, col = '#2b1a0e') => outline(make(w, h, fn), col);
const oicon = (fn, col = '#2b1a0e') => outline(make(30, 30, fn), col); // 32×32 の アイコン

// はっぱ 1まい（したから うえへ）
function leaf(g, x, y, len, dir, c1, c2) {
  for (let i = 0; i < len; i++) {
    const w = Math.round(Math.sin((i / len) * Math.PI) * 3) + 1;
    const cx = x + Math.round(dir * i * 0.6), cy = y - i;
    R(g, c1, cx - w + 1, cy, w * 2 - 1, 1);
    R(g, c2, cx, cy, 1, 1);
  }
}

// ---------- じめんを やきこむ ----------

const GROUND_CACHE = {};

function bakeGround(m) {
  if (GROUND_CACHE[m.id]) {
    m.ground = GROUND_CACHE[m.id];
    return;
  }
  const c = mk(m.w * T, m.h * T);
  const g = c.getContext('2d');
  if (m.id === 'house') bakeHouseFloor(m, g);
  else bakeOutside(m, g);
  GROUND_CACHE[m.id] = c;
  m.ground = c;
}

function bakeOutside(m, g) {
  const W = m.w * T, H = m.h * T, n = m.w * m.h;
  const mask = (fn) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = fn(m.tiles[i]) ? 1 : 0;
    return a;
  };
  const wM = mask((t) => t === TL.WATER);
  const sM = mask((t) => t === TL.WATER || t === TL.SAND);
  const pM = mask((t) => t === TL.PATH);
  const ring = mask(() => false);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (x < 2 || y < 2 || x >= m.w - 2 || y >= m.h - 2) ring[y * m.w + x] = 1;
  // みずの ふかさ：りくから なんマス はなれて いるか
  const dep = new Float32Array(n);
  {
    const q = [];
    for (let i = 0; i < n; i++) {
      if (wM[i]) dep[i] = 1e9;
      else q.push(i);
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], x = i % m.w, y = (i / m.w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const j = ny * m.w + nx;
        if (dep[j] > dep[i] + 1) {
          dep[j] = dep[i] + 1;
          q.push(j);
        }
      }
    }
  }
  // マスの まんなかの あいだを なめらかに つなぐ（かどが まるく なる）
  const samp = (a, x, y) => {
    const fx = x - 0.5, fy = y - 0.5;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    let u = fx - x0, v = fy - y0;
    u = u * u * (3 - 2 * u);
    v = v * v * (3 - 2 * v);
    const at = (xx, yy) => a[Math.max(0, Math.min(m.h - 1, yy)) * m.w + Math.max(0, Math.min(m.w - 1, xx))];
    return (at(x0, y0) * (1 - u) + at(x0 + 1, y0) * u) * (1 - v) + (at(x0, y0 + 1) * (1 - u) + at(x0 + 1, y0 + 1) * u) * v;
  };
  const GR = ['#4a8f34', '#589f3c', '#68b246', '#78c050', '#8ccf5c'].map(hexRGB);
  const PA = ['#a77b4a', '#b98d58', '#c99f68', '#d8b27a', '#e3c38c'].map(hexRGB);
  const SA = ['#d4b77e', '#e1c992', '#ebd8a6', '#f3e4b8'].map(hexRGB);
  const WA = ['#2a6aa6', '#3179b6', '#3b8ac4', '#4c9fd2', '#62b5df', '#7fcbe8'].map(hexRGB);
  const FOAM = hexRGB('#c6eaf4'), WET = hexRGB('#c2a46e'), EDGE = hexRGB('#946a3e');
  const img = g.createImageData(W, H), a = img.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / T, y = (py + 0.5) / T;
      const dth = BAYER[py & 3][px & 3] / 16 - 0.5;
      const nz = vnoise(x * 1.7, y * 1.7) - 0.5;
      const wv = samp(wM, x, y) + nz * 0.12;
      let col;
      if (wv > 0.5) {
        const d = Math.min(1, (samp(dep, x, y) - 0.5) / 3.2);
        col = pickTone(WA, 1 - d + dth * 0.25 + (fbm(x * 2, y * 4) - 0.5) * 0.18);
        if (wv < 0.6 && (BAYER[py & 3][px & 3] > 5 || wv < 0.54)) col = FOAM;
      } else if (samp(sM, x, y) + nz * 0.1 > 0.5) {
        col = wv > 0.42 ? WET : pickTone(SA, fbm(x * 3, y * 3) - 0.15 + dth * 0.3);
      } else {
        const pv = samp(pM, x, y) + nz * 0.16;
        if (pv > 0.5) {
          col = pv < 0.56 ? EDGE : pickTone(PA, fbm(x * 3, y * 3) * 1.1 - 0.05 + dth * 0.25);
        } else {
          let t = fbm(x * 0.9, y * 0.9) * 1.1 - 0.1 + dth * 0.2;
          t -= samp(ring, x, y) * 0.35;           // もりの なかは くらい
          if (samp(sM, x, y) > 0.2) t -= 0.12;     // すなはまの まわりは すこし こい
          col = pickTone(GR, t);
        }
      }
      const i = (py * W + px) * 4;
      a[i] = col[0];
      a[i + 1] = col[1];
      a[i + 2] = col[2];
      a[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tileAtPx = (px, py) => m.tiles[Math.floor(py / T) * m.w + Math.floor(px / T)];
  const r = RNG(5);
  // くさの たば
  for (let k = 0; k < (W * H) / 260; k++) {
    const px = (r() * W) | 0, py = (r() * H) | 0;
    if (tileAtPx(px, py) !== TL.GRASS) continue;
    const dark = r() < 0.6;
    const c1 = dark ? '#3f7e2c' : '#9ad968';
    R(g, c1, px, py, 1, 2);
    R(g, c1, px - 2, py + 1, 1, 2);
    R(g, c1, px + 2, py + 1, 1, 2);
    if (dark) R(g, '#7cc356', px, py - 1, 1, 1);
  }
  // こいし
  for (let k = 0; k < (W * H) / 1800; k++) {
    const px = (r() * W) | 0, py = (r() * H) | 0;
    const t = tileAtPx(px, py);
    if (t !== TL.PATH && t !== TL.SAND) continue;
    R(g, '#8f6a42', px, py + 1, 2, 1);
    R(g, '#efd6a6', px, py, 2, 1);
  }
}

function bakeHouseFloor(m, g) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y * m.w + x];
      const r = RNG(x * 31 + y * 7 + 1);
      const X = x * T, Y = y * T;
      if (t === TL.FLOOR) {
        // よこむきの いた 4まい
        for (let k = 0; k < 4; k++) {
          const tone = ['#a87444', '#b47d4b', '#bf8854', '#9e6c3f'][(r() * 4) | 0];
          R(g, tone, X, Y + k * 8, T, 8);
          R(g, shade(tone, 0.15), X, Y + k * 8, T, 1);
          R(g, '#7a4f2a', X, Y + k * 8 + 7, T, 1);
          const j = ((x * 13 + k * 11 + y * 5) % 3) * 10 + 4;
          R(g, '#7a4f2a', X + j, Y + k * 8, 1, 7);
          for (let s = 0; s < 2; s++) R(g, shade(tone, -0.12), X + ((r() * 26) | 0), Y + k * 8 + 2 + ((r() * 4) | 0), 4 + ((r() * 5) | 0), 1);
          if (r() < 0.3) R(g, '#5c3a1f', X + j + 2, Y + k * 8 + 3, 1, 1);
        }
      } else if (t === TL.WALL) {
        R(g, '#4a3020', X, Y, T, T);
        for (let k = 0; k < 4; k++) R(g, '#55382a', X + k * 8 + 1, Y, 6, T);
        R(g, '#3a2418', X, Y, T, 1);
        const below = y + 1 < m.h ? m.tiles[(y + 1) * m.w + x] : -1;
        if (below === TL.FLOOR || below === TL.FACE) { R(g, '#6e4a32', X, Y + T - 3, T, 2); R(g, '#2e1c12', X, Y + T - 1, T, 1); }
      } else if (t === TL.FACE) {
        // かべがみ（うえ）と こしいた（した）
        R(g, '#efe0bf', X, Y, T, 21);
        for (let yy = 2; yy < 20; yy += 6) {
          for (let xx = ((yy / 6) % 2) * 4 + 2; xx < T; xx += 8) {
            R(g, '#e2cfa6', X + xx, Y + yy, 1, 1);
            R(g, '#e2cfa6', X + xx - 1, Y + yy + 1, 3, 1);
            R(g, '#e2cfa6', X + xx, Y + yy + 2, 1, 1);
            if ((xx + yy) % 16 === 2) R(g, '#d9a0a0', X + xx, Y + yy + 1, 1, 1);
          }
        }
        R(g, 'rgba(60,30,10,.18)', X, Y, T, 3);
        R(g, '#a87444', X, Y + 20, T, 2);
        R(g, '#8a5a36', X, Y + 22, T, 9);
        R(g, '#7a4b2b', X + 3, Y + 24, 11, 5);
        R(g, '#7a4b2b', X + 18, Y + 24, 11, 5);
        R(g, '#9a6a42', X + 3, Y + 24, 11, 1);
        R(g, '#9a6a42', X + 18, Y + 24, 11, 1);
        R(g, '#4a2e1a', X, Y + 31, T, 1);
      }
    }
  }
}

// みずの きらきら（まいフレーム かさねる）
function drawWaterSparkles(g, m, x0, y0, x1, y1, time) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (m.tiles[y * m.w + x] !== TL.WATER) continue;
      for (let k = 0; k < 2; k++) {
        const h = hash2(x * 3 + k, y * 5 + k);
        const ph = (time * 0.8 + h * 9) % 3;
        if (ph > 1.2) continue;
        const w = ph < 0.6 ? 3 : 5;
        const px = x * T + 4 + Math.floor(hash2(x + k * 7, y) * 22), py = y * T + 4 + Math.floor(hash2(x, y + k * 9) * 22);
        R(g, ph < 0.6 ? '#d8f2fb' : '#9fd8f0', px - (w >> 1), py, w, 1);
      }
    }
  }
}

// ---------- しぜん ----------

function treeSprite(seed, pal) {
  const [dark, mid, light, hi] = pal;
  return osp(70, 92, (g) => {
    const bark = '#7a4a26', barkD = '#5a3417', barkL = '#9a643a';
    R(g, bark, 29, 50, 12, 38);
    R(g, barkD, 29, 50, 3, 38);
    R(g, barkL, 37, 52, 2, 34);
    for (let y = 56; y < 86; y += 6) R(g, barkD, 32 + ((y / 6) % 2) * 3, y, 1, 3);
    R(g, bark, 25, 86, 20, 4);
    R(g, barkD, 23, 88, 6, 2);
    R(g, barkD, 41, 88, 6, 2);
    const C = [[35, 32, 27, 22], [16, 42, 15, 12], [54, 42, 15, 12], [22, 19, 15, 13], [48, 19, 15, 13], [35, 10, 13, 10], [9, 30, 9, 9], [61, 30, 9, 9]];
    E(g, dark, 35, 50, 26, 9);
    for (const [x, y, rx, ry] of C) E(g, dark, x, y + 2, rx, ry);
    for (const [x, y, rx, ry] of C) E(g, mid, x - 1, y, rx - 2, ry - 2);
    for (const [x, y, rx, ry] of C) E(g, light, x - 3, y - 3, Math.max(2, rx - 8), Math.max(2, ry - 7));
    for (const [x, y, rx, ry] of C) if (rx > 12) E(g, hi, x - 6, y - 7, rx - 14, Math.max(1, ry - 12));
    const r = RNG(seed);
    const inside = (x, y) => C.some(([cx, cy, rx, ry]) => ((x - cx) / (rx - 3)) ** 2 + ((y - cy) / (ry - 3)) ** 2 < 1);
    for (let i = 0; i < 260; i++) {
      const x = (r() * 70) | 0, y = (r() * 56) | 0;
      if (!inside(x, y)) continue;
      if (r() < 0.6) R(g, dark, x, y, 2, 1);
      else R(g, hi, x, y, 1, 1);
    }
    if (seed % 2) {
      for (const [x, y] of [[20, 30], [48, 26], [36, 44], [56, 40]]) {
        R(g, '#b8231c', x, y, 4, 4);
        R(g, '#e8463a', x, y, 3, 3);
        R(g, '#ffb0a0', x, y, 1, 1);
        R(g, '#5a3417', x + 1, y - 1, 1, 1);
      }
    }
  }, '#1f3518');
}

function pineSprite() {
  return osp(56, 92, (g) => {
    R(g, '#6a4022', 25, 70, 7, 20);
    R(g, '#4f2e16', 25, 70, 2, 20);
    R(g, '#6a4022', 22, 88, 13, 3);
    const tiers = [[8, 30], [24, 25], [40, 20], [56, 14]];
    for (let k = tiers.length - 1; k >= 0; k--) {
      const [top, half] = tiers[tiers.length - 1 - k];
      for (let y = 0; y < 26; y++) {
        const w = Math.round(((y + 4) / 30) * (28 - k * 4));
        R(g, '#24552c', 28 - w, top + y + 2, w * 2, 1);
        R(g, '#2f6e3a', 28 - w + 1, top + y, w * 2 - 3, 1);
        R(g, '#3f8a4a', 28 - w + 2, top + y, Math.max(1, w - 3), 1);
      }
      void half;
    }
    R(g, '#5aa860', 24, 8, 3, 6);
    R(g, '#5aa860', 18, 30, 4, 2);
    R(g, '#5aa860', 14, 50, 4, 2);
  }, '#16301a');
}

function bushSprite(seed) {
  return osp(36, 28, (g) => {
    const C = [[18, 16, 16, 11], [9, 19, 8, 7], [27, 19, 8, 7], [18, 9, 9, 7]];
    for (const [x, y, rx, ry] of C) E(g, '#2f6b2c', x, y + 1, rx, ry);
    for (const [x, y, rx, ry] of C) E(g, '#448f3a', x - 1, y, rx - 2, ry - 2);
    for (const [x, y, rx, ry] of C) E(g, '#62ad4c', x - 2, y - 2, Math.max(1, rx - 6), Math.max(1, ry - 5));
    const r = RNG(seed);
    for (let i = 0; i < 9; i++) {
      const x = 6 + ((r() * 24) | 0), y = 6 + ((r() * 14) | 0);
      R(g, seed % 2 ? '#ffffff' : '#ff9cc0', x, y, 2, 2);
      R(g, '#ffe36a', x, y, 1, 1);
    }
  }, '#1f3518');
}

function flowerDecal(seed, cols) {
  return make(32, 32, (g) => {
    const r = RNG(seed);
    for (let k = 0; k < 4; k++) {
      const x = 4 + ((r() * 24) | 0), y = 5 + ((r() * 22) | 0), c = cols[k % cols.length];
      R(g, '#3a7a2a', x, y + 2, 1, 3);
      R(g, '#5ca842', x + 1, y + 3, 2, 1);
      R(g, c, x - 1, y, 3, 1);
      R(g, c, x, y - 1, 1, 3);
      R(g, c === '#ffd23f' ? '#e08a20' : '#ffe36a', x, y, 1, 1);
    }
  });
}

function buildNature() {
  SP.tree = treeSprite(1, ['#2f6b2c', '#3f8a37', '#56a845', '#7cc35a']);
  SP.tree2 = treeSprite(2, ['#2c6430', '#3a7f3e', '#4f9a4a', '#73bb62']);
  SP.pine = pineSprite();
  SP.bush = bushSprite(3);
  SP.bush2 = bushSprite(4);
  SP.weed = osp(30, 28, (g) => {
    const blades = [[4, 12, -1], [8, 6, -0.5], [12, 2, 0], [15, 5, 0.3], [19, 1, 0.6], [23, 7, 1], [26, 12, 1.2]];
    for (const [x, top, d] of blades) {
      for (let y = top; y < 27; y++) {
        const cx = x + Math.round(d * (27 - y) * 0.2);
        R(g, y < top + 3 ? '#9ad968' : y > 20 ? '#3a7a2a' : '#5ca842', cx, y, 2, 1);
      }
    }
  }, '#1f3518');
  SP.rock = osp(30, 24, (g) => {
    E(g, '#6b6e73', 15, 14, 13, 9);
    E(g, '#8a8e94', 14, 12, 12, 8);
    E(g, '#a9adb3', 11, 9, 7, 4);
    R(g, '#c9cdd2', 8, 7, 5, 1);
    R(g, '#5a5d62', 17, 12, 1, 5);
    R(g, '#5a5d62', 18, 16, 3, 1);
    R(g, '#6fa04a', 4, 16, 5, 2);
    R(g, '#8cc05a', 5, 15, 3, 1);
  }, '#2a2b2e');
  SP.flowerA = flowerDecal(7, ['#ffffff', '#ffd23f']);
  SP.flowerB = flowerDecal(8, ['#ff8fb5', '#b7a2ff', '#ffffff']);
  const fence = (vertical) => osp(32, 38, (g) => {
    const w1 = '#9a6638', w2 = '#b8804a', w3 = '#7a4b28', w4 = '#d29a60';
    if (vertical) {
      R(g, w3, 14, 0, 4, 38);
      R(g, w2, 14, 0, 2, 38);
    } else {
      for (const y of [14, 25]) {
        R(g, w1, 0, y, 32, 4);
        R(g, w2, 0, y, 32, 1);
        R(g, w3, 0, y + 3, 32, 1);
      }
    }
    R(g, w1, 12, 6, 8, 30);
    R(g, w2, 12, 6, 3, 30);
    R(g, w3, 18, 6, 2, 30);
    R(g, w4, 12, 4, 8, 3);
    R(g, w2, 11, 6, 10, 2);
    R(g, w3, 15, 12, 1, 3);
    R(g, w3, 16, 22, 1, 4);
  }, '#3a2010');
  SP.fence = fence(false);
  SP.fenceV = fence(true);
  SP.sign = osp(30, 40, (g) => {
    R(g, '#7a4b28', 13, 18, 5, 22);
    R(g, '#9a6638', 13, 18, 2, 22);
    R(g, '#b8804a', 1, 3, 28, 18);
    R(g, '#d29a60', 1, 3, 28, 2);
    R(g, '#8a5a30', 1, 19, 28, 2);
    R(g, '#9a6638', 1, 10, 28, 1);
    R(g, '#4c2f17', 6, 8, 14, 2);
    R(g, '#4c2f17', 6, 13, 18, 2);
    R(g, '#d8d0c0', 3, 5, 1, 1);
    R(g, '#d8d0c0', 26, 5, 1, 1);
  }, '#3a2010');
  SP.lily = osp(22, 14, (g) => {
    E(g, '#2f7a3a', 11, 7, 10, 6);
    E(g, '#46a04c', 10, 6, 8, 4);
    for (let i = 0; i < 6; i++) R(g, '#3a8c42', 11 - i, 7, 1, 1);
    R(g, '#3f8ac4', 11, 2, 4, 5);
    R(g, '#3f8ac4', 13, 4, 6, 2);
  }, '#1f4a26');
  SP.lotus = make(24, 16, (g) => {
    g.drawImage(SP.lily, 0, 0);
    g.drawImage(outline(make(10, 9, (h) => {
      E(h, '#f59ab8', 5, 5, 4, 3);
      R(h, '#ffd0e0', 4, 1, 2, 4);
      R(h, '#ffd0e0', 1, 3, 2, 3);
      R(h, '#ffd0e0', 7, 3, 2, 3);
      R(h, '#ffe36a', 4, 4, 2, 2);
    }), '#9a3a5a'), 7, 0);
  });
  SP.reed = osp(16, 30, (g) => {
    for (const [x, h, d] of [[4, 22, -0.2], [8, 28, 0], [11, 18, 0.3]]) {
      for (let y = 30 - h; y < 30; y++) R(g, '#5a8a3a', x + Math.round(d * (30 - y) * 0.3), y, 1, 1);
    }
    R(g, '#7a4a26', 7, 3, 3, 8);
    R(g, '#9a643a', 7, 3, 1, 8);
    R(g, '#7a4a26', 3, 10, 3, 6);
    leaf(g, 6, 28, 12, -0.8, '#6aa048', '#8cc05a');
  }, '#2a3a18');
}

// ---------- たてもの ----------

function houseSprite() {
  return osp(200, 176, (g) => {
    // どだい
    for (let row = 0; row < 2; row++) {
      let x = row ? 2 : 8;
      while (x < 192) {
        const w = Math.min(10 + ((x * 7) % 9), 192 - x);
        const y = 152 + row * 10;
        R(g, (x + row) % 3 ? '#9a9184' : '#857d71', x, y, w, 10);
        R(g, '#b9b0a2', x, y, w, 2);
        R(g, '#5f584f', x + w - 1, y, 1, 10);
        R(g, '#6f685f', x, y + 9, w, 1);
        x += w;
      }
    }
    // かべ と はしら
    R(g, '#f2e2c0', 10, 80, 180, 74);
    const r = RNG(4);
    for (let i = 0; i < 260; i++) R(g, r() < 0.5 ? '#e6d3ad' : '#fbefd6', 10 + ((r() * 180) | 0), 80 + ((r() * 72) | 0));
    const beam = (bx, by, bw, bh) => {
      R(g, '#7a4b2b', bx, by, bw, bh);
      R(g, '#97633b', bx, by, bw > bh ? bw : 2, bw > bh ? 2 : bh);
      R(g, '#5c361c', bw > bh ? bx : bx + bw - 1, bw > bh ? by + bh - 1 : by, bw > bh ? bw : 1, bw > bh ? 1 : bh);
    };
    for (const bx of [10, 60, 134, 184]) beam(bx, 80, 6, 74);
    beam(10, 80, 180, 6);
    beam(10, 132, 50, 4);
    beam(140, 132, 44, 4);
    R(g, 'rgba(80,40,20,.28)', 10, 86, 180, 7);
    // まど
    for (const wx of [22, 148]) {
      R(g, '#5c361c', wx, 94, 30, 30);
      for (let y = 0; y < 26; y++) {
        const t = y / 26;
        R(g, t < 0.5 ? '#cdeefa' : t < 0.8 ? '#a6dcf1' : '#86c9e6', wx + 2, 96 + y, 26, 1);
      }
      for (let i = 0; i < 8; i++) {
        R(g, '#ffffff', wx + 5 + i, 98 + i, 1, 1);
        R(g, '#ffffff', wx + 9 + i, 98 + i, 1, 1);
      }
      for (let y = 0; y < 12; y++) {
        const cw = Math.max(1, 6 - (y >> 1));
        R(g, '#e8746a', wx + 2, 96 + y, cw, 1);
        R(g, '#e8746a', wx + 28 - cw, 96 + y, cw, 1);
      }
      R(g, '#5c361c', wx + 14, 96, 2, 26);
      R(g, '#5c361c', wx + 2, 108, 26, 2);
      R(g, '#97633b', wx - 2, 124, 34, 3);
      R(g, '#7a4b2b', wx, 127, 30, 6);
      R(g, '#5c361c', wx, 132, 30, 1);
      for (let i = 0; i < 6; i++) {
        const fx = wx + 2 + i * 5, c = ['#e8465a', '#ffd23f', '#ff8fb5'][i % 3];
        R(g, '#3f8a32', fx, 122, 3, 4);
        R(g, c, fx, 119, 3, 3);
        R(g, '#fff6c0', fx + 1, 120, 1, 1);
      }
    }
    // ドア（いえの ひだりから 2.5マスめが まんなか）
    const dx = 70;
    R(g, '#5c361c', dx, 104, 28, 50);
    for (let y = 0; y < 48; y++) {
      const inset = y < 3 ? 3 - y : 0;
      R(g, '#a8693a', dx + 2 + inset, 106 + y, 24 - inset * 2, 1);
    }
    for (const k of [8, 14, 20]) R(g, '#8a5228', dx + k, 108, 1, 46);
    R(g, '#5c361c', dx + 8, 112, 12, 10);
    R(g, '#a6dcf1', dx + 9, 113, 10, 8);
    R(g, '#ffffff', dx + 10, 114, 2, 1);
    R(g, '#f2c94c', dx + 22, 132, 2, 3);
    R(g, '#3a3532', dx + 2, 114, 3, 2);
    R(g, '#3a3532', dx + 2, 142, 3, 2);
    R(g, '#a39b8f', dx - 6, 154, 40, 4);
    R(g, '#c4bcae', dx - 6, 154, 40, 1);
    // ランタン
    R(g, '#3a3532', 103, 106, 8, 2);
    R(g, '#3a3532', 104, 108, 6, 10);
    R(g, '#ffd76a', 105, 109, 4, 7);
    R(g, '#fff4c0', 106, 110, 1, 3);
    // やね
    for (let rr = 0; rr < 10; rr++) {
      const y = 14 + rr * 7;
      const t0 = (y - 14) / 70, t1 = (y + 7 - 14) / 70;
      const x0 = Math.round(30 - 30 * t1), x1 = Math.round(170 + 30 * t1);
      const x00 = Math.round(30 - 30 * t0);
      R(g, rr % 2 ? '#b04a33' : '#bf563d', x0, y, x1 - x0, 7);
      R(g, '#d8735a', x00, y, Math.round(170 + 30 * t0) - x00, 1);
      R(g, '#8a3424', x0, y + 6, x1 - x0, 1);
      for (let sx = x0 + (rr % 2) * 6; sx < x1; sx += 12) R(g, '#93392a', sx, y + 1, 1, 5);
    }
    R(g, '#5c2418', 0, 84, 200, 4);
    R(g, '#7a2c1e', 28, 9, 144, 7);
    R(g, '#a5432f', 28, 9, 144, 2);
    // えんとつ
    R(g, '#9a5a48', 138, 2, 20, 26);
    for (let y = 4; y < 28; y += 5) {
      R(g, '#c79a88', 138, y, 20, 1);
      for (let bx = 138 + ((y / 5) % 2) * 5; bx < 158; bx += 10) R(g, '#c79a88', bx, y, 1, 5);
    }
    R(g, '#5f3a30', 135, 0, 26, 4);
    R(g, '#7f564a', 135, 0, 26, 1);
  }, '#3a2010');
}

function buildBuildings() {
  SP.house = houseSprite();
  // じどう はんばいき（ひとが いなく なっても まだ うごいている。ネオンが ひかる）
  SP.vend = osp(62, 84, (g) => {
    R(g, '#1b1d30', 2, 4, 58, 76);
    R(g, '#2a2d48', 4, 4, 54, 74);
    R(g, '#3a3e60', 4, 4, 3, 74);
    // ネオンの かんばん
    R(g, '#0d0e1c', 6, 7, 50, 11);
    R(g, '#ff4fd8', 6, 7, 50, 1);
    R(g, '#ff4fd8', 6, 17, 50, 1);
    for (const [x, w] of [[10, 6], [18, 4], [24, 8], [34, 5], [41, 10]]) R(g, '#5ff6ff', x, 11, w, 3);
    R(g, '#c8fbff', 10, 11, 2, 1);
    // ガラスの なか（たね・どうぐの はこ）
    R(g, '#081a26', 7, 21, 34, 38);
    for (let row = 0; row < 3; row++) {
      const y = 23 + row * 12;
      R(g, '#5ff6ff', 7, y + 10, 34, 1);
      for (let k = 0; k < 4; k++) {
        const c = ['#e2392c', '#ffd23f', '#7dff9a', '#ff4fd8', '#e98a24', '#9b8cff'][(row * 4 + k) % 6];
        R(g, c, 9 + k * 8, y + 2, 6, 8);
        R(g, shade(c, 0.4), 9 + k * 8, y + 2, 6, 2);
        R(g, '#ffffff', 10 + k * 8, y + 5, 3, 1);
      }
    }
    for (let i = 0; i < 12; i++) R(g, 'rgba(200,240,255,.35)', 10 + i, 22 + i * 3, 1, 2);
    // ボタン・コインの いれぐち・がめん
    R(g, '#14162a', 44, 21, 12, 38);
    R(g, '#7dff9a', 46, 23, 8, 5);
    R(g, '#c8ffd6', 47, 24, 3, 1);
    for (let k = 0; k < 4; k++) {
      R(g, k % 2 ? '#5ff6ff' : '#ffd23f', 46, 31 + k * 5, 3, 3);
      R(g, k % 2 ? '#ff4fd8' : '#5ff6ff', 51, 31 + k * 5, 3, 3);
    }
    R(g, '#000000', 49, 52, 2, 5);
    R(g, '#6a7088', 48, 51, 4, 1);
    // とりだしぐち
    R(g, '#08090f', 9, 63, 44, 9);
    R(g, '#3a3e60', 9, 63, 44, 1);
    R(g, '#5ff6ff', 9, 72, 44, 1);
    // さび・よごれ・ネオンの ふち
    for (const [x, y] of [[6, 40], [54, 66], [13, 74], [48, 9], [30, 60]]) {
      R(g, '#7a4a2a', x, y, 2, 1);
      R(g, '#9a5a32', x + 1, y + 1, 1, 1);
    }
    R(g, '#5ff6ff', 2, 4, 1, 76);
    R(g, '#ff4fd8', 59, 4, 1, 76);
    R(g, '#14162a', 4, 78, 8, 6);
    R(g, '#14162a', 50, 78, 8, 6);
  }, '#07080f');
  SP.bin = osp(62, 44, (g) => {
    R(g, '#9a6638', 3, 12, 56, 30);
    for (let x = 10; x < 58; x += 10) R(g, '#7a4b28', x, 12, 1, 30);
    R(g, '#7a4b28', 3, 26, 56, 2);
    R(g, '#b8804a', 0, 4, 62, 9);
    R(g, '#d8a46a', 0, 4, 62, 2);
    R(g, '#7a4b28', 0, 12, 62, 1);
    for (const [cx, cy] of [[3, 12], [55, 12], [3, 37], [55, 37]]) R(g, '#6b6e73', cx, cy, 4, 5);
    E(g, '#c99a28', 31, 33, 6, 6);
    E(g, '#f2c94c', 31, 33, 5, 5);
    R(g, '#c99a28', 30, 30, 2, 7);
    R(g, '#fff0b0', 28, 30, 2, 2);
    R(g, '#3a2a1a', 24, 7, 14, 2);
  }, '#3a2010');

  // ---------- いえの なか ----------
  SP.bed = osp(62, 62, (g) => {
    R(g, '#7a4b28', 0, 0, 62, 14);
    R(g, '#9a6638', 2, 2, 58, 10);
    R(g, '#b8804a', 2, 2, 58, 2);
    R(g, '#7a4b28', 0, 0, 5, 62);
    R(g, '#7a4b28', 57, 0, 5, 62);
    R(g, '#9a6638', 1, 0, 2, 62);
    R(g, '#f6f1e6', 7, 10, 48, 13);
    R(g, '#ffffff', 9, 11, 20, 4);
    R(g, '#dcd5c6', 7, 21, 48, 2);
    for (let y = 0; y < 34; y++) {
      for (let x = 0; x < 52; x++) {
        const sq = ((x >> 3) + (y >> 3)) % 3;
        R(g, ['#5b8fd1', '#7aa8e0', '#f2ead8'][sq], 5 + x, 23 + y, 1, 1);
      }
    }
    for (let x = 5; x < 57; x += 8) R(g, 'rgba(40,60,110,.35)', x, 23, 1, 34);
    for (let y = 23; y < 57; y += 8) R(g, 'rgba(40,60,110,.35)', 5, y, 52, 1);
    R(g, 'rgba(255,255,255,.35)', 5, 23, 52, 2);
    R(g, 'rgba(20,30,70,.3)', 5, 52, 52, 5);
    R(g, '#7a4b28', 0, 56, 62, 6);
    R(g, '#9a6638', 0, 56, 62, 2);
  }, '#3a2010');
  SP.closet = osp(62, 78, (g) => {
    R(g, '#6e4626', 0, 4, 62, 70);
    R(g, '#8b5e34', 0, 0, 62, 6);
    R(g, '#a77445', 0, 0, 62, 2);
    for (const x of [3, 32]) {
      R(g, '#8b5e34', x, 9, 27, 60);
      R(g, '#a77445', x, 9, 27, 1);
      R(g, '#7a522c', x + 3, 13, 21, 22);
      R(g, '#7a522c', x + 3, 40, 21, 24);
      R(g, '#9a6a3e', x + 3, 13, 21, 1);
      R(g, '#9a6a3e', x + 3, 40, 21, 1);
    }
    R(g, '#f2c94c', 26, 36, 2, 5);
    R(g, '#f2c94c', 34, 36, 2, 5);
    R(g, '#fff0b0', 26, 36, 1, 1);
    R(g, '#4a2f1a', 2, 72, 6, 6);
    R(g, '#4a2f1a', 54, 72, 6, 6);
  }, '#2e1c10');
  // ロボの じゅうでんき（こわれかけ。やねの アンテナから ケーブルが きている）
  SP.charger = osp(62, 62, (g) => {
    R(g, '#2b2f36', 27, 0, 4, 20);
    R(g, '#3d434c', 28, 0, 1, 20);
    R(g, '#3d434c', 2, 18, 58, 42);
    R(g, '#5d6470', 4, 18, 54, 38);
    R(g, '#8a929e', 4, 18, 54, 3);
    R(g, '#4a5058', 4, 52, 54, 4);
    // がめん（でんちの マーク）
    R(g, '#0d1418', 9, 25, 26, 20);
    R(g, '#5ff6ff', 12, 30, 17, 10);
    R(g, '#0d1418', 13, 31, 15, 8);
    R(g, '#5ff6ff', 29, 33, 2, 4);
    R(g, '#3a5a60', 14, 32, 4, 6);
    // かみなりの マーク
    for (let y = 24; y <= 42; y++) {
      const t = (y - 24) / 18;
      const x = Math.round(48 - t * 6 + (y > 31 && y < 34 ? 3 : 0));
      R(g, '#ffd23f', x, y, 3, 1);
    }
    R(g, '#fff4a0', 46, 25, 1, 5);
    // ケーブル と プラグ
    R(g, '#2b2f36', 56, 40, 4, 18);
    R(g, '#2b2f36', 40, 56, 20, 4);
    R(g, '#8a929e', 36, 55, 5, 6);
    // さび
    for (const [x, y] of [[6, 47], [33, 22], [52, 49], [18, 49]]) {
      R(g, '#7a4a2a', x, y, 3, 2);
      R(g, '#c07a44', x, y, 1, 1);
    }
  }, '#11141c');
  SP.table = osp(62, 46, (g) => {
    R(g, '#6e4626', 4, 18, 6, 28);
    R(g, '#6e4626', 52, 18, 6, 28);
    R(g, '#8b5e34', 5, 18, 2, 28);
    R(g, '#a06c3e', 0, 12, 62, 12);
    R(g, '#c08a52', 0, 12, 62, 3);
    R(g, '#7a4b28', 0, 22, 62, 2);
    for (let x = 6; x < 60; x += 14) R(g, '#8b5e34', x, 15, 8, 1);
    // しゃしんたて
    R(g, '#5c361c', 10, 0, 16, 14);
    R(g, '#d8c7a0', 12, 2, 12, 10);
    E(g, '#8a8a8a', 15, 7, 2, 2);
    E(g, '#b0a080', 20, 8, 2, 3);
    R(g, '#f2c94c', 10, 0, 16, 1);
    // きゅうす と ゆのみ
    E(g, '#5a8a4a', 40, 9, 6, 5);
    R(g, '#4a7a3a', 45, 6, 4, 2);
    R(g, '#3a5a2a', 38, 3, 4, 2);
    R(g, '#e8e2d6', 50, 7, 6, 6);
    R(g, '#5a8a4a', 50, 7, 6, 2);
  }, '#2e1c10');
  SP.rug = make(96, 64, (g) => {
    R(g, '#a8423a', 2, 2, 92, 60);
    R(g, '#e9cf8a', 6, 6, 84, 52);
    R(g, '#a8423a', 9, 9, 78, 46);
    R(g, '#c95a4c', 12, 12, 72, 40);
    for (let x = 22; x < 80; x += 16) {
      E(g, '#e9cf8a', x, 32, 5, 5);
      E(g, '#a8423a', x, 32, 2, 2);
    }
    for (let x = 4; x < 92; x += 3) {
      R(g, '#e9cf8a', x, 0, 1, 2);
      R(g, '#e9cf8a', x, 62, 1, 2);
    }
    for (let y = 12; y < 52; y += 4) for (let x = 12; x < 84; x += 4) if ((x + y) % 8 === 0) R(g, '#b84e42', x, y, 1, 1);
  });
  SP.window = make(32, 32, (g) => {
    R(g, '#5c361c', 4, 2, 24, 18);
    for (let y = 0; y < 14; y++) R(g, y < 7 ? '#d8f2fb' : '#a6dcf1', 6, 4 + y, 20, 1);
    for (let i = 0; i < 6; i++) R(g, '#ffffff', 8 + i, 5 + i, 1, 1);
    R(g, '#5c361c', 15, 4, 2, 14);
    R(g, '#5c361c', 6, 10, 20, 2);
    for (let y = 0; y < 10; y++) {
      const cw = Math.max(1, 5 - (y >> 1));
      R(g, '#e8746a', 6, 4 + y, cw, 1);
      R(g, '#e8746a', 26 - cw, 4 + y, cw, 1);
    }
    R(g, '#97633b', 2, 20, 28, 2);
    R(g, '#7a4b2b', 2, 21, 28, 1);
  });
  SP.doorIn = make(32, 32, (g) => {
    R(g, '#2e1c12', 0, 0, 32, 32);
    for (let y = 0; y < 32; y++) R(g, y < 16 ? '#fff4c8' : '#f4e3a8', 4, y, 24, 1);
    R(g, '#d8c27a', 4, 22, 24, 10);
    R(g, '#b88a4a', 6, 26, 20, 5);
    for (let x = 7; x < 26; x += 3) R(g, '#a07a3a', x, 27, 1, 3);
    R(g, '#5c361c', 2, 0, 2, 32);
    R(g, '#5c361c', 28, 0, 2, 32);
  });
  SP.cobweb = make(32, 32, (g) => {
    const c = 'rgba(240,240,240,.55)';
    for (let i = 0; i < 24; i++) {
      R(g, c, i, 0);
      R(g, c, 0, i);
      R(g, c, i, i);
      R(g, c, i, i >> 1);
      R(g, c, i >> 1, i);
    }
    for (const rr of [6, 12, 18]) for (let i = 0; i <= rr; i++) R(g, c, i, rr - i);
  });
  // がらくた
  const box = (g, c1, c2, c3) => {
    R(g, c2, 3, 8, 24, 20);
    R(g, c1, 3, 8, 24, 9);
    R(g, c3, 3, 16, 24, 1);
    R(g, shade(c1, 0.2), 3, 8, 24, 1);
    R(g, '#e8dcb8', 13, 8, 4, 12);
    R(g, '#cfc3a0', 13, 17, 4, 1);
    R(g, 'rgba(210,210,200,.8)', 5, 7, 7, 1);
    R(g, 'rgba(210,210,200,.8)', 19, 9, 5, 1);
  };
  SP.c_box = osp(30, 30, (g) => box(g, '#d4a466', '#b5854a', '#8f6434'));
  SP.c_news = osp(30, 30, (g) => {
    for (let i = 0; i < 5; i++) {
      const y = 24 - i * 4, x = 3 + (i % 2) * 2;
      R(g, i % 2 ? '#e4ddc8' : '#d2c9ae', x, y, 22, 4);
      R(g, '#f2ecdc', x, y, 22, 1);
      R(g, '#9a937e', x + 3, y + 2, 10, 1);
      R(g, '#9a937e', x + 15, y + 2, 4, 1);
    }
    R(g, '#b14a3a', 4, 9, 22, 1);
    R(g, '#8a6a48', 14, 7, 2, 21);
  }, '#3a3020');
  SP.c_pot = osp(30, 30, (g) => {
    E(g, '#8a4e2a', 15, 18, 11, 10);
    E(g, '#a5643a', 14, 17, 10, 9);
    E(g, '#c27f50', 10, 14, 4, 5);
    R(g, '#8a4e2a', 9, 4, 12, 4);
    R(g, '#a5643a', 9, 4, 12, 1);
    R(g, '#4a2a16', 17, 10, 1, 4);
    R(g, '#4a2a16', 18, 14, 1, 4);
    R(g, '#4a2a16', 17, 18, 2, 1);
    R(g, '#4a2a16', 19, 19, 1, 5);
    R(g, '#d8a070', 7, 20, 3, 1);
  }, '#3a1e0e');
  SP.c_boots = osp(30, 30, (g) => {
    for (const x of [3, 16]) {
      R(g, '#3f6a3a', x, 6, 8, 18);
      R(g, '#3f6a3a', x, 20, 12, 7);
      R(g, '#5a8a52', x, 6, 2, 18);
      R(g, '#5a8a52', x, 6, 8, 2);
      R(g, '#2c4a28', x, 26, 12, 2);
      R(g, '#7a5a3a', x + 2, 22, 5, 2);
    }
  }, '#1a2a18');
  SP.c_bucket = osp(30, 30, (g) => {
    R(g, '#7c838a', 5, 10, 20, 18);
    R(g, '#9aa1a8', 6, 10, 6, 18);
    R(g, '#b8bec4', 5, 10, 20, 3);
    R(g, '#5c6268', 5, 26, 20, 2);
    R(g, '#8a5a36', 8, 18, 4, 3);
    R(g, '#8a5a36', 18, 22, 3, 3);
    R(g, '#a06c43', 20, 14, 2, 2);
    for (let i = 0; i < 9; i++) R(g, '#5c6268', 6 + i * 2, 3 + Math.round(Math.abs(i - 4) * 1.2), 2, 1);
  }, '#2a2c30');
  SP.c_cloth = osp(30, 30, (g) => {
    E(g, '#3e5f94', 15, 21, 13, 7);
    E(g, '#5a7bb0', 14, 19, 12, 6);
    E(g, '#7092c4', 12, 16, 8, 4);
    R(g, '#e9e2d0', 8, 17, 4, 1);
    R(g, '#e9e2d0', 18, 21, 4, 1);
    R(g, '#e9e2d0', 13, 13, 2, 1);
    R(g, '#2f4a78', 22, 22, 3, 2);
    R(g, '#2f4a78', 6, 24, 2, 2);
  }, '#1c2a44');
  SP.c_kettle = osp(30, 30, (g) => {
    E(g, '#2a2828', 14, 19, 11, 8);
    E(g, '#3b3a3a', 13, 18, 10, 7);
    E(g, '#5a5858', 9, 15, 4, 3);
    for (let i = 0; i < 5; i++) R(g, '#3b3a3a', 24 + i, 15 - i, 2, 2);
    R(g, '#2a2828', 7, 3, 2, 9);
    R(g, '#2a2828', 19, 3, 2, 9);
    R(g, '#2a2828', 7, 3, 14, 2);
    R(g, '#4a4646', 11, 9, 6, 2);
  }, '#141212');
  SP.c_book = osp(30, 30, (g) => {
    const books = [[2, 21, 26, '#8c3a3a'], [4, 15, 23, '#3a5a8c'], [2, 9, 22, '#3a7a4a'], [5, 4, 18, '#8a6a2a']];
    for (const [x, y, w, c] of books) {
      R(g, c, x, y, w, 6);
      R(g, shade(c, 0.25), x, y, w, 1);
      R(g, '#efe6d0', x + w - 3, y + 1, 2, 4);
      R(g, '#efe6d0', x + 2, y + 2, 1, 2);
    }
  }, '#2a1a10');
  SP.bobber = outline(make(6, 7, (g) => {
    R(g, '#ffffff', 1, 0, 4, 3);
    R(g, '#e8342e', 0, 3, 6, 2);
    R(g, '#e8342e', 1, 5, 4, 2);
    R(g, '#ffd0c8', 1, 3, 1, 1);
  }), '#2b1a0e');
}

// ---------- しゅじんこう（ロボ。パーツで みためが かわる） ----------

const RC = {
  body: '#6f9a94', bodyD: '#4a6f6a', bodyL: '#9cc7bf', rust: '#9a5a32', rustL: '#c07a44',
  metal: '#8a929e', metalD: '#5d6470', metalL: '#b4bcc6', visor: '#18222b', panel: '#2a333c',
  eyeOn: '#5ff6ff', eyeOff: '#3d4a52', pink: '#ff4fd8', pinkOff: '#6a3a62', green: '#7dff9a', greenOff: '#3a5244',
  tread: '#2e3238', treadL: '#4a5058', hazard: '#ffd23f',
};

// dir：'down' 'up' 'side'（みぎむき）、f：0 とまる・1 2 あるく、parts：{ legs, arm, sensor }、on：めを さましている
function robotSprite(dir, f, parts, on) {
  return osp(32, 48, (g) => {
    const lu = f === 1 ? 1 : 0, ru = f === 2 ? 1 : 0;
    const eye = on ? RC.eyeOn : RC.eyeOff;
    const ball = on ? RC.pink : RC.pinkOff;
    const side = dir === 'side';
    const slump = on ? 0 : 1; // とまっている ときは あたまが すこし さがる

    // あし
    if (parts.legs >= 1) {
      const xs = side ? [9] : [6, 18];
      for (const x of xs) {
        const w = side ? 15 : 8;
        R(g, RC.tread, x, 38, w, 10);
        R(g, RC.treadL, x, 38, w, 1);
        for (let y = 40 + (f % 2); y < 47; y += 2) R(g, RC.treadL, x + 1, y, w - 2, 1);
        R(g, RC.metal, x + 2, 41, 2, 2);
        R(g, RC.metal, x + w - 4, 44, 2, 2);
      }
    } else {
      R(g, RC.metalD, side ? 12 : 9, 37, side ? 9 : 15, 3);
      const xs = side ? [16 + (f === 1 ? -1 : f === 2 ? 1 : 0)] : [11, 21];
      for (const cx of xs) {
        E(g, RC.tread, cx, 44, 3, 3);
        E(g, RC.treadL, cx, 44, 1, 1);
        R(g, RC.metalL, cx + (f === 1 ? -1 : f === 2 ? 1 : 0), 42, 1, 1);
      }
    }

    // うで（まえから・うしろから は りょうがわ、よこからは てまえの 1ぽん）
    const arm = (x, y, big) => {
      if (big) {
        E(g, RC.metalD, x + 2, y, 3, 3);
        E(g, RC.metal, x + 2, y - 1, 2, 2);
        R(g, RC.metal, x, y + 2, 5, 8);
        R(g, RC.metalL, x, y + 2, 1, 8);
        for (let k = 0; k < 8; k += 3) R(g, RC.hazard, x + 1, y + 3 + k, 3, 1);
        R(g, RC.metalD, x - 1, y + 10, 2, 3);
        R(g, RC.metalD, x + 4, y + 10, 2, 3);
      } else {
        R(g, RC.metalD, x + 1, y, 3, 9);
        R(g, RC.metal, x + 1, y, 1, 9);
        R(g, RC.rust, x + 2, y + 4, 1, 1);
        R(g, RC.metalD, x, y + 9, 1, 2);
        R(g, RC.metalD, x + 4, y + 9, 1, 2);
      }
    };
    const big = parts.arm >= 1;
    if (!side) {
      arm(big ? 1 : 3, 26 + ru, big);
      arm(big ? 26 : 25, 26 + lu, big);
    }

    // からだ
    const bx = side ? 10 : 8, bw = side ? 13 : 17;
    R(g, RC.bodyD, bx, 24, bw, 15);
    R(g, RC.body, bx + 1, 24, bw - 2, 13);
    R(g, RC.bodyL, bx + 1, 24, 2, 13);
    R(g, RC.bodyD, bx, 36, bw, 1);
    R(g, RC.rust, bx + bw - 4, 33, 2, 2);
    R(g, RC.rustL, bx + bw - 4, 33, 1, 1);
    if (dir === 'down') {
      R(g, RC.panel, 12, 27, 9, 7);
      R(g, on ? RC.green : RC.greenOff, 13, 28, 2, 2);
      for (let k = 0; k < 3; k++) R(g, on ? RC.eyeOn : RC.eyeOff, 16 + k * 2 - 1, 31, 1, 2);
      R(g, on ? RC.pink : RC.pinkOff, 13, 32, 7, 1);
    } else if (dir === 'up') {
      // せなかの でんち
      R(g, RC.metalD, 11, 26, 11, 10);
      R(g, RC.panel, 12, 27, 9, 8);
      for (let k = 0; k < 3; k++) R(g, on ? RC.green : RC.greenOff, 13, 33 - k * 2, 7, 1);
      R(g, RC.metal, 15, 25, 3, 1);
    } else {
      R(g, RC.panel, 18, 28, 4, 5);
      R(g, on ? RC.green : RC.greenOff, 19, 29, 2, 1);
    }

    // くび と あたま
    R(g, RC.metalD, 14, 21 + slump, 5, 4);
    const hy = 8 + slump;
    const hx = side ? 9 : 7, hw = side ? 16 : 19;
    R(g, RC.bodyD, hx, hy, hw, 14);
    R(g, RC.body, hx + 1, hy, hw - 2, 12);
    R(g, RC.bodyL, hx + 1, hy, hw - 2, 2);
    R(g, RC.rust, hx + 2, hy + 9, 2, 1);
    if (dir === 'down') {
      R(g, RC.visor, 9, hy + 4, 15, 6);
      R(g, eye, 11, hy + 5, 4, on ? 3 : 1);
      R(g, eye, 18, hy + 5, 4, on ? 3 : 1);
      if (on) {
        R(g, '#ffffff', 11, hy + 5, 1, 1);
        R(g, '#ffffff', 18, hy + 5, 1, 1);
      }
      for (let x = 13; x < 20; x += 2) R(g, RC.metalD, x, hy + 11, 1, 2);
      R(g, RC.metal, 5, hy + 5, 2, 4);
      R(g, RC.metal, 26, hy + 5, 2, 4);
    } else if (dir === 'up') {
      for (let y = hy + 4; y < hy + 11; y += 2) R(g, RC.bodyD, 10, y, 13, 1);
      R(g, RC.metal, 5, hy + 5, 2, 4);
      R(g, RC.metal, 26, hy + 5, 2, 4);
    } else {
      R(g, RC.visor, 17, hy + 4, 8, 6);
      R(g, eye, 20, hy + 5, 3, on ? 3 : 1);
      if (on) R(g, '#ffffff', 20, hy + 5, 1, 1);
      R(g, RC.metal, 11, hy + 5, 3, 4);
      R(g, RC.metalL, 12, hy + 6, 1, 1);
    }

    // アンテナ（センサー）
    const ax = side ? 14 : 16;
    if (parts.sensor >= 1) {
      R(g, RC.metal, ax, hy - 6, 1, 6);
      R(g, RC.metalD, ax + 1, hy - 6, 1, 6);
      E(g, ball, ax, hy - 7, 2, 2);
      if (on) R(g, '#ffd0f4', ax - 1, hy - 8, 1, 1);
    } else {
      R(g, RC.metalD, ax, hy - 3, 1, 3);
      R(g, RC.metalD, ax + 1, hy - 4, 1, 1);
      R(g, RC.rust, ax + 2, hy - 5, 1, 1);
    }

    // よこむきの うで（てまえ）
    if (side) {
      const sw = f === 1 ? 2 : f === 2 ? -2 : 0;
      arm(13 + sw, 26, big);
    }
  }, '#11141c');
}

// パーツの くみあわせ ごとに つくって おく
function robotSpr(dir, f, parts, on) {
  const key = `r_${dir}_${f}_${parts.legs}${parts.arm}${parts.sensor}_${on ? 1 : 0}`;
  if (!SP[key]) {
    SP[key] = dir === 'left' ? flipX(robotSpr('right', f, parts, on))
      : robotSprite(dir === 'right' ? 'side' : dir, f, parts, on);
  }
  return SP[key];
}

// パーツの アイコン（lv 0 は うすく だす）
function partIcon(kind) {
  return oicon((g) => {
    if (kind === 'legs') {
      R(g, RC.tread, 3, 12, 24, 12);
      R(g, RC.treadL, 3, 12, 24, 1);
      for (let x = 5; x < 26; x += 3) R(g, RC.treadL, x, 14, 1, 9);
      E(g, RC.metal, 8, 18, 3, 3);
      E(g, RC.metal, 22, 18, 3, 3);
      E(g, RC.metalD, 15, 18, 3, 3);
    } else if (kind === 'arm') {
      E(g, RC.metalD, 8, 7, 5, 5);
      E(g, RC.metal, 7, 6, 3, 3);
      for (let i = 0; i < 12; i++) R(g, RC.metal, 9 + i, 9 + i, 5, 3);
      for (let i = 0; i < 12; i += 4) R(g, RC.hazard, 10 + i, 10 + i, 3, 1);
      R(g, RC.metalD, 20, 22, 3, 6);
      R(g, RC.metalD, 25, 19, 3, 6);
    } else {
      R(g, RC.metal, 14, 8, 2, 16);
      R(g, RC.metalD, 16, 8, 1, 16);
      E(g, RC.pink, 15, 6, 4, 4);
      R(g, '#ffd0f4', 13, 4, 2, 1);
      R(g, RC.metalD, 9, 24, 12, 4);
      for (let k = 0; k < 3; k++) {
        R(g, RC.eyeOn, 21 + k * 2, 5 + k * 2, 1, 4 - k);
        R(g, RC.eyeOn, 8 - k * 2, 5 + k * 2, 1, 4 - k);
      }
    }
  }, '#11141c');
}

function buildPlayer() {
  for (const k of Object.keys(PARTS)) ICON[`part_${k}`] = partIcon(k);
}

// ---------- はたけ ----------

function soilSprite(wet) {
  return make(32, 32, (g) => {
    const b = wet ? ['#4f2f1a', '#5f3a21', '#734a2c', '#3b2213'] : ['#7a4a2a', '#8e5b35', '#a87046', '#5e3820'];
    R(g, b[1], 1, 1, 30, 30);
    for (let k = 0; k < 4; k++) {
      const y = 2 + k * 7;
      R(g, b[2], 2, y, 28, 2);
      R(g, b[0], 2, y + 4, 28, 2);
      R(g, b[3], 2, y + 6, 28, 1);
    }
    const r = RNG(wet ? 2 : 1);
    for (let i = 0; i < 30; i++) R(g, r() < 0.5 ? b[0] : b[2], 2 + ((r() * 28) | 0), 2 + ((r() * 28) | 0));
    if (wet) for (let i = 0; i < 6; i++) R(g, 'rgba(160,200,230,.45)', 3 + ((r() * 24) | 0), 3 + ((r() * 26) | 0), 3, 1);
    R(g, b[3], 0, 0, 32, 1);
    R(g, b[3], 0, 31, 32, 1);
    R(g, b[3], 0, 0, 1, 32);
    R(g, b[3], 31, 0, 1, 32);
  });
}

function cropSprite(id, st) {
  const L1 = '#3f8a32', L2 = '#5fae45', L3 = '#86cf5e', LD = '#2c6624';
  return osp(32, 40, (g) => {
    if (st === 0) {
      E(g, '#6e4527', 16, 34, 7, 3);
      E(g, '#8e5b35', 15, 33, 5, 2);
      R(g, '#efe1a8', 13, 32, 2, 1);
      R(g, '#efe1a8', 17, 33, 2, 1);
      R(g, '#efe1a8', 15, 35, 1, 1);
      return;
    }
    if (st === 1) {
      R(g, LD, 15, 30, 2, 8);
      leaf(g, 12, 31, 7, -1.4, L2, L3);
      leaf(g, 19, 31, 7, 1.4, L2, L3);
      return;
    }
    if (st === 2) {
      R(g, LD, 15, 20, 2, 18);
      leaf(g, 13, 34, 10, -1.5, L1, L2);
      leaf(g, 18, 34, 10, 1.5, L1, L2);
      leaf(g, 14, 26, 9, -1.2, L2, L3);
      leaf(g, 17, 26, 9, 1.2, L2, L3);
      return;
    }
    if (id === 'turnip') {
      leaf(g, 11, 27, 16, -0.9, L1, L2);
      leaf(g, 20, 27, 16, 0.9, L1, L2);
      leaf(g, 15, 26, 18, 0.1, L2, L3);
      E(g, '#e9e2ef', 16, 31, 8, 6);
      E(g, '#ffffff', 14, 30, 5, 4);
      for (let x = 8; x <= 24; x++) {
        const h = 3 + Math.round(Math.sin(((x - 8) / 16) * Math.PI) * 2);
        R(g, '#9b4cb5', x, 25, 1, h);
        R(g, '#b86ad0', x, 25, 1, 1);
      }
      R(g, '#ffffff', 11, 29, 2, 2);
      R(g, '#d8cfd8', 16, 37, 1, 3);
    } else if (id === 'carrot') {
      for (const a of [-0.85, -0.4, 0.05, 0.5, 0.9]) {
        const dx = Math.sin(a), dy = -Math.cos(a), nx = -dy, ny = dx;
        const len = 17 - Math.abs(a) * 3;
        for (let i = 0; i < len; i++) {
          const px = 16 + dx * i, py = 29 + dy * i;
          R(g, LD, Math.round(px), Math.round(py), 1, 1);
          if (i > 3 && i % 3 === 0) {
            for (let k = 1; k <= 3; k++) {
              const up = k * 0.7;
              R(g, k === 3 ? L3 : L2, Math.round(px + nx * k + dx * up), Math.round(py + ny * k + dy * up), 1, 1);
              R(g, k === 3 ? L3 : L1, Math.round(px - nx * k + dx * up), Math.round(py - ny * k + dy * up), 1, 1);
            }
          }
        }
        R(g, L3, Math.round(16 + dx * len), Math.round(29 + dy * len), 1, 1);
      }
      E(g, '#e2781e', 16, 32, 6, 3);
      R(g, '#f39a3e', 12, 30, 7, 2);
      R(g, '#b85a10', 12, 33, 9, 1);
      R(g, '#5e3820', 9, 34, 15, 3);
    } else if (id === 'tomato') {
      R(g, '#c9a26a', 26, 2, 2, 36);
      R(g, '#a7814e', 27, 2, 1, 36);
      const C = [[15, 14, 10, 9], [9, 24, 7, 7], [21, 24, 7, 7], [15, 30, 9, 6]];
      for (const [x, y, rx, ry] of C) E(g, LD, x, y + 1, rx, ry);
      for (const [x, y, rx, ry] of C) E(g, L1, x - 1, y, rx - 2, ry - 2);
      for (const [x, y, rx, ry] of C) E(g, L2, x - 2, y - 2, Math.max(1, rx - 5), Math.max(1, ry - 5));
      for (const [x, y] of [[10, 16], [19, 12], [16, 23], [8, 28], [22, 30]]) {
        E(g, '#b5221a', x, y + 1, 3, 3);
        E(g, '#e2392c', x, y, 3, 3);
        R(g, '#ff9a8a', x - 2, y - 2, 2, 1);
        R(g, '#3f8a32', x - 1, y - 4, 3, 1);
      }
    } else {
      leaf(g, 5, 36, 10, -1.2, L1, L2);
      leaf(g, 27, 36, 10, 1.2, L1, L2);
      E(g, '#b65e12', 16, 30, 13, 8);
      E(g, '#e98a24', 16, 29, 12, 7);
      E(g, '#f6a646', 13, 27, 6, 4);
      for (const x of [9, 16, 23]) {
        for (let y = 23; y < 37; y++) {
          const k = Math.abs(y - 29) / 7;
          R(g, '#c46a12', x + Math.round((x - 16) * 0.15 * k), y, 1, 1);
        }
      }
      R(g, '#5a7a2a', 15, 19, 3, 5);
      R(g, '#3f5a1a', 17, 19, 1, 5);
      R(g, '#ffe0a0', 10, 25, 2, 1);
    }
  });
}

function buildCrops() {
  SP.soil = soilSprite(false);
  SP.soilWet = soilSprite(true);
  for (const id of Object.keys(CROPS)) for (let st = 0; st < 4; st++) SP[`crop_${id}_${st}`] = cropSprite(id, st);
}

// ---------- アイコン（32×32） ----------

function fishIcon(f) {
  return oicon((g) => {
    const [body, belly, fin] = f.col;
    const dark = shade(body, -0.3), light = shade(body, 0.3);
    if (f.kind === 'eel') {
      for (let x = 2; x < 28; x++) {
        const y = 15 + Math.round(Math.sin(x * 0.32 + 0.5) * 4);
        const th = x < 6 ? 3 : x > 24 ? 2 : 3;
        R(g, dark, x, y - th, 1, 1);
        R(g, body, x, y - th + 1, 1, th);
        R(g, belly, x, y + 1, 1, 2);
        if (x % 2) R(g, shade(body, 0.15), x, y - th + 1, 1, 1);
      }
      const hy = 15 + Math.round(Math.sin(2 * 0.32 + 0.5) * 4);
      R(g, '#ffffff', 3, hy - 2, 2, 2);
      R(g, '#111111', 3, hy - 2, 1, 1);
      return;
    }
    const big = f.size;
    let rx = [8, 10, 12][big - 1], ry = [4, 5, 7][big - 1];
    if (f.kind === 'thin') { rx = 12; ry = 3; }
    if (f.kind === 'cat') { rx = 12; ry = 5; }
    const cx = 13, cy = 15;
    // しっぽ
    const tl = f.kind === 'thin' ? 3 : 5;
    for (let i = 0; i < tl; i++) R(g, i === tl - 1 ? shade(fin, -0.2) : fin, cx + rx - 1 + i, cy - Math.round(i * 0.9) - 1, 1, Math.round(i * 1.8) + 2);
    // せびれ・はらびれ
    for (let i = 0; i < 6; i++) R(g, fin, cx - 2 + i, cy - ry - 2 + Math.abs(i - 2) * 0.5, 1, 2);
    R(g, fin, cx + 1, cy + ry, 3, 2);
    E(g, dark, cx, cy + 1, rx, ry);
    E(g, body, cx, cy, rx, ry);
    for (let y = 1; y <= ry; y++) {
      const dx = Math.round((rx - 1) * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25))));
      R(g, belly, cx - dx, cy + y, dx * 2 + 1, 1);
    }
    E(g, light, cx - 2, cy - Math.ceil(ry / 2), Math.max(1, Math.round(rx * 0.55)), 1);
    // もよう
    if (f.kind === 'round' && big >= 2) {
      for (let y = cy - ry + 2; y < cy; y += 2) for (let x = cx - rx + 5 + (y % 4 ? 1 : 0); x < cx + rx - 2; x += 3) R(g, dark, x, y, 1, 1);
    }
    if (f.col[2] === '#e2705c') R(g, '#5aa0e0', cx - rx + 4, cy, rx * 2 - 6, 1); // タナゴの すじ
    if (big === 3 && f.kind === 'round') { // コイの もよう
      E(g, '#fbf3e8', cx - 2, cy - 2, 4, 2);
      E(g, '#fbf3e8', cx + 6, cy, 3, 2);
      E(g, '#c03a12', cx + 2, cy - 3, 2, 1);
    }
    if (f.kind === 'thin') for (let x = cx - rx + 4; x < cx + rx - 2; x += 3) R(g, dark, x, cy - 1 + ((x / 3) % 2), 1, 1);
    // えらと め
    R(g, dark, cx - rx + 5, cy - ry + 2, 1, ry * 2 - 3);
    R(g, '#ffffff', cx - rx + 2, cy - 2, 3, 3);
    R(g, '#111111', cx - rx + 2, cy - 1, 2, 2);
    if (f.kind === 'cat' || f.kind === 'thin') {
      const long = f.kind === 'cat' ? 7 : 4;
      for (let i = 0; i < long; i++) {
        R(g, '#2a2a2a', cx - rx - 1 - i, cy + 1 + (i >> 1), 1, 1);
        R(g, '#2a2a2a', cx - rx - 1 - i, cy - 1 - (i >> 2), 1, 1);
      }
    }
  });
}

function cropIcon(id) {
  return oicon((g) => {
    if (id === 'turnip') {
      leaf(g, 11, 12, 11, -0.8, '#3f8a32', '#5fae45');
      leaf(g, 18, 12, 11, 0.8, '#3f8a32', '#5fae45');
      leaf(g, 15, 11, 11, 0, '#5fae45', '#86cf5e');
      E(g, '#d8cfd8', 15, 19, 10, 8);
      E(g, '#f2ecf4', 14, 18, 9, 7);
      E(g, '#ffffff', 11, 17, 4, 3);
      for (let x = 6; x <= 24; x++) {
        const h = 3 + Math.round(Math.sin(((x - 6) / 18) * Math.PI) * 3);
        R(g, '#9b4cb5', x, 11, 1, h);
        R(g, '#b86ad0', x, 11, 1, 1);
      }
      R(g, '#c9c0c8', 15, 26, 1, 3);
    } else if (id === 'carrot') {
      for (const a of [-0.5, 0, 0.5]) {
        const dx = Math.sin(a), dy = -Math.cos(a);
        for (let i = 0; i < 9; i++) {
          R(g, '#3f8a32', Math.round(20 + dx * i), Math.round(9 + dy * i), 1, 1);
          if (i % 2) { R(g, '#86cf5e', Math.round(21 + dx * i), Math.round(9 + dy * i), 1, 1); R(g, '#5fae45', Math.round(19 + dx * i), Math.round(9 + dy * i), 1, 1); }
        }
      }
      for (let i = 0; i < 18; i++) {
        const w = Math.max(1, Math.round(5 - i * 0.26));
        R(g, '#e2781e', 19 - i - w + 1, 9 + i - w + 1, w * 2, w * 2 - 1);
      }
      for (let i = 0; i < 16; i++) R(g, '#f39a3e', 16 - i, 8 + i, 1, 1);
      for (const k of [4, 8, 12]) R(g, '#b85a10', 18 - k, 12 + k - 1, 3, 1);
    } else if (id === 'tomato') {
      E(g, '#b5221a', 15, 17, 12, 10);
      E(g, '#e2392c', 14, 16, 11, 9);
      E(g, '#ff7a6a', 10, 12, 4, 3);
      R(g, '#ffffff', 9, 11, 2, 1);
      for (const [x, y] of [[15, 7], [11, 6], [19, 6], [13, 8], [17, 8]]) R(g, '#3f8a32', x - 1, y, 3, 2);
      R(g, '#2c6624', 14, 3, 2, 5);
    } else {
      E(g, '#b65e12', 15, 18, 14, 10);
      E(g, '#e98a24', 15, 17, 13, 9);
      E(g, '#f6a646', 11, 14, 5, 4);
      for (const x of [8, 15, 22]) for (let y = 9; y < 27; y++) R(g, '#c46a12', x + Math.round((x - 15) * 0.12 * (Math.abs(y - 17) / 8)), y, 1, 1);
      R(g, '#5a7a2a', 14, 3, 4, 7);
      R(g, '#3f5a1a', 17, 3, 1, 7);
      leaf(g, 20, 9, 6, 1.4, '#3f8a32', '#5fae45');
    }
  });
}

function seedIcon(id) {
  const col = { turnip: '#9b4cb5', carrot: '#e2781e', tomato: '#e2392c', pumpkin: '#e98a24' }[id];
  return oicon((g) => {
    R(g, '#c9b088', 3, 2, 24, 27);
    R(g, '#f6eedb', 4, 3, 22, 25);
    R(g, col, 4, 3, 22, 7);
    R(g, shade(col, 0.3), 4, 3, 22, 1);
    R(g, '#e6dcc4', 4, 10, 22, 1);
    for (let x = 4; x < 26; x += 2) R(g, '#d8ccb0', x, 26, 1, 2);
    // まんなかの え
    if (id === 'turnip') { E(g, '#f2ecf4', 15, 19, 5, 4); R(g, '#9b4cb5', 10, 15, 11, 2); R(g, '#5fae45', 13, 12, 2, 3); R(g, '#5fae45', 16, 12, 2, 3); }
    if (id === 'carrot') { for (let i = 0; i < 9; i++) R(g, '#e2781e', 18 - i, 14 + i, 3, 2); R(g, '#5fae45', 18, 11, 2, 4); R(g, '#5fae45', 20, 12, 2, 3); }
    if (id === 'tomato') { E(g, '#e2392c', 15, 19, 6, 5); R(g, '#ff9a8a', 12, 16, 2, 1); R(g, '#3f8a32', 13, 13, 5, 2); }
    if (id === 'pumpkin') { E(g, '#e98a24', 15, 20, 7, 5); R(g, '#c46a12', 15, 15, 1, 10); R(g, '#c46a12', 11, 16, 1, 8); R(g, '#c46a12', 19, 16, 1, 8); R(g, '#5a7a2a', 14, 12, 3, 4); }
    for (const [x, y] of [[7, 6], [11, 5], [20, 6]]) R(g, '#ffffff', x, y, 2, 1);
  }, '#5a4228');
}

function buildIcons() {
  const rod = (tier) => oicon((g) => {
    const c1 = tier === 1 ? '#a08060' : '#d8b768', c2 = tier === 1 ? '#6e5236' : '#a8843e';
    for (let i = 0; i < 24; i++) {
      R(g, c2, 2 + i, 27 - i, 3, 2);
      R(g, c1, 2 + i, 27 - i, 2, 1);
      if (i % 6 === 3) R(g, tier === 1 ? '#4a3420' : '#7a5a20', 2 + i, 26 - i, 3, 3);
    }
    if (tier === 2) {
      E(g, '#555b60', 8, 21, 4, 4);
      E(g, '#8a9096', 7, 20, 2, 2);
      R(g, '#2a2e32', 8, 21, 1, 1);
    } else {
      R(g, '#c8b898', 6, 22, 4, 1);
    }
    for (let y = 3; y < 18; y++) R(g, 'rgba(255,255,255,.9)', 27, y, 1, 1);
    R(g, '#ffffff', 25, 17, 5, 3);
    R(g, '#e8342e', 25, 20, 5, 3);
  });
  ICON.rod1 = rod(1);
  ICON.rod2 = rod(2);
  ICON.net = oicon((g) => {
    for (let i = 0; i < 14; i++) {
      R(g, '#7a5a3a', 2 + i, 27 - i, 3, 2);
      R(g, '#a07a50', 2 + i, 27 - i, 2, 1);
    }
    E(g, '#b89a5a', 19, 10, 10, 9);
    E(g, '#e8f0dc', 19, 10, 8, 7);
    for (let k = -6; k <= 6; k += 3) {
      R(g, '#b8c4a0', 19 + k, 3, 1, 15);
      R(g, '#b8c4a0', 11, 10 + k, 17, 1);
    }
    E(g, 'rgba(255,255,255,.5)', 16, 7, 3, 2);
  });
  ICON.hoe = oicon((g) => {
    for (let i = 0; i < 20; i++) {
      R(g, '#7a5a3a', 3 + i, 27 - i, 3, 2);
      R(g, '#a07a50', 3 + i, 27 - i, 2, 1);
    }
    R(g, '#6e6a66', 18, 3, 11, 5);
    R(g, '#8a8682', 18, 3, 11, 2);
    R(g, '#6e6a66', 24, 7, 5, 9);
    R(g, '#4e4a46', 24, 15, 5, 2);
    R(g, '#b0662e', 20, 5, 4, 2);
    R(g, '#a0603a', 25, 10, 2, 3);
    R(g, '#c07a40', 27, 4, 1, 1);
  });
  ICON.can = oicon((g) => {
    R(g, '#3a6ea8', 6, 11, 16, 16);
    R(g, '#4a86c8', 7, 11, 14, 15);
    R(g, '#6ea4dc', 8, 12, 4, 13);
    R(g, '#2c5a90', 6, 25, 16, 2);
    R(g, '#2c5a90', 9, 7, 10, 4);
    R(g, '#4a86c8', 10, 7, 8, 3);
    for (let i = 0; i < 8; i++) R(g, '#4a86c8', 21 + i, 18 - i, 2, 3);
    R(g, '#6ea4dc', 26, 7, 4, 5);
    R(g, '#2c5a90', 29, 7, 1, 5);
    for (let y = 12; y < 22; y++) R(g, '#2c5a90', 2 + Math.round(Math.abs(y - 17) * 0.3), y, 2, 1);
    R(g, '#2c5a90', 2, 12, 5, 2);
    R(g, '#2c5a90', 2, 21, 5, 2);
  });
  ICON.coin = oicon((g) => {
    E(g, '#a87818', 15, 15, 13, 13);
    E(g, '#e2b232', 15, 15, 12, 12);
    E(g, '#f2c94c', 14, 14, 10, 10);
    E(g, '#c99a28', 15, 15, 6, 6);
    E(g, '#f2c94c', 15, 15, 4, 4);
    R(g, '#fff0b0', 8, 7, 4, 2);
    R(g, '#fff0b0', 7, 9, 2, 3);
  }, '#5a3a08');
  ICON.stone = oicon((g) => {
    E(g, '#6b6e73', 15, 17, 12, 9);
    E(g, '#8a8e94', 14, 16, 11, 8);
    E(g, '#a9adb3', 11, 13, 6, 4);
    R(g, '#c9cdd2', 8, 11, 5, 1);
    R(g, '#5a5d62', 17, 17, 1, 4);
  }, '#2a2b2e');
  ICON.j_can = oicon((g) => {
    R(g, '#8a939b', 8, 4, 14, 23);
    R(g, '#b8c0c8', 9, 4, 4, 23);
    R(g, '#c0392b', 8, 10, 14, 10);
    R(g, '#e05a48', 9, 10, 4, 10);
    R(g, '#ffffff', 12, 13, 7, 2);
    R(g, '#6c7480', 9, 2, 12, 2);
    R(g, '#5c6470', 18, 20, 4, 3);
    R(g, '#d8dee4', 10, 3, 3, 1);
  }, '#2a2e34');
  ICON.j_boot = oicon((g) => {
    R(g, '#3f6a3a', 7, 3, 12, 20);
    R(g, '#3f6a3a', 7, 18, 19, 8);
    R(g, '#5a8a52', 8, 3, 3, 19);
    R(g, '#2c4a28', 7, 25, 19, 3);
    R(g, '#7a5a3a', 15, 20, 9, 3);
    R(g, '#7a5a3a', 9, 12, 5, 2);
    R(g, '#5a8a52', 7, 3, 12, 2);
  }, '#1a2a18');
  for (const [k, f] of Object.entries(FISH)) ICON[`f_${k}`] = fishIcon(f);
  for (const k of Object.keys(CROPS)) {
    ICON[`c_${k}`] = cropIcon(k);
    ICON[`seed_${k}`] = seedIcon(k);
  }
}

function buildSprites() {
  buildNature();
  buildBuildings();
  buildPlayer();
  buildCrops();
  buildIcons();
}

// DOM に だす ための がぞう（おなじ ものは つくりなおさない）
const ICON_URL = {};
function iconURL(id) {
  if (!ICON_URL[id]) {
    const src = ICON[id] || SP[id];
    ICON_URL[id] = src ? src.toDataURL() : '';
  }
  return ICON_URL[id];
}
