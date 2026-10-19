'use strict';
// ドット絵は ぜんぶ プログラムで かく（がぞう ファイルは つかわない）。
// SP[なまえ] … マップに かく え、ICON[id] … もちもの・おみせに だす 16×16 の え

const SP = {};
const ICON = {};

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
function speckle(g, seed, cols, n) {
  const r = RNG(seed);
  for (let i = 0; i < n; i++) R(g, cols[(r() * cols.length) | 0], (r() * 16) | 0, (r() * 16) | 0);
}

// ---------- じめん ----------

function buildTiles() {
  for (let i = 0; i < 4; i++) {
    SP[`grass${i}`] = make(16, 16, (g) => {
      R(g, '#74b84e', 0, 0, 16, 16);
      speckle(g, 11 + i, ['#80c35a', '#69ab45', '#7cbf55'], 18);
      const r = RNG(50 + i);
      for (let k = 0; k < 3; k++) {
        const x = 1 + ((r() * 13) | 0);
        const y = 1 + ((r() * 12) | 0);
        R(g, '#5b9a3b', x, y, 1, 2);
        R(g, '#8fd067', x + 1, y, 1, 1);
      }
    });
  }
  SP.path = make(16, 16, (g) => {
    R(g, '#cfa96e', 0, 0, 16, 16);
    speckle(g, 7, ['#bf995d', '#dcb983', '#c4a064'], 24);
    R(g, '#a88653', 4, 10, 2, 1);
    R(g, '#e3c595', 11, 4, 2, 1);
  });
  SP.sand = make(16, 16, (g) => {
    R(g, '#e8d59c', 0, 0, 16, 16);
    speckle(g, 9, ['#d9c386', '#f1e2b2', '#dcc890'], 22);
  });
  SP.floor = make(16, 16, (g) => {
    R(g, '#b98650', 0, 0, 16, 16);
    for (let y = 0; y < 16; y += 4) {
      R(g, '#9c6c3c', 0, y + 3, 16, 1);
      R(g, '#c79560', 0, y, 16, 1);
    }
    R(g, '#9c6c3c', 5, 0, 1, 3);
    R(g, '#9c6c3c', 12, 4, 1, 3);
    R(g, '#9c6c3c', 3, 8, 1, 3);
    R(g, '#9c6c3c', 10, 12, 1, 3);
  });
  SP.wall = make(16, 16, (g) => {
    R(g, '#5c3f28', 0, 0, 16, 16);
    R(g, '#6e4c31', 0, 0, 16, 2);
    R(g, '#4a321f', 0, 14, 16, 2);
  });
  SP.face = make(16, 16, (g) => {
    R(g, '#e3cfa6', 0, 0, 16, 16);
    speckle(g, 3, ['#d8c398', '#ead9b6'], 10);
    R(g, '#8a5a36', 0, 11, 16, 5);
    R(g, '#a06c43', 0, 11, 16, 1);
    R(g, '#6e4527', 0, 15, 16, 1);
  });
  SP.soil = make(16, 16, (g) => {
    R(g, '#8e5c35', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) {
      R(g, '#734726', 1, y, 14, 1);
      R(g, '#a06d43', 1, y + 1, 14, 1);
    }
    R(g, '#7a4c2b', 0, 0, 16, 1);
    R(g, '#7a4c2b', 0, 15, 16, 1);
  });
  SP.soilWet = make(16, 16, (g) => {
    R(g, '#5d3a21', 0, 0, 16, 16);
    for (let y = 2; y < 16; y += 4) {
      R(g, '#482b17', 1, y, 14, 1);
      R(g, '#6e4629', 1, y + 1, 14, 1);
    }
    R(g, '#4c2f1a', 0, 0, 16, 1);
    R(g, '#4c2f1a', 0, 15, 16, 1);
  });
}

// みず（まわりが りくの ところは あわい ふち）。mask: 1上 2右 4下 8左
const WATER = {};
function waterTile(mask, frame) {
  const k = `${mask}_${frame}`;
  if (WATER[k]) return WATER[k];
  WATER[k] = make(16, 16, (g) => {
    R(g, '#3f93d2', 0, 0, 16, 16);
    R(g, '#3a88c4', 0, 8, 16, 8);
    const o = frame * 4;
    R(g, '#6fb8ea', (2 + o) % 16, 4, 4, 1);
    R(g, '#6fb8ea', (9 + o) % 16, 11, 4, 1);
    R(g, '#8fcbf0', (12 + o) % 16, 7, 2, 1);
    const foam = '#a9dcf5';
    if (mask & 1) { R(g, foam, 0, 0, 16, 2); R(g, '#e8d59c', 0, 0, 16, 1); }
    if (mask & 2) R(g, foam, 14, 0, 2, 16);
    if (mask & 4) R(g, foam, 0, 14, 16, 2);
    if (mask & 8) R(g, foam, 0, 0, 2, 16);
  });
  return WATER[k];
}

