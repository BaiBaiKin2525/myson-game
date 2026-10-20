'use strict';
// ゲームの ほんたい：うごく・かたづける・なおす・つる・そだてる・ねる
// おはなし（DESIGN.md）：ネオンスポアで 人間が 空の コロニーへ にげて 100年。けんきゅう室で とまっていた 古い ロボットが、
// さんすうアプリの じつりょくテストで じゅう電されて 目を さます。こどもが なまえを つけ、けんきゅう室の きかいを なおして いく（1しょう）

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pickOne = (a) => a[(Math.random() * a.length) | 0];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const G = {
  save: null, pid: null, profile: null,
  maps: {}, map: null, p: null,
  time: 0, scale: 3, cw: 0, ch: 0, canvas: null, ctx: null,
  fishing: null, busy: false, pendingA: false,
  dirs: [], fx: [], splash: null, bolt: null, waking: false,
  saveT: 0, grantT: 0,
  dev: /[?&]dev=1/.test(location.search), infinite: false,
};

// ---------- はじめる ----------

window.addEventListener('load', () => {
  // いつも さいしんを よむ ための サービスワーカー（sw.js）
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
  buildSprites();
  G.canvas = $('view');
  G.ctx = G.canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  setupInput();
  showTitle();
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
});

function showTitle() {
  $('title').classList.remove('hidden');
  $('play').classList.add('hidden');
  $('toMath').href = CFG.mathUrl;
  const box = $('profiles');
  box.innerHTML = '';
  const cur = currentProfileId();
  for (const p of loadProfiles()) {
    const s = loadSave(p.id);
    const sub = !s ? 'はじめから' : s.flags.awake ? `${esc(s.name || 'ロボ')} ・ ${s.day}にちめ ・ 🔋${s.stamina}` : 'とまっている…';
    const b = el('button', `prof${p.id === cur ? ' cur' : ''}`, `<span class="pi">${esc(p.icon || '🙂')}</span><span class="pn">${esc(p.name)}</span><span class="ps">${sub}</span>`);
    b.onclick = () => {
      Sfx.init();
      Sfx.play('ui');
      startGame(p);
    };
    box.appendChild(b);
  }
}

function startGame(p) {
  G.pid = p.id;
  G.profile = p;
  G.save = loadSave(p.id) || newSave();
  G.maps = { house: buildHouse(G.save) };
  bakeGround(G.maps.house);
  ensureMap('out');
  const pos = G.save.pos;
  const m = ensureMap(pos.map) ? pos.map : 'house';
  if (walkable(G.maps[m], pos.x, pos.y)) setMap(m, pos.x, pos.y, pos.dir);
  else setMap('house', 5, 3, 'up');
  $('title').classList.add('hidden');
  $('play').classList.remove('hidden');
  UI.offNote(false);
  $('offMath').href = CFG.mathUrl;
  UI.hud();
  UI.hotbar();
  persist();
  if (G.save.flags.awake) checkGrants();
  if (!G.save.flags.awake && !G.waking) {
    G.intro = true; // おはなしの はじまりを みている あいだは 目を さまさない
    // まだ とまっている：おはなしの はじまり。じつりょくテストで じゅう電されるのを まつ
    UI.say([
      'せいれき 21XX{年|ねん}。',
      '{青|あお}く {光|ひか}る ばいきん「ネオンスポア」が、{町|まち}じゅうに ふえて しまった。',
      '{人間|にんげん}たちは、ばいきんの とどかない {空|そら}の {上|うえ}の コロニーへ {引|ひ}っこした。',
      'それから 100{年|ねん}…。だれも いない けんきゅう{室|しつ}の おくで、{古|ふる}い ロボットが 1だい、とまって いた。',
      '{電池|でんち}🔋は からっぽ。じゅう{電|でん}きも こわれて いて、うごかない…',
      '（{算数|さんすう}アプリで「じつりょくテスト」を やると… なにかが おきるかも！）',
    ], () => {
      G.intro = false;
      checkGrants(); // 電池が とどいて いれば ここで 目を さます
      UI.offNote(!G.save.flags.awake && !G.waking);
    });
  } else if (G.save.flags.awake && !G.save.flags.named) {
    askName(); // なまえを きめる まえに とじた
  }
}

// ロボの なまえを きめて、1しょうを はじめる
function askName() {
  const s = G.save;
  UI.nameEntry(s.name || 'ロビタ', (name) => {
    s.name = name;
    s.flags.named = true;
    persist();
    UI.hud();
    UI.say([
      '{name}「ピピッ… ボクは {name}。…ここは、はかせの けんきゅう{室|しつ}？」',
      '{name}「まっくらで、ガラクタだらけ… かべの メインパネルが ちかちか して いる。」',
      'メインパネルの {前|まえ}で Ⓐボタン を おして みよう！',
      'うごいたり、きかいを {直|なお}すと {電池|でんち}🔋が へるよ。{算数|さんすう}アプリの「じつりょくテスト」で、また じゅう{電|でん} できるよ！',
    ], () => {
      s.flags.intro = true;
      persist();
    });
  });
}

// かみなりが おちて じゅうでん！ big：はじめて めを さます とき
function strike(big) {
  G.bolt = { t: 0, big };
  Sfx.play('thunder');
  $('flash').classList.remove('on');
  void $('flash').offsetWidth;
  $('flash').classList.add('on');
  try { navigator.vibrate && navigator.vibrate(big ? [60, 40, 120] : 60); } catch { /* なし */ }
}

// さいしょの じつりょくテスト（または デバッグの むせいげん）で めを さます
function wakeUp(added) {
  const s = G.save;
  G.waking = true;
  G.busy = true;
  UI.offNote(false);
  if (UI.dialogOpen()) UI.close();
  strike(true);
  setTimeout(() => strike(true), 700);
  setTimeout(() => {
    G.waking = false;
    G.busy = false;
    if (G.save !== s) return; // とちゅうで タイトルに もどった
    s.flags.awake = true;
    persist();
    UI.hud();
    Sfx.play('boot');
    UI.say([
      'ピカッ！！ ゴロゴロ…！',
      'くずれた やねから、じゅう{電|でん}きに かみなりが おちた！ バチバチッ…',
      `ピピッ… システム チェック… {電池|でんち}🔋 じゅう{電|でん} ${unlimitedStamina() ? '∞' : added}。`,
      'パチッ。{丸|まる}い カメラの {目|め}に、{光|ひかり}が ともった。',
      '100{年|ねん}ぶりに、ロボットが {目|め}を さました！',
      'この ロボットに、{名前|なまえ}を つけて あげよう！',
    ], askName);
  }, 1700);
}

// エリアの マップ（まだ なければ つくって じめんを やく）。つくれない ときは null
function ensureMap(id) {
  if (G.maps[id]) return G.maps[id];
  const build = AREA_BUILD[id];
  if (!build) return null;
  G.maps[id] = build(G.save);
  bakeGround(G.maps[id]);
  return G.maps[id];
}

// ふさがった 道が ひらいた とき などに、そとの エリアを つくりなおす
function rebuildAreas() {
  for (const id of Object.keys(AREA_BUILD)) delete G.maps[id];
  ensureMap('out');
  if (G.map && AREA_BUILD[G.map.id]) G.map = ensureMap(G.map.id);
}

function setMap(id, x, y, dir) {
  G.map = G.maps[id];
  G.p = { x, y, tx: x, ty: y, moving: false, t: 0, dir: dir || 'down', hold: 0, chain: false };
  UI.hud();
}

function persist() {
  if (!G.save || !G.p) return;
  G.save.pos = { map: G.map.id, x: G.p.x, y: G.p.y, dir: G.p.dir };
  writeSave(G.pid, G.save);
}

function backToTitle() {
  G.intro = false;
  UI.offNote(false);
  persist();
  endFishing();
  UI.closePanel();
  G.save = null;
  G.map = null;
  showTitle();
}

// ---------- でんち ----------

function spend(n) {
  const s = G.save;
  useOil(CFG.oil.perAction);
  if (unlimitedStamina()) return true;
  if (s.stamina < n) {
    Sfx.play('err');
    UI.flashStamina();
    UI.say([
      'ピピ… {電池|でんち}🔋が たりない。うごけないよ…',
      '{算数|さんすう}アプリで「じつりょくテスト」を がんばると、じゅう{電|でん} できるよ！',
    ]);
    return false;
  }
  s.stamina -= n;
  UI.hud();
  addFx(`-${n}🔋`, '#7dff9a');
  return true;
}

// ---------- オイル🛢 ----------
// うごく たび・どうぐを つかう たび・1にち ごとに へる。すくないと あるくのが おそく なり、ギシギシ いう

function oilSpeed() {
  const o = G.save.oil;
  for (const [min, k] of CFG.oilSlow) if (o >= min) return k;
  return CFG.oilSlow[CFG.oilSlow.length - 1][1];
}

function useOil(n) {
  const s = G.save;
  const before = s.oil;
  s.oil = Math.max(0, s.oil - n * ((G.map && G.map.oilMul) || 1));
  if (before >= CFG.oilGlow && s.oil < CFG.oilGlow) UI.toast('バリアオイル🛢が へって、{体|からだ}に ネオンスポアが くっついて きた…', 2800);
  if (before > 0 && s.oil <= 0) UI.toast('ギギギ… オイルが なくなって、うごきが とても おそく なった！ バリアオイルを ぬろう', 3200);
  UI.hud();
}

function oilUp(id) {
  const s = G.save;
  const o = OILS[id];
  if (!(s.items[id] > 0)) return;
  if (--s.items[id] <= 0) delete s.items[id];
  s.oil = Math.min(100, s.oil + o.oil);
  Sfx.play('oil');
  addFx(`+${o.oil}🛢`, '#f2c94c');
  UI.toast(`${o.name}を ぬった！ ネオンスポアが はがれて、うごきが なめらかに なった`);
  if (!s.flags.oiled) {
    s.flags.oiled = true;
    setTimeout(() => UI.say(['{name}「ピカピカ！ {体|からだ}が かるく なった！」', 'つぎは、おくの「サイバーか そうち」を {直|なお}して みよう。']), 400);
  }
  UI.hud();
  if (UI.panelOpen) UI.rebuild();
  persist();
}

// さんすうアプリから とどいた でんちを とりこむ（とどくと かみなりが おちる）
function checkGrants() {
  if (!G.save || G.waking || G.intro) return;
  const got = pullGrants(G.pid, G.save);
  const added = got.reduce((a, g) => a + g.added, 0);
  if (!G.save.flags.awake) {
    // とどいた とき・むせいげん・まえの おはなしから 電池を ひきついだ とき に 目を さます
    if (got.length || unlimitedStamina() || G.save.stamina > 0) wakeUp(added || G.save.stamina);
    return;
  }
  if (!got.length) return;
  const sent = got.reduce((a, g) => a + g.amount, 0);
  persist();
  UI.hud();
  UI.flashStamina();
  strike(false);
  const reason = got[got.length - 1].reason || 'じつりょくテスト';
  UI.toast(`${reason}で じゅう{電|でん}！ 🔋 +${added}${added < sent ? '（いっぱいに なった！）' : ''}`, 3500);
}

// ---------- にゅうりょく ----------

function setupInput() {
  const keyDir = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  };
  addEventListener('keydown', (e) => {
    Sfx.init();
    const d = keyDir[e.code];
    if (d) {
      e.preventDefault();
      if (!e.repeat) pressDir(d, e.code);
      return;
    }
    if (e.repeat) return;
    if (['Space', 'Enter', 'KeyZ', 'KeyJ'].includes(e.code)) {
      e.preventDefault();
      pressA();
    } else if (e.code === 'Escape' || e.code === 'KeyX') {
      pressB();
    } else if (G.save && !UI.panelOpen && !UI.dialogOpen()) {
      if (e.code === 'KeyQ') cycleItem(-1);
      if (e.code === 'KeyE') cycleItem(1);
      if (/^Digit[1-9]$/.test(e.code)) {
        const it = hotbarItems()[Number(e.code.slice(5)) - 1];
        if (it) selectItem(it.id);
      }
    }
  });
  addEventListener('keyup', (e) => { if (keyDir[e.code]) releaseDir(e.code); });
  addEventListener('blur', () => { G.dirs = []; });

  // じゅうじキー：ゆびを すべらせても むきが かわる
  const pad = $('dpad');
  let pid = null;
  const dirFrom = (e) => {
    const r = pad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    if (Math.hypot(dx, dy) < r.width * 0.1) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  };
  const setPad = (d) => {
    releaseDir('pad');
    if (d) pressDir(d, 'pad');
    pad.dataset.dir = d || '';
  };
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.init();
    pid = e.pointerId;
    try { pad.setPointerCapture(pid); } catch { /* ふるい ブラウザ */ }
    setPad(dirFrom(e));
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === pid) setPad(dirFrom(e)); });
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    setPad(null);
  };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);

  const btnA = $('btnA');
  btnA.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    Sfx.init();
    btnA.classList.add('on');
    pressA();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btnA.addEventListener(ev, () => btnA.classList.remove('on'));

  $('dialog').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.choice')) return;
    e.preventDefault();
    UI.advance();
  });
  $('catch').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    UI.closeCatch();
  });
  $('fishPanel').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    pressA();
  });
  $('panelClose').onclick = () => { Sfx.play('ui'); UI.closePanel(); };
  // もちもの・メニューは ロボが とまっていても ひらける（さんすうアプリへ もどれる ように）
  $('bagBtn').onclick = () => { Sfx.init(); if (canOpen()) openBag(); };
  $('menuBtn').onclick = () => { Sfx.init(); if (canOpen()) openMenu(); };
  $('mapBtn').onclick = () => { Sfx.init(); if (canControl()) openMap(); };
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
    else checkGrants();
  });
  addEventListener('focus', checkGrants);
  addEventListener('storage', (e) => {
    if (G.pid && e.key === KEY.grants(G.pid)) checkGrants();
    if (e.key === KEY.unlimited) { UI.hud(); checkGrants(); }
  });
  addEventListener('pagehide', persist);
}

