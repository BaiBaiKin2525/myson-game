'use strict';
// つりの カットイン：うきの まわりを まうえから みた え。
// さかなの かげが よってくる → えさを つつく（まえあたり）→ くいついて はしる（ほんあたり）→ あばれる（リール）

const CUT = { W: 160, H: 100, g: null, bg: null, f: null, flee: 0 };
const CB = { x: 80, y: 50 }; // うきの ばしょ

function cutinInit() {
  if (CUT.g) return;
  const c = $('cutin');
  c.width = CUT.W;
  c.height = CUT.H;
  CUT.g = c.getContext('2d');
  CUT.bg = make(CUT.W, CUT.H, (g) => {
    const WA = ['#24609a', '#2a6aa6', '#3179b6', '#3b8ac4', '#4c9fd2', '#5fb0dc'];
    for (let y = 0; y < CUT.H; y++) {
      for (let x = 0; x < CUT.W; x++) {
        const t = fbm(x / 26, y / 26) * 0.8 + (1 - y / CUT.H) * 0.3 - 0.05 + (BAYER[y & 3][x & 3] / 16 - 0.5) * 0.18;
        R(g, pickTone(WA, t), x, y);
      }
    }
    // そこの いし と みずくさ
    const r = RNG(12);
    for (let i = 0; i < 9; i++) {
      const x = (r() * CUT.W) | 0, y = (r() * CUT.H) | 0;
      if (Math.hypot(x - CB.x, y - CB.y) < 22) continue;
      E(g, 'rgba(20,50,80,.45)', x + 1, y + 1, 4, 3);
      E(g, 'rgba(110,140,150,.5)', x, y, 4, 3);
    }
    for (const [x0, y0, len, d] of [[6, 98, 30, -0.3], [12, 98, 22, 0.2], [150, 98, 26, 0.3], [4, 70, 18, 0.5]]) {
      for (let i = 0; i < len; i++) {
        const x = Math.round(x0 + Math.sin(i * 0.3) * 2 + d * i), y = y0 - i;
        R(g, i % 4 ? '#2f6a4a' : '#3f8a5a', x, y, 2, 1);
      }
    }
    g.drawImage(SP.lily, 128, 6);
    g.drawImage(SP.lotus, 6, 8);
  });
}

// さかなの おおきさと うごきの よてい
function cutinStart(f) {
  cutinInit();
  CUT.flee = 0;
  const s = f.spec;
  let L = 6, W = 4;
  if (!f.junk) {
    L = [9, 13, 18][s.size - 1] * (s.kind === 'eel' ? 1.4 : 1);
    W = L * { round: 0.42, thin: 0.24, cat: 0.46, eel: 0.15 }[s.kind];
  }
  const a0 = Math.random() * Math.PI * 2;
  const d = [Math.cos(a0), Math.sin(a0)];
  const run = Math.random() < 0.5 ? 0.9 : -0.9;
  return {
    L, W, a0, d,
    start: [CB.x + d[0] * 120, CB.y + d[1] * 90],
    hold: [CB.x + d[0] * (L + 10), CB.y + d[1] * (L + 10)],
    run: [Math.cos(a0 + Math.PI + run), Math.sin(a0 + Math.PI + run)],
    pos: [CB.x + d[0] * 120, CB.y + d[1] * 90], ang: a0 + Math.PI, alpha: 0,
    rings: [{ t: G.time, r: 2, sp: 22, life: 0.8 }], bubbles: [], nextIdle: G.time + 1,
  };
}

function cutinEvent(f, kind) {
  const c = f.cut, now = G.time;
  if (kind === 'nibble') c.rings.push({ t: now, r: 3, sp: 18, life: 0.7 });
  if (kind === 'bite' || kind === 'hit') {
    c.rings.push({ t: now, r: 3, sp: 34, life: 0.9 }, { t: now + 0.12, r: 2, sp: 26, life: 0.9 });
    for (let i = 0; i < 10; i++) c.bubbles.push({ x: CB.x + rnd(-6, 6), y: CB.y + rnd(-5, 5), t: now + i * 0.05, life: 0.8 });
  }
  if (kind === 'reel') c.rings.push({ t: now, r: 4, sp: 30, life: 0.8 });
}