// ---------- しぜん ----------

function buildNature() {
  SP.tree = make(32, 40, (g) => {
    R(g, 'rgba(0,0,0,.18)', 7, 35, 18, 4);
    R(g, '#6b4423', 13, 24, 6, 14);
    R(g, '#583619', 13, 24, 2, 14);
    R(g, '#6b4423', 11, 36, 10, 2);
    E(g, '#2f7a33', 16, 15, 13, 12);
    E(g, '#3d9440', 15, 13, 11, 10);
    E(g, '#4fab4a', 12, 10, 7, 6);
    E(g, '#6cc35c', 10, 8, 3, 2);
    R(g, '#2a6d2e', 6, 22, 20, 2);
    R(g, '#e85a5a', 21, 14, 2, 2);
    R(g, '#e85a5a', 9, 18, 2, 2);
  });
  SP.pine = make(32, 40, (g) => {
    R(g, 'rgba(0,0,0,.18)', 8, 35, 16, 4);
    R(g, '#5d3b1f', 14, 28, 4, 10);
    for (let i = 0; i < 4; i++) {
      const w = 6 + i * 3;
      E(g, i % 2 ? '#2e6e3a' : '#357d42', 16, 6 + i * 6, w, 4);
    }
    R(g, '#48975a', 12, 6, 3, 2);
  });
  SP.bush = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.18)', 2, 13, 12, 3);
    E(g, '#3d8c3a', 8, 9, 7, 5);
    E(g, '#55a84b', 7, 7, 5, 4);
    R(g, '#f3f0f0', 4, 8, 1, 1);
    R(g, '#f3f0f0', 10, 6, 1, 1);
  });
  SP.weed = make(16, 16, (g) => {
    const blades = [[3, 7, '#4f9434'], [5, 4, '#62aa3f'], [7, 2, '#4a8c31'], [9, 5, '#6cbb47'], [11, 3, '#4f9434'], [12, 7, '#62aa3f']];
    for (const [x, y, c] of blades) {
      R(g, c, x, y, 2, 15 - y);
      R(g, '#86cf5e', x, y, 1, 2);
    }
    R(g, '#3a7428', 2, 13, 12, 2);
  });
  SP.rock = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 13, 13, 3);
    E(g, '#7c8086', 8, 10, 6, 4);
    E(g, '#979ba1', 7, 9, 5, 3);
    R(g, '#b8bcc2', 5, 7, 3, 1);
    R(g, '#62666b', 9, 12, 4, 1);
  });
  const flower = (a, b) => make(16, 16, (g) => {
    for (const [x, y, c] of [[3, 4, a], [10, 6, b], [6, 11, a], [12, 12, b]]) {
      R(g, '#3f8a30', x, y + 1, 1, 2);
      R(g, c, x - 1, y, 3, 1);
      R(g, c, x, y - 1, 1, 3);
      R(g, '#fff3a0', x, y, 1, 1);
    }
  });
  SP.flowerA = flower('#ffffff', '#ffd23f');
  SP.flowerB = flower('#ff8fb5', '#c9a2ff');
  SP.fence = make(16, 20, (g) => {
    R(g, '#8b5e34', 0, 8, 16, 2);
    R(g, '#8b5e34', 0, 13, 16, 2);
    R(g, '#a77445', 0, 8, 16, 1);
    R(g, '#a77445', 0, 13, 16, 1);
    R(g, '#6e4626', 6, 4, 4, 16);
    R(g, '#8b5e34', 6, 4, 3, 15);
    R(g, '#b07c4b', 7, 4, 1, 14);
  });
  SP.sign = make(16, 22, (g) => {
    R(g, '#6e4626', 7, 10, 2, 12);
    R(g, '#a77445', 1, 2, 14, 10);
    R(g, '#8b5e34', 1, 11, 14, 1);
    R(g, '#c8925b', 2, 3, 12, 1);
    R(g, '#4c2f17', 4, 6, 8, 1);
    R(g, '#4c2f17', 4, 8, 6, 1);
  });
}

// ---------- たてもの・どうぐ ----------