function pressDir(d, src) {
  G.dirs = G.dirs.filter((x) => x.src !== src);
  G.dirs.push({ d, src });
}
function releaseDir(src) {
  G.dirs = G.dirs.filter((x) => x.src !== src);
}
const inputDir = () => (G.dirs.length ? G.dirs[G.dirs.length - 1].d : null);

const canOpen = () => !!G.save && !G.busy && !UI.dialogOpen() && !UI.panelOpen && !UI.catchOpen && !G.fishing;
const canControl = () => canOpen() && !!G.save.flags.awake;

function pressA() {
  if (!G.save) return;
  if (UI.catchOpen) { UI.closeCatch(); return; }
  if (UI.dialogOpen()) { UI.advance(); return; }
  if (UI.panelOpen || G.busy || !G.save.flags.awake) return;
  if (G.fishing) { fishPress(); return; }
  if (G.p.moving) { G.pendingA = true; return; }
  doAction();
}

function pressB() {
  if (UI.naming) return; // なまえを きめるまで とじない
  if (UI.panelOpen) { UI.closePanel(); return; }
  if (G.fishing && G.fishing.state !== 'reel') { endFishing('つりを やめた'); return; }
  if (canControl()) cycleItem(1);
}

// ---------- うごく ----------

function update(dt) {
  G.time += dt;
  UI.tick(dt);
  if (!G.save) return;
  const p = G.p;
  if (p.moving) {
    p.t += dt * partFx('walk', 'legs') * oilSpeed();
    if (p.t >= 1) {
      p.x = p.tx;
      p.y = p.ty;
      p.moving = false;
      p.t = 0;
      useOil(CFG.oil.perStep);
      if (G.save.oil <= 0 && Math.random() < 0.5) Sfx.play('squeak');
      arrived();
    }
  }
  if (!p.moving) {
    if (G.fishing && G.fishing.state !== 'reel' && inputDir()) endFishing('つりを やめた');
    const d = canControl() ? inputDir() : null;
    if (!d) {
      p.hold = Math.min(p.hold, 0);
      if (p.hold < 0) p.hold += dt;
      p.chain = false;
    } else {
      if (d !== p.dir) {
        p.dir = d;
        if (!p.chain) p.hold = Math.min(p.hold, 0);
      }
      p.hold += dt;
      // みじかく おすと むきだけ かわる（どうぐを ねらいやすい）
      if (p.chain || p.hold >= 0.1) tryStep(d);
    }
    if (!p.moving && G.pendingA) {
      G.pendingA = false;
      if (canControl()) doAction();
    }
  }
  if (G.fishing) fishUpdate(dt);
  cutinFrame(dt);
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter((f) => f.t < 1);
  if (G.splash) {
    G.splash.t += dt;
    if (G.splash.t > 0.5) G.splash = null;
  }
  if (G.bolt) {
    G.bolt.t += dt;
    if (G.bolt.t > 0.9) G.bolt = null;
  }
  G.saveT += dt;
  if (G.saveT > 15) { G.saveT = 0; persist(); }
  G.grantT += dt;
  if (G.grantT > 4) { G.grantT = 0; checkGrants(); UI.hud(); }
}

// パーツの lv に あわせた ちから（PART_FX の ならびより lv が たかい ときは いちばん うえ）
function partFx(fx, part) {
  const list = PART_FX[fx];
  return list[Math.min(list.length - 1, G.save.parts[part] || 0)];
}

// x0〜x1（よこに ならんだ 端）・y0〜y1（たてに ならんだ 端）・x,y（ひとつの マス）の ドア。つく ばしょ（tx,ty）を きめて かえす
function doorAt(m, x, y) {
  for (const d of m.doors) {
    if (d.x0 != null && y === d.y && x >= d.x0 && x <= d.x1) return { ...d, tx: x };
    if (d.y0 != null && x === d.x && y >= d.y0 && y <= d.y1) return { ...d, ty: y };
    if (d.x0 == null && d.y0 == null && d.x === x && d.y === y) return d;
  }
  return null;
}

function tryStep(d) {
  const p = G.p;
  const [dx, dy] = DIRV[d];
  const nx = p.x + dx, ny = p.y + dy;
  const door = doorAt(G.map, nx, ny);
  if (door && !canUseDoor(door)) {
    p.chain = false;
    p.hold = -0.6;
    return;
  }
  if (walkable(G.map, nx, ny)) {
    p.tx = nx;
    p.ty = ny;
    p.moving = true;
    p.t = 0;
    p.chain = true;
  } else {
    p.chain = false;
  }
}

function canUseDoor(door) {
  if (door.to === 'out' && !G.save.tools.rod) {
    UI.say('{外|そと}は ネオンスポアが いっぱい… まずは けんきゅう{室|しつ}を かたづけよう。\nなにか いい ものが みつかるかも！');
    return false;
  }
  if (G.save.tidy.carry) {
    UI.say('もっている ものを ごうせい そうちに {入|い}れてから でかけよう。');
    return false;
  }
  if (door.gate && !gateOpen(G.save, door.gate)) {
    ACT.gate({ gid: door.gate });
    return false;
  }
  if (G.save.carryOtter && door.to !== 'house' && door.to !== 'out') {
    UI.say('カワウソが ぐったり して いる… さきに けんきゅう{室|しつ}の サイバーか そうちへ はこぼう。');
    return false;
  }
  if (!AREA_BUILD[door.to] && door.to !== 'house' && door.to !== 'out') {
    const a = AREAS[door.to];
    UI.say(`この さきは「${a ? a.name : '？？？'}」。\nまだ つくって いる ところ だよ。（${a ? a.ch : '？'}しょうで {行|い}ける よてい）`);
    return false;
  }
  return true;
}

function arrived() {
  const p = G.p;
  const door = doorAt(G.map, p.x, p.y);
  if (door) goThrough(door);
}

function fadeTo(v, cb, ms = 260) {
  $('fade').style.opacity = v;
  setTimeout(cb, ms);
}

// つく マスが とおれない ときは ちかくの とおれる マスへ（エリアの 端で 道が すこし ずれて いても だいじょうぶ）
function landing(m, x, y) {
  let best = null, bestScore = 1e9;
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(m, nx, ny) || doorAt(m, nx, ny)) continue;
      const road = [TL.PATH, TL.PAVE, TL.PIER].includes(tileAt(m, nx, ny));
      const score = Math.hypot(dx, dy) + (road ? 0 : 1.5); // 道の うえを えらぶ
      if (score < bestScore) { bestScore = score; best = [nx, ny]; }
    }
  }
  return best || [x, y];
}

function goThrough(door) {
  G.busy = true;
  Sfx.play('door');
  fadeTo(1, () => {
    const m = ensureMap(door.to);
    const [lx, ly] = landing(m, door.tx, door.ty);
    setMap(door.to, lx, ly, door.dir);
    const s = G.save;
    s.visited = s.visited || {};
    const first = !s.visited[door.to];
    s.visited[door.to] = true;
    persist();
    fadeTo(0, () => {
      G.busy = false;
      if (first && AREA_INTRO[door.to]) UI.say(AREA_INTRO[door.to]);
      if (door.to === 'out' && !G.save.flags.outIntro) {
        G.save.flags.outIntro = true;
        persist();
        UI.say([
          '{外|そと}に {出|で}た！ {青|あお}い ネオンスポアが ふわふわ とんで いる…',
          '🗺 ボタンで {町|まち}の {地図|ちず}を {見|み}られるよ。',
          'みぎの ほうに {水|みず}ろが ある。でも {水|みず}が むらさきに {光|ひか}って いる…',
          '{水|みず}の {前|まえ}で つりざおを えらんで Ⓐ！ どんな さかなが いるかな？',
          'けんきゅう{室|しつ}の まわりに、{黄|き}いろい オイル{草|くさ}が さいて いる。',
          'みちには こわれた きかいも おちて いる。ひろって ごうせい そうちに {入|い}れよう。',
        ]);
      }
    });
  });
}

// はじめて エリアに 入った ときの ことば
const AREA_INTRO = {
  plaza: [
    'ちゅうおう {広場|ひろば}に ついた！',
    'まんなかに {大|おお}きな きかいの {木|き}が ある… かれて うごいて いない。',
    '{北|きた}の {道|みち}は ネオン こうざんへ、ひがしの はしの さきは ネオン しょう{店|てん}がいへ つづいて いる。',
  ],
  sea: [
    '{海|うみ}だ！ みなとに ついた！',
    'しお{風|かぜ}が つよい… バリアオイル🛢が いつもより はやく へるよ。',
    'ていぼう（{海|うみ}に つきでた コンクリートの {道|みち}）の さきから なら つりが できそう。',
  ],
};

// ---------- しらべる・つかう ----------

function frontTile() {
  const [dx, dy] = DIRV[G.p.dir];
  return [G.p.x + dx, G.p.y + dy];
}

function doAction() {
  const s = G.save, m = G.map;
  const [tx, ty] = frontTile();
  const o = objAt(m, tx, ty);
  if (s.tidy.carry) {
    if (o && o.act === 'synth') synthClutter();
    else {
      Sfx.play('err');
      UI.toast('ごうせい そうちの まえで Ⓐ を おして いれよう');
    }
    return;
  }
  if (o && o.act) {
    ACT[o.act](o);
    return;
  }
  const key = `${tx},${ty}`;
  const pl = m.id === 'out' ? s.plots[key] : null;
  if (pl && pl.c && pl.c.d >= CROPS[pl.c.id].days) {
    harvest(pl, tx, ty);
    return;
  }
  useItem(tx, ty, o);
}