function cutinFlee(f) {
  if (!f.cut) return;
  CUT.f = f;
  CUT.flee = 0.8;
}

// さかなの かげ（まうえから）。u＝あたまの ほう、v＝よこ
function drawFishShadow(g, c, junk, eel, time, alpha) {
  const [cx, cy] = c.pos;
  const ca = Math.cos(c.ang), sa = Math.sin(c.ang);
  const L = c.L, W = c.W;
  const reach = Math.ceil(L * 1.5);
  g.fillStyle = `rgba(8,24,40,${alpha})`;
  for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(CUT.H - 1, cy + reach); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(CUT.W - 1, cx + reach); x++) {
      const dx = x - cx, dy = y - cy;
      const u = dx * ca + dy * sa;
      let v = -dx * sa + dy * ca;
      if (junk) {
        if (Math.abs(u) < L && Math.abs(v) < W) g.fillRect(x, y, 1, 1);
        continue;
      }
      // しっぽの ほうほど おおきく ゆれる
      const sway = eel ? 2.4 : W * 0.35;
      v -= Math.sin(time * (eel ? 7 : 10) - u * 0.3) * sway * (eel ? 1 : Math.max(0, -u / L));
      const body = (u / L) ** 2 + (v / W) ** 2 < 1;
      const tail = !eel && u < -L * 0.8 && u > -L * 1.4 && Math.abs(v) < (-(u + L * 0.8)) * 1.1 + 0.8;
      const finS = !eel && Math.abs(u - L * 0.25) < 2 && Math.abs(v) < W + 2 && Math.sin(time * 12) > -0.2;
      if (body || tail || finS) g.fillRect(x, y, 1, 1);
    }
  }
}

function ringAt(g, cx, cy, r, a) {
  g.fillStyle = `rgba(225,245,255,${a})`;
  const n = Math.max(12, Math.round(r * 6.5));
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    g.fillRect(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.9), 1, 1);
  }
}