function buildBuildings() {
  // おじいちゃんの いえ（そと）96×80、ドアは ひだりから 3マスめ
  SP.house = make(96, 80, (g) => {
    R(g, 'rgba(0,0,0,.2)', 4, 76, 90, 4);
    // かべ
    R(g, '#efdcb8', 4, 34, 88, 42);
    for (let y = 38; y < 70; y += 6) R(g, '#e2cda4', 4, y, 88, 1);
    R(g, '#8a7a66', 4, 68, 88, 8);
    for (let x = 6; x < 92; x += 9) R(g, '#9d8e78', x, 70, 6, 4);
    R(g, '#6e4a2d', 4, 34, 3, 34);
    R(g, '#6e4a2d', 89, 34, 3, 34);
    // まど
    for (const wx of [10, 66]) {
      R(g, '#6e4a2d', wx, 44, 20, 16);
      R(g, '#9fd5ef', wx + 2, 46, 16, 12);
      R(g, '#d4eefa', wx + 3, 47, 5, 3);
      R(g, '#6e4a2d', wx + 9, 46, 2, 12);
      R(g, '#6e4a2d', wx + 2, 51, 16, 2);
      R(g, '#a77445', wx - 1, 60, 22, 3);
      R(g, '#e85a7a', wx + 2, 58, 3, 2);
      R(g, '#ffd23f', wx + 8, 58, 3, 2);
      R(g, '#e85a7a', wx + 14, 58, 3, 2);
    }
    // ドア
    R(g, '#5a3a20', 33, 54, 14, 22);
    R(g, '#8a5a32', 35, 56, 10, 20);
    R(g, '#a06c3e', 36, 57, 3, 18);
    R(g, '#f2c94c', 42, 66, 2, 2);
    R(g, '#c4a77a', 31, 76, 18, 4);
    // やね
    R(g, '#9c3e2c', 0, 10, 96, 26);
    for (let y = 12; y < 36; y += 5) {
      R(g, '#b5533c', 0, y, 96, 3);
      for (let x = (y / 5) % 2 ? 0 : 6; x < 96; x += 12) R(g, '#8a3424', x, y, 1, 3);
    }
    R(g, '#7a2c1e', 0, 33, 96, 3);
    R(g, '#c8664d', 8, 8, 80, 4);
    R(g, '#7a2c1e', 8, 6, 80, 2);
    // えんとつ
    R(g, '#7d6d5e', 70, 0, 10, 12);
    R(g, '#968676', 70, 0, 10, 2);
  });
  // ポポばあちゃんの おみせ 48×46
  SP.stall = make(48, 46, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 42, 46, 4);
    R(g, '#6e4626', 3, 10, 3, 34);
    R(g, '#6e4626', 42, 10, 3, 34);
    // ばあちゃん（うしろに たっている）
    drawGranny(g, 16, 12);
    // カウンター
    R(g, '#8b5e34', 1, 30, 46, 14);
    R(g, '#a77445', 1, 30, 46, 2);
    R(g, '#6e4626', 1, 42, 46, 2);
    for (let x = 4; x < 46; x += 8) R(g, '#7a522c', x, 33, 1, 9);
    // しなもの
    E(g, '#c48a3d', 8, 29, 5, 2);
    R(g, '#f2f2e8', 5, 26, 2, 2); R(g, '#e85a5a', 9, 26, 2, 2); R(g, '#ee8a2c', 7, 25, 2, 2);
    E(g, '#c48a3d', 39, 29, 5, 2);
    R(g, '#f0922a', 36, 25, 3, 3); R(g, '#e0382e', 40, 26, 2, 2);
    // のれん（やね）
    for (let i = 0; i < 6; i++) R(g, i % 2 ? '#f6efe2' : '#d94c3d', i * 8, 2, 8, 9);
    R(g, '#b73a2d', 0, 0, 48, 3);
    for (let i = 0; i < 6; i++) E(g, i % 2 ? '#f6efe2' : '#d94c3d', i * 8 + 4, 11, 4, 1);
  });
  SP.bin = make(32, 22, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 19, 31, 3);
    R(g, '#8b5e34', 1, 6, 30, 14);
    R(g, '#6e4626', 1, 12, 30, 1);
    R(g, '#a77445', 0, 3, 32, 4);
    R(g, '#c8925b', 0, 3, 32, 1);
    R(g, '#6e4626', 12, 4, 8, 1);
    E(g, '#f2c94c', 16, 14, 3, 3);
    R(g, '#c99a28', 16, 12, 1, 5);
  });
  // いえの なか
  SP.bed = make(32, 34, (g) => {
    R(g, '#6e4626', 0, 0, 32, 6);
    R(g, '#8b5e34', 1, 1, 30, 4);
    R(g, '#6e4626', 0, 4, 2, 30);
    R(g, '#6e4626', 30, 4, 2, 30);
    R(g, '#f4efe4', 3, 6, 26, 8);
    R(g, '#dcd5c6', 3, 12, 26, 2);
    R(g, '#5b8fd1', 2, 14, 28, 18);
    R(g, '#7aa8e0', 2, 14, 28, 3);
    for (let x = 4; x < 30; x += 6) for (let y = 19; y < 31; y += 6) R(g, '#4a7cbf', x, y, 2, 2);
    R(g, '#6e4626', 0, 30, 32, 4);
  });
  SP.closet = make(32, 40, (g) => {
    R(g, '#5a3a20', 0, 0, 32, 40);
    R(g, '#8b5e34', 2, 2, 28, 34);
    R(g, '#7a522c', 15, 2, 2, 34);
    R(g, '#a06c3e', 3, 3, 11, 2);
    R(g, '#a06c3e', 18, 3, 11, 2);
    R(g, '#f2c94c', 12, 18, 2, 3);
    R(g, '#f2c94c', 18, 18, 2, 3);
    R(g, '#4a2f1a', 0, 36, 32, 4);
  });
  SP.stove = make(32, 30, (g) => {
    R(g, '#7f7468', 1, 8, 30, 22);
    R(g, '#958a7c', 1, 8, 30, 3);
    R(g, '#2b2420', 8, 17, 16, 10);
    R(g, '#e8823a', 11, 23, 3, 2);
    R(g, '#3a3532', 9, 2, 14, 7);
    R(g, '#55504c', 10, 2, 12, 2);
    R(g, '#3a3532', 21, 4, 5, 2);
  });
  SP.table = make(32, 24, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 20, 28, 4);
    R(g, '#6e4626', 3, 10, 3, 14);
    R(g, '#6e4626', 26, 10, 3, 14);
    R(g, '#a06c3e', 0, 6, 32, 7);
    R(g, '#b98650', 0, 6, 32, 2);
    // しゃしんたて と ゆのみ
    R(g, '#6e4626', 6, 0, 8, 7);
    R(g, '#d8c7a0', 7, 1, 6, 5);
    R(g, '#8a8a8a', 9, 2, 2, 2);
    R(g, '#e8e2d6', 20, 3, 4, 4);
    R(g, '#5a8a4a', 20, 3, 4, 1);
  });
  SP.rug = make(48, 32, (g) => {
    R(g, '#a8423a', 0, 0, 48, 32);
    R(g, '#e9cf8a', 2, 2, 44, 28);
    R(g, '#a8423a', 4, 4, 40, 24);
    R(g, '#c95a4c', 6, 6, 36, 20);
    for (let x = 10; x < 40; x += 8) E(g, '#e9cf8a', x, 16, 2, 2);
  });
  SP.window = make(16, 16, (g) => {
    R(g, '#6e4a2d', 1, 1, 14, 10);
    R(g, '#a8dcf2', 2, 2, 12, 8);
    R(g, '#d8f0fa', 3, 3, 4, 2);
    R(g, '#6e4a2d', 7, 2, 2, 8);
  });
  SP.doorIn = make(16, 16, (g) => {
    R(g, '#3d2716', 0, 0, 16, 16);
    R(g, '#f4e3a8', 2, 0, 12, 16);
    R(g, '#e7d08a', 2, 8, 12, 8);
    R(g, '#c9a45a', 3, 12, 10, 4);
  });
  SP.cobweb = make(16, 16, (g) => {
    const c = 'rgba(240,240,240,.55)';
    for (let i = 0; i < 12; i++) { R(g, c, i, 0); R(g, c, 0, i); R(g, c, i, i); }
    for (const r of [4, 8]) for (let i = 0; i <= r; i++) R(g, c, i, r - i);
  });
  // がらくた
  SP.c_box = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 13, 15, 3);
    R(g, '#c9995a', 2, 4, 12, 11);
    R(g, '#b5854a', 2, 9, 12, 6);
    R(g, '#dcb070', 2, 4, 12, 2);
    R(g, '#e8dcb8', 7, 4, 2, 6);
    R(g, 'rgba(200,200,190,.6)', 3, 3, 5, 1);
  });
  SP.c_news = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 13, 15, 3);
    for (let i = 0; i < 4; i++) {
      R(g, i % 2 ? '#e4ddc8' : '#d2c9ae', 2 + (i % 2), 12 - i * 2, 12, 2);
      R(g, '#9a937e', 4 + (i % 2), 12 - i * 2, 6, 1);
    }
    R(g, '#b14a3a', 3, 5, 10, 1);
  });
  SP.c_pot = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 13, 13, 3);
    E(g, '#a5643a', 8, 9, 5, 5);
    R(g, '#8a4e2a', 5, 3, 6, 2);
    R(g, '#c27f50', 5, 7, 2, 3);
    R(g, '#4a2a16', 9, 6, 1, 2); R(g, '#4a2a16', 10, 8, 1, 2); R(g, '#4a2a16', 9, 10, 1, 2);
  });
  SP.c_boots = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 13, 15, 3);
    for (const x of [2, 8]) {
      R(g, '#3f6a3a', x, 4, 4, 9);
      R(g, '#3f6a3a', x, 11, 6, 3);
      R(g, '#5a8a52', x, 4, 4, 1);
    }
  });
  SP.c_bucket = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 13, 13, 3);
    R(g, '#8c939a', 3, 5, 10, 9);
    R(g, '#a9b0b6', 3, 5, 10, 2);
    R(g, '#8a5a36', 4, 9, 2, 2); R(g, '#8a5a36', 10, 11, 2, 2);
    R(g, '#5c6268', 2, 1, 1, 5); R(g, '#5c6268', 13, 1, 1, 5); R(g, '#5c6268', 2, 1, 12, 1);
  });
  SP.c_cloth = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 13, 15, 3);
    E(g, '#5a7bb0', 8, 11, 7, 3);
    E(g, '#7092c4', 7, 9, 5, 2);
    R(g, '#e9e2d0', 5, 9, 2, 1); R(g, '#e9e2d0', 10, 11, 2, 1);
  });
  SP.c_kettle = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 2, 13, 13, 3);
    E(g, '#3b3a3a', 8, 10, 5, 4);
    R(g, '#3b3a3a', 12, 7, 3, 2);
    R(g, '#2a2828', 5, 3, 1, 4); R(g, '#2a2828', 10, 3, 1, 4); R(g, '#2a2828', 5, 3, 6, 1);
    R(g, '#5a5858', 6, 8, 3, 1);
  });
  SP.c_book = make(16, 16, (g) => {
    R(g, 'rgba(0,0,0,.2)', 1, 13, 15, 3);
    R(g, '#8c3a3a', 2, 10, 12, 3); R(g, '#e8e0cc', 3, 11, 10, 1);
    R(g, '#3a5a8c', 3, 7, 11, 3); R(g, '#e8e0cc', 4, 8, 9, 1);
    R(g, '#3a7a4a', 2, 4, 10, 3); R(g, '#e8e0cc', 3, 5, 8, 1);
  });
  SP.bobber = make(5, 5, (g) => {
    R(g, '#ffffff', 1, 0, 3, 2);
    R(g, '#e8342e', 1, 2, 3, 2);
    R(g, '#e8342e', 0, 2, 5, 1);
  });
}