const ACT = {
  clutter(o) {
    if (!spend(CFG.cost.tidy)) return;
    removeObj(G.map, o);
    G.save.tidy.carry = o.cid;
    Sfx.play('pick');
    const c = CLUTTER.find((x) => x.id === o.cid);
    UI.toast(`${c.name}を もちあげた！ ごうせい そうちへ はこぼう`);
    persist();
  },
  synth() { openSynth(); },
  press(o) { usePress(o); },
  wild(o) { pickWild(o); },
  scrap(o) { pickScrap(o); },
  bed() {
    UI.ask('スリープ ポッド。ここで スリープ すると、つぎの {日|ひ}に なる。\n（{水|みず}を あげた さくもつが そだつよ。{電池|でんち}🔋は ふえないよ）', ['スリープ', 'まだ'], (k) => {
      if (k === 0) sleep();
    });
  },
  charger() {
    UI.say([
      'じゅう{電|でん}き。こわれかけて いて、ふだんは うごかない。',
      '{算数|さんすう}アプリの「じつりょくテスト」を やると、ここから {電池|でんち}🔋に じゅう{電|でん} されるよ。',
    ]);
  },
  table() {
    UI.say([
      'つくえの うえに しゃしんが ある。モニターは こわれて ちらちら して いる…',
      'はかせと、ぴかぴかだった ころの ロボが うつって いる…',
      G.save.flags.letter ? 'はかせ、むらと はたけは まかせて！' : 'はかせの けんきゅうじょを きれいに しよう！',
    ]);
  },
  panel(o) {
    if (!G.save.fixed.panel) tryFix('panel', () => { o.spr = 'panelOn'; });
    else openVideos();
  },
  pot(o) {
    if (!G.save.fixed.planter) tryFix('planter', fixPots);
    else potAction(o.pid);
  },
  pod(o) {
    const s = G.save;
    if (s.fixed.pod) {
      if (!s.flags.cleanWater) UI.say(['サイバーか そうち。あかい ランプが {光|ひか}って いる。「{水|みず}が ありません」', '{外|そと}の {水|みず}ろの ろかそうちを {直|なお}せば うごきそう…']);
      else if (s.carryOtter) healOtter();
      else UI.say(['サイバーか そうち。きれいな {水|みず}が とどいて、みどりの ランプが ついて いる。', s.flags.otter ? 'カワウソは ここで げんきに なったんだ。' : 'よわった どうぶつを つれて くれば、なおせるよ。']);
      return;
    }
    tryFix('pod', () => { o.spr = 'podOn'; }, ch1Clear);
  },
  filter() {
    const s = G.save;
    if (s.fixed.filter) UI.say('ろかそうち。ゴウンゴウン… きれいな {水|みず}が ながれて いく。');
    else if ((s.ch || 1) < 2) UI.say(['{水|みず}ろの「ろかそうち」。さびて、ネオンスポアが びっしり くっついて いる…', 'いまは まだ {直|なお}せない。（2しょうで {直|なお}すよ）']);
    else fixFilter();
  },
  otterWeak(o) { findOtter(o); },
  otter() { talkOtter(); },
  // あれた 町の もの：しらべると ひとこと
  look(o) {
    const lines = {
      ruinB: ['くずれた ビル。まどは われて、だれも いない…', '100{年|ねん}{前|まえ}は、ここに {人間|にんげん}が すんで いたんだ。', 'かんばんの ネオンが、ときどき ちかちか して いる。'],
      wall: ['くずれた かべ。ネオンの らくがきが のこって いる。', 'かべの むこうにも、だれも いない {町|まち}が つづいて いる…'],
      car: ['さびた くるま。100{年|ねん} うごいて いない…', 'タイヤが なくて、まどガラスも われて いる。'],
      rubble: ['コンクリートの がれき。てっきんが つきでて いる。', 'あぶない がれき。ちかよらない ように しよう。'],
      deadTree: ['かれた {木|き}。ネオンスポアで よわって しまった みたい…', 'みきに {光|ひか}る コケが はえて いる。'],
      barrel: ['さびた ドラムかん。{中|なか}は からっぽ。'],
      lamp: ['こわれた がいとう。100{年|ねん} {明|あ}かりが ついて いない…'],
      bench: ['こわれた ベンチ。むかしは ここで {人間|にんげん}が ひとやすみ して いたんだね。'],
      crate: ['さびた コンテナ。{中|なか}は からっぽ…'],
    }[o.t] || ['…'];
    UI.say(pickOne(lines));
  },
  gate(o) {
    const g = GATES[o.gid], a = AREAS[g.to];
    const when = g.flag === 'cleanWater' && (G.save.ch || 1) >= g.ch ? '{水|みず}ろの ろかそうちを {直|なお}すと {通|とお}れる かも' : `${g.ch}しょうで {通|とお}れる ように なるよ`;
    UI.say([`がれきと ネオンスポアの きりで {道|みち}が ふさがって いる…`, `この さきは「${a.name}」。${when}。`]);
  },
  airTree() {
    UI.say(['{空気|くうき}じょうか ツリー。ネオンスポアを すいこんで {空気|くうき}を きれいに する きかいの {木|き}。', 'いまは かれて、うごいて いない…（4しょうで うごかすよ）']);
  },
  orchard() { UI.say('かれた {木|き}の きりかぶ。むかしは ここに くだものの {木|き}が あったみたい。'); },
  signOrchard() { UI.say('「かじゅえん」\nくだものの {木|き}を そだてる ところ。（4しょうで つかえるよ）'); },
  signPlaza() { UI.say('「ちゅうおう {広場|ひろば}」\n{北|きた}：ネオン こうざん　ひがし：ネオン しょう{店|てん}がい　{南|みなみ}：けんきゅう{室|しつ}'); },
  boat(o) { UI.say(['こわれた ボート。そこに あなが あいて いる…', '3しょうの メカ{工|こう}ぼうで {直|なお}して もらえる かも。{直|なお}すと {海|うみ}の おきで つりが できるよ！']); },
  signPier() { UI.say('「ていぼう」\nここから {海|うみ}に むかって つりざおを つかおう。'); },
  signFarm() {
    if ((G.save.ch || 1) >= 2) UI.say('「はたけ」\nくわで くさを かって、つちを たがやそう。\nたねを まいて、{毎日|まいにち} じょうろで {水|みず}を あげよう！');
    else UI.say('「はたけ」\nいまは ネオンスポアが こくて、はたけに できない…\n（2しょうで ひらくよ。いまは けんきゅう{室|しつ}の プランターで そだてよう）');
  },
  signCanal() { UI.say('「{水|みず}ろ」\n{水|みず}の {前|まえ}で つりざおを つかおう。\nうきが ツンツン した あと、スパッと しずんだら Ⓐ！'); },
};

// ---------- 1しょう：けんきゅう室を なおす ----------

const matList = (mats) => Object.entries(mats).map(([k, n]) => `${ITEMS[k].name} ${n}こ`).join('・');
const nextFix = () => CH1.find((c) => !G.save.fixed[c.id]);

// HUD の「🎯 つぎに やること」
function goalText() {
  const s = G.save;
  if (!s || !s.flags.awake || !s.flags.named) return '';
  if (s.flags.ch1done) return goalCh2();
  const n = nextFix();
  if (!n) return '';
  if (n.id === 'pod' && !s.flags.oiled) return s.fixed.press ? '🎯 バリアオイルを つくって {体|からだ}に ぬろう' : '';
  const have = Object.entries(n.mats).map(([k, need]) => `${ITEMS[k].name} ${Math.min(need, s.items[k] || 0)}/${need}`).join('・');
  const where = { panel: 'かべの メインパネルを しらべよう', planter: 'プランターを {直|なお}そう', press: 'オイル しぼりきを {直|なお}そう', pod: 'サイバーか そうちを {直|なお}そう' }[n.id];
  return `🎯 ${where}${have ? `（${have}）` : ''}`;
}

function goalCh2() {
  const s = G.save;
  if ((s.ch || 1) < 2) return '🎯 スリープ ポッドで ねて、あしたの {朝|あさ}を まとう';
  if (!s.fixed.filter) {
    const g = s.items.m_gear || 0;
    if (g < GEARS_NEED) return `🎯 {水|みず}ろで さびた はぐるまを つろう（${g}/${GEARS_NEED}）`;
    const have = Object.entries(FILTER_FIX.mats).filter(([k]) => k !== 'm_gear').map(([k, n]) => `${ITEMS[k].name} ${Math.min(n, s.items[k] || 0)}/${n}`);
    const oil = Object.keys(OILS).reduce((a, id) => a + (s.items[id] || 0), 0);
    return `🎯 ろかそうちを {直|なお}そう（${have.join('・')}・バリアオイル ${Math.min(1, oil)}/1）`;
  }
  if (!s.flags.otter) return s.carryOtter ? '🎯 カワウソを サイバーか そうちへ はこぼう' : '🎯 {水|みず}ろの きしで なにかが たおれて いる…';
  if (s.otterFed !== s.day) return '🎯 カワウソに {魚|さかな}を あげよう';
  return '';
}

// なおす。after：なおった ときに え を かえる、then：ビデオの あと
function tryFix(id, after, then) {
  const s = G.save;
  const c = CH1.find((x) => x.id === id);
  const prev = CH1[CH1.indexOf(c) - 1];
  if (prev && !s.fixed[prev.id]) {
    UI.say(`${c.name}は こわれて いる…\nさきに ${prev.name}を {直|なお}そう。`);
    return;
  }
  if (id === 'pod' && !s.flags.oiled) {
    UI.say(['サイバーか そうちは こわれて いる…', '{体|からだ}が ギシギシ して、てが とどかない。さきに バリアオイルを つくって ぬろう。']);
    return;
  }
  const lack = Object.entries(c.mats).some(([k, n]) => (s.items[k] || 0) < n);
  if (lack) {
    UI.say([
      `${c.name}は こわれて いる…`,
      `{直|なお}すには ${matList(c.mats)}が いる。`,
      'ガラクタや こわれた きかいを ごうせい そうちに {入|い}れると、てつくずや ねじが {出|で}るよ。つった さかなを {入|い}れても、ねじが {出|で}る ことが あるよ。',
    ]);
    return;
  }
  const cost = [matList(c.mats), `{電池|でんち}🔋${c.energy}`].filter(Boolean).join('・');
  UI.ask(`${c.name}を {直|なお}す？\n（${cost}）`, ['{直|なお}す', 'やめる'], (k) => {
    if (k !== 0) return;
    if (!spend(c.energy)) return;
    takeItems(c.mats);
    s.fixed[id] = true;
    Sfx.play('power');
    if (after) after();
    UI.hud();
    persist();
    playVideo(c.video, then);
  });
}

function fixPots() {
  const s = G.save;
  for (const o of G.maps.house.objs) if (o.t === 'pot') o.spr = 'potOk';
  for (const [k, n] of Object.entries(POT_SEEDS)) s.seeds[k] = (s.seeds[k] || 0) + n;
  s.tools.can = 1;
  if (!s.sel || s.sel === 'rod') s.sel = 'seed:nanohana';
  UI.hotbar();
}

function ch1Clear() {
  const s = G.save;
  UI.say([
    'ピピッ… サイバーか そうちの ランプが あかく {光|ひか}った。「{水|みず}が ありません」',
    '{name}「{外|そと}の {水|みず}ろの ろかそうちを {直|なお}せば、きれいな {水|みず}が くる…！」',
    '★ 1しょう「100{年|ねん}{目|め}の さいきどう」クリア！ ★',
    'つぎの {日|ひ}から 2しょう「ネオン{水|みず}ろの じょうか」が はじまるよ。スリープ ポッドで ねて、あしたの {朝|あさ}を まとう！',
  ], () => {
    s.flags.ch1done = true;
    UI.hud();
    persist();
  });
  Sfx.play('catch');
}

// ---------- 2しょう：ネオン水ろの じょうか ----------

// 1しょうを クリアした つぎの 朝に はじまる：さびた くわ と たね、ビデオ05
function startCh2() {
  const s = G.save;
  s.ch = Math.max(2, s.ch || 1);
  s.tools.hoe = 1;
  for (const [k, n] of Object.entries(CH2_SEEDS)) s.seeds[k] = (s.seeds[k] || 0) + n;
  s.sel = 'hoe';
  rebuildAreas();
  UI.hotbar();
  UI.hud();
  persist();
  UI.say('ピピッ… メインパネルに あたらしい ビデオが とどいた！', () => playVideo(5, () => {
    Sfx.play('catch');
    UI.say([
      '★ 2しょう「ネオン{水|みず}ろの じょうか」 ★',
      '{name}は「さびた くわ」と、でんきニンジン・ネオンひまわりの たねを てに いれた！',
      '{外|そと}の はたけで、くわを えらんで くさの {前|まえ}で Ⓐ！',
      'よごれた {水|みず}ろで つりを すると、さびた はぐるまが つれる ことが あるよ。',
    ]);
  }));
}

// ろかそうちを なおす（はぐるま・ねじ・てつくず・どの バリアオイルでも 1つ・電池）
function fixFilter() {
  const s = G.save, c = FILTER_FIX;
  const oils = Object.keys(OILS).filter((id) => s.items[id] > 0);
  const lackMat = Object.entries(c.mats).some(([k, n]) => (s.items[k] || 0) < n);
  const cost = `${matList(c.mats)}・バリアオイル 1こ・{電池|でんち}🔋${c.energy}`;
  if (lackMat || oils.length < c.oil) {
    UI.say([
      '{水|みず}ろの「ろかそうち」。さびて、ネオンスポアが びっしり くっついて いる…',
      `{直|なお}すには ${cost}が いる。`,
      (s.items.m_gear || 0) < GEARS_NEED ? 'さびた はぐるまは、よごれた {水|みず}ろの そこに しずんで いる。つりざおで つりあげよう！'
        : lackMat ? 'ねじと てつくずは、こわれた きかいを ごうせい そうちに {入|い}れると {出|で}るよ。'
        : 'バリアオイルは オイル しぼりきで つくれるよ。',
    ]);
    return;
  }
  UI.ask(`ろかそうちを {直|なお}す？\n（${cost}）`, ['{直|なお}す', 'やめる'], (k) => {
    if (k !== 0) return;
    if (!spend(c.energy)) return;
    takeItems(c.mats);
    takeItems({ [oils[0]]: 1 });
    s.fixed.filter = true;
    s.flags.cleanWater = true;
    Sfx.play('power');
    rebuildAreas();
    UI.hud();
    persist();
    playVideo(6, () => UI.say([
      'ゴウンゴウン… {水|みず}ろの {水|みず}が すきとおって いく！',
      '{南|みなみ}の {道|みち}を ふさいで いた がれきが、{水|みず}に ながされた！ {海|うみ}へ {行|い}けるよ。',
      '…あれ？ {水|みず}ろの きしで、なにかが たおれて いる…',
    ]));
  });
}

// きれいに なった 水ろを ながれて きた、よわった カワウソ
function findOtter(o) {
  const s = G.save;
  UI.say([
    '{水|みず}ろの きしに、ちいさな どうぶつが たおれて いる…',
    'カワウソだ！ ネオンスポアが びっしり ついて、ぐったり して いる。',
    '{name}「けんきゅう{室|しつ}の サイバーか そうちなら、なおせる かも！」',
  ], () => UI.ask('カワウソを だっこして はこぶ？', ['はこぶ', 'まだ'], (k) => {
    if (k !== 0) return;
    removeObj(G.map, o);
    s.carryOtter = true;
    Sfx.play('pick');
    UI.toast('カワウソを だっこした！ けんきゅう{室|しつ}の サイバーか そうちへ はこぼう', 2800);
    UI.hud();
    persist();
  }));
}

