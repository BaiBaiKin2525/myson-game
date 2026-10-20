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
  const key = m.id + (m.glow ? ':glow' : '') + (m.ruin ? ':ruin' : '');
  if (GROUND_CACHE[key]) {
    m.ground = GROUND_CACHE[key];
    return;
  }
  const c = mk(m.w * T, m.h * T);
  const g = c.getContext('2d');
  if (m.id === 'house') bakeHouseFloor(m, g);
  else bakeOutside(m, g);
  GROUND_CACHE[key] = c;
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
  // あれはてた 町（m.ruin）：かれくさ・むきだしの つち・ひびわれた アスファルト・コンクリートの きし
  const GR = (m.ruin ? ['#3a392c', '#454332', '#514e38', '#5c583f', '#676147'] : ['#4a8f34', '#589f3c', '#68b246', '#78c050', '#8ccf5c']).map(hexRGB);
  const DI = ['#3e362f', '#4a4038', '#55493f', '#615446', '#6b5e4e'].map(hexRGB);
  const PA = (m.ruin ? ['#2e3034', '#36383c', '#3e4045', '#46484d', '#4e5055'] : ['#a77b4a', '#b98d58', '#c99f68', '#d8b27a', '#e3c38c']).map(hexRGB);
  const SA = (m.ruin ? ['#5e5c58', '#696762', '#74726c', '#7f7d77'] : ['#d4b77e', '#e1c992', '#ebd8a6', '#f3e4b8']).map(hexRGB);
  // ネオンスポアで よごれた 水は むらさきと みずいろに 光る
  const WA = (m.glow ? ['#1c1450', '#2a1f78', '#33309c', '#3a52b8', '#3f86d0', '#5fd8ea'] : ['#2a6aa6', '#3179b6', '#3b8ac4', '#4c9fd2', '#62b5df', '#7fcbe8']).map(hexRGB);
  const FOAM = hexRGB(m.glow ? '#d68aff' : '#c6eaf4'), WET = hexRGB(m.glow ? (m.ruin ? '#4a4656' : '#8f7a9a') : '#c2a46e'), EDGE = hexRGB(m.ruin ? '#66645e' : '#946a3e');
  const SEAM = hexRGB('#4a4844');
  const PV = ['#4e4f53', '#58595d', '#626367', '#6c6d71'].map(hexRGB), PVS = hexRGB('#3a3b3f');
  const PR = ['#6e6c66', '#7a7872', '#86847e'].map(hexRGB), PRE = hexRGB('#3e3c38');
  const tileOf = (tx, ty) => (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h ? -1 : m.tiles[ty * m.w + tx]);
  const img = g.createImageData(W, H), a = img.data;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / T, y = (py + 0.5) / T;
      const dth = BAYER[py & 3][px & 3] / 16 - 0.5;
      const nz = vnoise(x * 1.7, y * 1.7) - 0.5;
      const wv = samp(wM, x, y) + nz * 0.12;
      const tx = (px / T) | 0, ty = (py / T) | 0, tt = m.tiles[ty * m.w + tx];
      let col;
      if (tt === TL.PIER) {
        // ていぼう・はし：コンクリートの いた。水に めんした ふちは くらい
        const lx = px % T, ly = py % T;
        col = (lx % 16 === 0 || ly % 16 === 0) ? PVS : pickTone(PR, fbm(x * 3, y * 3) + dth * 0.3 - 0.1);
        if ((lx < 2 && tileOf(tx - 1, ty) === TL.WATER) || (lx > T - 3 && tileOf(tx + 1, ty) === TL.WATER) || (ly > T - 4 && tileOf(tx, ty + 1) === TL.WATER) || (ly < 2 && tileOf(tx, ty - 1) === TL.WATER)) col = PRE;
      } else if (tt === TL.PAVE) {
        // いしだたみ（ひろば・みなとの 岸ぺき）
        const lx = (px + (ty % 2) * 8) % 16, ly = py % 16;
        col = (lx === 0 || ly === 0) ? PVS : pickTone(PV, fbm(x * 2.5, y * 2.5) * 1.1 - 0.1 + dth * 0.3);
      } else if (wv > 0.5) {
        const d = Math.min(1, (samp(dep, x, y) - 0.5) / 3.2);
        col = pickTone(WA, 1 - d + dth * 0.25 + (fbm(x * 2, y * 4) - 0.5) * 0.18);
        if (wv < 0.6 && (BAYER[py & 3][px & 3] > 5 || wv < 0.54)) col = FOAM;
      } else if (samp(sM, x, y) + nz * 0.1 > 0.5) {
        col = wv > 0.42 ? WET : pickTone(SA, fbm(x * 3, y * 3) - 0.15 + dth * 0.3);
        if (m.ruin && wv <= 0.42 && ((px % 16) === 0 || (py % 12) === 0)) col = SEAM; // コンクリートの つなぎめ
      } else {
        const pv = samp(pM, x, y) + nz * 0.16;
        if (pv > 0.5) {
          col = pv < 0.56 ? EDGE : pickTone(PA, fbm(x * 3, y * 3) * 1.1 - 0.05 + dth * 0.25);
        } else {
          let t = fbm(x * 0.9, y * 0.9) * 1.1 - 0.1 + dth * 0.2;
          t -= samp(ring, x, y) * 0.35;           // もりの なかは くらい
          if (samp(sM, x, y) > 0.2) t -= 0.12;     // すなはまの まわりは すこし こい
          col = pickTone(GR, t);
          // くさが はげて つちが むきだしに なった ところ
          if (m.ruin && vnoise(x * 0.45 + 3, y * 0.45) + nz * 0.3 < 0.45) col = pickTone(DI, fbm(x * 2.5, y * 2.5) * 1.1 - 0.05 + dth * 0.25);
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
  // あれた 町：アスファルトの ひび・きえかけた せんの もよう・ちらばる ガラス
  if (m.ruin) {
    for (let k = 0; k < (W * H) / 900; k++) {
      let px = (r() * W) | 0, py = (r() * H) | 0;
      if (tileAtPx(px, py) === TL.WATER) continue;
      const col = tileAtPx(px, py) === TL.PATH ? '#1e2024' : '#2e2a24';
      for (let i = 0; i < 6 + r() * 18; i++) {
        R(g, col, px, py, 1, 1);
        px += r() < 0.5 ? 1 : -1 + ((r() * 2) | 0);
        py += r() < 0.6 ? 1 : 0;
      }
    }
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.tiles[y * m.w + x] !== TL.PATH || (x + y) % 2) continue;
        const left = m.tiles[y * m.w + x - 1] === TL.PATH, right = m.tiles[y * m.w + x + 1] === TL.PATH;
        if (left && right && r() < 0.7) R(g, r() < 0.5 ? '#7a6a3a' : '#5e543a', x * T + 6, y * T + 15, 14, 2);
      }
    }
  }
  // くさの たば（あれた 町では すくなくて かれた いろ）
  for (let k = 0; k < (W * H) / (m.ruin ? 700 : 260); k++) {
    const px = (r() * W) | 0, py = (r() * H) | 0;
    if (tileAtPx(px, py) !== TL.GRASS) continue;
    const dark = r() < 0.6;
    const c1 = m.ruin ? (dark ? '#3e3a26' : '#8e8458') : dark ? '#3f7e2c' : '#9ad968';
    R(g, c1, px, py, 1, 2);
    R(g, c1, px - 2, py + 1, 1, 2);
    R(g, c1, px + 2, py + 1, 1, 2);
    if (dark) R(g, m.ruin ? '#6e6844' : '#7cc356', px, py - 1, 1, 1);
  }
  // こいし
  for (let k = 0; k < (W * H) / 1800; k++) {
    const px = (r() * W) | 0, py = (r() * H) | 0;
    const t = tileAtPx(px, py);
    if (t !== TL.PATH && t !== TL.SAND) continue;
    R(g, m.ruin ? '#2a2a2e' : '#8f6a42', px, py + 1, 2, 1);
    R(g, m.ruin ? '#8a8a86' : '#efd6a6', px, py, 2, 1);
  }
}