function drawGranny(g, x, y) {
  R(g, '#f2f2f2', x + 4, y, 8, 3);       // おだんごの かみ
  E(g, '#e8e8e8', x + 8, y + 1, 3, 2);
  R(g, '#e3e3e3', x + 3, y + 3, 10, 3);
  R(g, '#f3c9a0', x + 4, y + 5, 8, 6);
  R(g, '#2b1d12', x + 5, y + 7, 2, 1);
  R(g, '#2b1d12', x + 9, y + 7, 2, 1);
  R(g, '#e8908a', x + 4, y + 9, 1, 1);
  R(g, '#e8908a', x + 11, y + 9, 1, 1);
  R(g, '#8a4a7a', x + 2, y + 11, 12, 8);  // きもの
  R(g, '#f4ead0', x + 5, y + 12, 6, 7);   // エプロン
}

// ---------- しゅじんこう（16×24。むぎわら ぼうし と オーバーオール） ----------

function playerSprite(dir, f) {
  return make(16, 24, (g) => {
    const skin = '#f6cfa6', hat = '#f0cc5c', hatD = '#d4a637', band = '#c0392b', hair = '#6a4426';
    const shirt = '#fbf3e0', ov = '#3f74b8', ovD = '#2f5a94', shoe = '#5a3a22', eye = '#2b1d12';
    R(g, 'rgba(0,0,0,.2)', 3, 22, 10, 2);
    if (dir === 'side') {
      // あし
      const a = f === 1 ? -2 : f === 2 ? 2 : 0;
      R(g, ovD, 6 - a, 18, 3, 4); R(g, shoe, 5 - a, 21, 4, 2);
      R(g, ov, 7 + a, 18, 3, 4); R(g, shoe, 6 + a, 21, 4, 2);
      // からだ
      R(g, shirt, 5, 11, 7, 4);
      R(g, ov, 5, 13, 7, 6);
      R(g, ovD, 5, 18, 7, 1);
      R(g, skin, 7 + (f === 1 ? 1 : f === 2 ? -1 : 0), 13, 3, 4); // うで
      // かお
      R(g, hair, 7, 5, 6, 6);
      R(g, skin, 3, 5, 7, 6);
      R(g, eye, 4, 7, 1, 2);
      R(g, '#f0a090', 5, 9, 2, 1);
      // ぼうし
      R(g, hatD, 0, 3, 15, 2);
      R(g, hat, 3, 0, 10, 4);
      R(g, band, 3, 3, 10, 1);
      return;
    }
    const l = f === 1 ? 1 : 0, r = f === 2 ? 1 : 0;
    R(g, ov, 5, 18 - l, 3, 4); R(g, shoe, 4, 21 - l, 4, 2);
    R(g, ov, 8, 18 - r, 3, 4); R(g, shoe, 8, 21 - r, 4, 2);
    R(g, shirt, 3, 11, 10, 4);
    R(g, ov, 4, 13, 8, 6);
    R(g, ovD, 4, 18, 8, 1);
    R(g, skin, 2, 12 + r, 2, 4);
    R(g, skin, 12, 12 + l, 2, 4);
    if (dir === 'down') {
      R(g, ov, 5, 11, 1, 2); R(g, ov, 10, 11, 1, 2);
      R(g, '#f2c94c', 5, 14, 1, 1); R(g, '#f2c94c', 10, 14, 1, 1);
      R(g, hair, 3, 5, 10, 2);
      R(g, skin, 4, 5, 8, 6);
      R(g, eye, 5, 7, 1, 2); R(g, eye, 10, 7, 1, 2);
      R(g, '#f0a090', 4, 9, 2, 1); R(g, '#f0a090', 10, 9, 2, 1);
      R(g, '#c9705a', 7, 9, 2, 1);
    } else {
      R(g, ov, 5, 11, 1, 3); R(g, ov, 10, 11, 1, 3);
      R(g, hair, 3, 5, 10, 6);
      R(g, '#5a3820', 4, 9, 8, 1);
    }
    R(g, hatD, 1, 3, 14, 3);
    R(g, hat, 4, 0, 8, 4);
    R(g, band, 4, 3, 8, 1);
    R(g, '#f8dc80', 5, 0, 3, 1);
  });
}