function healOtter() {
  const s = G.save;
  UI.ask(`カワウソを サイバーか そうちに ねかせる？\n（{電池|でんち}🔋${OTTER_HEAL}）`, ['なおす', 'まだ'], (k) => {
    if (k !== 0) return;
    if (!spend(OTTER_HEAL)) return;
    s.carryOtter = false;
    s.flags.otter = true;
    Sfx.play('power');
    rebuildAreas();
    UI.hud();
    persist();
    UI.say([
      'ウィーン… カプセルに きれいな {水|みず}が みたされて いく…',
      'ネオンスポアが とけて、カワウソの {目|め}に {光|ひかり}が ともった！',
      'カワウソ「…プイ？ ここは どこだプイ？」',
      'カワウソ「たすけて くれて ありがとうだプイ！ ボクも はたけを てつだうプイ！」',
    ], () => playVideo(8, ch2Clear));
  });
}

function ch2Clear() {
  const s = G.save;
  if (s.flags.ch2done) return;
  Sfx.play('catch');
  UI.say([
    'カワウソは {外|そと}の {水|みず}ろの そばで くらす ことに なった。',
    '{魚|さかな}を あげると、つぎの {日|ひ}の {朝|あさ}に はたけと プランターに {水|みず}を まいて くれるよ。',
    '★ 2しょう「ネオン{水|みず}ろの じょうか」クリア！ ★',
    'つづきの 3しょうは もうすぐ できるよ。それまで {海|うみ}で つりを したり、はたけで そだてたり して まってね！',
  ], () => {
    s.flags.ch2done = true;
    UI.hud();
    persist();
  });
}

// カワウソ：その日に 魚を あげると、つぎの 朝に 水やり（と ときどき 魚の おすそわけ）
const OTTER_FISH = Object.keys(FISH).filter((k) => FISH[k].tier === 1 && !FISH[k].sea);
function talkOtter() {
  const s = G.save;
  if (s.otterFed === s.day) {
    UI.say(pickOne([
      'カワウソ「おなか いっぱいだプイ！ あしたの {朝|あさ}、{水|みず}やりは まかせてプイ！」',
      'カワウソ「{水|みず}が きれいで きもちいいプイ〜」',
      'カワウソ「{name}は はたらきものだプイ！」',
    ]));
    return;
  }
  Sfx.play('ui');
  UI.panel('カワウソに ごはん', (box) => {
    box.appendChild(el('p', 'help', 'カワウソ「おなかが すいたプイ…」<br>{魚|さかな}を あげると、あしたの {朝|あさ}に はたけと プランターに {水|みず}を まいて くれるよ。<br>カワウソエビと メダカッチが だいこうぶつ！'));
    const list = Object.entries(s.items).filter(([id, n]) => n > 0 && id.startsWith('f_'));
    if (!list.length) {
      box.appendChild(el('p', 'empty', '{魚|さかな}を もって いないよ。{水|みず}ろで つって こよう！<br>（{光|ひか}る {魚|さかな}は ネオンスポアが ついて いて たべられないよ）'));
      return;
    }
    for (const [id, n] of list) {
      const f = FISH[id.slice(2)];
      const row = el('div', 'row');
      row.innerHTML = rbh(`${iconImg(id, 'ic m')}<div class="info"><div class="nm">${f.name} × ${n}</div><div class="ds">${f.love ? '💗 だいこうぶつ！' : 'たべて くれるよ'}</div></div>`);
      const bb = el('div', 'btns');
      const bt = el('button', 'buy', 'あげる');
      bt.onclick = () => feedOtter(id);
      bb.appendChild(bt);
      row.appendChild(bb);
      box.appendChild(row);
    }
  });
}

function feedOtter(id) {
  const s = G.save;
  if (!(s.items[id] > 0)) return;
  const f = FISH[id.slice(2)];
  if (--s.items[id] <= 0) delete s.items[id];
  s.otterFed = s.day;
  if (f.love) s.otterLove = s.day;
  UI.closePanel();
  Sfx.play('harvest');
  const o = G.map.objs.find((x) => x.t === 'otter');
  if (o) addFx(f.love ? '💗💗' : '💗', '#ff9ae8', (o.x + 0.5) * T, o.y * T - 10);
  UI.say(f.love ? [
    `カワウソ「わあっ！ ${f.name}だプイ！ だいこうぶつだプイ〜！」`,
    'カワウソ「あしたの {朝|あさ}、はたけの {水|みず}やりは まかせてプイ！ おみやげも あるかも だプイ！」',
  ] : [
    'カワウソ「もぐもぐ… おいしいプイ！」',
    'カワウソ「あしたの {朝|あさ}、はたけと プランターに {水|みず}を まいて おくプイ！」',
  ]);
  UI.hud();
  persist();
}

// はかせの ビデオ（100年まえの ろくが）を うつす
function playVideo(n, then) {
  const v = VIDEOS[n];
  const s = G.save;
  if (!s.videos.includes(n)) s.videos.push(n);
  persist();
  Sfx.play('boot');
  UI.say([{ text: `ピッ… ${v.title}を さいせい します。` }, ...v.lines.map((t) => ({ who: HAKASE, text: t, holo: true }))], then);
}

function openVideos() {
  Sfx.play('beep');
  UI.panel('メインパネル', (box) => {
    const s = G.save;
    box.appendChild(el('p', 'help', 'はかせが のこした ビデオを {見|み}られるよ。きかいを {直|なお}すと、ビデオが ふえるよ。'));
    for (const n of Object.keys(VIDEOS).map(Number)) {
      const got = s.videos.includes(n);
      const row = el('div', `row${got ? '' : ' weak'}`);
      row.innerHTML = rbh(`<div class="vid">${got ? '📼' : '🔒'}</div><div class="info"><div class="nm">${got ? VIDEOS[n].title : '？？？'}</div><div class="ds">${got ? 'もういちど {見|み}る' : 'まだ {見|み}られない'}</div></div>`);
      if (got) {
        const bb = el('div', 'btns');
        const bt = el('button', 'buy', '{見|み}る');
        bt.onclick = () => { UI.closePanel(); playVideo(n); };
        bb.appendChild(bt);
        row.appendChild(bb);
      }
      box.appendChild(row);
    }
  });
}

// ---------- しつない プランター ----------

function potAction(i) {
  const s = G.save, pt = s.pots[i], sel = s.sel;
  const px = 8 + i, py = 8; // world.js の プランターの ばしょ
  if (pt.c && pt.c.d >= CROPS[pt.c.id].days) {
    const id = pt.c.id;
    addItem(`c_${id}`);
    s.totals.harvest++;
    pt.c = null;
    pt.w = 0;
    pt.f = 0;
    Sfx.play('harvest');
    addFx(`${CROPS[id].name}！`, '#ffffff', (px + 0.5) * T, py * T - 10);
    UI.toast(id === 'nanohana' ? 'オイル{草|くさ}を しゅうかく！ オイル しぼりきで バリアオイルが できるよ' : `${CROPS[id].name}を しゅうかく！`, 2600);
    persist();
    return;
  }
  if (sel && sel.startsWith('seed:')) {
    const id = sel.slice(5);
    if (pt.c) { UI.toast('もう たねが まいて あるよ'); return; }
    if (!(s.seeds[id] > 0)) return;
    if (!spend(CFG.cost.plant)) return;
    s.seeds[id]--;
    pt.c = { id, d: 0 };
    Sfx.play('plant');
    UI.toast(`${CROPS[id].name}の たねを まいた！ {毎日|まいにち} じょうろで {水|みず}を あげよう`, 2400);
    UI.hotbar();
    persist();
    return;
  }
  if (sel === 'can') {
    if (!pt.c) { UI.toast('さきに たねを まこう'); return; }
    if (pt.w) { UI.toast('{今日|きょう}は もう {水|みず}を あげたよ'); return; }
    if (!spend(CFG.cost.water)) return;
    pt.w = 1;
    G.splash = { x: px, y: py - 0.5, t: 0 };
    Sfx.play('water');
    persist();
    return;
  }
  if (sel === 'kasu') {
    if (!pt.c) { UI.toast('さきに たねを まこう'); return; }
    if (pt.f) { UI.toast('もう ひりょうを まいたよ'); return; }
    if (--s.items.m_kasu <= 0) delete s.items.m_kasu;
    pt.f = 1;
    Sfx.play('plant');
    UI.toast('ひりょうを まいた！ {水|みず}を あげると ぐんぐん そだつよ', 2400);
    UI.hotbar();
    persist();
    return;
  }
  if (!pt.c) UI.toast('プランター。たねを えらんで Ⓐで まこう');
  else UI.toast(`${CROPS[pt.c.id].name}が そだって いる（あと ${CROPS[pt.c.id].days - pt.c.d}{日|にち}${pt.w ? '・{水|みず} OK' : '・{水|みず}を あげよう'}）`, 2400);
}

// ---------- ごうせい そうち ----------
// がらくたや もちものを いれると、SYNTH の かくりつで なにか でる。だいじな もの（MILESTONES）は かたづけた かずで かならず でる

// かくりつで ひとつ きめて もちものに いれる。でた もの { name, icon } か null
function rollSynth(kind) {
  const s = G.save;
  let pick = null;
  if (kind === 'machine' && s.synthMiss >= SCREW_PITY) pick = 'm_screw';
  else {
    let r = Math.random();
    for (const [id, p] of SYNTH[kind]) {
      if (r < p) { pick = id; break; }
      r -= p;
    }
  }
  if (kind === 'machine') s.synthMiss = pick === 'm_screw' ? 0 : s.synthMiss + 1;
  if (!pick) return null;
  if (pick === 'seed') {
    const k = pickOne((s.ch || 1) >= 2 ? [...SYNTH_SEEDS, ...SYNTH_SEEDS_CH2] : SYNTH_SEEDS);
    s.seeds[k] = (s.seeds[k] || 0) + 1;
    return { name: `${CROPS[k].name}の たね`, icon: `seed_${k}` };
  }
  addItem(pick);
  return { name: ITEMS[pick].name, icon: pick };
}

const gotLine = (got) => (got ? `ポン！「${got.name}」が {出|で}て きた！` : 'ぷしゅー… なにも {出|で}なかった');

function synthClutter() {
  const s = G.save;
  const c = CLUTTER.find((x) => x.id === s.tidy.carry);
  s.tidy.carry = null;
  s.tidy.stored.push(c.id);
  const n = s.tidy.stored.length;
  Sfx.play('synth');
  if (n === 5) for (const o of G.map.objs.filter((x) => x.web)) removeObj(G.map, o);
  const ms = MILESTONES[n];
  const extra = c.machine ? rollSynth('machine') : null; // こわれた きかいは ねじが でる かも
  if (ms) {
    giveMilestone(ms.give);
    setTimeout(() => Sfx.play('power'), 150);
    const lines = ms.lines.map((t) => t.replace('{n}', c.name));
    if (ms.give === 'rod') lines.push('かたづけの つづきも できるし、{外|そと}へ でかけても いいよ！');
    if (extra) lines.push(`それから… ${gotLine(extra)}`);
    UI.say(lines);
  } else {
    const got = extra || rollSynth('clutter');
    if (got) setTimeout(() => Sfx.play('power'), 150);
    UI.toast(`${c.name}を {入|い}れた… ${gotLine(got)}（${n}/${CLUTTER.length}）`, 2600);
  }
  UI.hud();
  UI.hotbar();
  persist();
}

// もちものを いれる ときの しゅるい（いれられない ものは null）
function synthKind(id) {
  const cat = ITEMS[id] && ITEMS[id].cat;
  if (cat === 'glow') return 'glow';
  if (cat === 'machine') return 'machine';
  if (cat === 'junk') return 'junk';
  if (cat === 'fish' || cat === 'crop') return 'food';
  return null;
}

function openSynth() {
  Sfx.play('beep');
  UI.panel('ごうせい そうち', (box) => {
    const s = G.save;
    const left = CLUTTER.length - s.tidy.stored.length;
    box.appendChild(el('p', 'help', `ものを いれると、ウィーン… なにかが でて くるかも！<br>こわれた きかいからは ねじが でる ことが あるよ。さかなも ときどき ねじを のみこんで いるよ。${left ? `<br>けんきゅうじょの がらくたも もって きて いれよう（のこり ${left}こ）` : ''}`));
    const list = Object.entries(s.items).filter(([id, n]) => n > 0 && synthKind(id));
    if (!list.length) {
      box.appendChild(el('p', 'empty', 'いま {入|い}れられる ものが ないよ。<br>（こわれた きかい・いし・ながぐつ・さかな・{野|や}さい を {入|い}れられるよ）'));
      return;
    }
    for (const [id, n] of list) {
      const row = el('div', 'row');
      const k = synthKind(id);
      row.innerHTML = rbh(`${iconImg(id, 'ic m')}<div class="info"><div class="nm">${ITEMS[id].name} × ${n}</div><div class="ds">${k === 'machine' ? 'ねじ や てつくずが でる かも' : k === 'junk' ? 'てつくずが でる かも' : k === 'glow' ? 'あぶらかす（ひりょう）が でるよ。ねじが でる ことも' : /^f_/.test(id) ? 'たね や ねじが でる かも' : 'たねが でる かも'}</div></div>`);
      const bb = el('div', 'btns');
      const bt = el('button', 'buy', 'いれる');
      bt.onclick = () => putSynth(id);
      bb.appendChild(bt);
      row.appendChild(bb);
      box.appendChild(row);
    }
  });
}