function cutinFrame(dt) {
  let f = G.fishing;
  if (!f) {
    if (CUT.flee <= 0) return;
    CUT.flee -= dt;
    f = CUT.f;
    if (CUT.flee <= 0 || !f) {
      UI.cutin(false);
      CUT.f = null;
      return;
    }
  }
  const c = f.cut, g = CUT.g, time = G.time;
  if (!c || !g) return;
  const eel = !f.junk && f.spec.kind === 'eel';
  g.drawImage(CUT.bg, 0, 0);
  // みずの なかの ひかりの ゆらめき
  g.fillStyle = 'rgba(190,235,255,.16)';
  for (let k = 0; k < 6; k++) {
    const base = ((k * 19 + time * 7) % 120) - 10;
    for (let x = 0; x < CUT.W; x += 1) g.fillRect(x, Math.round(base + Math.sin(x * 0.07 + time * 1.4 + k * 2) * 3), 1, 1);
  }

  // さかなの いち
  const fleeing = !G.fishing;
  if (fleeing) {
    const ax = c.pos[0] - CB.x, ay = c.pos[1] - CB.y;
    const len = Math.hypot(ax, ay) || 1;
    c.pos = [c.pos[0] + (ax / len) * dt * 110, c.pos[1] + (ay / len) * dt * 110];
    c.ang = Math.atan2(ay, ax);
    c.alpha = Math.max(0, c.alpha - dt * 0.8);
  } else if (f.junk) {
    c.pos = [CB.x + 3, CB.y + 4];
    c.ang = 0.4;
    c.alpha = Math.min(0.45, f.since * 0.5);
  } else if (f.state === 'approach') {
    const k = Math.min(1, f.t / f.wait), e = 1 - (1 - k) ** 2;
    const px = c.start[0] + (c.hold[0] - c.start[0]) * e, py = c.start[1] + (c.hold[1] - c.start[1]) * e;
    const wob = Math.sin(time * 2.3) * 6 * (1 - k);
    c.pos = [px - c.d[1] * wob, py + c.d[0] * wob];
    c.ang = Math.atan2(CB.y - c.pos[1], CB.x - c.pos[0]) + Math.sin(time * 3) * 0.15 * (1 - k);
    c.alpha = Math.min(0.55, f.since * 1.2);
  } else if (f.state === 'nibble') {
    const near = f.dip > 0 ? c.L + 1 : c.L + 6;
    c.pos = [CB.x + c.d[0] * near + Math.sin(time * 4) * 0.8, CB.y + c.d[1] * near];
    c.ang = c.a0 + Math.PI + Math.sin(time * 5) * 0.08;
    c.alpha = 0.55;
  } else if (f.state === 'bite') {
    const go = Math.min(30, f.t * 60);
    c.pos = [CB.x + c.d[0] * (c.L + 1) + c.run[0] * go, CB.y + c.d[1] * (c.L + 1) + c.run[1] * go];
    c.ang = Math.atan2(c.run[1], c.run[0]);
    c.alpha = 0.6;
  } else {
    const px = CB.x + Math.cos(time * 1.7) * 18, py = CB.y + Math.sin(time * 2.3) * 11;
    c.ang = Math.atan2(Math.cos(time * 2.3) * 2.3 * 11, -Math.sin(time * 1.7) * 1.7 * 18) + Math.sin(time * 14) * 0.35;
    c.pos = [px, py];
    c.alpha = 0.62;
  }
  drawFishShadow(g, c, f.junk, eel, time, c.alpha);

  // いと（つりびとの いる ほうから）
  const sunk = !fleeing && (f.state === 'bite' || f.state === 'reel');
  const [ddx, ddy] = DIRV[f.dir];
  const ox = ddx ? (ddx > 0 ? -1 : CUT.W) : CB.x + 14, oy = ddy ? (ddy > 0 ? -1 : CUT.H) : CB.y - 10;
  const mouth = [c.pos[0] + Math.cos(c.ang) * c.L, c.pos[1] + Math.sin(c.ang) * c.L];
  const [ex, ey] = sunk ? mouth : [CB.x, CB.y];
  g.fillStyle = 'rgba(235,245,255,.75)';
  const steps = Math.ceil(Math.hypot(ex - ox, ey - oy));
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const sag = sunk ? 0 : Math.sin(k * Math.PI) * 4;
    g.fillRect(Math.round(ox + (ex - ox) * k), Math.round(oy + (ey - oy) * k + sag), 1, 1);
  }

  // はもん と あわ
  if (!sunk && !fleeing && time > c.nextIdle) {
    c.rings.push({ t: time, r: 4, sp: 7, life: 1.4 });
    c.nextIdle = time + 1.6;
  }
  c.rings = c.rings.filter((r) => time - r.t < r.life);
  for (const r of c.rings) {
    const age = time - r.t;
    if (age < 0) continue;
    ringAt(g, CB.x, CB.y, r.r + age * r.sp, 0.8 * (1 - age / r.life));
  }
  if (f.state === 'reel' && !fleeing && Math.random() < 0.3) c.bubbles.push({ x: mouth[0] + rnd(-3, 3), y: mouth[1] + rnd(-3, 3), t: time, life: 0.5 });
  c.bubbles = c.bubbles.filter((b) => time - b.t < b.life);
  for (const b of c.bubbles) {
    const age = time - b.t;
    if (age < 0) continue;
    g.fillStyle = `rgba(240,250,255,${0.9 * (1 - age / b.life)})`;
    g.fillRect(Math.round(b.x), Math.round(b.y - age * 4), age < 0.2 ? 1 : 2, age < 0.2 ? 1 : 2);
  }

  // うき（まうえから：しろい わ と あかい まんなか）
  if (!sunk) {
    const rad = f.dip > 0 ? 3 : 4;
    E(g, 'rgba(8,24,40,.35)', CB.x + 1, CB.y + 2, rad, rad - 1);
    E(g, '#2b1a0e', CB.x, CB.y, rad + 1, rad + 1);
    E(g, '#ffffff', CB.x, CB.y, rad, rad);
    E(g, '#e8342e', CB.x, CB.y, rad - 2, rad - 2);
    R(g, '#ffd0c8', CB.x - 1, CB.y - 2, 1, 1);
  }
}