function buildPlayer() {
  for (let f = 0; f < 3; f++) {
    SP[`p_down_${f}`] = playerSprite('down', f);
    SP[`p_up_${f}`] = playerSprite('up', f);
    SP[`p_left_${f}`] = playerSprite('side', f);
    SP[`p_right_${f}`] = flipX(SP[`p_left_${f}`]);
  }
}

// ---------- さくもつ（そだつ すがた 0〜3） ----------

function cropSprite(id, st) {
  return make(16, 16, (g) => {
    const lf = '#4fa03a', lf2 = '#6cc04f', dk = '#3a7f2a';
    if (st === 0) {
      R(g, '#6e4527', 6, 9, 4, 2);
      R(g, '#efe1a8', 7, 9, 1, 1); R(g, '#efe1a8', 9, 10, 1, 1);
      return;
    }
    if (st === 1) {
      R(g, dk, 7, 9, 2, 4);
      R(g, lf, 4, 7, 3, 2); R(g, lf2, 9, 7, 3, 2);
      return;
    }
    if (st === 2) {
      R(g, dk, 7, 6, 2, 8);
      R(g, lf, 3, 7, 4, 2); R(g, lf2, 9, 5, 4, 2);
      R(g, lf, 4, 10, 3, 2); R(g, lf2, 9, 9, 4, 2);
      return;
    }
    if (id === 'turnip') {
      R(g, lf, 5, 1, 2, 7); R(g, lf2, 8, 0, 2, 8); R(g, lf, 10, 2, 2, 6);
      E(g, '#f4efe6', 8, 11, 4, 3);
      R(g, '#b05ac2', 4, 8, 9, 2);
      R(g, '#ffffff', 6, 11, 2, 1);
    } else if (id === 'carrot') {
      for (const x of [4, 7, 10]) { R(g, lf, x, 1, 2, 8); R(g, lf2, x - 1, 3, 1, 2); R(g, lf2, x + 2, 5, 1, 2); }
      R(g, '#ee8a2c', 5, 9, 6, 3);
      R(g, '#d96a10', 6, 12, 4, 2);
      R(g, '#f6a85a', 6, 9, 2, 1);
    } else if (id === 'tomato') {
      R(g, '#a77445', 12, 0, 1, 15);
      E(g, dk, 7, 7, 6, 6);
      E(g, lf, 7, 6, 5, 5);
      for (const [x, y] of [[4, 5], [9, 3], [8, 9], [3, 10]]) { E(g, '#e0382e', x, y, 2, 2); R(g, '#ff8a80', x - 1, y - 1, 1, 1); }
    } else {
      R(g, lf, 0, 11, 5, 3); R(g, lf2, 12, 10, 4, 3);
      E(g, '#f0922a', 8, 10, 6, 4);
      R(g, '#c46a12', 5, 7, 1, 7); R(g, '#c46a12', 10, 7, 1, 7);
      R(g, '#f8b85a', 4, 8, 2, 2);
      R(g, '#5a7a2a', 7, 4, 2, 3);
    }
  });
}