function putSynth(id) {
  const s = G.save;
  if (!(s.items[id] > 0)) return;
  if (!spend(CFG.cost.tidy)) return;
  if (--s.items[id] <= 0) delete s.items[id];
  Sfx.play('synth');
  const got = rollSynth(synthKind(id));
  const fish = /^[fg]_/.test(id) && Math.random() < FISH_SCREW;
  if (fish) addItem('m_screw');
  if (got || fish) setTimeout(() => Sfx.play('power'), 200);
  UI.toast(fish ? `${gotLine(got)}\n…あれ？ ねじも 1こ {出|で}て きた！ さかなが ねじを のみこんで いた みたい` : gotLine(got), fish ? 3600 : 2200);
  UI.rebuild();
  UI.hotbar();
  persist();
}

// ---------- オイル しぼりき ----------

function takeItems(need) {
  const s = G.save;
  for (const [id, n] of Object.entries(need)) if ((s.items[id] || 0) < n) return false;
  for (const [id, n] of Object.entries(need)) if ((s.items[id] -= n) <= 0) delete s.items[id];
  return true;
}

function usePress(o) {
  if (G.save.fixed.press) openPress();
  else tryFix('press', () => { o.spr = 'pressOk'; });
}

function openPress() {
  Sfx.play('ui');
  UI.panel('オイル しぼりき', (box) => {
    const s = G.save;
    box.appendChild(el('div', 'wallet', `🛢 ロボの オイル <b>${Math.round(s.oil)}</b> / 100`));
    for (const [id, o] of Object.entries(OILS)) {
      const have = s.items[o.from] || 0;
      const row = el('div', 'row');
      row.innerHTML = rbh(`${iconImg(id, 'ic m')}<div class="info"><div class="nm">${o.name}</div><div class="ds">${ITEMS[o.from].name} ${o.need}こ → 1こ（ぬると 🛢+${o.oil}）。もっている ${ITEMS[o.from].name}：${have}こ</div></div>`);
      const bb = el('div', 'btns');
      const bt = el('button', `buy${have < o.need ? ' off' : ''}`, 'しぼる');
      bt.onclick = () => pressMake(id);
      bb.appendChild(bt);
      row.appendChild(bb);
      box.appendChild(row);
    }
    oilRows(box);
  });
}

function pressMake(id) {
  const o = OILS[id];
  if ((G.save.items[o.from] || 0) < o.need) {
    Sfx.play('err');
    UI.toast(`${ITEMS[o.from].name}が ${o.need}こ いるよ`);
    return;
  }
  if (!spend(CFG.cost.tidy)) return;
  takeItems({ [o.from]: o.need });
  addItem(id);
  Sfx.play('press');
  UI.toast(`ギュギュッ… ${o.name}が できた！`);
  UI.rebuild();
  persist();
}

// もっている オイルを さす ボタン（もちもの・しぼりき）
function oilRows(box) {
  const s = G.save;
  const have = Object.keys(OILS).filter((id) => s.items[id] > 0);
  if (!have.length) return;
  box.appendChild(el('p', 'help', '<b>バリアオイルを {体|からだ}に ぬる</b>'));
  for (const id of have) {
    const row = el('div', 'row');
    row.innerHTML = rbh(`${iconImg(id, 'ic m')}<div class="info"><div class="nm">${OILS[id].name} × ${s.items[id]}</div><div class="ds">ぬると 🛢+${OILS[id].oil}</div></div>`);
    const bb = el('div', 'btns');
    const bt = el('button', 'buy', 'ぬる');
    bt.onclick = () => oilUp(id);
    bb.appendChild(bt);
    row.appendChild(bb);
    box.appendChild(row);
  }
}

// ---------- そとの なのはな・こわれた きかい ----------

function pickWild(o) {
  const s = G.save;
  if (!wildReady(s, o.wid)) {
    UI.toast(`オイル{草|くさ}は また さくまで まとう（とってから ${CFG.wildRegrow}{日|にち}）`);
    return;
  }
  if (!spend(CFG.cost.tidy)) return;
  s.wild[o.wid] = s.day;
  o.spr = 'wildPicked';
  addItem('c_nanohana');
  Sfx.play('harvest');
  addFx('オイル{草|くさ}！', '#fff07a', (o.x + 0.5) * T, o.y * T);
  UI.toast(G.save.fixed.press ? 'オイル{草|くさ}を とった！ しぼりきで バリアオイルに できるよ' : 'オイル{草|くさ}を とった！ しぼりきを {直|なお}すと オイルに できるよ', 2600);
  persist();
}

function pickScrap(o) {
  const s = G.save;
  if (!spend(CFG.cost.tidy)) return;
  removeObj(G.map, o);
  s.picked.push(o.sid);
  addItem('scrap');
  Sfx.play('pick');
  UI.toast('こわれた きかいを ひろった！ ごうせい そうちに {入|い}れて みよう', 2400);
  persist();
}

function giveMilestone(give) {
  const s = G.save;
  if (give.startsWith('part:')) {
    const k = give.slice(5);
    s.parts[k] = Math.max(1, s.parts[k] || 0);
  }
  if (give.startsWith('seed:')) {
    const [, k, n] = give.split(':');
    s.seeds[k] = (s.seeds[k] || 0) + Number(n);
  }
  if (give === 'rod') { s.tools.rod = Math.max(1, s.tools.rod); s.sel = 'rod'; }
  if (give === 'net') s.tools.net = 1;
  if (give === 'hoe') s.tools.hoe = 1;
  UI.hotbar();
  UI.hud();
}

function addItem(id, n = 1) {
  G.save.items[id] = (G.save.items[id] || 0) + n;
}

function addFx(text, color, x, y) {
  const p = G.p;
  const px = x != null ? x : (p.x + 0.5) * T;
  const py = y != null ? y : p.y * T - 22;
  G.fx.push({ text, color, x: px, y: py, t: 0 });
}

function useItem(tx, ty, o) {
  const sel = G.save.sel;
  if (!sel) {
    UI.toast(o ? 'なにも おきない みたい' : 'なにも ないよ');
    return;
  }
  if (sel === 'rod') return startFishing(tx, ty);
  if (sel === 'net') return UI.say('ちいさな むしあみ。');
  const farmOpen = G.map.id === 'out' && (G.save.ch || 1) >= 2;
  if ((sel === 'kasu' || sel === 'can' || sel.startsWith('seed:')) && !farmOpen) {
    UI.toast((G.save.ch || 1) >= 2 ? 'プランターか、{外|そと}の はたけで つかおう' : 'けんきゅう{室|しつ}の プランターの {前|まえ}で つかおう');
    return;
  }
  if (G.map.id !== 'out') {
    Sfx.play('err');
    UI.toast('けんきゅう{室|しつ}の {中|なか}では つかえないよ');
    return;
  }
  if (sel === 'hoe') return useHoe(tx, ty, o);
  if (sel === 'can') return useCan(tx, ty);
  if (sel === 'kasu') return useKasu(tx, ty);
  if (sel.startsWith('seed:')) return plantSeed(sel.slice(5), tx, ty);
}

// ---------- はたけ ----------

function useHoe(tx, ty, o) {
  const s = G.save, m = G.map;
  if (o && o.t === 'weed') {
    if (!spend(CFG.cost.weed)) return;
    removeObj(m, o);
    s.cleared.push(o.key);
    Sfx.play('cut');
    persist();
    return;
  }
  if (o && o.t === 'rock') {
    if ((s.parts.arm || 0) < PART_FX.rockArm) {
      Sfx.play('err');
      UI.say('うーん… いしが おもくて うごかない。\nもっと つよい うでの パーツが あれば…');
      return;
    }
    if (!spend(CFG.cost.rock)) return;
    removeObj(m, o);
    s.cleared.push(o.key);
    addItem('stone');
    Sfx.play('till');
    UI.toast('いしを どけた！（いしを 1こ てに いれた）');
    persist();
    return;
  }
  if (o) {
    Sfx.play('err');
    UI.toast('ここは たがやせないよ');
    return;
  }
  if (!inFarm(tx, ty) || tileAt(m, tx, ty) !== TL.GRASS) {
    Sfx.play('err');
    UI.toast('さくの なかの はたけで たがやそう');
    return;
  }
  const key = `${tx},${ty}`;
  if (s.plots[key]) {
    UI.toast(s.plots[key].c ? 'やさいが そだって いるよ' : 'もう たがやして あるよ');
    return;
  }
  if (!spend(CFG.cost.hoe)) return;
  s.plots[key] = { w: 0, c: null };
  Sfx.play('till');
  if (!s.flags.firstTill) {
    s.flags.firstTill = true;
    UI.toast('たがやした！ おみせで たねを かって まこう', 2600);
  }
  persist();
}

function useKasu(tx, ty) {
  const s = G.save;
  const pl = s.plots[`${tx},${ty}`];
  if (!pl || !pl.c) {
    UI.toast('たねを まいた ところに まこう');
    return;
  }
  if (pl.f) {
    UI.toast('もう ひりょうを まいたよ');
    return;
  }
  if (--s.items.m_kasu <= 0) delete s.items.m_kasu;
  pl.f = 1;
  Sfx.play('plant');
  UI.toast('ひりょうを まいた！ {水|みず}を あげると ぐんぐん そだつよ', 2400);
  UI.hotbar();
  persist();
}

function useCan(tx, ty) {
  const s = G.save;
  const pl = s.plots[`${tx},${ty}`];
  if (!pl) {
    UI.toast('たがやした つちに みずを あげよう');
    return;
  }
  if (!pl.c) {
    UI.toast('さきに たねを まこう');
    return;
  }
  if (pl.w) {
    UI.toast('きょうは もう みずを あげたよ');
    return;
  }
  if (!spend(CFG.cost.water)) return;
  pl.w = 1;
  G.splash = { x: tx, y: ty, t: 0 };
  Sfx.play('water');
  persist();
}

function plantSeed(id, tx, ty) {
  const s = G.save;
  const pl = s.plots[`${tx},${ty}`];
  if (!pl) {
    UI.toast('くわで たがやした ところに まこう');
    return;
  }
  if (pl.c) {
    UI.toast('もう たねが まいて あるよ');
    return;
  }
  if (!(s.seeds[id] > 0)) return;
  if (!spend(CFG.cost.plant)) return;
  s.seeds[id]--;
  pl.c = { id, d: 0 };
  Sfx.play('plant');
  UI.toast(`${CROPS[id].name}の たねを まいた！ まいにち みずを あげよう`, 2400);
  UI.hotbar();
  persist();
}

function cropStage(c) {
  const days = CROPS[c.id].days;
  if (c.d >= days) return 3;
  if (c.d === 0) return 0;
  return c.d < days / 2 ? 1 : 2;
}

function harvest(pl, tx, ty) {
  const s = G.save;
  const id = pl.c.id;
  addItem(`c_${id}`);
  s.totals.harvest++;
  pl.c = null;
  pl.w = 0;
  pl.f = 0;
  Sfx.play('harvest');
  addFx(`${CROPS[id].name}！`, '#ffffff', (tx + 0.5) * T, ty * T);
  UI.toast(`${CROPS[id].name}を しゅうかく！`);
  persist();
}

// ---------- ねる ----------

function sleep() {
  G.busy = true;
  Sfx.play('sleep');
  fadeTo(1, () => {
    const s = G.save;
    let grown = 0, ready = 0;
    const helped = s.flags.otter && s.otterFed === s.day;
    const love = s.otterLove === s.day;
    const ch2 = s.flags.ch1done && (s.ch || 1) < 2;
    for (const pl of [...Object.values(s.plots), ...s.pots]) {
      if (pl.c && pl.w && pl.c.d < CROPS[pl.c.id].days) {
        pl.c.d = Math.min(CROPS[pl.c.id].days, pl.c.d + (pl.f ? KASU_BOOST : 1)); // ひりょうが あると 2日ぶん
        grown++;
      }
      pl.w = 0;
      if (pl.c && pl.c.d >= CROPS[pl.c.id].days) ready++;
    }
    s.day++;
    let gift = null;
    if (helped) {
      for (const pl of [...Object.values(s.plots), ...s.pots]) if (pl.c && pl.c.d < CROPS[pl.c.id].days) pl.w = 1;
      if (Math.random() < (love ? 0.7 : OTTER_GIFT)) {
        gift = pickOne(OTTER_FISH);
        addItem(`f_${gift}`);
      }
    }
    useOil(CFG.oil.perDay);
    for (const o of G.maps.out.objs) if (o.t === 'wild') o.spr = wildReady(s, o.wid) ? 'wild' : 'wildPicked';
    G.p.dir = 'down';
    persist();
    UI.hud();
    $('fadeText').textContent = `${s.day}にちめ の あさ`;
    setTimeout(() => {
      $('fadeText').textContent = '';
      fadeTo(0, () => {
        G.busy = false;
        Sfx.play('morning');
        const lines = [`ピピッ… ${s.day}{日目|にちめ}の {朝|あさ}。スリープ かいじょ！`];
        if (grown) lines.push(`{水|みず}を あげた さくもつが そだったよ！${ready ? `\nしゅうかく できる ものが ${ready}こ あるよ！` : ''}`);
        if (s.oil < CFG.oilGlow) lines.push('バリアオイル🛢が すくないよ。{体|からだ}に ネオンスポアが くっついて いる…\nしぼりきで つくって、もちもの🎒から ぬろう！');
        if (helped) lines.push('カワウソ「おはようだプイ！ はたけと プランターに {水|みず}を まいて おいたプイ！」');
        if (gift) lines.push(`カワウソ「${FISH[gift].name}を とって きたプイ！ あげるプイ！」`);
        if (s.stamina < 10 && !unlimitedStamina()) lines.push('{電池|でんち}🔋が すくないね。\n{算数|さんすう}アプリの「じつりょくテスト」で じゅう{電|でん} しよう！');
        UI.say(lines, ch2 ? startCh2 : undefined);
      }, 600);
    }, 1300);
  }, 700);
}