// けんきゅうじょの ゆか・かべ（くずれかけ。きんぞくの パネル・ひび・さび・きれかけの ネオン）
function bakeHouseFloor(m, g) {
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const t = m.tiles[y * m.w + x];
      const r = RNG(x * 31 + y * 7 + 1);
      const X = x * T, Y = y * T;
      if (t === TL.FLOOR) {
        // 16×16 の きんぞくの パネル 4まい
        for (let py = 0; py < 2; py++) {
          for (let px = 0; px < 2; px++) {
            const tone = ['#2b303c', '#2f3542', '#333a48', '#292e39'][(r() * 4) | 0];
            const sx = X + px * 16, sy = Y + py * 16;
            R(g, tone, sx, sy, 16, 16);
            R(g, shade(tone, 0.12), sx, sy, 16, 1);
            R(g, shade(tone, 0.12), sx, sy, 1, 16);
            R(g, '#1a1e27', sx, sy + 15, 16, 1);
            R(g, '#1a1e27', sx + 15, sy, 1, 16);
            for (const [rx, ry] of [[2, 2], [13, 2], [2, 13], [13, 13]]) R(g, '#4a5262', sx + rx, sy + ry, 1, 1);
            const k = r();
            if (k < 0.12) {
              // ひび
              let cx = sx + 2 + ((r() * 10) | 0);
              for (let cy = sy + 1; cy < sy + 15; cy++) {
                R(g, '#14171e', cx, cy, 1, 1);
                cx += r() < 0.5 ? 1 : -1;
                cx = Math.max(sx + 1, Math.min(sx + 14, cx));
              }
            } else if (k < 0.24) {
              // さび
              R(g, '#5a3a2a', sx + 4 + ((r() * 6) | 0), sy + 5 + ((r() * 6) | 0), 4, 2);
              R(g, '#7a4a2a', sx + 5 + ((r() * 4) | 0), sy + 6 + ((r() * 4) | 0), 2, 1);
            } else if (k < 0.3) {
              // あみの ふた
              for (let gy = 4; gy < 13; gy += 2) R(g, '#171a22', sx + 3, sy + gy, 10, 1);
            }
          }
        }
        // ゆかの ネオン（ところどころ）
        if ((x * 5 + y * 3) % 13 === 0) {
          R(g, '#1f6f78', X + 2, Y + 15, 28, 2);
          R(g, '#5ff6ff', X + 4, Y + 15, 8, 1);
        }
      } else if (t === TL.WALL) {
        R(g, '#14161e', X, Y, T, T);
        for (let k = 0; k < 4; k++) R(g, '#191c25', X + k * 8 + 1, Y, 6, T);
        R(g, '#0c0d12', X, Y, T, 1);
        const below = y + 1 < m.h ? m.tiles[(y + 1) * m.w + x] : -1;
        if (below === TL.FLOOR || below === TL.FACE) {
          R(g, '#3a3f4c', X, Y + T - 3, T, 2);
          R(g, '#0c0d12', X, Y + T - 1, T, 1);
        }
      } else if (t === TL.FACE) {
        // コンクリートの かべ と ネオンの せん（ところどころ きれている）
        R(g, '#3a3f4c', X, Y, T, 22);
        R(g, '#2f3440', X + 15, Y, 1, 22);
        R(g, '#2f3440', X, Y + 10, T, 1);
        for (let i = 0; i < 6; i++) R(g, r() < 0.5 ? '#343947' : '#424858', X + ((r() * 30) | 0), Y + ((r() * 20) | 0), 2, 1);
        if (r() < 0.35) {
          let cx = X + 4 + ((r() * 22) | 0);
          for (let cy = Y; cy < Y + 18; cy++) {
            R(g, '#1f222b', cx, cy, 1, 1);
            if (r() < 0.4) cx += r() < 0.5 ? 1 : -1;
          }
        }
        R(g, 'rgba(0,0,0,.25)', X, Y, T, 3);
        const lit = r() < 0.7;
        R(g, lit ? '#ff4fd8' : '#5a2a50', X, Y + 17, T, 2);
        if (lit) R(g, '#ffc4f2', X + 6, Y + 17, 6, 1);
        R(g, '#232731', X, Y + 22, T, 10);
        R(g, '#4a5058', X, Y + 22, T, 1);
        if ((x * 7) % 5 === 0) for (let k = 0; k < T; k += 6) R(g, '#ffd23f', X + k, Y + 25, 3, 4);
        R(g, '#0c0d12', X, Y + 31, T, 1);
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
        R(g, m.glow ? (ph < 0.6 ? '#7ff8ff' : '#d68aff') : ph < 0.6 ? '#d8f2fb' : '#9fd8f0', px - (w >> 1), py, w, 1);
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

// くずれかけた けんきゅうじょ（そとから）。やねの アンテナに かみなりが おちる
// ドアは ひだりから 70ドット（マップの ドアの マスに あわせる）
function houseSprite() {
  return osp(200, 176, (g) => {
    const r = RNG(11);
    // どだい（がれき まじり）
    R(g, '#4a4f5c', 4, 150, 192, 24);
    R(g, '#5d6370', 4, 150, 192, 2);
    for (let x = 8; x < 192; x += 14) R(g, '#3a3f4c', x, 152, 1, 22);
    // かべ（コンクリートの パネル）
    R(g, '#3a3f4c', 10, 40, 180, 112);
    for (let x = 10; x < 190; x += 30) R(g, '#2f3440', x, 40, 1, 112);
    for (let y = 40; y < 152; y += 28) R(g, '#2f3440', 10, y, 180, 1);
    for (let i = 0; i < 160; i++) R(g, r() < 0.5 ? '#343947' : '#444a5a', 10 + ((r() * 178) | 0), 42 + ((r() * 108) | 0), 2, 1);
    // ひび
    for (const sx of [34, 118, 168]) {
      let cx = sx;
      for (let y = 44; y < 140; y++) {
        R(g, '#1f222b', cx, y, 1, 1);
        if (r() < 0.45) cx += r() < 0.5 ? 1 : -1;
        if (r() < 0.04) break;
      }
    }
    // こけ と つた（だれも いない むら）
    for (let i = 0; i < 26; i++) {
      const x = 10 + ((r() * 176) | 0), y = r() < 0.5 ? 140 + ((r() * 10) | 0) : 40 + ((r() * 14) | 0);
      E(g, r() < 0.5 ? '#3f6a3a' : '#56883f', x, y, 2 + ((r() * 3) | 0), 1 + ((r() * 2) | 0));
    }
    for (let y = 46; y < 120; y += 3) R(g, '#3f6a3a', 12 + Math.round(Math.sin(y * 0.3) * 2), y, 2, 2);
    // やね（たいら。ふちが かけている）
    R(g, '#232731', 6, 30, 184, 12);
    R(g, '#4a5058', 6, 30, 184, 2);
    R(g, '#1a1d25', 6, 41, 184, 1);
    // みぎうえが くずれて、てっきんが でている
    for (let y = 0; y < 46; y++) {
      const w = Math.max(0, Math.round((46 - y) * 1.15 + r() * 5 - 4));
      g.clearRect(192 - w, 28 + y, w, 1);
    }
    for (const [x, y, l] of [[160, 34, 10], [168, 44, 9], [176, 54, 8], [184, 64, 6]]) {
      for (let k = 0; k < l; k++) R(g, '#8a5a3a', x + k, y - (k >> 1), 1, 1);
    }
    for (let i = 0; i < 9; i++) E(g, i % 2 ? '#5d6370' : '#4a4f5c', 172 + ((r() * 22) | 0), 146 + ((r() * 8) | 0), 3 + ((r() * 3) | 0), 2);
    // アンテナ（ひらいしん）
    R(g, '#5d6370', 40, 0, 3, 32);
    R(g, '#8a929e', 40, 0, 1, 32);
    for (const y of [8, 16, 24]) R(g, '#5d6370', 34, y, 15, 2);
    E(g, '#ff4fd8', 41, 1, 2, 2);
    R(g, '#2b2f36', 42, 32, 2, 10);
    // こわれた パラボラ
    E(g, '#5d6370', 120, 26, 10, 5);
    E(g, '#8a929e', 120, 25, 8, 3);
    R(g, '#5d6370', 119, 26, 3, 6);
    R(g, '#14161e', 124, 22, 4, 1);
    // まど（ひとつは いたで ふさいである）
    for (const [wx, boarded] of [[22, false], [140, true]]) {
      R(g, '#232731', wx, 66, 34, 30);
      for (let y = 0; y < 26; y++) R(g, y < 13 ? '#0d1430' : '#1d1240', wx + 2, 68 + y, 30, 1);
      R(g, 'rgba(95,246,255,.35)', wx + 4, 70, 3, 20);
      R(g, 'rgba(255,79,216,.3)', wx + 24, 74, 2, 14);
      if (boarded) {
        for (const [y, tilt] of [[70, 1], [80, -1], [88, 1]]) for (let k = 0; k < 34; k++) R(g, k % 9 ? '#8a6a48' : '#6a4a2a', wx + k, y + Math.round(k * tilt * 0.08), 1, 4);
      } else {
        let cx = wx + 12;
        for (let y = 68; y < 94; y++) {
          R(g, '#c8f4ff', cx, y, 1, 1);
          if (r() < 0.5) cx += r() < 0.5 ? 1 : -1;
        }
      }
      R(g, '#4a5058', wx - 2, 96, 38, 3);
    }
    // パイプ
    R(g, '#5d6370', 106, 42, 5, 108);
    R(g, '#8a929e', 106, 42, 1, 108);
    for (const y of [60, 92, 124]) R(g, '#3d434c', 105, y, 7, 3);
    R(g, '#5d6370', 111, 118, 26, 4);
    R(g, '#8a929e', 111, 118, 26, 1);
    // ネオンの かんばん「LAB」（すこし きれかけ）
    R(g, '#0d0e1c', 60, 84, 46, 16);
    R(g, '#ff4fd8', 60, 84, 46, 1);
    R(g, '#ff4fd8', 60, 99, 46, 1);
    const px = (x, y) => R(g, '#5ff6ff', 66 + x * 2, 87 + y * 2, 2, 2);
    for (let y = 0; y < 5; y++) px(0, y);
    for (let x = 1; x < 3; x++) px(x, 4);
    for (let y = 1; y < 5; y++) { px(5, y); px(7, y); }
    px(6, 0); px(6, 2);
    for (let y = 0; y < 5; y++) px(10, y);
    for (const [x, y] of [[11, 0], [12, 1], [11, 2], [12, 3], [11, 4]]) px(x, y);
    R(g, '#2a5a60', 96, 88, 6, 8); // きれた ネオン
    // ドア（スライド ドアと きいろ くろの しましま）
    const dx = 70;
    R(g, '#14161e', dx - 4, 102, 36, 52);
    for (let y = 102; y < 154; y += 4) {
      R(g, (y >> 2) % 2 ? '#ffd23f' : '#1a1a1a', dx - 4, y, 4, 4);
      R(g, (y >> 2) % 2 ? '#1a1a1a' : '#ffd23f', dx + 28, y, 4, 4);
    }
    R(g, '#4a5058', dx, 106, 28, 48);
    R(g, '#5d6370', dx, 106, 13, 48);
    R(g, '#2a2e38', dx + 13, 106, 2, 48);
    R(g, '#8a929e', dx, 106, 28, 1);
    for (const y of [118, 132, 146]) R(g, '#3d434c', dx + 2, y, 24, 1);
    R(g, '#7dff9a', dx + 20, 112, 4, 3);
    R(g, '#5ff6ff', dx - 2, 102, 32, 2);
    R(g, '#3a3f4c', dx - 6, 154, 40, 4);
    R(g, '#5d6370', dx - 6, 154, 40, 1);
  }, '#0b0d14');
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
  // しゅうしゅうばこ（ドローン ポート）。うえが ちゃくりくばん、したが にもつの はこ
  const port = (ok) => osp(62, 60, (g) => {
    const neon = ok ? '#5ff6ff' : '#2a4a50', pink = ok ? '#ff4fd8' : '#4a2a44';
    // はこ
    R(g, '#1b1d28', 2, 30, 58, 30);
    R(g, ok ? '#3d434c' : '#3a3632', 4, 30, 54, 26);
    R(g, ok ? '#5d6470' : '#4a4440', 4, 30, 54, 2);
    for (let x = 4; x < 58; x += 6) R(g, (x / 6) % 2 ? '#ffd23f' : '#1a1a1a', x, 52, 6, 3);
    R(g, '#0d1418', 8, 36, 20, 12);
    if (ok) {
      R(g, '#7dff9a', 10, 38, 12, 1);
      R(g, '#5ff6ff', 10, 41, 8, 1);
      R(g, '#7dff9a', 10, 44, 14, 1);
    } else {
      R(g, '#3a2a2a', 10, 41, 14, 1);
    }
    R(g, '#14161e', 32, 36, 22, 14);
    R(g, ok ? '#4a5058' : '#3a3632', 33, 37, 20, 12);
    R(g, neon, 33, 42, 20, 1);
    R(g, neon, 2, 30, 1, 30);
    R(g, pink, 59, 30, 1, 30);
    // ちゃくりくばん
    E(g, '#14161e', 31, 24, 28, 9);
    E(g, '#232731', 31, 23, 26, 8);
    E(g, neon, 31, 23, 24, 7);
    E(g, '#1b1f2a', 31, 23, 22, 6);
    // H の しるし
    R(g, pink, 24, 20, 2, 7);
    R(g, pink, 36, 20, 2, 7);
    R(g, pink, 26, 23, 10, 1);
    for (const x of [7, 55]) E(g, ok ? '#ffd23f' : '#4a4030', x, 23, 2, 1);
    // アンテナ
    R(g, '#5d6470', 4, 2, 2, 22);
    E(g, pink, 5, 2, 2, 2);
    if (!ok) {
      // ひび・さび・おちた ドローン
      for (const [x, y] of [[18, 22], [40, 25], [12, 46], [50, 40]]) {
        R(g, '#7a4a2a', x, y, 3, 1);
        R(g, '#c07a44', x, y, 1, 1);
      }
      for (let i = 0; i < 9; i++) R(g, '#0b0d14', 28 + i, 18 + (i % 3), 1, 1);
      R(g, '#2a2e38', 34, 12, 16, 6);
      R(g, '#3d434c', 36, 11, 12, 3);
      R(g, '#5d6470', 30, 9, 8, 2);
      R(g, '#5d6470', 46, 16, 8, 2);
      R(g, '#3a4a50', 41, 13, 3, 2);
      R(g, '#ffd23f', 52, 10, 1, 3);
      R(g, '#ffd23f', 53, 8, 1, 2);
    }
  }, '#07080f');
  SP.port = port(true);
  SP.portBroken = port(false);
  // ドローン（box：にもつを さげている）
  const drone = (box) => osp(30, box ? 24 : 16, (g) => {
    for (const x of [2, 20]) {
      E(g, 'rgba(200,220,240,.55)', x + 4, 3, 5, 1);
      R(g, '#3d434c', x + 3, 3, 2, 3);
    }
    R(g, '#3d434c', 6, 5, 18, 2);
    E(g, '#232731', 15, 8, 7, 4);
    E(g, '#3d434c', 14, 7, 5, 2);
    R(g, '#5ff6ff', 13, 8, 4, 2);
    R(g, '#ff4fd8', 9, 10, 2, 1);
    R(g, '#ff4fd8', 19, 10, 2, 1);
    if (box) {
      R(g, '#5d6470', 14, 12, 1, 4);
      R(g, '#9a6638', 9, 16, 12, 7);
      R(g, '#c08a52', 9, 16, 12, 2);
      R(g, '#ffd23f', 14, 16, 2, 7);
    }
  }, '#07080f');
  SP.drone = drone(false);
  SP.droneBox = drone(true);
  // けんせつ よていち（かんづめ せいさく そうちを つくる ところ）
  SP.canSite = osp(62, 40, (g) => {
    for (let x = 2; x < 60; x += 6) {
      R(g, '#ffd23f', x, 24, 3, 2);
      R(g, '#ffd23f', x, 38, 3, 2);
    }
    for (let y = 24; y < 40; y += 6) {
      R(g, '#ffd23f', 2, y, 2, 3);
      R(g, '#ffd23f', 58, y, 2, 3);
    }
    for (const x of [8, 48]) {
      for (let k = 0; k < 10; k++) R(g, k % 4 < 2 ? '#e98a24' : '#ffffff', x + 3 - (k >> 2), 24 + k, 1 + (k >> 1), 1);
      R(g, '#3a3632', x - 1, 34, 10, 2);
    }
    R(g, '#8a6a48', 28, 6, 3, 30);
    R(g, '#a07a50', 20, 4, 20, 12);
    R(g, '#c8a070', 20, 4, 20, 2);
    R(g, '#3a2a1a', 25, 8, 10, 2);
    R(g, '#3a2a1a', 25, 12, 7, 1);
  }, '#2a1a10');
  // がいとう（なおすと ネオンが つく）
  SP.lamp = osp(18, 72, (g) => {
    R(g, '#3d434c', 7, 10, 4, 60);
    R(g, '#8a929e', 7, 10, 1, 60);
    R(g, '#232731', 4, 66, 10, 6);
    R(g, '#3d434c', 3, 6, 12, 5);
    E(g, 'rgba(255,79,216,.35)', 9, 14, 8, 6);
    R(g, '#ff4fd8', 4, 11, 10, 3);
    R(g, '#ffd0f4', 6, 11, 6, 1);
    R(g, '#5ff6ff', 7, 30, 4, 2);
  }, '#07080f');
  SP.lampOff = osp(18, 72, (g) => {
    for (let y = 18; y < 70; y++) R(g, '#3a3632', 7 + (y < 30 ? Math.round((30 - y) * 0.25) : 0), y, 4, 1);
    R(g, '#232731', 4, 66, 10, 6);
    R(g, '#3a3632', 8, 14, 12, 4);
    R(g, '#2a2420', 9, 18, 9, 2);
    R(g, '#7a4a2a', 8, 44, 3, 2);
  }, '#07080f');
  // ふんすい
  const fountain = (ok) => osp(64, 60, (g) => {
    E(g, '#4a4f5c', 32, 44, 30, 14);
    E(g, '#6a7180', 32, 42, 28, 12);
    E(g, ok ? '#2a7ab8' : '#3a3632', 32, 42, 24, 9);
    if (ok) {
      E(g, '#5fb8f0', 30, 40, 16, 5);
      E(g, '#5ff6ff', 32, 42, 25, 10);
      E(g, '#2a7ab8', 32, 42, 24, 9);
      E(g, '#5fb8f0', 28, 40, 12, 4);
      for (let i = 0; i < 14; i++) R(g, '#e8f8ff', 20 + ((i * 7) % 24), 38 + ((i * 3) % 8), 2, 1);
    }
    R(g, '#6a7180', 28, 14, 8, 28);
    R(g, '#8a929e', 28, 14, 2, 28);
    E(g, '#6a7180', 32, 14, 10, 4);
    if (ok) {
      for (let k = -3; k <= 3; k++) {
        for (let i = 0; i < 12; i++) R(g, i % 3 ? '#9fd8ff' : '#e8f8ff', Math.round(32 + k * i * 0.6), Math.round(4 + i * 0.5 + (i * i) * 0.06 * Math.abs(k) / 3), 1, 2);
      }
      R(g, '#ff4fd8', 26, 30, 12, 1);
    } else {
      R(g, '#2a2e38', 30, 6, 4, 8);
      for (const [x, y] of [[12, 46], [46, 48], [36, 40]]) E(g, '#4a4f5c', x, y, 3, 2);
      for (let i = 0; i < 6; i++) R(g, '#0b0d14', 18 + i * 2, 42 + (i % 2), 2, 1);
    }
  }, '#0b0d14');
  SP.fountain = fountain(true);
  SP.fountainRuin = fountain(false);
  // むらの いえ
  const cottage = (ok) => osp(96, 100, (g) => {
    R(g, '#4a4f5c', 4, 88, 88, 12);
    R(g, ok ? '#e8dcc4' : '#8a8070', 8, 46, 80, 44);
    for (let i = 0; i < 40; i++) R(g, ok ? '#d8ccb0' : '#7a7062', 8 + ((i * 37) % 78), 48 + ((i * 13) % 40), 2, 1);
    // やね
    for (let rr = 0; rr < 8; rr++) {
      const y = 10 + rr * 5, x0 = 46 - rr * 6, x1 = 50 + rr * 6;
      R(g, ok ? (rr % 2 ? '#2a7a88' : '#348a98') : (rr % 2 ? '#4a4440' : '#55504a'), x0, y, x1 - x0, 5);
      R(g, ok ? '#5ff6ff' : '#5a5450', x0, y, x1 - x0, 1);
    }
    R(g, ok ? '#1f5a66' : '#3a3632', 0, 50, 96, 4);
    // まど と ドア
    for (const wx of [16, 64]) {
      R(g, '#232731', wx, 56, 16, 14);
      R(g, ok ? '#ffe68a' : '#14161e', wx + 2, 58, 12, 10);
      if (ok) R(g, '#fff4c0', wx + 3, 59, 4, 3);
      else for (const [y, t] of [[58, 1], [64, -1]]) for (let k = 0; k < 16; k++) R(g, '#8a6a48', wx + k, y + Math.round(k * t * 0.1), 1, 3);
    }
    R(g, '#5c361c', 40, 62, 16, 28);
    R(g, ok ? '#a8693a' : '#6a4a2a', 42, 64, 12, 26);
    R(g, '#f2c94c', 51, 76, 2, 2);
    if (ok) {
      R(g, '#ff4fd8', 36, 58, 24, 2);
      for (let i = 0; i < 5; i++) R(g, ['#e8465a', '#ffd23f', '#ff8fb5'][i % 3], 18 + i * 3, 70, 2, 2);
    } else {
      g.clearRect(56, 10, 30, 18);
      for (let i = 0; i < 6; i++) R(g, '#3a3632', 60 + i * 4, 26 + (i % 2), 3, 2);
      for (let y = 50; y < 86; y++) R(g, '#3a3632', 30 + Math.round(Math.sin(y * 0.4) * 2), y, 1, 1);
    }
  }, '#0b0d14');
  SP.cottage = cottage(true);
  SP.cottageRuin = cottage(false);
  // いちば の やたい
  const market = (ok) => osp(96, 76, (g) => {
    R(g, '#4a4f5c', 2, 68, 92, 8);
    for (const x of [6, 86]) R(g, ok ? '#5d6470' : '#4a4440', x, 18, 4, 52);
    R(g, ok ? '#5d6470' : '#4a4440', 2, 46, 92, 22);
    R(g, ok ? '#8a929e' : '#5a5450', 2, 46, 92, 2);
    if (ok) {
      for (let i = 0; i < 8; i++) {
        const sx = 4 + i * 11;
        R(g, i % 2 ? '#ff4fd8' : '#232731', sx, 10, 11, 14);
        E(g, i % 2 ? '#ff4fd8' : '#232731', sx + 5, 24, 5, 3);
      }
      R(g, '#5ff6ff', 2, 9, 92, 2);
      for (const [x, c] of [[12, '#e2392c'], [26, '#ffd23f'], [40, '#7dff9a'], [56, '#e98a24'], [70, '#f2c94c']]) {
        R(g, c, x, 38, 10, 8);
        R(g, shade(c, 0.4), x, 38, 10, 2);
      }
      R(g, '#0d1418', 30, 52, 36, 10);
      R(g, '#7dff9a', 33, 55, 20, 1);
      R(g, '#5ff6ff', 33, 58, 14, 1);
    } else {
      for (let i = 0; i < 8; i++) {
        const sx = 4 + i * 11;
        R(g, '#3a3632', sx, 26 + i * 2, 11, 6);
      }
      for (const [x, y] of [[20, 60], [60, 58], [44, 64]]) E(g, '#4a4440', x, y, 4, 2);
      R(g, '#7a4a2a', 30, 50, 6, 2);
    }
  }, '#0b0d14');
  SP.market = market(true);
  SP.marketRuin = market(false);
  // えき（でんしゃが とまる ところ）
  const station = (ok) => osp(128, 84, (g) => {
    R(g, '#4a4f5c', 0, 68, 128, 16);
    R(g, '#6a7180', 0, 68, 128, 2);
    R(g, '#ffd23f', 0, 80, 128, 2);
    for (const x of [8, 60, 112]) R(g, ok ? '#5d6470' : '#4a4440', x, 20, 6, 50);
    // やね
    R(g, ok ? '#232731' : '#2a2624', 0, 12, 128, 12);
    R(g, ok ? '#5ff6ff' : '#3a3632', 0, 22, 128, 2);
    if (!ok) g.clearRect(70, 10, 40, 10);
    // かんばん「えき」
    R(g, '#0d0e1c', 40, 0, 48, 14);
    R(g, ok ? '#ff4fd8' : '#4a2a44', 40, 0, 48, 1);
    R(g, ok ? '#ff4fd8' : '#4a2a44', 40, 13, 48, 1);
    // 「えき」（ドットでは よみにくいので もじで かく）
    g.font = "bold 11px 'Hiragino Maru Gothic ProN', 'Hiragino Sans', 'Meiryo', sans-serif";
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = ok ? '#5ff6ff' : '#2a4a50';
    g.fillText('えき', 64, 7);
    // ベンチ・とけい
    R(g, ok ? '#a8693a' : '#5a4a3a', 20, 54, 28, 4);
    R(g, ok ? '#7a4b28' : '#4a3a2a', 22, 58, 3, 8);
    R(g, ok ? '#7a4b28' : '#4a3a2a', 43, 58, 3, 8);
    E(g, ok ? '#e8ecf2' : '#5a5450', 96, 36, 7, 7);
    R(g, '#232731', 96, 31, 1, 5);
    R(g, '#232731', 96, 36, 4, 1);
    if (!ok) {
      for (const [x, y] of [[30, 70], [80, 74], [110, 70]]) E(g, '#4a4440', x, y, 4, 2);
      for (let i = 0; i < 10; i++) R(g, '#0b0d14', 60 + i * 3, 70 + (i % 2), 2, 1);
    }
  }, '#0b0d14');
  SP.station = station(true);
  SP.stationRuin = station(false);
  // せんろ（ゆかに はる）
  SP.rail = make(32, 32, (g) => {
    for (const x of [4, 20]) R(g, '#6a5a48', x, 6, 8, 20);
    R(g, '#8a929e', 0, 10, 32, 2);
    R(g, '#8a929e', 0, 22, 32, 2);
    R(g, '#c8ccd4', 0, 10, 32, 1);
    R(g, '#c8ccd4', 0, 22, 32, 1);
  });
  // ふっこう けいかく ボード
  SP.board = osp(34, 58, (g) => {
    R(g, '#3d434c', 15, 30, 4, 28);
    R(g, '#0d0e1c', 1, 2, 32, 30);
    R(g, '#ff4fd8', 1, 2, 32, 1);
    R(g, '#ff4fd8', 1, 31, 32, 1);
    R(g, '#5ff6ff', 1, 2, 1, 30);
    R(g, '#5ff6ff', 32, 2, 1, 30);
    for (const [y, w, c] of [[7, 22, '#ffd23f'], [12, 18, '#5ff6ff'], [16, 24, '#5ff6ff'], [20, 14, '#5ff6ff']]) R(g, c, 5, y, w, 2);
    for (let k = 0; k < 5; k++) R(g, '#7dff9a', 6 + k * 5, 25, 3, 3);
  }, '#07080f');
  // むらの ひと
  const person = (p) => osp(32, 48, (g) => {
    R(g, p.pants, 11, 38, 4, 8);
    R(g, p.pants, 17, 38, 4, 8);
    R(g, '#3a2a1a', 10, 45, 6, 3);
    R(g, '#3a2a1a', 16, 45, 6, 3);
    R(g, p.shirt, 8, 24, 16, 15);
    R(g, shade(p.shirt, -0.15), 20, 24, 4, 15);
    R(g, p.shirt, 5, 25, 4, 10);
    R(g, p.shirt, 23, 25, 4, 10);
    R(g, p.skin, 5, 34, 4, 3);
    R(g, p.skin, 23, 34, 4, 3);
    if (p.coat) {
      R(g, '#f4f6fa', 7, 24, 18, 18);
      R(g, '#d8dce4', 15, 26, 2, 16);
      R(g, '#f4f6fa', 4, 25, 5, 11);
      R(g, '#f4f6fa', 23, 25, 5, 11);
      R(g, '#5ff6ff', 19, 28, 1, 4);
    }
    if (p.apron) {
      R(g, '#fbf3e0', 10, 28, 12, 12);
      R(g, '#e4d8bc', 10, 28, 12, 1);
    }
    E(g, p.skin, 16, 16, 8, 8);
    R(g, p.hair, 8, 8, 16, 5);
    R(g, p.hair, 7, 10, 3, p.long ? 14 : 7);
    R(g, p.hair, 22, 10, 3, p.long ? 14 : 7);
    R(g, '#2b1d12', 12, 16, 2, 3);
    R(g, '#2b1d12', 18, 16, 2, 3);
    if (p.glasses) {
      R(g, '#3d434c', 10, 15, 6, 1);
      R(g, '#3d434c', 16, 15, 6, 1);
      R(g, '#3d434c', 10, 15, 1, 4);
      R(g, '#3d434c', 21, 15, 1, 4);
    }
    R(g, '#f39a8a', 10, 20, 3, 1);
    R(g, '#f39a8a', 19, 20, 3, 1);
    R(g, '#c9705a', 15, 21, 3, 1);
    if (p.cap) {
      R(g, p.cap, 7, 6, 18, 4);
      R(g, p.cap, 18, 9, 9, 2);
    }
  }, '#2b1a0e');
  SP.npc_mina = person({ skin: '#f7d1a8', hair: '#a8541e', shirt: '#e8746a', pants: '#3f5a8c', apron: true, long: true });
  SP.npc_sora = person({ skin: '#f7d1a8', hair: '#3a2a1a', shirt: '#4d96ff', pants: '#3a3a4a', cap: '#ffd23f' });
  SP.npc_gen = person({ skin: '#e8b88a', hair: '#d8d8d8', shirt: '#7a5a8c', pants: '#4a3a2a' });
  SP.npc_hakase = person({ skin: '#f7d1a8', hair: '#e8e8e8', shirt: '#5d6470', pants: '#3a3f4c', coat: true, glasses: true });
  SP.npc_v1 = person({ skin: '#f0c49a', hair: '#2a2a3a', shirt: '#3cb46e', pants: '#4a4a5a', long: true });
  SP.npc_v2 = person({ skin: '#f7d1a8', hair: '#6a4426', shirt: '#ffd23f', pants: '#2a5a8c' });
  SP.npc_cat = osp(24, 20, (g) => {
    E(g, '#e98a24', 12, 13, 8, 5);
    E(g, '#f6a646', 11, 12, 5, 3);
    E(g, '#e98a24', 6, 8, 5, 4);
    R(g, '#e98a24', 2, 2, 3, 4);
    R(g, '#e98a24', 8, 2, 3, 4);
    R(g, '#2b1d12', 4, 8, 1, 2);
    R(g, '#2b1d12', 8, 8, 1, 2);
    R(g, '#ff8fb5', 6, 10, 1, 1);
    for (let i = 0; i < 6; i++) R(g, '#e98a24', 19 + (i >> 1), 12 - i, 2, 1);
    for (const x of [6, 10, 14, 17]) R(g, '#c46a12', x, 17, 2, 3);
  }, '#3a1e0e');
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

  // ---------- けんきゅうじょの なか ----------
  // スリープ ポッド（ベッドの かわり。ガラスに ひびが ある）
  SP.bed = osp(62, 62, (g) => {
    R(g, '#2a2e38', 0, 34, 62, 28);
    R(g, '#3a3f4c', 2, 34, 58, 24);
    R(g, '#4a5058', 2, 34, 58, 2);
    for (let x = 6; x < 58; x += 8) R(g, '#2a2e38', x, 40, 4, 1);
    R(g, '#5ff6ff', 4, 56, 54, 1);
    E(g, '#232731', 31, 26, 29, 22);
    E(g, '#5ff6ff', 31, 25, 27, 20);
    E(g, '#0f2a3a', 31, 25, 26, 19);
    E(g, '#174050', 27, 20, 16, 10);
    for (let i = 0; i < 10; i++) R(g, 'rgba(200,250,255,.55)', 14 + i, 12 + i, 1, 1);
    R(g, '#c8f4ff', 40, 12, 1, 6);
    R(g, '#c8f4ff', 41, 18, 1, 6);
    R(g, '#c8f4ff', 40, 24, 1, 6);
    R(g, '#14161e', 6, 44, 10, 8);
    R(g, '#7dff9a', 8, 46, 2, 2);
    R(g, '#ff4fd8', 12, 46, 2, 2);
  }, '#0b0d14');
  // ごうせい そうち（ロッカーの かわり）。うえから ものを いれると、ガラスの なかで まぜて したから なにか でる
  SP.synth = osp(62, 78, (g) => {
    R(g, '#2a2e38', 2, 6, 58, 70);
    R(g, '#3d434c', 4, 6, 54, 68);
    R(g, '#5d6470', 4, 6, 54, 2);
    // いれぐち（ホッパー）
    R(g, '#4a5058', 16, 0, 30, 8);
    R(g, '#8a929e', 16, 0, 30, 1);
    R(g, '#0c0d12', 20, 2, 22, 4);
    R(g, '#ffd23f', 16, 7, 30, 1);
    // ガラスの へや（エネルギーが うずまく）
    E(g, '#14161e', 31, 32, 20, 18);
    E(g, '#5ff6ff', 31, 32, 19, 17);
    E(g, '#0f2a3a', 31, 32, 18, 16);
    for (let a = 0; a < Math.PI * 4; a += 0.12) {
      const rr = 3 + a * 1.1;
      R(g, a < Math.PI * 2 ? '#5ff6ff' : '#ff4fd8', Math.round(31 + Math.cos(a) * rr), Math.round(32 + Math.sin(a) * rr * 0.85), 1, 1);
    }
    E(g, '#c8f4ff', 31, 32, 2, 2);
    for (let i = 0; i < 8; i++) R(g, 'rgba(200,250,255,.5)', 17 + i, 20 + i, 1, 1);
    // よこの ランプ
    for (let k = 0; k < 4; k++) {
      R(g, ['#7dff9a', '#ffd23f', '#ff4fd8', '#5ff6ff'][k], 52, 18 + k * 7, 4, 3);
      R(g, ['#7dff9a', '#ffd23f', '#ff4fd8', '#5ff6ff'][k], 6, 18 + k * 7, 4, 3);
    }
    // でぐち
    R(g, '#0c0d12', 14, 56, 34, 12);
    R(g, '#5ff6ff', 14, 67, 34, 1);
    R(g, '#4a5058', 12, 54, 38, 2);
    for (let x = 6; x < 56; x += 6) R(g, (x / 6) % 2 ? '#ffd23f' : '#1a1a1a', x, 70, 6, 3);
    R(g, '#7a4a2a', 8, 60, 4, 2);
    R(g, '#14161e', 4, 74, 8, 4);
    R(g, '#14161e', 50, 74, 8, 4);
  }, '#0b0d14');
  // オイル しぼりき（こわれている ときは ねじが とれて、さびて いる）
  const press = (fixed) => osp(62, 52, (g) => {
    const m = fixed ? '#8a929e' : '#6a6460', mD = fixed ? '#5d6470' : '#4a4440';
    R(g, mD, 6, 40, 50, 12);
    R(g, m, 6, 40, 50, 2);
    R(g, mD, 12, 14, 18, 28);
    R(g, m, 13, 14, 16, 26);
    R(g, shade(m, 0.3), 13, 14, 3, 26);
    for (let y = 18; y < 38; y += 5) R(g, mD, 13, y, 16, 1);
    // ねじぼう と ハンドル
    if (fixed) {
      for (let y = 2; y < 14; y++) R(g, y % 2 ? '#b4bcc6' : '#5d6470', 19, y, 4, 1);
      R(g, '#5d6470', 6, 3, 30, 3);
      E(g, '#ff4fd8', 6, 4, 2, 2);
      E(g, '#ff4fd8', 36, 4, 2, 2);
    } else {
      R(g, '#4a4440', 19, 8, 4, 6);
      R(g, '#2a2420', 18, 6, 6, 2);
      R(g, '#4a4440', 34, 34, 12, 3);
      R(g, '#6a6460', 44, 30, 3, 6);
    }
    // くち と びん
    R(g, mD, 29, 30, 10, 4);
    R(g, mD, 37, 30, 3, 8);
    R(g, 'rgba(220,240,255,.6)', 40, 34, 12, 14);
    R(g, '#e8f8ff', 40, 34, 2, 14);
    if (fixed) {
      R(g, '#f2c94c', 41, 40, 11, 8);
      R(g, '#ffe68a', 41, 40, 11, 1);
      R(g, '#f2c94c', 38, 38, 1, 2);
    }
    if (!fixed) {
      for (const [x, y] of [[14, 22], [24, 33], [9, 44], [48, 44]]) {
        R(g, '#7a4a2a', x, y, 3, 2);
        R(g, '#c07a44', x, y, 1, 1);
      }
    }
  }, '#0b0d14');
  SP.press = press(false);
  SP.pressOk = press(true);
  // かんづめ せいさく そうち（しゅっかばこの ところに つくる）
  SP.canner = osp(62, 50, (g) => {
    R(g, '#2a2e38', 0, 30, 62, 20);
    R(g, '#4a5058', 0, 30, 62, 2);
    for (let x = 2; x < 60; x += 5) R(g, '#14161e', x, 34, 3, 2);
    R(g, '#5d6470', 4, 4, 22, 28);
    R(g, '#8a929e', 4, 4, 22, 2);
    R(g, '#0d1418', 7, 8, 16, 8);
    R(g, '#7dff9a', 9, 10, 8, 1);
    R(g, '#5ff6ff', 9, 13, 11, 1);
    R(g, '#3d434c', 12, 18, 6, 10);
    R(g, '#b4bcc6', 11, 26, 8, 3);
    for (const x of [30, 40, 50]) {
      R(g, '#b4bcc6', x, 20, 8, 11);
      R(g, '#e8ecf2', x, 20, 2, 11);
      R(g, x === 40 ? '#ff4fd8' : '#5ff6ff', x, 23, 8, 4);
      R(g, '#8a929e', x, 20, 8, 1);
    }
    R(g, '#ffd23f', 0, 46, 62, 2);
  }, '#0b0d14');
  // そとの なのはな（さいている・とった あと）
  SP.wild = osp(30, 36, (g) => {
    for (const [x, h] of [[9, 22], [15, 28], [21, 20]]) {
      R(g, '#3f8a32', x, 36 - h, 2, h);
      leaf(g, x, 32, 6, x < 15 ? -1.2 : 1.2, '#3f8a32', '#5fae45');
      for (const [dx, dy] of [[0, 0], [-2, 2], [2, 2], [-1, 4], [1, -2]]) {
        E(g, '#e8c21a', x + dx, 36 - h + dy, 2, 1);
        R(g, '#fff07a', x + dx, 36 - h + dy, 1, 1);
      }
    }
  }, '#2a3a18');
  SP.wildPicked = osp(30, 18, (g) => {
    leaf(g, 10, 17, 8, -1.2, '#3f8a32', '#5fae45');
    leaf(g, 19, 17, 8, 1.2, '#3f8a32', '#5fae45');
    R(g, '#2c6624', 14, 9, 2, 8);
  }, '#2a3a18');
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
  // つくえ（こわれた モニターと、はかせと ロボの しゃしん）
  SP.table = osp(62, 46, (g) => {
    R(g, '#2a2e38', 4, 22, 5, 24);
    R(g, '#2a2e38', 53, 22, 5, 24);
    R(g, '#4a5058', 0, 18, 62, 8);
    R(g, '#6a7180', 0, 18, 62, 2);
    R(g, '#232731', 0, 25, 62, 1);
    // モニター（がめんが ちらつく）
    R(g, '#232731', 6, 0, 26, 18);
    R(g, '#0d1418', 8, 2, 22, 13);
    for (const [y, c] of [[4, '#5ff6ff'], [7, '#2a7a88'], [9, '#ff4fd8'], [12, '#2a7a88']]) R(g, c, 9, y, 12 + ((y * 7) % 8), 1);
    R(g, '#c8f4ff', 22, 3, 1, 5);
    R(g, '#c8f4ff', 23, 8, 1, 4);
    R(g, '#3d434c', 16, 15, 6, 3);
    // キーボード
    R(g, '#14161e', 8, 20, 20, 3);
    for (let x = 9; x < 27; x += 2) R(g, '#4a5058', x, 21, 1, 1);
    // しゃしんたて
    R(g, '#5d6470', 38, 4, 16, 14);
    R(g, '#d8c7a0', 40, 6, 12, 10);
    E(g, '#8a8a8a', 43, 11, 2, 2);
    E(g, '#6f9a94', 48, 12, 2, 3);
    R(g, '#5ff6ff', 48, 11, 2, 1);
    R(g, '#ffd23f', 38, 4, 16, 1);
    // ケーブル
    for (let x = 0; x < 30; x++) R(g, '#14161e', 30 + x, 26 + Math.round(Math.sin(x * 0.4) * 2) + (x >> 3), 1, 1);
  }, '#0b0d14');
  // ゆかの おおきな ひびわれ（ケーブルが でている）
  SP.rug = make(96, 64, (g) => {
    const r = RNG(5);
    for (let y = 0; y < 40; y++) {
      const w = Math.round(Math.sin((y / 40) * Math.PI) * 30 + r() * 6);
      R(g, '#0c0e14', 48 - w, 12 + y, w * 2, 1);
      R(g, '#4a5058', 48 - w - 1, 12 + y, 1, 1);
      R(g, '#1f222b', 48 + w, 12 + y, 1, 1);
    }
    for (const [c, a, ph] of [['#ffd23f', 18, 0], ['#ff4fd8', 14, 1.5], ['#5ff6ff', 22, 3]]) {
      for (let x = 0; x < 50; x++) R(g, c, 23 + x, 30 + Math.round(Math.sin(x / a * 6 + ph) * 6), 1, 1);
    }
    for (let i = 0; i < 6; i++) R(g, '#c8f4ff', 30 + ((r() * 36) | 0), 22 + ((r() * 18) | 0), 1, 1);
    for (let i = 0; i < 12; i++) E(g, i % 2 ? '#3a3f4c' : '#2b303c', 10 + ((r() * 76) | 0), 8 + ((r() * 48) | 0), 1 + ((r() * 2) | 0), 1);
  });
  // まど（ひびの はいった ガラスの むこうに よるの そら）
  SP.window = make(32, 32, (g) => {
    R(g, '#232731', 3, 2, 26, 19);
    for (let y = 0; y < 15; y++) R(g, y < 8 ? '#0d1430' : '#1d1240', 5, 4 + y, 22, 1);
    for (const [x, y] of [[8, 6], [20, 5], [14, 9], [23, 11]]) R(g, '#e8f4ff', x, y, 1, 1);
    R(g, 'rgba(255,79,216,.5)', 5, 16, 22, 2);
    R(g, 'rgba(95,246,255,.4)', 7, 4, 2, 12);
    let cx = 18;
    for (let y = 4; y < 19; y++) {
      R(g, '#c8f4ff', cx, y, 1, 1);
      if (y % 2) cx += y % 4 === 1 ? 1 : -1;
    }
    R(g, '#4a5058', 1, 21, 30, 2);
    R(g, '#2a2e38', 1, 22, 30, 1);
  });
  // でぐち（ゆかの ひかる せん）
  SP.doorIn = make(32, 32, (g) => {
    R(g, '#0c0d12', 0, 0, 32, 32);
    for (let y = 0; y < 32; y++) R(g, y < 16 ? '#1a2a38' : '#14202c', 4, y, 24, 1);
    R(g, '#5ff6ff', 4, 0, 24, 1);
    for (let y = 4; y < 32; y += 6) R(g, '#2a7a88', 8, y, 16, 1);
    R(g, '#4a5058', 2, 0, 2, 32);
    R(g, '#4a5058', 28, 0, 2, 32);
    R(g, '#ffd23f', 2, 0, 2, 4);
    R(g, '#ffd23f', 28, 0, 2, 4);
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
  // がらくた（けんきゅうじょの ガラクタ）
  SP.c_crate = osp(30, 30, (g) => {
    R(g, '#4a5058', 3, 8, 24, 20);
    R(g, '#5d6470', 3, 8, 24, 8);
    R(g, '#8a929e', 3, 8, 24, 1);
    for (const x of [7, 14, 21]) R(g, '#3d434c', x, 9, 2, 19);
    for (let x = 4; x < 26; x += 4) R(g, (x >> 2) % 2 ? '#ffd23f' : '#1a1a1a', x, 18, 4, 3);
    R(g, '#7a4a2a', 20, 24, 4, 2);
    R(g, 'rgba(210,210,200,.7)', 5, 7, 8, 1);
  }, '#0b0d14');
  SP.c_monitor = osp(30, 30, (g) => {
    R(g, '#4a5058', 3, 5, 24, 20);
    R(g, '#5d6470', 3, 5, 24, 2);
    R(g, '#0d1418', 6, 8, 18, 13);
    R(g, '#2a7a88', 7, 13, 16, 1);
    R(g, '#ff4fd8', 9, 16, 8, 1);
    let cx = 13;
    for (let y = 8; y < 21; y++) {
      R(g, '#c8f4ff', cx, y, 1, 1);
      if (y % 2) cx += y % 4 === 1 ? 2 : -1;
    }
    R(g, '#3d434c', 11, 25, 8, 3);
    R(g, '#232731', 8, 27, 14, 2);
  }, '#0b0d14');
  SP.c_cable = osp(30, 30, (g) => {
    for (const [c, cx, cy, rx, ry] of [['#14161e', 15, 18, 11, 7], ['#ffd23f', 13, 16, 8, 5], ['#ff4fd8', 17, 19, 7, 4], ['#14161e', 12, 20, 5, 4]]) {
      for (let a = 0; a < Math.PI * 2; a += 0.15) R(g, c, Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 2, 1);
    }
    R(g, '#8a929e', 24, 8, 3, 4);
    R(g, '#ffd23f', 25, 6, 1, 2);
  }, '#0b0d14');
  SP.c_beaker = osp(30, 30, (g) => {
    R(g, 'rgba(200,240,255,.7)', 8, 6, 12, 18);
    R(g, '#e8f8ff', 8, 6, 2, 18);
    R(g, '#7dff9a', 10, 16, 9, 8);
    R(g, '#c8ffd6', 10, 16, 9, 1);
    R(g, '#0b0d14', 15, 6, 6, 4);
    E(g, '#3fae5a', 21, 26, 7, 2);
    E(g, '#7dff9a', 20, 26, 4, 1);
    R(g, 'rgba(200,240,255,.7)', 24, 20, 2, 2);
    R(g, 'rgba(200,240,255,.7)', 4, 24, 2, 1);
  }, '#0b0d14');
  SP.c_gears = osp(30, 30, (g) => {
    const gear = (cx, cy, rr, c, c2) => {
      E(g, c, cx, cy, rr, rr);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        R(g, c, Math.round(cx + Math.cos(a) * (rr + 1)) - 1, Math.round(cy + Math.sin(a) * (rr + 1)) - 1, 2, 2);
      }
      E(g, c2, cx, cy, Math.max(1, rr >> 1), Math.max(1, rr >> 1));
    };
    gear(11, 18, 7, '#8a929e', '#3d434c');
    gear(21, 20, 5, '#c9a040', '#7a5a20');
    gear(17, 9, 4, '#5d6470', '#232731');
    for (const [x, y] of [[4, 26], [25, 27], [6, 9]]) R(g, '#b4bcc6', x, y, 3, 1);
  }, '#0b0d14');
  // こわれた きかい（けんきゅうじょの なかと、みちに おちている）。ごうせい そうちに いれると ねじが でる かも
  SP.c_machine = osp(30, 30, (g) => {
    E(g, '#3d434c', 15, 22, 13, 7);
    E(g, '#5d6470', 15, 20, 12, 6);
    E(g, '#8a929e', 12, 17, 6, 3);
    R(g, '#0d1418', 9, 18, 12, 3);
    R(g, '#5ff6ff', 11, 19, 2, 1);
    R(g, '#3a4a50', 17, 19, 2, 1);
    R(g, '#5d6470', 21, 6, 1, 10);
    R(g, '#ff4fd8', 20, 5, 3, 2);
    R(g, '#14161e', 6, 25, 4, 3);
    R(g, '#14161e', 20, 25, 4, 3);
    R(g, '#7a4a2a', 22, 21, 3, 2);
    for (let i = 0; i < 4; i++) R(g, '#c8f4ff', 14 + i, 14 + (i % 2), 1, 1);
  }, '#0b0d14');
  SP.c_coat = osp(30, 30, (g) => {
    // ゆかに おちた はくい（そで・えり・ポケットの ペン）
    R(g, '#c8ccd4', 2, 9, 6, 13);
    R(g, '#e8ecf2', 3, 9, 4, 12);
    R(g, '#c8ccd4', 22, 11, 6, 13);
    R(g, '#e8ecf2', 23, 11, 4, 12);
    R(g, '#c8ccd4', 7, 5, 16, 23);
    R(g, '#e8ecf2', 8, 5, 14, 22);
    R(g, '#ffffff', 9, 6, 4, 18);
    for (let i = 0; i < 5; i++) {
      R(g, '#c8ccd4', 10 + i, 5 + i, 1, 1);
      R(g, '#c8ccd4', 19 - i, 5 + i, 1, 1);
    }
    R(g, '#c8ccd4', 15, 10, 1, 17);
    R(g, '#8a929e', 17, 14, 1, 1);
    R(g, '#8a929e', 17, 19, 1, 1);
    R(g, '#c8ccd4', 17, 21, 4, 3);
    R(g, '#5ff6ff', 18, 18, 1, 4);
    R(g, '#9a5a32', 10, 24, 3, 1);
    R(g, '#9a5a32', 24, 20, 2, 1);
  }, '#2a2e38');
  SP.c_notes = osp(30, 30, (g) => {
    const books = [[2, 21, 26, '#3a5a8c'], [4, 15, 23, '#2a7a88'], [2, 9, 22, '#5a3a8c'], [5, 4, 18, '#8a3a6a']];
    for (const [x, y, w, c] of books) {
      R(g, c, x, y, w, 6);
      R(g, shade(c, 0.25), x, y, w, 1);
      R(g, '#efe6d0', x + w - 3, y + 1, 2, 4);
      R(g, '#5ff6ff', x + 2, y + 2, 4, 1);
    }
  }, '#0b0d14');
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

// ロビタの からだの いろ（3しょうの ペイント屋で かえる）。[ふつう, かげ, こい かげ, ひかり, アクセント]
const ROBO_COLORS = {
  ivory:  ['#ece2c8', '#cfc2a2', '#a3967a', '#faf5e6', '#7fd6b4'], // クラシック・アイボリー（はじめ）
  mint:   ['#a8e2c8', '#7fc4a8', '#5a9a82', '#d4f6e6', '#f2ead4'],
  orange: ['#f2a24a', '#d27f2e', '#a85e1a', '#ffd09a', '#f2ead4'],
  blue:   ['#5a8ad8', '#3f6ab8', '#2a4a8a', '#9fc4ff', '#5ff6ff'],
  gold:   ['#f2c94c', '#d2a62e', '#a87e1a', '#fff0a8', '#ffffff'],
};

// ロビタ：まるい ドームの からだ・くろい バイザーに まるい 2つの 目・みじかい 手足・あたまの アンテナ
// dir：'down' 'up' 'side'（みぎむき）、f：0 とまる・1 2 あるく、parts：{ legs, arm, sensor }、on：目を さましている、color：ROBO_COLORS
function robotSprite(dir, f, parts, on, color) {
  const [cB, cS, cD, cL, cA] = ROBO_COLORS[color] || ROBO_COLORS.ivory;
  return osp(32, 48, (g) => {
    const side = dir === 'side';
    const sink = on ? 0 : 1;                      // とまっている ときは すこし しずむ
    const bob = f ? 0 : 0;
    const lu = f === 1 ? 1 : 0, ru = f === 2 ? 1 : 0;
    const eye = on ? RC.eyeOn : RC.eyeOff;

    // あし（lv0：みじかい あしと まるい くつ、lv1：キャタピラ）
    if (parts.legs >= 1) {
      const xs = side ? [9] : [6, 18];
      for (const x of xs) {
        const w = side ? 15 : 8;
        R(g, RC.tread, x, 39, w, 9);
        R(g, RC.treadL, x, 39, w, 1);
        for (let y = 41 + (f % 2); y < 47; y += 2) R(g, RC.treadL, x + 1, y, w - 2, 1);
        R(g, RC.metal, x + 2, 42, 2, 2);
        R(g, RC.metal, x + w - 4, 44, 2, 2);
      }
    } else if (side) {
      const a = f === 1 ? -2 : f === 2 ? 2 : 0;
      R(g, RC.metalD, 13 - a, 38, 3, 6); E(g, cD, 14 - a, 45, 4, 2);
      R(g, RC.metal, 17 + a, 38, 3, 6); E(g, cS, 18 + a, 45, 4, 2);
    } else {
      R(g, RC.metalD, 10, 38 - lu, 3, 6); E(g, cS, 11, 45 - lu, 4, 2); R(g, cL, 9, 44 - lu, 3, 1);
      R(g, RC.metalD, 19, 38 - ru, 3, 6); E(g, cS, 20, 45 - ru, 4, 2); R(g, cL, 18, 44 - ru, 3, 1);
    }

    // うで（まるい かた と みじかい て。lv1 は つよい アーム）
    const big = parts.arm >= 1;
    const arm = (x, y, flip) => {
      E(g, cD, x + 2, y + 1, 3, 3);
      E(g, cS, x + 2, y, 3, 3);
      if (big) {
        R(g, RC.metal, x, y + 3, 5, 7);
        R(g, RC.metalL, x, y + 3, 1, 7);
        for (let k = 0; k < 6; k += 3) R(g, RC.hazard, x + 1, y + 4 + k, 3, 1);
        R(g, RC.metalD, x - 1, y + 10, 2, 3);
        R(g, RC.metalD, x + 4, y + 10, 2, 3);
      } else {
        R(g, RC.metalD, x + 1, y + 3, 3, 5);
        E(g, cS, x + 2, y + 9, 2, 2);
        R(g, cL, x + 1 + (flip ? 1 : 0), y + 8, 1, 1);
      }
    };
    if (!side) {
      arm(1, 28 + ru + sink, false);
      arm(26, 28 + lu + sink, true);
    }

    // からだ（たまごの ような まるい ドーム）
    const cx = side ? 15 : 16, cy = 25 + sink;
    E(g, cD, cx, cy + 1, side ? 11 : 12, 14);
    E(g, cB, cx, cy, side ? 10 : 11, 13);
    E(g, cS, cx + (side ? 3 : 4), cy + 4, side ? 6 : 6, 8);  // みぎしたの かげ
    E(g, cB, cx - 1, cy - 1, side ? 8 : 9, 10);
    E(g, cL, cx - 4, cy - 7, 3, 3);                          // ひかり
    R(g, cL, cx - 6, cy - 4, 1, 3);
    // ぬりが すこし はげた ところ
    R(g, cD, cx + 5, cy + 7, 2, 1);
    R(g, RC.rust, cx - 6, cy + 8, 2, 1);

    if (dir === 'down') {
      // バイザー と まるい 目
      R(g, '#1a1e26', 7, cy - 8, 19, 9);
      R(g, '#0e1016', 8, cy - 7, 17, 7);
      R(g, '#3a4250', 8, cy - 8, 17, 1);
      E(g, eye, 12, cy - 4, 3, on ? 3 : 1);
      E(g, eye, 21, cy - 4, 3, on ? 3 : 1);
      if (on) {
        E(g, '#bffcff', 11, cy - 5, 1, 1);
        E(g, '#bffcff', 20, cy - 5, 1, 1);
        R(g, '#ffffff', 11, cy - 6, 1, 1);
        R(g, '#ffffff', 20, cy - 6, 1, 1);
      }
      // よこの ボルト（みみ）と おなかの パネル
      E(g, cA, 4, cy - 3, 1, 3);
      E(g, cA, 28, cy - 3, 1, 3);
      R(g, cS, 12, cy + 4, 9, 6);
      R(g, cL, 12, cy + 4, 9, 1);
      R(g, on ? RC.green : RC.greenOff, 13, cy + 6, 2, 2);
      R(g, cA, 17, cy + 6, 3, 1);
      R(g, cA, 17, cy + 8, 2, 1);
    } else if (dir === 'up') {
      // せなか：でんちの ふた と つうき口
      R(g, cS, 11, cy - 6, 11, 12);
      R(g, cD, 11, cy + 5, 11, 1);
      for (let k = 0; k < 3; k++) R(g, on ? RC.green : RC.greenOff, 13, cy + 2 - k * 3, 7, 1);
      for (let x = 12; x < 21; x += 2) R(g, cD, x, cy - 4, 1, 3);
      E(g, cA, 4, cy - 3, 1, 3);
      E(g, cA, 28, cy - 3, 1, 3);
    } else {
      // よこ：バイザーが まえに まわって、目が 1つ みえる
      R(g, '#1a1e26', 15, cy - 8, 11, 9);
      R(g, '#0e1016', 16, cy - 7, 9, 7);
      E(g, eye, 21, cy - 4, 3, on ? 3 : 1);
      if (on) { E(g, '#bffcff', 20, cy - 5, 1, 1); R(g, '#ffffff', 20, cy - 6, 1, 1); }
      E(g, cA, 9, cy - 2, 2, 3);                              // みみの ボルト
      E(g, cL, 9, cy - 3, 1, 1);
    }

    // アンテナ（lv0：おれて まがって いる、lv1：まっすぐ・ピンクの たま）
    const ax = side ? 13 : 16, ay = cy - 13;
    if (parts.sensor >= 1) {
      R(g, RC.metal, ax, ay - 6, 1, 6);
      R(g, RC.metalD, ax + 1, ay - 6, 1, 6);
      E(g, on ? RC.pink : RC.pinkOff, ax, ay - 7, 2, 2);
      if (on) R(g, '#ffd0f4', ax - 1, ay - 8, 1, 1);
    } else {
      R(g, RC.metalD, ax, ay - 3, 1, 3);
      R(g, RC.metalD, ax + 1, ay - 4, 2, 1);
      E(g, RC.rust, ax + 3, ay - 4, 1, 1);
    }

    if (side) {
      const sw = f === 1 ? 2 : f === 2 ? -2 : 0;
      arm(13 + sw, 28 + sink, false);
    }
    void bob;
  }, '#2a2418');
}

// パーツと いろの くみあわせ ごとに つくって おく
function robotSpr(dir, f, parts, on, color = 'ivory') {
  const key = `r_${dir}_${f}_${parts.legs}${parts.arm}${parts.sensor}_${on ? 1 : 0}_${color}`;
  if (!SP[key]) {
    SP[key] = dir === 'left' ? flipX(robotSpr('right', f, parts, on, color))
      : robotSprite(dir === 'right' ? 'side' : dir, f, parts, on, color);
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
    if (id === 'nanohana') {
      for (const [x, h] of [[9, 26], [16, 33], [23, 24]]) {
        R(g, LD, x, 40 - h, 2, h);
        leaf(g, x, 36, 7, x < 16 ? -1.2 : 1.2, L1, L2);
        for (const [dx, dy] of [[0, 0], [-2, 2], [2, 2], [-1, 4], [1, -2], [2, 5]]) {
          E(g, '#e8c21a', x + dx, 40 - h + dy, 2, 1);
          R(g, '#fff07a', x + dx, 40 - h + dy, 1, 1);
        }
      }
    } else if (id === 'goma') {
      R(g, LD, 15, 4, 2, 34);
      for (let y = 10; y < 34; y += 6) {
        leaf(g, 14, y + 5, 6, -1.3, L1, L2);
        leaf(g, 17, y + 5, 6, 1.3, L1, L2);
        E(g, '#f6e8f2', 12, y, 2, 2);
        R(g, '#d8a0c8', 12, y + 1, 2, 1);
        R(g, '#6fae45', 19, y - 1, 3, 5);
        R(g, '#4a8a32', 21, y - 1, 1, 5);
      }
    } else if (id === 'turnip') {
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
    if (id === 'nanohana') {
      R(g, '#3f8a32', 14, 12, 2, 16);
      leaf(g, 14, 26, 7, -1.3, '#3f8a32', '#5fae45');
      leaf(g, 16, 24, 7, 1.3, '#3f8a32', '#5fae45');
      for (const [dx, dy] of [[0, 0], [-4, 3], [4, 3], [-2, 7], [2, -4], [3, 7], [-4, -2]]) {
        E(g, '#e8c21a', 15 + dx, 9 + dy, 3, 2);
        R(g, '#fff07a', 15 + dx, 9 + dy, 1, 1);
      }
    } else if (id === 'goma') {
      for (let k = 0; k < 26; k++) {
        const x = 5 + ((k * 7) % 20), y = 14 + ((k * 5) % 12);
        R(g, k % 3 ? '#efe0c0' : '#3a2a1a', x, y, 2, 1);
      }
      R(g, '#6fae45', 9, 3, 6, 11);
      R(g, '#4a8a32', 13, 3, 2, 11);
      R(g, '#6fae45', 17, 5, 5, 9);
    } else if (id === 'turnip') {
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
  const col = { nanohana: '#e8c21a', goma: '#8a6a3a', turnip: '#9b4cb5', dcarrot: '#e8c21a', sunflower: '#ff9a3f', carrot: '#e2781e', tomato: '#e2392c', pumpkin: '#e98a24' }[id] || '#8a8a8a';
  return oicon((g) => {
    R(g, '#c9b088', 3, 2, 24, 27);
    R(g, '#f6eedb', 4, 3, 22, 25);
    R(g, col, 4, 3, 22, 7);
    R(g, shade(col, 0.3), 4, 3, 22, 1);
    R(g, '#e6dcc4', 4, 10, 22, 1);
    for (let x = 4; x < 26; x += 2) R(g, '#d8ccb0', x, 26, 1, 2);
    // まんなかの え
    if (id === 'nanohana') { for (const [dx, dy] of [[0, 0], [-3, 2], [3, 2], [0, 4]]) E(g, '#e8c21a', 15 + dx, 17 + dy, 2, 2); R(g, '#3f8a32', 14, 22, 2, 4); }
    if (id === 'goma') { for (let k = 0; k < 12; k++) R(g, k % 3 ? '#efe0c0' : '#3a2a1a', 9 + ((k * 5) % 12), 15 + ((k * 3) % 8), 2, 1); }
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
  ICON.m_screw = oicon((g) => {
    R(g, '#5d6470', 9, 4, 12, 5);
    R(g, '#b4bcc6', 9, 4, 12, 2);
    R(g, '#2a2e38', 14, 4, 2, 4);
    for (let y = 9; y < 27; y++) R(g, y % 3 ? '#8a929e' : '#5d6470', 12, y, 6, 1);
    R(g, '#b4bcc6', 12, 9, 1, 18);
    R(g, '#5d6470', 14, 27, 2, 2);
  }, '#14161e');
  ICON.m_scrap = oicon((g) => {
    for (const [x, y, w, h, c] of [[3, 16, 12, 9, '#6a7180'], [13, 10, 13, 8, '#8a929e'], [9, 20, 16, 7, '#5d6470'], [6, 8, 7, 6, '#9a5a32']]) {
      R(g, c, x, y, w, h);
      R(g, shade(c, 0.3), x, y, w, 1);
    }
    R(g, '#2a2e38', 15, 13, 2, 2);
    R(g, '#2a2e38', 18, 23, 2, 2);
  }, '#14161e');
  ICON.scrap = SP.c_machine;
  const oilIcon = (c, c2) => oicon((g) => {
    R(g, '#c8ccd4', 12, 2, 6, 5);
    R(g, '#5d6470', 11, 6, 8, 2);
    R(g, 'rgba(220,240,255,.7)', 7, 8, 16, 20);
    R(g, c, 8, 13, 14, 14);
    R(g, c2, 8, 13, 14, 2);
    R(g, '#ffffff', 9, 10, 2, 16);
    R(g, '#f6eedb', 10, 17, 10, 6);
    E(g, c, 15, 20, 2, 2);
  }, '#2a2418');
  ICON.o_nanohana = oilIcon('#f2c94c', '#ffe68a');
  ICON.o_goma = oilIcon('#a8641e', '#d08a3e');
  ICON.o_sun = oilIcon('#ff9a3f', '#ffd23f');
  ICON.o_fish = oilIcon('#d8a83a', '#fff0b0');
  for (const [k, f] of Object.entries(FISH)) ICON[`f_${k}`] = fishIcon(f);
  // 光る すがた：ネオンの いろ と キラキラ
  for (const [k, gl] of Object.entries(GLOW)) {
    const base = fishIcon({ ...FISH[k], col: gl.col });
    ICON[`g_${k}`] = make(32, 32, (g) => {
      g.drawImage(base, 0, 0);
      for (const [x, y, c] of [[4, 6, '#ffffff'], [26, 8, gl.col[2]], [7, 25, gl.col[2]], [24, 24, '#ffffff'], [15, 4, '#7ff8ff']]) {
        R(g, c, x, y, 1, 1);
        R(g, c, x - 1, y + 1, 3, 1);
        R(g, c, x, y + 2, 1, 1);
      }
    });
  }
  ICON.m_kasu = oicon((g) => {
    E(g, '#5a3a20', 15, 21, 13, 7);
    E(g, '#7a5232', 14, 19, 12, 6);
    for (const [x, y, rr] of [[8, 17, 3], [14, 14, 4], [21, 17, 3], [11, 21, 3], [19, 22, 3]]) {
      E(g, '#9a6a3e', x, y, rr, rr - 1);
      R(g, '#c08a52', x - 1, y - rr + 1, 2, 1);
    }
    R(g, '#7dff9a', 22, 6, 2, 6);
    R(g, '#5fae45', 20, 8, 2, 2);
    R(g, '#5fae45', 24, 9, 2, 2);
  }, '#2a1a0a');
  for (const k of Object.keys(CROPS)) {
    ICON[`c_${k}`] = cropIcon(k);
    ICON[`seed_${k}`] = seedIcon(k);
  }
}

// ---------- 1しょう：けんきゅう室の きかい ----------

function buildCh1() {
  // メインパネル（かべの おおきな がめん）。off：まっくらで ひび、on：あおく 光って ビデオが うつる
  const panel = (on) => osp(62, 46, (g) => {
    R(g, '#2a2e38', 0, 0, 62, 42);
    R(g, '#4a5058', 1, 1, 60, 2);
    R(g, '#14161e', 4, 4, 54, 32);
    if (on) {
      for (let y = 0; y < 32; y++) R(g, y % 3 ? '#0f3a4a' : '#145a6a', 4, 4 + y, 54, 1);
      E(g, '#5ff6ff', 31, 18, 9, 9);
      E(g, '#0f3a4a', 31, 18, 7, 7);
      E(g, '#7ff8ff', 31, 15, 4, 4);                 // はかせの あたま（ホログラム）
      R(g, '#7ff8ff', 25, 21, 12, 8);
      R(g, '#5ff6ff', 6, 6, 10, 2);
      R(g, '#ff4fd8', 48, 6, 6, 2);
      for (let x = 8; x < 56; x += 6) R(g, '#7dff9a', x, 32, 3, 2);
    } else {
      for (const [x, y, l] of [[14, 8, 9], [40, 20, 11]]) for (let i = 0; i < l; i++) R(g, '#3d434c', x + i, y + ((i * 7) % 3), 1, 1);
      R(g, '#3d434c', 22, 26, 12, 1);
    }
    R(g, '#3d434c', 10, 40, 6, 6);
    R(g, '#3d434c', 46, 40, 6, 6);
    R(g, on ? '#7dff9a' : '#5a1a1a', 54, 37, 4, 2);
  }, '#0b0d14');
  SP.panelOff = panel(false);
  SP.panelOn = panel(true);

  // サイバーか そうち（ちりょう ポッド）。off：ガラスが われて さびている、on：うごくが 水が なくて あかい ランプ
  const pod = (on) => osp(62, 76, (g) => {
    R(g, '#2a2e38', 2, 54, 58, 22);
    R(g, '#4a5058', 2, 54, 58, 3);
    for (let x = 6; x < 58; x += 8) R(g, (x / 8) % 2 ? '#ffd23f' : '#1a1a1a', x, 70, 8, 3);
    // ガラスの ドーム
    E(g, '#14161e', 31, 32, 24, 26);
    E(g, on ? '#2a6a7a' : '#2a2e38', 31, 32, 22, 24);
    E(g, on ? '#5fd8ea' : '#3d434c', 31, 30, 19, 21);
    E(g, on ? '#bff8ff' : '#4a5058', 25, 20, 5, 8);
    R(g, '#14161e', 6, 46, 50, 9);
    if (on) {
      for (let y = 14; y < 50; y += 4) R(g, 'rgba(255,255,255,.25)', 18, y, 26, 1);
      R(g, '#ff4f4f', 10, 59, 6, 4);                 // 水が ない（あかい ランプ）
      R(g, '#7dff9a', 20, 59, 6, 4);
      R(g, '#5ff6ff', 30, 59, 22, 4);
    } else {
      for (const [x, y, l, d] of [[20, 14, 12, 1], [36, 30, 10, -1], [28, 38, 8, 1]]) for (let i = 0; i < l; i++) R(g, '#14161e', x + i * d, y + i, 1, 1);
      for (const [x, y] of [[8, 60], [40, 62], [50, 58]]) { R(g, '#7a4a2a', x, y, 4, 2); R(g, '#c07a44', x, y, 1, 1); }
      R(g, '#3a1a1a', 10, 59, 6, 4);
    }
    // 水の タンク（よこ）
    R(g, '#3d434c', 52, 20, 8, 34);
    R(g, on ? '#1a2a3a' : '#2a2e38', 54, 22, 4, 30);
  }, '#0b0d14');
  SP.podOff = pod(false);
  SP.podOn = pod(true);

  // しつない プランター。broken：われて つちが こぼれている、ok：つちと ライト
  const pot = (ok) => osp(30, 26, (g) => {
    R(g, ok ? '#5d6470' : '#4a4440', 1, 8, 28, 18);
    R(g, ok ? '#8a929e' : '#6a6460', 1, 8, 28, 2);
    R(g, ok ? '#4a3020' : '#3a2a20', 3, 10, 24, 5);
    R(g, ok ? '#6a4428' : '#4a3020', 3, 10, 24, 1);
    if (ok) {
      R(g, '#3d434c', 1, 0, 2, 9);
      R(g, '#3d434c', 27, 0, 2, 9);
      R(g, '#2a2e38', 1, 0, 28, 2);
      R(g, '#ff7ae8', 4, 2, 22, 1);                  // そだつ ための ライト
      R(g, '#7dff9a', 3, 22, 4, 2);
    } else {
      for (let i = 0; i < 9; i++) R(g, '#14161e', 12 + i, 12 + i, 1, 1);
      R(g, '#3a2a20', 22, 23, 8, 3);
      R(g, '#3a2a20', 0, 24, 5, 2);
    }
  }, '#0b0d14');
  SP.potBroken = pot(false);
  SP.potOk = pot(true);
  SP.potWet = make(SP.potOk.width, SP.potOk.height, (g) => {
    g.drawImage(SP.potOk, 0, 0);
    R(g, '#2a1a10', 4, 11, 24, 5);
    for (const x of [7, 13, 19, 24]) R(g, 'rgba(160,200,230,.6)', x, 12, 2, 1);
  });

  // 水ろの ろかそうち（こわれて いる。ネオンスポアが くっついて 光る）
  SP.filterBroken = osp(62, 64, (g) => {
    R(g, '#3d434c', 4, 18, 46, 46);
    R(g, '#5d6470', 6, 18, 42, 3);
    R(g, '#2a2e38', 50, 34, 12, 8);                  // 水ろへの パイプ
    R(g, '#2a2e38', 18, 4, 14, 16);
    E(g, '#4a5058', 25, 6, 8, 4);
    R(g, '#14161e', 12, 28, 30, 18);
    R(g, '#3a1a1a', 14, 30, 26, 2);
    for (let x = 14; x < 40; x += 5) R(g, '#2a2e38', x, 32, 2, 12);
    R(g, '#5a1a1a', 40, 50, 6, 4);
    for (const [x, y] of [[8, 24], [44, 26], [10, 54], [30, 58], [22, 22], [54, 36]]) {
      R(g, '#c08aff', x, y, 3, 3);
      R(g, '#7ff8ff', x + 1, y + 1, 1, 1);
    }
    for (const [x, y] of [[36, 20], [6, 44]]) { R(g, '#7a4a2a', x, y, 4, 2); R(g, '#c07a44', x, y, 1, 1); }
  }, '#0b0d14');

  // はかせの ホログラム（ビデオの かお）
  SP.holo = make(64, 64, (g) => {
    E(g, 'rgba(95,246,255,.25)', 32, 34, 30, 30);
    E(g, '#bff8ff', 32, 26, 14, 15);                 // かお
    R(g, '#e8fcff', 18, 13, 28, 6);                  // しろい かみ
    E(g, '#e8fcff', 20, 20, 5, 7);
    E(g, '#e8fcff', 44, 20, 5, 7);
    R(g, '#2a6a7a', 23, 25, 7, 5);                   // めがね
    R(g, '#2a6a7a', 34, 25, 7, 5);
    R(g, '#e8fcff', 25, 26, 3, 2);
    R(g, '#e8fcff', 36, 26, 3, 2);
    R(g, '#2a6a7a', 30, 27, 4, 1);
    R(g, '#5fb8c8', 28, 34, 8, 2);                   // にっこり
    E(g, '#7ff8ff', 32, 56, 20, 12);                 // はくい
    R(g, '#bff8ff', 30, 44, 4, 20);
    for (let y = 0; y < 64; y += 3) R(g, 'rgba(10,40,60,.35)', 0, y, 64, 1); // ホログラムの すじ
  });
}

// ---------- あれはてた 町（くずれた ビル・がれき・はいしゃ・かれ木） ----------

// まどの いろいろ（われた・くらい・いたで ふさいだ・ネオンが すこし のこる）
function ruinWindow(g, x, y, w, h, kind) {
  R(g, '#26272c', x - 1, y - 1, w + 2, h + 2);
  if (kind === 0) { // われて まっくら
    R(g, '#0e0f12', x, y, w, h);
    R(g, '#5a6a7a', x + 1, y + 1, 2, 1);
    R(g, '#5a6a7a', x + w - 3, y + h - 2, 2, 1);
    for (let i = 0; i < Math.min(w, h) - 2; i++) R(g, '#3a4a5a', x + 2 + i, y + 1 + (i >> 1), 1, 1);
  } else if (kind === 1) { // くらい ガラス
    R(g, '#2c3a48', x, y, w, h);
    R(g, '#3e5062', x, y, w, 2);
    R(g, '#4a6074', x + 1, y + 1, 2, 2);
  } else if (kind === 2) { // いたで ふさいだ
    R(g, '#0e0f12', x, y, w, h);
    R(g, '#6e5a42', x - 1, y + 2, w + 2, 2);
    R(g, '#5e4a34', x - 1, y + h - 4, w + 2, 2);
  } else { // ネオンが すこし のこる
    R(g, '#0e0f12', x, y, w, h);
    R(g, kind === 3 ? 'rgba(95,246,255,.55)' : 'rgba(255,79,216,.5)', x + 1, y + 1, w - 2, h - 2);
    R(g, kind === 3 ? '#9ff8ff' : '#ff9ae8', x + 1, y + 1, w - 2, 1);
  }
}

// ひび（ジグザグ）
function crack(g, x, y, len, r, col = '#2a2b2e') {
  let cx = x, cy = y;
  for (let i = 0; i < len; i++) {
    R(g, col, cx, cy, 1, 1);
    cx += r() < 0.5 ? 1 : 0;
    cy += r() < 0.7 ? 1 : 0;
    if (r() < 0.15) cx -= 1;
  }
}

// ネオンスポアが くっついて 光る コケ
function sporeMoss(g, r, x0, y0, w, h, n) {
  for (let i = 0; i < n; i++) {
    const x = x0 + ((r() * w) | 0), y = y0 + ((r() * h) | 0);
    R(g, r() < 0.5 ? '#3f86a0' : '#6a4a8a', x, y, 2, 2);
    R(g, r() < 0.5 ? '#7ff8ff' : '#d68aff', x, y, 1, 1);
  }
}

// こわれた ビル（たかい）。seed ごとに まどや くずれかたが かわる
function ruinTower(seed) {
  return osp(96, 132, (g) => {
    const r = RNG(seed);
    R(g, '#4c4d53', 4, 14, 88, 118);
    R(g, '#5a5b61', 4, 14, 64, 118);
    R(g, '#3e3f45', 80, 14, 12, 118);              // みぎの かげ
    for (let y = 30; y < 118; y += 20) {          // かいの さかいめ
      R(g, '#6a6b70', 4, y, 88, 1);
      R(g, '#35363b', 4, y + 1, 88, 1);
    }
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const v = r();
        const kind = v < 0.4 ? 0 : v < 0.65 ? 1 : v < 0.85 ? 2 : v < 0.93 ? 3 : 4;
        ruinWindow(g, 12 + col * 20, 34 + row * 20, 11, 10, kind);
      }
    }
    // 1かい：さびた シャッター
    R(g, '#26272c', 16, 118, 40, 14);
    for (let y = 119; y < 132; y += 2) R(g, y % 4 ? '#6a5a4e' : '#5a4a3e', 17, y, 38, 1);
    R(g, '#8a4a2a', 22, 124, 6, 3);
    R(g, '#8a4a2a', 40, 127, 8, 2);
    // くずれた うえ と てっきん
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(52, 0);
    let x = 52;
    while (x < 96) {
      x += 4 + r() * 6;
      g.lineTo(x, 14 + r() * 26);
    }
    g.lineTo(96, 0);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) {
      const bx = 56 + ((r() * 34) | 0), by = 18 + ((r() * 18) | 0);
      for (let k = 0; k < 8; k++) R(g, '#8a5a3a', bx + (k >> 2), by - k, 1, 1);
    }
    R(g, '#6a6b70', 4, 14, 50, 2);
    // ひび と ネオンの かんばん（はんぶん きえて いる）
    for (let i = 0; i < 5; i++) crack(g, 6 + ((r() * 80) | 0), 20 + ((r() * 90) | 0), 10 + ((r() * 14) | 0), r);
    R(g, '#1a1a22', 0, 44, 9, 52);
    for (let k = 0; k < 6; k++) {
      const on = r() < 0.6;
      R(g, on ? '#ff4fd8' : '#4a2a44', 2, 48 + k * 8, 5, 5);
      if (on) R(g, '#ffc0f0', 3, 49 + k * 8, 3, 1);
    }
    // でんせん
    for (let x2 = 0; x2 < 30; x2++) R(g, '#1a1a1e', 60 + x2, 60 + Math.round(Math.sin(x2 / 30 * Math.PI) * 8), 1, 1);
    sporeMoss(g, r, 6, 96, 80, 34, 22);
  }, '#121216');
}

// ひくい みせの あと（シャッターと やぶれた テント）
function ruinShop(seed) {
  return osp(64, 92, (g) => {
    const r = RNG(seed);
    R(g, '#55565c', 2, 12, 60, 80);
    R(g, '#45464c', 50, 12, 12, 80);
    R(g, '#6a6b70', 2, 12, 60, 2);
    ruinWindow(g, 8, 22, 14, 12, r() < 0.5 ? 0 : 2);
    ruinWindow(g, 34, 22, 14, 12, r() < 0.5 ? 1 : 3);
    // やぶれた テント
    const tc = r() < 0.5 ? ['#2a8a8a', '#1f6a6a'] : ['#8a3a7a', '#6a2a5e'];
    for (let x = 2; x < 62; x += 6) {
      const h = 8 + ((r() * 6) | 0);
      R(g, (x / 6) % 2 ? tc[0] : tc[1], x, 42, 6, h);
    }
    R(g, '#3e3f45', 2, 41, 60, 2);
    // シャッター
    R(g, '#26272c', 6, 58, 48, 34);
    for (let y = 59; y < 92; y += 2) R(g, y % 4 ? '#6a5a4e' : '#5a4a3e', 7, y, 46, 1);
    for (let i = 0; i < 4; i++) R(g, '#8a4a2a', 10 + ((r() * 36) | 0), 62 + ((r() * 26) | 0), 4 + ((r() * 5) | 0), 2);
    // かんばん（もじは かすれて よめない）
    R(g, '#1a1a22', 10, 2, 44, 10);
    for (let k = 0; k < 5; k++) R(g, r() < 0.5 ? '#5ff6ff' : '#2a4a50', 14 + k * 8, 4, 5, 6);
    for (let i = 0; i < 3; i++) crack(g, 4 + ((r() * 50) | 0), 14 + ((r() * 30) | 0), 10, r);
    sporeMoss(g, r, 4, 70, 56, 20, 12);
  }, '#121216');
}

function buildRuins() {
  SP.tower1 = ruinTower(11);
  SP.tower2 = ruinTower(23);
  SP.tower3 = ruinTower(37);
  SP.shop1 = ruinShop(5);
  SP.shop2 = ruinShop(8);
  // がれき
  const rubble = (seed, w, h) => osp(w, h, (g) => {
    const r = RNG(seed);
    for (let i = 0; i < Math.round(w * h / 90); i++) {
      const cx = 4 + ((r() * (w - 8)) | 0), cy = Math.round(h * 0.45 + r() * h * 0.45);
      const rw = 3 + ((r() * w * 0.14) | 0), rh = 2 + ((r() * h * 0.16) | 0);
      E(g, '#4a4b50', cx + 1, cy + 1, rw, rh);
      E(g, r() < 0.5 ? '#6e6f74' : '#7e7f84', cx, cy, rw, rh);
      R(g, '#9a9ba0', cx - rw + 1, cy - rh + 1, Math.max(1, rw - 1), 1);
    }
    for (let i = 0; i < 3; i++) {
      const bx = 6 + ((r() * (w - 12)) | 0), by = Math.round(h * 0.5 + r() * h * 0.3);
      for (let k = 0; k < 7; k++) R(g, '#8a5a3a', bx + (k > 3 ? 1 : 0), by - k, 1, 1);
    }
  }, '#1e1e22');
  SP.rubble = rubble(3, 34, 26);
  SP.rubbleBig = rubble(9, 64, 40);
  // はいしゃ（さびた くるま）
  SP.car = osp(64, 38, (g) => {
    const r = RNG(4);
    R(g, '#2a2a2e', 4, 30, 56, 6);
    R(g, '#7a3a2e', 2, 16, 60, 16);
    R(g, '#8e4a38', 2, 16, 60, 3);
    R(g, '#5a2a20', 2, 28, 60, 4);
    R(g, '#6a3428', 14, 4, 34, 14);
    R(g, '#0e0f12', 17, 6, 12, 10);
    R(g, '#0e0f12', 32, 6, 13, 10);
    R(g, '#5a6a7a', 19, 7, 2, 1);
    for (const x of [8, 46]) { E(g, '#1a1a1e', x + 5, 32, 6, 4); E(g, '#4a4a50', x + 5, 32, 3, 2); }
    for (let i = 0; i < 9; i++) R(g, r() < 0.5 ? '#a8582e' : '#4a2018', 4 + ((r() * 54) | 0), 18 + ((r() * 12) | 0), 2 + ((r() * 4) | 0), 1 + ((r() * 2) | 0));
    R(g, '#ffd23f', 56, 20, 4, 3);
    R(g, '#5a4a20', 56, 20, 4, 1);
    sporeMoss(g, r, 4, 20, 56, 12, 8);
  }, '#121216');
  // かれ木
  SP.deadTree = osp(44, 78, (g) => {
    const r = RNG(6);
    R(g, '#4e4238', 19, 34, 7, 44);
    R(g, '#3a3028', 19, 34, 2, 44);
    R(g, '#5e5246', 24, 36, 1, 40);
    R(g, '#4e4238', 15, 74, 15, 4);
    const branch = (x, y, dx, len) => {
      let cx = x, cy = y;
      for (let i = 0; i < len; i++) {
        R(g, '#4e4238', Math.round(cx), Math.round(cy), 2, 2);
        cx += dx;
        cy -= 1;
        if (i === (len >> 1)) for (let k = 0; k < 5; k++) R(g, '#4e4238', Math.round(cx) + (dx > 0 ? -k : k), Math.round(cy) - k, 1, 1);
      }
    };
    branch(21, 40, -0.9, 18);
    branch(23, 36, 0.8, 20);
    branch(22, 34, 0.1, 24);
    branch(21, 50, -1.2, 10);
    branch(24, 46, 1.1, 12);
    sporeMoss(g, r, 18, 52, 8, 20, 5);
  }, '#1a1612');
  // ドラムかん
  SP.barrel = osp(22, 28, (g) => {
    const r = RNG(2);
    R(g, '#6a4a32', 2, 4, 18, 24);
    R(g, '#8a5e3e', 2, 4, 6, 24);
    R(g, '#4a3222', 16, 4, 4, 24);
    R(g, '#3a3a3e', 2, 10, 18, 2);
    R(g, '#3a3a3e', 2, 20, 18, 2);
    E(g, '#4a3222', 11, 4, 9, 2);
    E(g, '#2a2a2e', 11, 4, 7, 1);
    for (let i = 0; i < 5; i++) R(g, '#a8582e', 3 + ((r() * 15) | 0), 6 + ((r() * 20) | 0), 2, 2);
    R(g, '#ffd23f', 8, 14, 6, 4);
    R(g, '#1a1a1e', 10, 15, 2, 2);
  }, '#121216');
  // くずれた コンクリートの かべ（ネオンの らくがき）
  SP.wallBroken = osp(64, 44, (g) => {
    const r = RNG(12);
    R(g, '#5e5f64', 0, 10, 64, 34);
    R(g, '#4a4b50', 0, 38, 64, 6);
    for (let x = 0; x < 64; x += 16) R(g, '#4e4f54', x, 10, 1, 34);
    for (let y = 18; y < 40; y += 8) R(g, '#4e4f54', 0, y, 64, 1);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x <= 64; x += 6) g.lineTo(x, 10 + r() * 16);
    g.lineTo(64, 0);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
    R(g, '#8a4a3a', 40, 24, 10, 6);           // なかの レンガ
    R(g, '#6a3a2e', 40, 27, 10, 1);
    for (let i = 0; i < 18; i++) R(g, '#ff4fd8', 8 + i, 30 + Math.round(Math.sin(i * 0.7) * 3), 1, 2);
    for (let i = 0; i < 10; i++) R(g, '#5ff6ff', 26 + i, 34 - (i >> 1), 2, 1);
    crack(g, 20, 14, 18, r);
  }, '#121216');
  // ちらかった ごみ（じめんに はりつく）
  SP.debris = make(32, 32, (g) => {
    const r = RNG(17);
    for (let i = 0; i < 6; i++) {
      const x = 3 + ((r() * 24) | 0), y = 4 + ((r() * 24) | 0);
      const k = r();
      if (k < 0.3) { R(g, '#8a8a84', x, y, 4, 2); R(g, '#a8a8a2', x, y, 4, 1); }          // かみくず
      else if (k < 0.55) { R(g, '#6a7a8a', x, y, 2, 2); R(g, '#bfe6f2', x, y, 1, 1); }    // ガラス
      else if (k < 0.8) { R(g, '#5a4a3e', x, y, 5, 1); R(g, '#3a3028', x + 1, y + 1, 3, 1); } // はへん
      else { R(g, '#3f86a0', x, y, 2, 2); R(g, '#7ff8ff', x, y, 1, 1); }                  // 光る コケ
    }
  });
  SP.debris2 = flipX(SP.debris);
  // おなじ ものが ならばない ように、いろちがい・はんてん
  SP.car2 = make(SP.car.width, SP.car.height, (g) => {
    g.drawImage(SP.car, 0, 0);
    const img = g.getImageData(0, 0, SP.car.width, SP.car.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const [r0, g0, b0] = [d[i], d[i + 1], d[i + 2]];
      if (d[i + 3] && r0 > g0 + 20 && r0 > b0 + 20) { d[i] = r0 * 0.45; d[i + 1] = g0 * 0.9 + 30; d[i + 2] = b0 * 1.1 + 40; } // さびた あか → いろあせた あお
    }
    g.putImageData(img, 0, 0);
  });
  SP.carB = flipX(SP.car2);
  SP.wall2 = flipX(SP.wallBroken);
  // かれた くさ（はたけ）
  SP.weedDry = osp(30, 28, (g) => {
    const blades = [[4, 12, -1], [8, 6, -0.5], [12, 4, 0], [15, 7, 0.3], [19, 3, 0.6], [23, 9, 1], [26, 13, 1.2]];
    for (const [x, top, d] of blades) {
      for (let y = top; y < 27; y++) {
        const cx = x + Math.round(d * (27 - y) * 0.25);
        R(g, y < top + 3 ? '#c8b27a' : y > 20 ? '#5a4a30' : '#8e7a4e', cx, y, 2, 1);
      }
    }
  }, '#2a2214');
}

// ---------- 町の エリア：ふさがった 道・ちゅうおう広場・みなと ----------

function buildAreas() {
  // バリケード（とおれない）。ネオンスポアが こびりついて 光る
  SP.barricade = osp(32, 40, (g) => {
    const r = RNG(41);
    R(g, '#3a3a3e', 4, 18, 3, 20);
    R(g, '#3a3a3e', 25, 18, 3, 20);
    for (let x = 0; x < 32; x++) for (let y = 12; y < 22; y++) R(g, ((x + y) >> 2) % 2 ? '#d94c3d' : '#e8e2d6', x, y, 1, 1);
    R(g, '#8a2a20', 0, 21, 32, 1);
    R(g, '#ffd23f', 14, 6, 4, 4);
    R(g, '#3a3a3e', 15, 10, 2, 2);
    for (const [x, y] of [[2, 32], [10, 33], [18, 32], [26, 33], [6, 28], [22, 28]]) { E(g, '#7a6a4a', x + 2, y + 2, 4, 3); R(g, '#9a8a62', x, y, 4, 1); }
    sporeMoss(g, r, 0, 12, 32, 26, 12);
  }, '#121216');
  SP.barricade2 = osp(32, 36, (g) => {
    const r = RNG(43);
    for (let i = 0; i < 9; i++) {
      const cx = 4 + ((r() * 24) | 0), cy = 14 + ((r() * 18) | 0), rw = 3 + ((r() * 5) | 0), rh = 2 + ((r() * 4) | 0);
      E(g, '#4a4b50', cx + 1, cy + 1, rw, rh);
      E(g, r() < 0.5 ? '#6e6f74' : '#7e7f84', cx, cy, rw, rh);
    }
    for (let i = 0; i < 4; i++) { const bx = 6 + ((r() * 20) | 0); for (let k = 0; k < 10; k++) R(g, '#8a5a3a', bx + (k >> 2), 20 - k, 1, 1); }
    for (const [x, y] of [[8, 10], [20, 8], [14, 14]]) { R(g, '#c08aff', x, y, 3, 5); R(g, '#7ff8ff', x + 1, y, 1, 3); } // ネオンスポアの けっしょう
    sporeMoss(g, r, 2, 12, 28, 22, 14);
  }, '#121216');

  // かれた 空気じょうか ツリー（4しょうで うごかす）
  SP.airTreeDead = osp(96, 116, (g) => {
    const r = RNG(47);
    R(g, '#3a3c42', 30, 100, 36, 16);
    R(g, '#55575d', 30, 100, 36, 3);
    R(g, '#4a4c52', 40, 40, 16, 62);
    R(g, '#5e6066', 40, 40, 5, 62);
    for (let y = 46; y < 100; y += 8) R(g, '#2e3036', 40, y, 16, 1);
    E(g, '#1e2026', 48, 64, 6, 6);                  // とまった コア（光って いない）
    E(g, '#2e3a44', 48, 64, 4, 4);
    const arm = (x, y, dx, len) => {
      let cx = x, cy = y;
      for (let i = 0; i < len; i++) { R(g, '#4a4c52', Math.round(cx), Math.round(cy), 3, 3); cx += dx; cy -= 1.1; }
      // こわれた ソーラーの は
      for (let k = 0; k < 3; k++) {
        const px = Math.round(cx) - 6 + k * 5, py = Math.round(cy) - 4 - (k % 2) * 3;
        R(g, '#1a2a3a', px, py, 7, 5);
        R(g, '#2c4054', px + 1, py + 1, 5, 1);
        if (r() < 0.5) R(g, '#0e0f12', px + 2, py + 2, 3, 3);
      }
    };
    arm(46, 44, -1.1, 24);
    arm(50, 44, 1.1, 24);
    arm(47, 40, -0.4, 26);
    arm(49, 40, 0.5, 26);
    arm(46, 56, -1.5, 16);
    arm(50, 56, 1.5, 16);
    for (let i = 0; i < 6; i++) { const x = 30 + ((r() * 36) | 0); for (let k = 0; k < 16; k++) R(g, '#1a1a1e', x + Math.round(Math.sin(k * 0.4) * 2), 100 - k, 1, 1); } // たれた ケーブル
    sporeMoss(g, r, 30, 50, 36, 64, 26);
  }, '#121216');

  SP.benchBroken = osp(32, 24, (g) => {
    R(g, '#5a4a3a', 2, 6, 28, 4);
    R(g, '#6e5a46', 2, 6, 12, 4);
    R(g, '#4a3a2e', 18, 9, 12, 3);                  // おれた いた
    R(g, '#3a3a3e', 4, 10, 3, 12);
    R(g, '#3a3a3e', 25, 12, 3, 10);
    R(g, '#5a4a3a', 2, 14, 26, 3);
    R(g, '#8a4a2a', 8, 15, 4, 1);
  }, '#121216');

  SP.stump = osp(30, 18, (g) => {
    E(g, '#3a3028', 15, 12, 12, 5);
    E(g, '#5e4a38', 15, 9, 11, 5);
    E(g, '#7a6248', 15, 8, 8, 3);
    E(g, '#5e4a38', 15, 8, 4, 1);
    R(g, '#3f86a0', 6, 12, 2, 2);
    R(g, '#7ff8ff', 6, 12, 1, 1);
  }, '#1a1612');

  // みなとの こわれた ボート（3しょうで なおして もらう）
  SP.boatBroken = osp(64, 36, (g) => {
    const r = RNG(53);
    for (let y = 0; y < 14; y++) {
      const inset = Math.round(y * 0.7);
      R(g, y < 4 ? '#e8e2d6' : '#3a6a8a', 2 + inset, 18 + y, 60 - inset * 2, 1);
    }
    R(g, '#2a4a62', 4, 26, 56, 2);
    R(g, '#1a1a1e', 30, 22, 8, 6);                  // あな
    R(g, '#5a6a72', 18, 6, 22, 12);                 // キャビン
    R(g, '#0e0f12', 21, 8, 7, 6);
    R(g, '#0e0f12', 30, 8, 7, 6);
    R(g, '#3a3a3e', 40, 0, 2, 18);                  // おれた マスト
    for (let i = 0; i < 10; i++) R(g, r() < 0.5 ? '#a8582e' : '#7a3a20', 6 + ((r() * 52) | 0), 20 + ((r() * 10) | 0), 3, 1);
    sporeMoss(g, r, 6, 20, 52, 10, 8);
  }, '#121216');
}

// ---------- 2しょう：カワウソ・ろかそうち・あたらしい さくもつ と さかな ----------

// 青く 光る オイル草（ほそながい は が 光る）
function oilGrass(g, x0, y0, h, n, r) {
  for (let k = 0; k < n; k++) {
    const x = x0 + k * 4 - (n * 2), d = (k - (n - 1) / 2) * 0.35, len = h - Math.abs(k - (n - 1) / 2) * 3;
    for (let i = 0; i < len; i++) {
      const cx = Math.round(x + d * i * 0.6), cy = y0 - i;
      R(g, i < len - 4 ? '#1f6a9a' : '#3fa8e0', cx, cy, 2, 1);
      if (i % 3 === 0) R(g, '#7fe8ff', cx, cy, 1, 1);
    }
    R(g, '#bff6ff', Math.round(x + d * len * 0.6), y0 - len, 1, 1);
  }
  for (let i = 0; i < 5; i++) R(g, 'rgba(127,232,255,.55)', x0 - 8 + ((r() * 16) | 0), y0 - 4 - ((r() * h) | 0), 1, 1);
}

function buildCh2() {
  const r = RNG(61);
  // オイル草（はたけ・プランターの さいご の すがた と、そとに さいている もの）
  SP.crop_nanohana_3 = osp(32, 40, (g) => oilGrass(g, 16, 38, 26, 5, r));
  SP.wild = osp(30, 36, (g) => oilGrass(g, 15, 35, 28, 5, r));
  ICON.c_nanohana = oicon((g) => {
    oilGrass(g, 15, 27, 22, 5, r);
    R(g, '#8a6a48', 9, 22, 13, 3);              // たば ねた ひも
  }, '#0e2a3a');
  ICON.seed_nanohana = oicon((g) => {
    R(g, '#c9b088', 3, 2, 24, 27);
    R(g, '#f6eedb', 4, 3, 22, 25);
    R(g, '#3fa8e0', 4, 3, 22, 7);
    oilGrass(g, 15, 25, 12, 3, r);
  }, '#5a4228');

  // ライトかぶ：まるくて しろく、ほんのり 光る
  const turnip = SP.crop_turnip_3;
  SP.crop_turnip_3 = make(turnip.width, turnip.height, (g) => {
    E(g, 'rgba(255,244,180,.35)', 17, 32, 11, 9);
    g.drawImage(turnip, 0, 0);
    for (const [x, y] of [[8, 30], [26, 28], [17, 22], [12, 38]]) R(g, '#fff4b0', x, y, 1, 1);
  });

  // でんきニンジン（黄色く ピカピカ）
  SP.crop_dcarrot_3 = osp(32, 40, (g) => {
    for (const a of [-0.6, -0.2, 0.2, 0.6]) {
      const dx = Math.sin(a), dy = -Math.cos(a);
      for (let i = 0; i < 15; i++) R(g, i % 3 ? '#3f8a32' : '#86cf5e', Math.round(16 + dx * i), Math.round(29 + dy * i), 2, 1);
    }
    E(g, 'rgba(255,230,80,.45)', 16, 32, 9, 5);
    E(g, '#e8c21a', 16, 32, 6, 3);
    R(g, '#fff07a', 12, 30, 6, 1);
    R(g, '#a88a10', 12, 34, 9, 1);
    for (const [x, y] of [[8, 28], [24, 30], [16, 24]]) { R(g, '#fff07a', x, y, 1, 3); R(g, '#fff07a', x - 1, y + 1, 3, 1); }
    R(g, '#5e3820', 9, 35, 15, 2);
  });
  ICON.c_dcarrot = oicon((g) => {
    for (let i = 0; i < 18; i++) {
      const w = Math.max(1, Math.round(5 - i * 0.26));
      R(g, '#e8c21a', 19 - i - w + 1, 9 + i - w + 1, w * 2, w * 2 - 1);
    }
    for (let i = 0; i < 16; i++) R(g, '#fff07a', 16 - i, 8 + i, 1, 1);
    R(g, '#3f8a32', 20, 3, 2, 7); R(g, '#86cf5e', 23, 4, 2, 6);
    for (const [x, y] of [[4, 6], [26, 16], [10, 26]]) { R(g, '#fff07a', x, y, 1, 3); R(g, '#fff07a', x - 1, y + 1, 3, 1); }
  });
  // ネオンひまわり（大きな 花が ネオン色に 光る）
  SP.crop_sunflower_3 = osp(36, 56, (g) => {
    R(g, '#2c6624', 17, 22, 3, 34);
    leaf(g, 17, 46, 9, -1.4, '#3f8a32', '#5fae45');
    leaf(g, 19, 38, 9, 1.4, '#3f8a32', '#5fae45');
    E(g, 'rgba(255,79,216,.35)', 18, 14, 15, 13);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      E(g, k % 2 ? '#ffd23f' : '#ff9a3f', Math.round(18 + Math.cos(a) * 9), Math.round(14 + Math.sin(a) * 8), 3, 3);
    }
    E(g, '#5a3a1a', 18, 14, 6, 5);
    E(g, '#7a5228', 17, 13, 4, 3);
    E(g, '#5ff6ff', 18, 14, 6, 5); E(g, '#5a3a1a', 18, 14, 5, 4); // ネオンの わ
    for (let k = 0; k < 6; k++) R(g, '#3a2210', 15 + (k % 3) * 2, 12 + (k >> 1), 1, 1);
  });
  ICON.c_sunflower = oicon((g) => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      E(g, k % 2 ? '#ffd23f' : '#ff9a3f', Math.round(15 + Math.cos(a) * 9), Math.round(14 + Math.sin(a) * 9), 3, 3);
    }
    E(g, '#5ff6ff', 15, 14, 6, 6);
    E(g, '#5a3a1a', 15, 14, 5, 5);
    R(g, '#2c6624', 14, 24, 2, 6);
  });
  for (const [id, col] of [['dcarrot', '#e8c21a'], ['sunflower', '#ff9a3f']]) {
    ICON[`seed_${id}`] = oicon((g) => {
      R(g, '#c9b088', 3, 2, 24, 27);
      R(g, '#f6eedb', 4, 3, 22, 25);
      R(g, col, 4, 3, 22, 7);
      g.drawImage(ICON[`c_${id}`], 7, 9, 16, 16);
    }, '#5a4228');
  }

  // さびた 歯車（水ろの そこ）
  ICON.m_gear = oicon((g) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      R(g, '#7a5a3a', Math.round(15 + Math.cos(a) * 11) - 2, Math.round(15 + Math.sin(a) * 11) - 2, 5, 5);
    }
    E(g, '#8a6a48', 15, 15, 10, 10);
    E(g, '#a87a4e', 13, 13, 6, 6);
    E(g, '#3a2a1a', 15, 15, 3, 3);
    for (const [x, y] of [[8, 18], [20, 9], [19, 21]]) R(g, '#c07a44', x, y, 3, 2);
  }, '#2a1a0a');

  // 海の いきもの：カニ と タコ
  ICON.f_kani = oicon((g) => {
    E(g, '#b5221a', 15, 18, 10, 6);
    E(g, '#e2392c', 15, 17, 9, 5);
    for (const x of [6, 24]) { E(g, '#e2392c', x, 9, 4, 3); R(g, '#b5221a', x - 1, 11, 3, 5); }
    for (let k = 0; k < 3; k++) { R(g, '#b5221a', 4 + k * 2, 22 + k, 4, 1); R(g, '#b5221a', 22 - k * 2, 22 + k, 4, 1); }
    R(g, '#ffffff', 12, 13, 2, 2); R(g, '#ffffff', 17, 13, 2, 2);
    R(g, '#1a1a1a', 12, 14, 1, 1); R(g, '#1a1a1a', 18, 14, 1, 1);
    R(g, '#5ff6ff', 14, 19, 3, 1);                // でんきの ひかり
  });
  ICON.f_tako = oicon((g) => {
    E(g, '#8a3a9a', 15, 11, 9, 8);
    E(g, '#b05ac2', 14, 10, 7, 6);
    for (let k = 0; k < 6; k++) {
      const x = 5 + k * 4;
      for (let y = 17; y < 27; y++) R(g, '#8a3a9a', x + Math.round(Math.sin(y * 0.6 + k) * 1.5), y, 2, 1);
    }
    R(g, '#ffffff', 11, 10, 2, 3); R(g, '#ffffff', 17, 10, 2, 3);
    R(g, '#1a1a1a', 12, 11, 1, 2); R(g, '#1a1a1a', 18, 11, 1, 2);
    R(g, '#ff9ae8', 9, 6, 2, 2);
  });

  // サイバーカワウソ（ゴーグル と せなかの 水タンク）。weak：ネオンスポアまみれで たおれている
  const otter = (weak) => osp(32, weak ? 24 : 40, (g) => {
    const fur = weak ? '#6a5a50' : '#8a6040', furL = weak ? '#8a7a70' : '#b0845a', belly = '#e8d2b0';
    if (weak) {
      E(g, fur, 16, 15, 13, 6);
      E(g, belly, 14, 17, 8, 3);
      E(g, fur, 5, 12, 5, 4);
      R(g, '#2a1a10', 3, 11, 2, 1);                // とじた 目
      R(g, '#3a2a20', 26, 16, 6, 2);                // しっぽ
      sporeMoss(g, r, 4, 8, 26, 12, 16);
      return;
    }
    R(g, '#3d434c', 20, 14, 8, 14);                 // 水タンク
    R(g, '#5ff6ff', 21, 16, 6, 8);
    R(g, '#8a929e', 20, 14, 8, 2);
    R(g, fur, 24, 30, 6, 4);                        // しっぽ
    E(g, fur, 15, 26, 9, 11);
    E(g, belly, 14, 28, 5, 8);
    E(g, fur, 15, 11, 8, 7);                        // あたま
    E(g, furL, 13, 9, 4, 3);
    E(g, belly, 15, 14, 4, 3);
    R(g, '#2a1a10', 14, 13, 3, 2);                  // はな
    R(g, '#3d434c', 7, 7, 17, 4);                   // ゴーグル
    E(g, '#5ff6ff', 11, 9, 2, 1); E(g, '#5ff6ff', 19, 9, 2, 1);
    R(g, '#bffcff', 10, 8, 1, 1); R(g, '#bffcff', 18, 8, 1, 1);
    E(g, fur, 8, 4, 2, 2); E(g, fur, 22, 4, 2, 2);  // みみ
    R(g, fur, 8, 26, 3, 6); R(g, fur, 20, 26, 3, 6); // て
    R(g, '#4a3020', 10, 36, 4, 3); R(g, '#4a3020', 17, 36, 4, 3);
  }, '#2a1a10');
  SP.otter = otter(false);
  SP.otterWeak = otter(true);
  SP.otterHop = make(SP.otter.width, SP.otter.height + 2, (g) => g.drawImage(SP.otter, 0, 0));

  // なおった ろかそうち（みどりの ランプ・きれいな 水が ながれる）
  SP.filterOk = osp(62, 64, (g) => {
    R(g, '#4a5058', 4, 18, 46, 46);
    R(g, '#6a7078', 6, 18, 42, 3);
    R(g, '#3d434c', 50, 34, 12, 8);
    R(g, '#5fd8ea', 52, 36, 10, 4);                 // きれいな 水
    R(g, '#3d434c', 18, 4, 14, 16);
    E(g, '#5d6470', 25, 6, 8, 4);
    R(g, '#14161e', 12, 28, 30, 18);
    for (let y = 30; y < 44; y += 3) R(g, '#3fa8d8', 14, y, 26, 1);
    R(g, '#7dff9a', 40, 50, 6, 4);
    R(g, '#c0ffd0', 41, 51, 2, 1);
    R(g, '#ffd23f', 10, 50, 4, 4);
  }, '#0b0d14');
}

function buildSprites() {
  buildNature();
  buildBuildings();
  buildCh1();
  buildRuins();
  buildAreas();
  buildPlayer();
  buildCrops();
  buildIcons();
  buildCh2(); // さいごに：2しょうの え で うわがき
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