function buildCrops() {
  for (const id of Object.keys(CROPS)) for (let st = 0; st < 4; st++) SP[`crop_${id}_${st}`] = cropSprite(id, st);
}

// ---------- アイコン ----------

function fishIcon(f) {
  return make(16, 16, (g) => {
    const [body, belly, fin] = f.col;
    if (f.kind === 'eel') {
      for (let x = 1; x < 15; x++) {
        const y = 8 + Math.round(Math.sin(x * 0.7) * 2);
        R(g, body, x, y - 1, 1, 2);
        R(g, belly, x, y + 1, 1, 1);
      }
      R(g, '#ffffff', 2, 7 + Math.round(Math.sin(1.4) * 2) - 1, 1, 1);
      return;
    }
    const rx = f.kind === 'thin' ? 6 : 3 + f.size;
    const ry = f.kind === 'thin' ? 1 : 1 + f.size;
    const cx = 7, cy = 8;
    // しっぽ
    for (let i = 0; i < 3 + (f.size > 1 ? 1 : 0); i++) R(g, fin, cx + rx - 1 + i, cy - i - 1, 1, i * 2 + 2);
    E(g, body, cx, cy, rx, ry);
    for (let y = 1; y <= ry; y++) {
      const dx = Math.round((rx - 1) * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.25))));
      R(g, belly, cx - dx, cy + y, dx * 2 + 1, 1);
    }
    R(g, fin, cx - 1, cy - ry - 1, 3, 1); // せびれ
    R(g, '#ffffff', cx - rx + 1, cy - 1, 2, 2);
    R(g, '#1a1a1a', cx - rx + 1, cy - 1, 1, 1);
    if (f.kind === 'cat' || f.kind === 'thin') {
      R(g, '#2a2a2a', cx - rx - 2, cy + 1, 3, 1);
      R(g, '#2a2a2a', cx - rx - 1, cy + 2, 2, 1);
    }
    if (f.kind === 'round' && f.size === 3) { R(g, '#ffffff', cx - 1, cy - 2, 3, 2); R(g, '#d85a1a', cx + 2, cy, 2, 2); }
  });
}