// ---------- つり ----------
// なげる → さかなが よってくる（approach）
// → まえあたり：うきが「ツン」と すこし しずむ（nibble。ここで Aを おすと にげる）
// → ほんあたり：うきが スパッと しずむ（bite。さかなごとの みじかい じかんの うちに A）
// → リール（reel：メーターの みどりで A）

const rnd = (a, b) => a + Math.random() * (b - a);

function startFishing(tx, ty) {
  if (tileAt(G.map, tx, ty) !== TL.WATER) {
    Sfx.play('err');
    UI.toast('みずの まえで つりざおを つかおう');
    return;
  }
  if (G.map.id === 'sea' && tileAt(G.map, G.p.x, G.p.y) !== TL.PIER && !G.save.tools.boat) {
    Sfx.play('err');
    UI.toast('ここからは つれない… ていぼうの {上|うえ}から つろう');
    return;
  }
  if (!spend(CFG.cost.cast)) return;
  Sfx.play('cast');
  const pick = pickFish();
  const junk = !/^[fg]_/.test(pick.id);
  const f = {
    state: 'approach', t: 0, since: 0, tx, ty, dir: G.p.dir,
    item: pick.id, spec: pick.spec, junk, dip: 0, nib: 0,
    wait: rnd(CFG.approach[0], CFG.approach[1]) * (junk ? 0.6 : 1),
  };
  // まえあたりの よてい（ごみは まえあたり なしで ずずっと しずむ）
  const n = junk ? 0 : Math.round(rnd(CFG.nibbles[0], CFG.nibbles[1]));
  f.sched = [];
  let at = 0.25;
  for (let i = 0; i < n; i++) {
    f.sched.push(at);
    at += rnd(CFG.nibbleGap[0], CFG.nibbleGap[1]);
  }
  f.biteAt = (n ? f.sched[n - 1] : 0) + rnd(CFG.biteDelay[0], CFG.biteDelay[1]);
  f.cut = cutinStart(f);
  G.fishing = f;
  UI.cutin(true);
}

function pickFish() {
  const s = G.save, tier = s.tools.rod;
  const pool = [];
  const sea = G.map && G.map.id === 'sea';
  if (G.map && G.map.glow && !sea) {
    // よごれた 水ろ：ネオンスポアで 光る すがたの さかな だけ。2しょうでは さびた はぐるまも しずんで いる
    for (const k of Object.keys(GLOW)) pool.push({ id: `g_${k}`, w: FISH[k].w, spec: FISH[k] });
    if ((s.ch || 1) >= 2 && !s.fixed.filter && (s.items.m_gear || 0) < GEARS_NEED) pool.push({ id: 'm_gear', w: 45, spec: JUNK.gear });
  } else {
    // きれいな 水ろ と 海：sea の ついた いきものは 海 だけ
    for (const [k, f] of Object.entries(FISH)) {
      if (f.tier <= tier && !!f.sea === sea) pool.push({ id: `f_${k}`, w: f.tier < tier ? f.w * 0.6 : f.w, spec: f });
    }
  }
  for (const [k, j] of Object.entries(JUNK)) pool.push({ id: j.item || `j_${k}`, w: j.w, spec: j });
  let r = Math.random() * pool.reduce((a, x) => a + x.w, 0);
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x;
  }
  return pool[0];
}

function newZone(f) {
  let c;
  do c = f.zw / 2 + Math.random() * (1 - f.zw); while (Math.abs(c - f.zc) < 0.25 && Math.random() < 0.9);
  f.zc = c;
}

function fishUpdate(dt) {
  const f = G.fishing;
  f.t += dt;
  f.since += dt;
  f.dip = Math.max(0, f.dip - dt);
  if (f.state === 'approach' && f.t >= f.wait) {
    f.state = 'nibble';
    f.t = 0;
  }
  if (f.state === 'nibble') {
    while (f.nib < f.sched.length && f.t >= f.sched[f.nib]) {
      f.nib++;
      f.dip = 0.2;
      Sfx.play('nibble');
      UI.cutText('ツン');
      cutinEvent(f, 'nibble');
    }
    if (f.t >= f.biteAt) {
      f.state = 'bite';
      f.t = 0;
      Sfx.play(f.junk ? 'heavy' : 'sink');
      UI.cutText(f.junk ? 'ずずっ…' : 'スパッ！');
      cutinEvent(f, 'bite');
      try { navigator.vibrate && navigator.vibrate(80); } catch { /* なし */ }
    }
  } else if (f.state === 'bite' && f.t > f.spec.bite + partFx('bite', 'sensor')) {
    endFishing(f.junk ? 'あれ？ なにかに ひっかかって いたのかな…' : 'あ… えさだけ とられちゃった');
  } else if (f.state === 'reel') {
    const u = (f.t * f.speed) % 2;
    f.pos = u < 1 ? u : 2 - u;
    UI.fishDraw(f);
  }
}

function fishPress() {
  const f = G.fishing;
  if (f.state === 'approach') {
    UI.toast('まだ だよ… うきを よく みてね', 1100);
    return;
  }
  if (f.state === 'nibble') {
    endFishing('はやすぎた！ さかなが にげちゃった');
    return;
  }
  if (f.state === 'bite') {
    const bonus = G.save.tools.rod >= 2 ? 1.2 : 1;
    Object.assign(f, {
      state: 'reel', t: 0, need: f.spec.hits, hits: 0, miss: 0,
      zw: Math.min(0.5, f.spec.zone * bonus), zc: 0.5, speed: f.spec.speed, pos: 0,
    });
    newZone(f);
    UI.fishMsg(f.junk ? 'なにか かかった！ みどりで Ⓐ！' : 'かかった！ みどりの ところで Ⓐ！');
    UI.fishGauge(true);
    UI.fishDraw(f);
    UI.cutText(f.junk ? 'ずるずる…' : 'グググッ');
    cutinEvent(f, 'reel');
    Sfx.play('hit');
    return;
  }
  if (f.state === 'reel') {
    if (Math.abs(f.pos - f.zc) <= f.zw / 2) {
      f.hits++;
      Sfx.play('hit');
      cutinEvent(f, 'hit');
      if (f.hits >= f.need) {
        landFish();
        return;
      }
      UI.fishMsg('いいぞ！ もういっかい！');
      newZone(f);
    } else {
      f.miss++;
      Sfx.play('miss');
      if (f.miss > CFG.missesAllowed) {
        endFishing('あ〜… にげられちゃった');
        return;
      }
      UI.fishMsg('おしい！ みどりの ところで！');
    }
    UI.fishDraw(f);
  }
}

function landFish() {
  const s = G.save;
  const id = G.fishing.item;
  endFishing(null, true);
  addItem(id);
  let isNew = false;
  if (/^[fg]_/.test(id)) {
    const k = id.slice(2);
    const dex = id[0] === 'g' ? s.gdex : s.dex;
    isNew = !dex[k];
    dex[k] = (dex[k] || 0) + 1;
    s.totals.fish++;
  }
  Sfx.play('catch');
  persist();
  const first = id[0] === 'g' && !s.flags.glowSeen;
  if (first) s.flags.glowSeen = true;
  let after = first ? () => UI.say([
    'さかなが {青|あお}く {光|ひか}って いる… ネオンスポアが くっついて いるんだ。',
    'この さかなからは オイルが とれない みたい。',
    'でも、ごうせい そうちに {入|い}れると「あぶらかす」が できるよ。プランターに まくと ひりょうに なる！',
  ]) : null;
  if (id === 'm_gear') {
    const n = s.items.m_gear;
    after = () => UI.say(n >= GEARS_NEED ? `さびた はぐるまが ${GEARS_NEED}こ そろった！ ろかそうちを {直|なお}しに {行|い}こう。` : `さびた はぐるま ${n}/${GEARS_NEED}。あと ${GEARS_NEED - n}こ！`);
    UI.hud();
  }
  // きれいな 水ろで はじめて つれた さかな：ビデオ07
  if (id[0] === 'f' && !FISH[id.slice(2)].sea && !s.videos.includes(7)) after = () => playVideo(7);
  UI.catchCard(id, isNew, after);
}

// caught：つれた（カットインは すぐ けす）。ちがう ときは さかなが にげる ところを すこし みせる
function endFishing(msg, caught = false) {
  const f = G.fishing;
  if (!f) return;
  G.fishing = null;
  UI.fishGauge(false);
  if (caught) UI.cutin(false);
  else cutinFlee(f);
  if (msg) {
    Sfx.play('lose');
    UI.toast(msg);
  }
}

// ---------- もちもの・ずかん ----------

function openBag() {
  Sfx.play('ui');
  UI.panel('もちもの', (box) => {
    const s = G.save;
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['items', 'もちもの'], ['parts', 'ロボの パーツ'], ['dex', 'ラボ{図|ず}かん']]) {
      const b = el('button', `tab${(G.bagTab || 'items') === k ? ' on' : ''}`, label);
      b.onclick = () => { G.bagTab = k; Sfx.play('ui'); UI.rebuild(); };
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    if ((G.bagTab || 'items') === 'dex') {
      // さかなの ページ：光る すがた（1しょう）と もとの すがた（水ろが きれいに なってから）
      const n = Object.keys(s.gdex).length + Object.keys(s.dex).length;
      box.appendChild(el('div', 'wallet', `{魚|さかな}の ページ　みつけた かず <b>${n} / ${Object.keys(GLOW).length + Object.keys(FISH).length}</b>`));
      box.appendChild(el('p', 'help', '<b>{光|ひか}る すがた</b>（よごれた {水|みず}ろ）'));
      let grid = el('div', 'dex');
      for (const [k, gl] of Object.entries(GLOW)) {
        const got = s.gdex[k];
        const c = el('div', `dcard${got ? '' : ' unknown'}`);
        c.innerHTML = rbh(`${iconImg(`g_${k}`, 'ic m')}<div class="nm">${got ? ITEMS[`g_${k}`].name : '？？？'}</div><div class="ds">${got ? `${gl.desc}<br>つった かず：${got}` : 'まだ つって いない'}</div>`);
        grid.appendChild(c);
      }
      box.appendChild(grid);
      for (const [sea, title] of [[false, '<b>{水|みず}ろの {魚|さかな}</b>（{水|みず}ろが きれいに なると あえる）'], [true, '<b>{海|うみ}の いきもの</b>（ていぼう から つれる）']]) {
        box.appendChild(el('p', 'help', title));
        grid = el('div', 'dex');
        for (const [k, f] of Object.entries(FISH)) {
          if (!!f.sea !== sea) continue;
          const got = s.dex[k];
          const c = el('div', `dcard${got ? '' : ' unknown'}`);
          c.innerHTML = rbh(`${iconImg(`f_${k}`, 'ic m')}<div class="nm">${got ? f.name : '？？？'}</div><div class="ds">${got ? `${f.desc}<br>つった かず：${got}` : 'まだ {見|み}た ことが ない'}</div>`);
          grid.appendChild(c);
        }
        box.appendChild(grid);
      }
      return;
    }
    if (G.bagTab === 'parts') {
      const top = el('div', 'robo');
      top.innerHTML = `<img class="ic robo-img" src="${robotSpr('down', 0, s.parts, s.flags.awake, s.color).toDataURL()}" alt="">
        <p class="help">パーツを つけると ロボが つよく なって、できる ことが ふえるよ。<br>もっと いい パーツは、これから たんけんで みつかるかも！</p>`;
      box.appendChild(top);
      for (const [k, p] of Object.entries(PARTS)) {
        const lv = s.parts[k] || 0;
        const row = el('div', `row${lv ? '' : ' weak'}`);
        row.innerHTML = `${iconImg(`part_${k}`, 'ic m')}<div class="info"><div class="nm">${p.label}：${p.names[Math.min(lv, p.names.length - 1)]}</div><div class="ds">${p.does[Math.min(lv, p.does.length - 1)]}${lv ? '' : '（はじめから ついている ぼろぼろの パーツ）'}</div></div><div class="pr">Lv ${lv}</div>`;
        box.appendChild(row);
      }
      return;
    }
    box.appendChild(el('div', 'wallet', `🔋 {電池|でんち} <b>${unlimitedStamina() ? '∞' : s.stamina}</b> / ${CFG.staminaMax}　🛢 オイル <b>${Math.round(s.oil)}</b>`));
    const grid = el('div', 'grid');
    const cell = (icon, name, n) => {
      const c = el('div', 'cell', `${iconImg(icon, 'ic m')}${n != null ? `<b>${n}</b>` : ''}<span>${name}</span>`);
      grid.appendChild(c);
    };
    for (const it of hotbarItems()) cell(it.icon, it.name, it.n);
    for (const [id, n] of Object.entries(s.items)) if (n > 0 && ITEMS[id]) cell(id, ITEMS[id].name, n);
    if (!grid.children.length) box.appendChild(el('p', 'empty', 'まだ なにも もって いないよ。'));
    else box.appendChild(grid);
    oilRows(box);
  });
}

// ---------- 町の 地図 ----------

function openMap() {
  Sfx.play('ui');
  UI.panel('{町|まち}の {地図|ちず}', (box) => {
    const s = G.save;
    const here = G.map.id === 'house' ? 'out' : G.map.id;
    box.appendChild(el('p', 'help', '{水|みず}ろが じょうりゅうの こうざん から、かりゅうの {海|うみ}へ ながれて いるよ。'));
    const grid = el('div', 'tmap');
    const rows = Math.max(...Object.values(AREAS).map((a) => a.row)) + 1;
    grid.style.gridTemplateRows = `repeat(${rows}, auto)`;
    grid.appendChild(el('div', 'river'));
    for (const [id, a] of Object.entries(AREAS)) {
      const open = (s.flags.allOpen || ((s.ch || 1) >= a.ch && (!a.flag || s.flags[a.flag]))) && a.built;
      const visited = (s.visited || {})[id] || id === 'out';
      const cls = id === here ? 'here' : open ? (visited ? 'ok' : 'new') : 'lock';
      const status = id === here ? `🤖 ${escHTML(s.name || 'ロビタ')}が いる` : open ? (visited ? '{行|い}ける' : '{行|い}ける（まだ {行|い}って いない）') : a.flag === 'cleanWater' && (s.ch || 1) >= a.ch ? '🔒 ろかそうちを {直|なお}すと {行|い}ける' : `🔒 ${a.ch}しょうで {行|い}ける`;
      const c = el('div', `tcell ${cls}`, `<div class="nm">${a.name}</div><div class="ds">${status}</div><div class="ds sm">${a.note}</div>`);
      c.style.gridColumn = String(a.col + 1);
      c.style.gridRow = String(a.row + 1);
      // おとなの テスト：たっぷして その エリアへ
      if (G.dev && a.built && id !== here) {
        c.onclick = () => {
          UI.closePanel();
          const m = ensureMap(id);
          const d = m.doors.find((x) => x.x0 != null) || { x0: 20, y: 14 };
          const [lx, ly] = landing(m, d.x0, d.y === 0 ? 1 : d.y === m.h - 1 ? m.h - 2 : d.y);
          setMap(id, lx, ly, 'down');
          (s.visited = s.visited || {})[id] = true;
          persist();
        };
      }
      grid.appendChild(c);
    }
    box.appendChild(grid);
  });
}

// ---------- メニュー ----------

function openMenu() {
  Sfx.play('ui');
  UI.panel('メニュー', (box) => {
    const s = G.save;
    const add = (label, fn, cls = '') => {
      const b = el('button', `big ${cls}`, label);
      b.onclick = fn;
      box.appendChild(b);
    };
    box.appendChild(el('p', 'help', `<b>${esc(G.profile.name)}</b> の ロボ「${esc(s.name || 'ロビタ')}」 ・ ${s.day}{日目|にちめ}<br>つった さかな ${s.totals.fish}ひき ・ しゅうかく ${s.totals.harvest}こ`));
    box.appendChild(el('p', 'help', '🔋 {電池|でんち}は、{算数|さんすう}アプリの「じつりょくテスト」の てんすう ぶん じゅう{電|でん} されるよ。<br>うごいたり、きかいを {直|なお}すと へるよ。スリープ しても ふえないよ。<br>🛢 バリアオイルは うごくと へるよ。はんぶんより すくないと {体|からだ}に ネオンスポアが くっついて {光|ひか}り、なくなると うごきが とても おそく なるよ。しぼりきで つくって ぬろう。'));
    add(Sfx.mute ? '🔇 おと：なし' : '🔊 おと：あり', () => { Sfx.mute = !Sfx.mute; UI.rebuild(); });
    add('👪 こどもを かえる', () => backToTitle());
    add('🧮 さんすうアプリに もどる', () => {
      persist();
      location.href = CFG.mathUrl;
    });
    if (G.dev) {
      box.appendChild(el('p', 'help', 'おとな（テスト）メニュー'));
      add('⚡ かみなりで でんちを 50 とどける（じつりょくテストの かわり）', () => { grantGameStamina(G.pid, 50, 'テスト'); UI.closePanel(); checkGrants(); });
      add('🔩 ねじ +3・てつくず +8', () => { addItem('m_screw', 3); addItem('m_scrap', 8); persist(); UI.rebuild(); });
      add('🛢 オイル 100', () => { s.oil = 100; UI.hud(); persist(); UI.rebuild(); });
      add(s.flags.allOpen ? '🔓 ふさがった みち：ぜんぶ ひらいて いる' : '🔒 ふさがった みちを ぜんぶ ひらく（テスト）', () => {
        s.flags.allOpen = !s.flags.allOpen;
        rebuildAreas();
        persist();
        UI.rebuild();
      });
      add('🔧 1しょうの きかいを ぜんぶ なおす', () => {
        for (const c of CH1) { s.fixed[c.id] = true; if (!s.videos.includes(c.video)) s.videos.push(c.video); }
        s.flags.oiled = true;
        fixPots();
        G.maps.house = buildHouse(s);
        bakeGround(G.maps.house);
        if (G.map.id === 'house') G.map = G.maps.house;
        UI.hud();
        persist();
        UI.closePanel();
      });
      add('🌅 2しょうを はじめる（1しょう クリア あつかい）', () => {
        s.flags.ch1done = true;
        UI.closePanel();
        if ((s.ch || 1) < 2) startCh2();
      });
      add('⚙ さびた はぐるま +3・バリアオイル +1', () => { addItem('m_gear', 3); addItem('o_nanohana'); UI.hud(); persist(); UI.rebuild(); });
      add(G.infinite ? '🔋 でんち むげん：オン' : '🔋 でんち むげん：オフ', () => { G.infinite = !G.infinite; UI.hud(); UI.rebuild(); });
      add('🧹 けんきゅうじょを ぜんぶ かたづける', () => {
        while (s.tidy.stored.length < CLUTTER.length) {
          const c = CLUTTER.find((x) => !s.tidy.stored.includes(x.id));
          s.tidy.stored.push(c.id);
        }
        s.tidy.carry = null;
        for (const ms of Object.values(MILESTONES)) giveMilestone(ms.give);
        G.maps.house = buildHouse(s);
        bakeGround(G.maps.house);
        if (G.map.id === 'house') G.map = G.maps.house;
        persist();
        UI.closePanel();
      });
    }
    add('🗑 さいしょから やりなおす', () => {
      UI.closePanel();
      UI.ask('ほんとうに さいしょから やりなおす？\n（いまの きろくは きえるよ）', ['やめる', 'やりなおす'], (k) => {
        if (k !== 1) return;
        Store.remove(KEY.save(G.pid));
        const p = G.profile;
        G.save = null;
        startGame(p);
      });
    }, 'danger');
  });
}

// ---------- かく ----------

// ものの かげ（よこの はんけい・たての はんけい）
const SHADOW = {
  tree: [24, 6], bush: [15, 4], rock: [12, 3], vend: [30, 4], bin: [28, 4], sign: [9, 3],
  clutter: [12, 3], reed: [6, 2], table: [28, 4], synth: [30, 3], press: [28, 3], charger: [30, 3], bed: [30, 3], wild: [8, 2], scrap: [12, 3],
  pod: [30, 4], pot: [14, 3], filter: [30, 5], otter: [10, 3], otterWeak: [14, 3],
  deadTree: [12, 3], car: [30, 4], wall: [30, 3], barrel: [9, 3], rubble: [14, 3],
  gate: [14, 3], airTree: [44, 6], bench: [14, 3], boat: [30, 4], stump: [12, 3], crate: [12, 3],
};

function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  G.canvas.width = Math.round(innerWidth * dpr);
  G.canvas.height = Math.round(innerHeight * dpr);
  G.cw = G.canvas.width;
  G.ch = G.canvas.height;
  // 1ドットが ちょうど なんピクセルかに なる おおきさ（たて 11マス くらい みえる）
  G.scale = Math.max(1, Math.floor(G.ch / (T * 11)));
  while (G.scale > 1 && G.cw / (G.scale * T) < 15) G.scale--;
  G.ctx.imageSmoothingEnabled = false;
  // ひだりうえから さす ひかり
  const lg = G.ctx.createLinearGradient(0, 0, G.cw, G.ch);
  lg.addColorStop(0, 'rgba(255,236,170,.15)');
  lg.addColorStop(0.5, 'rgba(255,236,170,0)');
  lg.addColorStop(1, 'rgba(40,20,60,.13)');
  G.light = lg;
}

function drawSpr(g, spr, o) {
  const dx = Math.round(o.x * T + (o.w * T - spr.width) / 2);
  const dy = (o.y + o.h) * T - spr.height;
  if (o.mirror) {
    g.save();
    g.translate(dx + spr.width, dy);
    g.scale(-1, 1);
    g.drawImage(spr, 0, 0);
    g.restore();
  } else {
    g.drawImage(spr, dx, dy);
  }
}

function shadowAt(g, cx, by, rx, ry) {
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * 2 * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
    g.fillRect(Math.round(cx - w / 2), Math.round(by + y), w, 1);
  }
}

function render() {
  const g = G.ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#17110c';
  g.fillRect(0, 0, G.cw, G.ch);
  if (!G.save || !G.map) return;
  const m = G.map, s = G.scale, p = G.p;
  const vw = G.cw / s, vh = G.ch / s;
  const k = p.moving ? p.t : 0;
  const ppx = (p.x + (p.tx - p.x) * k) * T;
  const ppy = (p.y + (p.ty - p.y) * k) * T;
  const mw = m.w * T, mh = m.h * T;
  const cx = Math.round(mw <= vw ? -(vw - mw) / 2 : clamp(ppx + T / 2 - vw / 2, 0, mw - vw));
  const cy = Math.round(mh <= vh ? -(vh - mh) / 2 : clamp(ppy + T / 2 - vh / 2, 0, mh - vh));
  g.setTransform(s, 0, 0, s, -cx * s, -cy * s);
  g.imageSmoothingEnabled = false;

  // じめん（やきこんだ え の みえる ところだけ）
  const sx = Math.max(0, cx), sy = Math.max(0, cy);
  const sw = Math.min(mw, cx + vw) - sx, sh = Math.min(mh, cy + vh) - sy;
  if (sw > 0 && sh > 0) g.drawImage(m.ground, sx, sy, sw, sh, sx, sy, sw, sh);
  const x0 = Math.max(0, Math.floor(cx / T)), y0 = Math.max(0, Math.floor(cy / T));
  const x1 = Math.min(m.w - 1, Math.floor((cx + vw) / T)), y1 = Math.min(m.h - 1, Math.floor((cy + vh) / T));
  if (m.id === 'out') drawWaterSparkles(g, m, x0, y0, x1, y1, G.time);

  const inView = (o, mg) => o.x + o.w >= x0 - mg && o.x <= x1 + mg && o.y + o.h >= y0 - mg && o.y <= y1 + mg + 3;
  for (const o of m.objs) if (o.flat && inView(o, 1)) drawSpr(g, SP[o.spr], o);

  // はたけ（つち）
  const crops = [];
  if (m.id === 'out') {
    for (const [key, pl] of Object.entries(G.save.plots)) {
      const [x, y] = key.split(',').map(Number);
      if (x < x0 - 1 || x > x1 + 1 || y < y0 - 1 || y > y1 + 1) continue;
      g.drawImage(pl.w ? SP.soilWet : SP.soil, x * T, y * T);
      if (pl.c) crops.push([x, y, pl.c]);
    }
  }
  if (G.splash) {
    const sp = G.splash;
    for (let i = 0; i < 8; i++) {
      const a = i * 0.8 + sp.t * 3;
      R(g, '#9fd8ff', Math.round(sp.x * T + 16 + Math.cos(a) * 10), Math.round(sp.y * T + 10 + Math.sin(a) * 5 + sp.t * 16), 1, 3);
    }
  }

  // かげ
  g.fillStyle = m.id === 'house' ? 'rgba(4,6,18,.32)' : 'rgba(20,40,10,.26)';
  for (const o of m.objs) {
    const sh2 = SHADOW[o.t];
    if (!sh2 || o.flat || !inView(o, 2)) continue;
    shadowAt(g, (o.x + o.w / 2) * T, (o.y + o.h) * T - 3, sh2[0], sh2[1]);
  }
  shadowAt(g, ppx + T / 2, ppy + T - 2, 9, 3);

  // たかさの ある もの・やさい・しゅじんこうを、したに ある じゅんに
  const list = [];
  for (const o of m.objs) if (!o.flat && inView(o, 3)) list.push([(o.y + o.h) * T, o]);
  for (const c of crops) list.push([(c[1] + 1) * T - 1, c]);
  list.push([ppy + T - 0.5, null]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, o] of list) {
    if (!o) drawPlayer(g, ppx, ppy);
    else if (Array.isArray(o)) drawCrop(g, o[0], o[1], o[2]);
    else if (o.t === 'pot') drawPot(g, o);
    else if (o.t === 'otter') drawSpr(g, SP[Math.sin(G.time * 3 + 1) > 0.7 ? 'otterHop' : 'otter'], o);
    else drawSpr(g, SP[o.spr], o);
  }
  drawSpores(g, m, cx, cy, vw, vh);
  drawGateFog(g, m, x0, y0, x1, y1);

  if (G.fishing) drawFishing(g, ppx, ppy);
  if (canControl() && !p.moving && G.save.flags.intro) drawCursor(g);
  if (G.bolt) drawBolt(g, ppx + T / 2, ppy + 6, cy);

  g.font = 'bold 12px sans-serif';
  g.textAlign = 'center';
  for (const f of G.fx) {
    g.globalAlpha = 1 - f.t;
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillText(kana(f.text), f.x + 1, f.y - f.t * 18 + 1);
    g.fillStyle = f.color;
    g.fillText(kana(f.text), f.x, f.y - f.t * 18);
  }
  g.globalAlpha = 1;

  g.setTransform(1, 0, 0, 1, 0, 0);
  // あれた 町は すこし くらく、むらさきがかった ゆうぐれの いろ
  if (m.ruin) {
    g.fillStyle = 'rgba(28,18,48,.22)';
    g.fillRect(0, 0, G.cw, G.ch);
  }
  g.fillStyle = G.light;
  g.fillRect(0, 0, G.cw, G.ch);
  // ロボが とまっている あいだは くらい
  if (!G.save.flags.awake) {
    g.fillStyle = 'rgba(8,6,24,.55)';
    g.fillRect(0, 0, G.cw, G.ch);
  }
  // メインパネルを なおすまで けんきゅう室は まっくら
  if (m.id === 'house' && G.save.flags.awake && !G.save.fixed.panel) {
    g.fillStyle = 'rgba(4,6,20,.45)';
    g.fillRect(0, 0, G.cw, G.ch);
  }
  // かたづけるほど けんきゅう室が あかるく なる
  if (m.id === 'house') {
    const n = G.save.tidy.stored.length;
    if (n < CLUTTER.length) {
      g.fillStyle = `rgba(10,12,30,${0.32 * (1 - n / CLUTTER.length)})`;
      g.fillRect(0, 0, G.cw, G.ch);
    }
  }
}