function cropIcon(id) {
  return make(16, 16, (g) => {
    if (id === 'turnip') {
      R(g, '#4fa03a', 5, 1, 2, 5); R(g, '#6cc04f', 8, 0, 2, 6); R(g, '#4fa03a', 10, 2, 2, 4);
      E(g, '#f4efe6', 8, 10, 5, 4);
      R(g, '#b05ac2', 4, 6, 9, 2);
      R(g, '#d8d0c4', 8, 14, 1, 2);
      R(g, '#ffffff', 5, 9, 2, 2);
    } else if (id === 'carrot') {
      R(g, '#4fa03a', 9, 0, 2, 5); R(g, '#6cc04f', 12, 1, 2, 4);
      for (let i = 0; i < 9; i++) R(g, '#ee8a2c', 3 + i, 13 - i, 3, 3);
      R(g, '#d96a10', 6, 10, 2, 1); R(g, '#d96a10', 9, 7, 2, 1);
    } else if (id === 'tomato') {
      E(g, '#e0382e', 8, 9, 6, 5);
      R(g, '#ff8a80', 4, 7, 2, 2);
      R(g, '#3f8a30', 6, 3, 5, 2); R(g, '#3f8a30', 8, 1, 1, 3);
    } else {
      E(g, '#f0922a', 8, 10, 7, 5);
      R(g, '#c46a12', 4, 6, 1, 9); R(g, '#c46a12', 8, 5, 1, 10); R(g, '#c46a12', 12, 6, 1, 9);
      R(g, '#f8b85a', 2, 8, 2, 3);
      R(g, '#5a7a2a', 7, 2, 3, 4);
    }
  });
}

function seedIcon(id) {
  const col = { turnip: '#b05ac2', carrot: '#ee8a2c', tomato: '#e0382e', pumpkin: '#f0922a' }[id];
  return make(16, 16, (g) => {
    R(g, '#a88a5a', 2, 1, 12, 14);
    R(g, '#f4ead0', 3, 2, 10, 12);
    R(g, col, 3, 2, 10, 3);
    const ic = cropIcon(id);
    g.drawImage(ic, 4, 5, 8, 8);
    R(g, '#a88a5a', 3, 13, 10, 1);
  });
}

function buildIcons() {
  ICON.rod1 = make(16, 16, (g) => {
    for (let i = 0; i < 12; i++) R(g, i % 4 === 2 ? '#5a4128' : '#8a6a48', 2 + i, 13 - i, 2, 2);
    R(g, '#d8d8d8', 14, 2, 1, 7);
    R(g, '#e8342e', 13, 9, 3, 2);
  });
  ICON.rod2 = make(16, 16, (g) => {
    for (let i = 0; i < 12; i++) R(g, i % 3 === 0 ? '#a8843e' : '#d8b768', 2 + i, 13 - i, 2, 2);
    R(g, '#555b60', 4, 9, 4, 4);
    R(g, '#8a9096', 5, 10, 2, 2);
    R(g, '#ffffff', 14, 2, 1, 7);
    R(g, '#e8342e', 13, 9, 3, 2);
  });
  ICON.net = make(16, 16, (g) => {
    for (let i = 0; i < 7; i++) R(g, '#8a6a48', 1 + i, 14 - i, 2, 2);
    E(g, '#c9b27a', 10, 5, 5, 5);
    E(g, '#eef3e2', 10, 5, 4, 4);
    for (let i = -3; i <= 3; i += 2) { R(g, '#c9d4b8', 10 + i, 2, 1, 7); R(g, '#c9d4b8', 7, 5 + i, 7, 1); }
  });
  ICON.hoe = make(16, 16, (g) => {
    for (let i = 0; i < 11; i++) R(g, '#8a6a48', 2 + i, 14 - i, 2, 2);
    R(g, '#8a6a5a', 9, 2, 6, 3);
    R(g, '#b0662e', 10, 2, 3, 1);
    R(g, '#8a6a5a', 12, 5, 3, 4);
    R(g, '#a0603a', 13, 6, 1, 2);
  });
  ICON.can = make(16, 16, (g) => {
    R(g, '#4a86c8', 4, 6, 8, 8);
    R(g, '#6ea4dc', 4, 6, 8, 2);
    R(g, '#3a6ea8', 4, 13, 8, 1);
    for (let i = 0; i < 4; i++) R(g, '#4a86c8', 12 + i, 8 - i, 1, 2);
    R(g, '#6ea4dc', 14, 3, 2, 2);
    R(g, '#3a6ea8', 1, 7, 3, 1); R(g, '#3a6ea8', 1, 7, 1, 5); R(g, '#3a6ea8', 1, 11, 3, 1);
    R(g, '#3a6ea8', 6, 4, 4, 2);
  });
  ICON.coin = make(16, 16, (g) => {
    E(g, '#c99a28', 8, 8, 6, 6);
    E(g, '#f2c94c', 8, 8, 5, 5);
    R(g, '#c99a28', 7, 5, 2, 6);
    R(g, '#fff0b0', 5, 5, 2, 2);
  });
  ICON.stone = make(16, 16, (g) => {
    E(g, '#7c8086', 8, 9, 6, 4);
    E(g, '#979ba1', 7, 8, 5, 3);
    R(g, '#b8bcc2', 5, 6, 3, 1);
  });
  ICON.j_can = make(16, 16, (g) => {
    R(g, '#9aa3ab', 5, 3, 7, 11);
    R(g, '#c0c8cf', 5, 3, 7, 1);
    R(g, '#c0392b', 5, 6, 7, 4);
    R(g, '#ffffff', 7, 7, 3, 1);
    R(g, '#6c7480', 6, 2, 5, 1);
  });
  ICON.j_boot = make(16, 16, (g) => {
    R(g, '#6e4a2d', 4, 2, 6, 10);
    R(g, '#6e4a2d', 4, 10, 10, 4);
    R(g, '#8b5e34', 5, 3, 2, 8);
    R(g, '#4a2f1a', 4, 13, 10, 1);
  });
  for (const [k, f] of Object.entries(FISH)) ICON[`f_${k}`] = fishIcon(f);
  for (const k of Object.keys(CROPS)) {
    ICON[`c_${k}`] = cropIcon(k);
    ICON[`seed_${k}`] = seedIcon(k);
  }
}

function buildSprites() {
  buildTiles();
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