// プランター（水を あげると つちが こく なる）と、そだって いる もの
function drawPot(g, o) {
  const s = G.save;
  const pt = s.pots[o.pid];
  drawSpr(g, SP[s.fixed.planter && pt.w ? 'potWet' : o.spr], o);
  if (!pt.c) return;
  const st = cropStage(pt.c);
  const spr = SP[`crop_${pt.c.id}_${st}`];
  g.drawImage(spr, o.x * T + (T - spr.width) / 2, (o.y + 1) * T - spr.height - 13);
  if (pt.f) R(g, '#7dff9a', o.x * T + 25, (o.y + 1) * T - 7, 3, 2);
  if (st === 3 && Math.sin(G.time * 5 + o.x) > 0.3) {
    R(g, '#fff6a0', o.x * T + 27, o.y * T - 16, 1, 5);
    R(g, '#fff6a0', o.x * T + 25, o.y * T - 14, 5, 1);
  }
}

// ふさがった 道の まわりの、こい ネオンスポアの きり
function drawGateFog(g, m, x0, y0, x1, y1) {
  for (const o of m.objs) {
    if (o.t !== 'gate' || !o.road || o.x < x0 - 2 || o.x > x1 + 2 || o.y < y0 - 2 || o.y > y1 + 2) continue;
    for (let k = 0; k < 7; k++) {
      const h = hash2(o.x * 7 + k, o.y * 5 + k);
      const ph = (G.time * (0.15 + h * 0.2) + h * 5) % 1;
      const x = o.x * T + 16 + Math.sin(G.time * 0.8 + k * 1.7 + o.x) * 18;
      const y = o.y * T + 20 - ph * 34;
      const a = 0.32 * Math.sin(ph * Math.PI);
      g.fillStyle = k % 2 ? `rgba(150,90,230,${a})` : `rgba(90,220,240,${a * 0.8})`;
      g.beginPath();
      g.arc(x, y, 9 + h * 10, 0, Math.PI * 2);
      g.fill();
    }
  }
}

// ふわふわ とぶ ネオンスポア（そと は たくさん、けんきゅう室は すこし）
function drawSpores(g, m, cx, cy, vw, vh) {
  const n = m.glow ? 46 : m.id === 'house' ? 10 : 0;
  for (let k = 0; k < n; k++) {
    const sp = 5 + hash2(k, 3) * 9;
    const x = cx + ((hash2(k, 1) * vw + G.time * sp + Math.sin(G.time * 0.7 + k) * 12) % vw + vw) % vw;
    const y = cy + ((hash2(k, 2) * vh - G.time * sp * 0.5) % vh + vh) % vh;
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(G.time * 2 + k));
    g.fillStyle = k % 3 ? `rgba(127,248,255,${0.55 * tw})` : `rgba(214,138,255,${0.6 * tw})`;
    g.fillRect(Math.round(x), Math.round(y), 2, 2);
    g.fillStyle = `rgba(255,255,255,${0.5 * tw})`;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

function drawCrop(g, x, y, c) {
  const st = cropStage(c);
  const spr = SP[`crop_${c.id}_${st}`];
  g.drawImage(spr, x * T + (T - spr.width) / 2, (y + 1) * T - spr.height + 1);
  if (st === 3 && Math.sin(G.time * 5 + x + y) > 0.3) {
    R(g, '#fff6a0', x * T + 27, y * T - 4, 1, 5);
    R(g, '#fff6a0', x * T + 25, y * T - 2, 5, 1);
  }
}

function drawPlayer(g, x, y) {
  const p = G.p;
  const f = p.moving ? (p.t < 0.5 ? 1 : 2) : 0;
  const bob = p.moving && p.t >= 0.25 && p.t < 0.75 ? -1 : 0;
  const on = !!G.save.flags.awake;
  const spr = robotSpr(p.dir, f, G.save.parts, on, G.save.color);
  const px = Math.round(x + (T - spr.width) / 2), py = Math.round(y + T - spr.height + 2) + bob;
  g.drawImage(spr, px, py);
  // めの ひかり（ネオン）
  if (on && p.dir !== 'up') {
    // まるい 目の まわりが ふわっと 光る（robotSprite の 目の ばしょ。ふちどりで +1）
    g.fillStyle = `rgba(95,246,255,${0.16 + 0.08 * Math.sin(G.time * 4)})`;
    const eyes = p.dir === 'down' ? [13, 22] : p.dir === 'right' ? [22] : [11];
    for (const ex of eyes) {
      g.beginPath();
      g.arc(px + ex, py + 22, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (on && G.save.oil < CFG.oilGlow) {
    const many = G.save.oil <= 0 ? 12 : G.save.oil < 25 ? 7 : 4; // へるほど たくさん くっつく
    for (let k = 0; k < many; k++) {
      if (Math.sin(G.time * 6 + k * 1.7) < 0) continue;
      g.fillStyle = k % 2 ? '#7ff8ff' : '#d68aff';
      g.fillRect(px + 6 + Math.floor(hash2(k, 7) * (spr.width - 12)), py + 10 + Math.floor(hash2(k, 8) * (spr.height - 14)), 2, 2);
    }
  }
  if (G.save.tidy.carry) {
    const c = CLUTTER.find((q) => q.id === G.save.tidy.carry);
    const cs = SP[`c_${c.kind}`];
    g.drawImage(cs, Math.round(x + (T - cs.width) / 2), py - cs.height + 10);
  }
  if (G.save.carryOtter) {
    const cs = SP.otterWeak;
    g.drawImage(cs, Math.round(x + (T - cs.width) / 2), py - cs.height + 12);
  }
}

function drawFishing(g, ppx, ppy) {
  const f = G.fishing;
  const p = G.p;
  const [dx, dy] = DIRV[p.dir];
  const hx = ppx + 16 + dx * 10, hy = ppy + 14 + (dy > 0 ? 4 : 0);
  const tipX = hx + dx * 18, tipY = hy - 18 + dy * 8;
  let bx = f.tx * T + 16, by = f.ty * T + 18;
  // うきは まえあたりで すこし しずみ、ほんあたりから あとは みずの なか
  const sunk = f.state === 'bite' || f.state === 'reel';
  if (f.dip > 0) by += 2;
  if (f.state === 'reel') bx += Math.round(Math.sin(G.time * 13) * 3);
  g.strokeStyle = '#4a2e1a';
  g.lineWidth = 3;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(hx, hy);
  g.lineTo(tipX, tipY);
  g.stroke();
  g.strokeStyle = '#a8804e';
  g.lineWidth = 1.5;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.8)';
  g.lineWidth = 0.75;
  g.beginPath();
  g.moveTo(tipX, tipY);
  g.quadraticCurveTo((tipX + bx) / 2, Math.max(tipY, by) + 8, bx, by - 3);
  g.stroke();
  const speed = sunk ? 14 : f.dip > 0 ? 10 : 5;
  const r = ((G.time * speed) % 9) + 2;
  g.strokeStyle = `rgba(220,245,255,${0.75 - r / 14})`;
  g.lineWidth = 1;
  g.beginPath();
  g.ellipse(bx, by + 3, r * (sunk ? 1.8 : 1.2), r * 0.45, 0, 0, Math.PI * 2);
  g.stroke();
  if (sunk) {
    for (let i = 0; i < 5; i++) {
      const a = G.time * 7 + i * 1.3;
      R(g, '#e8f6ff', Math.round(bx + Math.cos(a) * 6), Math.round(by + 2 + Math.sin(a) * 2), 1, 1);
    }
  } else {
    g.drawImage(SP.bobber, Math.round(bx - 4), Math.round(by - 5));
  }
}

// ドローン：しゅうしゅうばこの うえで ふわふわ。はっしゃ すると みぎうえへ とんで いき、あさ もどって くる
// ギザギザの でんきの せん（まいかい すこし かたちが かわる）
function drawZap(g, x0, y0, x1, y1, n, jit, wide) {
  const r = RNG(Math.floor(G.time * 30) + n);
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const j = i === 0 || i === n ? 0 : (r() - 0.5) * jit;
    pts.push([x0 + (x1 - x0) * k + j, y0 + (y1 - y0) * k + j * 0.4]);
  }
  for (const [w, col] of [[wide + 3, 'rgba(255,79,216,.45)'], [wide, 'rgba(95,246,255,.85)'], [Math.max(1, wide - 2), '#ffffff']]) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
    g.stroke();
  }
}

function sparks(g, x, y) {
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + G.time * 9;
    R(g, i % 2 ? '#5ff6ff' : '#ffffff', Math.round(x + Math.cos(a) * 12), Math.round(y + Math.sin(a) * 5), 2, 2);
  }
}

// かみなり：がめんの うえから おちる。めざめる ときは じゅうでん そうちに おちて、そこから ロボへ でんきが ながれる
function drawBolt(g, px, py, top) {
  const b = G.bolt;
  if (b.t > 0.55 || (b.t > 0.2 && b.t < 0.3)) return;
  const ch = b.big && G.map.id === 'house' ? G.map.objs.find((o) => o.t === 'charger') : null;
  if (ch) {
    const cx = (ch.x + ch.w / 2) * T, cy2 = ch.y * T + 2;
    drawZap(g, cx + 6, top, cx, cy2, 9, 26, 4);
    sparks(g, cx, cy2 + 18);
    if (b.t > 0.1) {
      drawZap(g, cx, cy2 + 24, px, py + 14, 5, 10, 2);
      sparks(g, px, py + 20);
    }
    return;
  }
  drawZap(g, px, top, px, py, 9, 26, 4);
  sparks(g, px, py + 20);
}

function drawCursor(g) {
  const [tx, ty] = frontTile();
  const m = G.map;
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return;
  const a = 0.5 + 0.3 * Math.sin(G.time * 5);
  const x = tx * T, y = ty * T;
  for (const [col, o] of [['rgba(40,20,10,.35)', 1], [`rgba(255,255,255,${a})`, 0]]) {
    g.fillStyle = col;
    for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [31, 0, -1, 1], [0, 31, 1, -1], [31, 31, -1, -1]]) {
      g.fillRect(x + cx + o + (sx < 0 ? -5 : 0), y + cy + o + (sy < 0 ? -1 : 0), 6, 2);
      g.fillRect(x + cx + o + (sx < 0 ? -1 : 0), y + cy + o + (sy < 0 ? -5 : 0), 2, 6);
    }
  }
}
