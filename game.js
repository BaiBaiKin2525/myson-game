'use strict';
// ゲームの ほんたい：うごく・かたづける・つる・たがやす・ねる・かう・うる
// おはなし：だれも いなくなった さびれた むらに、ロボが ひとり のこされて とまっていた。
// さんすうアプリで さいしょの じつりょくテストを やると、じゅうでん そうちに かみなりが おちて システムが ふっきゅうし、ロボが でんちぎれ から めを さます

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
  drone: null, // ドローンの うごき { state: 'fly'（まちへ）| 'land'（かえって くる）, t }
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
    const sub = !s ? 'はじめから' : s.flags.awake ? `${s.day}にちめ ・ 🔋${s.stamina}` : 'とまっている…';
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
  G.maps = { house: buildHouse(G.save), out: buildOutside(G.save) };
  for (const mm of Object.values(G.maps)) bakeGround(mm);
  const pos = G.save.pos;
  const m = G.maps[pos.map] ? pos.map : 'house';
  if (walkable(G.maps[m], pos.x, pos.y)) setMap(m, pos.x, pos.y, pos.dir);
  else setMap('house', 5, 3, 'up');
  $('title').classList.add('hidden');
  $('play').classList.remove('hidden');
  $('offMath').href = CFG.mathUrl;
  UI.hud();
  UI.hotbar();
  persist();
  checkGrants();
  if (!G.save.flags.awake && !G.waking) {
    // まだ とまっている：おはなしの はじまり。じつりょくテストの かみなりを まつ
    UI.say([
      'ここは だれも いなく なった、さびれた むら。',
      'むらの はずれに、くずれかけた けんきゅうじょが ある。',
      'その おくで、でんち🔋が きれた ロボが 1だい とまって いた。',
      'じゅうでん そうちは こわれて いて、うごかない…',
      '（さんすうアプリで「じつりょくテスト」を やると… なにかが おきるかも！）',
    ], () => UI.offNote(!G.save.flags.awake && !G.waking));
  }
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
      'くずれた やねから、じゅうでん そうちに かみなりが おちた！\nバチバチッ… でんきが ながれこむ…',
      'ピピッ… システム チェック… ふっきゅう しました。',
      `でんち🔋 じゅうでん ${unlimitedStamina() ? '∞' : added}。\nでんちぎれ から ふっき します… ロボ、きどう！`,
      'ここは… はかせの けんきゅうじょ？\nはかせは… いない みたい。',
      'けんきゅうじょは くずれかけて、がらくただらけ。\nまずは かたづけから はじめよう！',
      'ギシギシ… からだも さびついて いる。オイル🛢も すくない…\nあとで オイルを さそう。',
      'がらくたの まえで Ⓐボタン を おすと もちあげられるよ。\n「ごうせい そうち」まで はこんで、もういちど Ⓐ で いれよう。\nなにかが でて くるかも！',
      'うごいたり ものを もつと でんち🔋が へるよ。\nさんすうアプリで「じつりょくテスト」を やると、また かみなりで じゅうでん できるよ！',
    ], () => {
      s.flags.intro = true;
      persist();
    });
  }, 1700);
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
      'ピピ… でんち🔋が たりない。うごけないよ…',
      'さんすうアプリで「じつりょくテスト」を がんばると、かみなりが おちて じゅうでん できるよ！',
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
  s.oil = Math.max(0, s.oil - n);
  if (before >= 25 && s.oil < 25) UI.toast('ギシギシ… オイル🛢が すくなく なって きた。うごきが わるい…', 2600);
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
  UI.toast(`${o.name}を さした！ うごきが なめらかに なった`);
  UI.hud();
  if (UI.panelOpen) UI.rebuild();
  persist();
}

// さんすうアプリから とどいた でんちを とりこむ（とどくと かみなりが おちる）
function checkGrants() {
  if (!G.save || G.waking) return;
  const got = pullGrants(G.pid, G.save);
  const added = got.reduce((a, g) => a + g.added, 0);
  if (!G.save.flags.awake) {
    if (got.length || unlimitedStamina()) wakeUp(added);
    return;
  }
  if (!got.length) return;
  const sent = got.reduce((a, g) => a + g.amount, 0);
  persist();
  UI.hud();
  UI.flashStamina();
  strike(false);
  const reason = got[got.length - 1].reason || 'じつりょくテスト';
  UI.toast(`${reason}の かみなりで じゅうでん！ 🔋 +${added}${added < sent ? '（いっぱいに なった！）' : ''}`, 3500);
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
      if (G.save.oil < 25 && Math.random() < 0.3) Sfx.play('squeak');
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
  if (G.drone) {
    G.drone.t += dt;
    if (G.drone.t > 3) G.drone = null;
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

function tryStep(d) {
  const p = G.p;
  const [dx, dy] = DIRV[d];
  const nx = p.x + dx, ny = p.y + dy;
  const door = G.map.doors.find((o) => o.x === nx && o.y === ny);
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
    UI.say('そとに でる まえに、けんきゅうじょの なかを かたづけよう。\nなにか いい ものが みつかるかも！');
    return false;
  }
  if (G.save.tidy.carry) {
    UI.say('もっている ものを ごうせい そうちに いれてから でかけよう。');
    return false;
  }
  return true;
}

function arrived() {
  const p = G.p;
  const door = G.map.doors.find((o) => o.x === p.x && o.y === p.y);
  if (door) goThrough(door);
}

function fadeTo(v, cb, ms = 260) {
  $('fade').style.opacity = v;
  setTimeout(cb, ms);
}

function goThrough(door) {
  G.busy = true;
  Sfx.play('door');
  fadeTo(1, () => {
    setMap(door.to, door.tx, door.ty, door.dir);
    persist();
    fadeTo(0, () => {
      G.busy = false;
      if (door.to === 'out' && !G.save.flags.outIntro) {
        G.save.flags.outIntro = true;
        persist();
        UI.say([
          'そとに でた！ むらは しーんと して いる…',
          'みぎの ほうに いけが ある。\nみずの まえで つりざおを えらんで Ⓐ！',
          'けんきゅうじょの よこの「しゅうしゅうばこ」は こわれて いる…\nなおすと ドローンで、ひとの すむ まちへ しなものを うりに いける みたい！',
          'けんきゅうじょの まわりに きいろい はなが さいて いる。なのはな かな？',
          'みちには こわれた きかいも おちて いる…',
          'みなみには、だれも いない ひろばと えきが ある。\n「ふっこう けいかく ボード」を しらべて みよう。',
        ]);
      }
    });
  });
}

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
    UI.ask('スリープ ポッド。ロボは ここで スリープ モードに なる。\nスリープ して あしたに する？\n（みずを あげた やさいが そだつよ。でんち🔋は ふえないよ）', ['スリープ', 'まだ'], (k) => {
      if (k === 0) sleep();
    });
  },
  charger() {
    UI.say([
      'じゅうでん そうち。こわれて いて、ふだんは うごかない。',
      'でも かみなりが おちると、でんきが ながれこむ みたい。\n（さんすうアプリの「じつりょくテスト」で かみなりが おちるよ）',
    ]);
  },
  table() {
    UI.say([
      'つくえの うえに しゃしんが ある。モニターは こわれて ちらちら して いる…',
      'はかせと、ぴかぴかだった ころの ロボが うつって いる…',
      G.save.flags.letter ? 'はかせ、むらと はたけは まかせて！' : 'はかせの けんきゅうじょを きれいに しよう！',
    ]);
  },
  port() { usePort(); },
  canner() { useCanner(); },
  board() { openBoard(); },
  npc(o) {
    const n = NPCS[o.nid];
    UI.say({ who: n.name, text: pickOne(n.lines) });
  },
  lamp(o) {
    UI.say(o.spr === 'lamp' ? 'ネオンの がいとう。むらを あかるく てらして いる。' : 'こわれた がいとう…\n（「ふっこう けいかく ボード」で なおせるよ）');
  },
  ruin(o) {
    const r = REVIVAL.find((x) => x.id === o.rid);
    if (revDone(o.rid)) UI.say(RUIN_TEXT[o.rid]);
    else UI.say(`こわれた ばしょ…\n「ふっこう けいかく ボード」の「${r.name}」で なおせるよ。`);
  },
  vend() { useVend(); },
  signFarm() { UI.say('「はたけ」\nくわで くさを かって、つちを たがやそう。\nたねを まいたら まいにち みずを あげよう。'); },
  signPond() { UI.say('「いけ」\nみずの まえで つりざおを つかおう。\nうきが しずんだら Ⓐ！'); },
};

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
    const k = pickOne(SYNTH_SEEDS);
    s.seeds[k] = (s.seeds[k] || 0) + 1;
    return { name: `${CROPS[k].name}の たね`, icon: `seed_${k}` };
  }
  addItem(pick);
  return { name: ITEMS[pick].name, icon: pick };
}

const gotLine = (got) => (got ? `ポン！「${got.name}」が でてきた！` : 'ぷしゅー… なにも でなかった');

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
    if (ms.give === 'rod') lines.push('かたづけの つづきも できるし、そとへ でかけても いいよ！');
    if (extra) lines.push(`それから… ${gotLine(extra)}`);
    UI.say(lines);
  } else {
    const got = extra || rollSynth('clutter');
    if (got) setTimeout(() => Sfx.play('power'), 150);
    UI.toast(`${c.name}を いれた… ${gotLine(got)}（${n}/${CLUTTER.length}）`, 2600);
  }
  UI.hud();
  UI.hotbar();
  persist();
}

// もちものを いれる ときの しゅるい（いれられない ものは null）
function synthKind(id) {
  const cat = ITEMS[id] && ITEMS[id].cat;
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
    box.appendChild(el('p', 'help', `ものを いれると、ウィーン… なにかが でて くるかも！<br>こわれた きかいからは ねじが でる ことが あるよ。${left ? `<br>けんきゅうじょの がらくたも もって きて いれよう（のこり ${left}こ）` : ''}`));
    const list = Object.entries(s.items).filter(([id, n]) => n > 0 && synthKind(id));
    if (!list.length) {
      box.appendChild(el('p', 'empty', 'いま いれられる ものが ないよ。<br>（こわれた きかい・いし・あきかん・ながぐつ・さかな・やさい を いれられるよ）'));
      return;
    }
    for (const [id, n] of list) {
      const row = el('div', 'row');
      row.innerHTML = `${iconImg(id, 'ic m')}<div class="info"><div class="nm">${ITEMS[id].name} × ${n}</div><div class="ds">${synthKind(id) === 'machine' ? 'ねじ や てつくずが でる かも' : synthKind(id) === 'junk' ? 'てつくずが でる かも' : 'たねが でる かも'}</div></div>`;
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
  if (got) setTimeout(() => Sfx.play('power'), 200);
  UI.toast(gotLine(got), 2200);
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
  const s = G.save;
  if (s.flags.pressFixed) {
    openPress();
    return;
  }
  const need = PRESS_FIX.m_screw;
  if ((s.items.m_screw || 0) < need) {
    UI.say([
      'こわれた オイル しぼりき。ねじが 1ぽん とれて いる…',
      'ねじが あれば なおせそう。\n（こわれた きかいを ごうせい そうちに いれると、ねじが でる ことが あるよ）',
    ]);
    return;
  }
  UI.ask(`こわれた オイル しぼりき。\nねじを ${need}こ つかって なおす？`, ['なおす', 'やめる'], (k) => {
    if (k !== 0 || !takeItems(PRESS_FIX)) return;
    s.flags.pressFixed = true;
    o.spr = 'pressOk';
    Sfx.play('power');
    UI.say(['ギュッ ギュッ… ねじを しめた！', 'オイル しぼりきが なおった！\nなのはなや ごまを いれると オイルが できるよ。']);
    persist();
  });
}

function openPress() {
  Sfx.play('ui');
  UI.panel('オイル しぼりき', (box) => {
    const s = G.save;
    box.appendChild(el('div', 'wallet', `🛢 ロボの オイル <b>${Math.round(s.oil)}</b> / 100`));
    for (const [id, o] of Object.entries(OILS)) {
      const have = s.items[o.from] || 0;
      const row = el('div', 'row');
      row.innerHTML = `${iconImg(id, 'ic m')}<div class="info"><div class="nm">${o.name}</div><div class="ds">${ITEMS[o.from].name} ${o.need}こ → 1こ（さすと 🛢+${o.oil}）。もっている ${ITEMS[o.from].name}：${have}こ</div></div>`;
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
  box.appendChild(el('p', 'help', '<b>オイルを さす</b>（こうえきが できる ように なったら うる ことも できるよ）'));
  for (const id of have) {
    const row = el('div', 'row');
    row.innerHTML = `${iconImg(id, 'ic m')}<div class="info"><div class="nm">${OILS[id].name} × ${s.items[id]}</div><div class="ds">さすと 🛢+${OILS[id].oil}</div></div>`;
    const bb = el('div', 'btns');
    const bt = el('button', 'buy', 'さす');
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
    UI.toast(`なのはなは また さくまで まとう（とってから ${CFG.wildRegrow}にち）`);
    return;
  }
  if (!spend(CFG.cost.tidy)) return;
  s.wild[o.wid] = s.day;
  o.spr = 'wildPicked';
  addItem('c_nanohana');
  Sfx.play('harvest');
  addFx('なのはな！', '#fff07a', (o.x + 0.5) * T, o.y * T);
  UI.toast('なのはなを とった！ しぼりきで オイルに できるよ', 2400);
  persist();
}

function pickScrap(o) {
  const s = G.save;
  if (!spend(CFG.cost.tidy)) return;
  removeObj(G.map, o);
  s.picked.push(o.sid);
  addItem('scrap');
  Sfx.play('pick');
  UI.toast('こわれた きかいを ひろった！ ごうせい そうちに いれて みよう', 2400);
  persist();
}

function giveMilestone(give) {
  const s = G.save;
  if (give.startsWith('part:')) {
    const k = give.slice(5);
    s.parts[k] = Math.max(1, s.parts[k] || 0);
  }
  if (give === 'rod') { s.tools.rod = Math.max(1, s.tools.rod); s.sel = 'rod'; }
  if (give === 'net') s.tools.net = 1;
  if (give === 'hoe') s.tools.hoe = 1;
  if (give === 'letter') { s.money += 50; s.flags.letter = true; }
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
  if (sel === 'net') return UI.say('ちいさな むしあみ。\nむしとりは もうすこし あとで できるように なるよ！');
  if (G.map.id !== 'out') {
    Sfx.play('err');
    UI.toast('けんきゅうじょの なかでは つかえないよ');
    return;
  }
  if (sel === 'hoe') return useHoe(tx, ty, o);
  if (sel === 'can') return useCan(tx, ty);
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
  Sfx.play('harvest');
  addFx(`${CROPS[id].name}！`, '#ffffff', (tx + 0.5) * T, ty * T);
  UI.toast(`${CROPS[id].name}を しゅうかく！ しゅっかばこで うれるよ`);
  persist();
}

// ---------- ねる ----------

function sleep() {
  G.busy = true;
  Sfx.play('sleep');
  fadeTo(1, () => {
    const s = G.save;
    let grown = 0, ready = 0;
    for (const pl of Object.values(s.plots)) {
      if (pl.c && pl.w && pl.c.d < CROPS[pl.c.id].days) {
        pl.c.d++;
        grown++;
      }
      pl.w = 0;
      if (pl.c && pl.c.d >= CROPS[pl.c.id].days) ready++;
    }
    s.day++;
    useOil(CFG.oil.perDay);
    let droneGold = 0;
    if (s.drone) {
      droneGold = s.drone.gold;
      s.money += droneGold;
      s.totals.earned += droneGold;
      s.drone = null;
      G.drone = { state: 'land', t: 0 };
    }
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
        const lines = [`ピピッ… ${s.day}にちめの あさ。スリープ かいじょ！`];
        if (droneGold) {
          lines.push(`ブーン… ドローンが まちから かえって きた！\n${droneGold}G もって かえって きたよ！`);
          lines.push(pickOne(['まちの ひと「オイル ありがとう！ ロボットたちに だいにんき！」', 'まちの ひと「ネオンの むらの かんづめ、おいしいね！」', 'まちの ひと「むらは どんな ところ？ いつか いって みたいな」']));
        }
        if (grown) lines.push(`みずを あげた やさいが そだったよ！${ready ? `\nしゅうかく できる やさいが ${ready}こ あるよ！` : ''}`);
        if (s.oil < 25) lines.push('ギシギシ… オイル🛢が すくないよ。\nしぼりきで オイルを つくって、もちもの🎒から さそう！');
        if (s.stamina < 10 && !unlimitedStamina()) lines.push('でんち🔋が すくないね。\nさんすうアプリの「じつりょくテスト」で かみなりを おとして じゅうでん しよう！');
        UI.say(lines);
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
  if (!spend(CFG.cost.cast)) return;
  Sfx.play('cast');
  const pick = pickFish();
  const junk = pick.id.startsWith('j_');
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
  const tier = G.save.tools.rod;
  const pool = [];
  for (const [k, f] of Object.entries(FISH)) {
    if (f.tier <= tier) pool.push({ id: `f_${k}`, w: f.tier < tier ? f.w * 0.6 : f.w, spec: f });
  }
  for (const [k, j] of Object.entries(JUNK)) pool.push({ id: `j_${k}`, w: j.w, spec: j });
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
  if (id.startsWith('f_')) {
    const k = id.slice(2);
    isNew = !s.dex[k];
    s.dex[k] = (s.dex[k] || 0) + 1;
    s.totals.fish++;
  }
  Sfx.play('catch');
  persist();
  UI.catchCard(id, isNew);
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

// ---------- じどう はんばいき ----------
// むらに ひとは いない。しゃべらない きかいが まだ うごいて いて、たねや どうぐを うって くれる

function useVend() {
  const s = G.save;
  Sfx.play('beep');
  if (s.flags.metVend) {
    openShop();
    return;
  }
  s.flags.metVend = true;
  const lines = [
    'ピッ… ピピッ。ネオンが ちかちか ひかった。',
    'じどう はんばいきが まだ うごいて いる！\nおかねを いれると、たねや どうぐが かえる みたい。',
    'つった さかなや やさいは、けんきゅうじょの よこの「しゅっかばこ」に いれると おかねに なるよ。',
  ];
  if (!s.tools.can) lines.push('はたけを やるなら じょうろ（150G）が いるね。\nまずは つりで おかねを ためよう。');
  UI.say(lines, openShop);
}

function shopRow(box, icon, name, desc, price, buttons) {
  const s = G.save;
  const row = el('div', 'row');
  row.innerHTML = `${iconImg(icon, 'ic m')}<div class="info"><div class="nm">${name}</div><div class="ds">${desc}</div></div><div class="pr">${price}G</div>`;
  const bb = el('div', 'btns');
  for (const b of buttons) {
    const total = price * (b.n || 1);
    const btn = el('button', `buy${s.money < total ? ' off' : ''}`, b.label);
    btn.onclick = () => b.fn(total);
    bb.appendChild(btn);
  }
  row.appendChild(bb);
  box.appendChild(row);
}

function pay(total) {
  const s = G.save;
  if (s.money < total) {
    Sfx.play('err');
    UI.toast('おかねが たりないよ');
    return false;
  }
  s.money -= total;
  Sfx.play('coin');
  return true;
}

function afterBuy(msg) {
  UI.toast(msg);
  UI.rebuild();
  UI.hud();
  UI.hotbar();
  persist();
}

function openShop() {
  UI.panel('じどう はんばいき', (box) => {
    const s = G.save;
    box.appendChild(el('div', 'wallet', `${iconImg('coin', 'ic s')} もっている おかね <b>${s.money}G</b>`));
    if (!s.tools.can) {
      shopRow(box, 'can', 'じょうろ', 'やさいに みずを あげる。いつでも みずが いっぱい', TOOLS.can.price, [{
        label: 'かう',
        fn: (t) => {
          if (!pay(t)) return;
          s.tools.can = 1;
          s.sel = 'can';
          afterBuy('じょうろを かった！');
        },
      }]);
    }
    if (s.tools.rod === 1) {
      shopRow(box, 'rod2', 'ふつうの つりざお', 'コイ・ナマズ・ウナギも つれる。メーターも ひろく なる', ROD2_PRICE, [{
        label: 'かう',
        fn: (t) => {
          if (!pay(t)) return;
          s.tools.rod = 2;
          s.sel = 'rod';
          afterBuy('ふつうの つりざおを かった！ おおきな さかなも つれるよ');
        },
      }]);
    }
    for (const [k, c] of Object.entries(CROPS)) {
      const buy = (n) => (t) => {
        if (!pay(t)) return;
        s.seeds[k] = (s.seeds[k] || 0) + n;
        if (!s.sel || !s.sel.startsWith('seed:')) s.sel = `seed:${k}`;
        afterBuy(`${c.name}の たねを ${n}こ かった！`);
      };
      const have = s.seeds[k] ? `（もっている：${s.seeds[k]}こ）` : '';
      shopRow(box, `seed_${k}`, `${c.name}の たね`, `${c.days}にち みずを あげると そだつ。うると ${c.sell}G ${have}`, c.seed, [
        { label: '1こ', n: 1, fn: buy(1) },
        { label: '5こ', n: 5, fn: buy(5) },
      ]);
    }
  });
}

// ---------- しゅうしゅうばこ（ドローン ポート）・かんづめ せいさく そうち ----------
// しゅうしゅうばこを なおすと、ドローンが ひとの すむ まちへ うりに いく（つぎの あさ おかねを もって かえる）。
// オイルは そのまま うれる。さかな・やさいは となりの かんづめ せいさく そうちが できてから（かんづめに して うる）

const revDone = (id) => REVIVAL.findIndex((r) => r.id === id) < (G.save.revival || 0);

// 1こ の うりね（いちばを ひらくと MARKET_BONUS ばい）
function tradePrice(id) {
  const base = OILS[id] ? OILS[id].trade : ITEMS[id].sell;
  return Math.round(base * (revDone('market') ? MARKET_BONUS : 1));
}

function sellable() {
  const s = G.save;
  return Object.entries(s.items).filter(([id, n]) => {
    if (!(n > 0) || !ITEMS[id]) return false;
    const cat = ITEMS[id].cat;
    return cat === 'oil' || (s.flags.canner && (cat === 'fish' || cat === 'crop'));
  });
}

// ひつような もの（gold は おかね）が そろって いるか・はらう
const haveOf = (id) => (id === 'gold' ? G.save.money : G.save.items[id] || 0);
const costName = (id) => (id === 'gold' ? 'おかね' : ITEMS[id].name);
const costText = (cost) => Object.entries(cost).map(([id, n]) => (id === 'gold' ? `${n}G` : `${costName(id)}×${n}`)).join('・');

function payRecipe(recipe) {
  const s = G.save;
  for (const [id, n] of Object.entries(recipe)) if (haveOf(id) < n) return false;
  for (const [id, n] of Object.entries(recipe)) {
    if (id === 'gold') s.money -= n;
    else if ((s.items[id] -= n) <= 0) delete s.items[id];
  }
  UI.hud();
  return true;
}

// そざいで つくる・なおす パネル
function openRecipe(title, help, recipe, label, done) {
  Sfx.play('ui');
  UI.panel(title, (box) => {
    box.appendChild(el('p', 'help', `${help}<br>（てつくず・ねじは ごうせい そうちから、いしは はたけで でるよ）`));
    let ok = true;
    for (const [id, n] of Object.entries(recipe)) {
      const have = haveOf(id);
      if (have < n) ok = false;
      const row = el('div', `row${have < n ? ' weak' : ''}`);
      row.innerHTML = `${iconImg(id === 'gold' ? 'coin' : id, 'ic m')}<div class="info"><div class="nm">${costName(id)}</div><div class="ds">${have >= n ? 'そろった！' : `あと ${n - have}${id === 'gold' ? 'G' : 'こ'}`}</div></div><div class="pr">${Math.min(have, n)} / ${n}</div>`;
      box.appendChild(row);
    }
    const bt = el('button', `big${ok ? '' : ' off'}`, ok ? label : 'まだ たりないよ');
    bt.onclick = () => { if (ok) done(); };
    box.appendChild(bt);
  });
}

function usePort() {
  const s = G.save;
  if (!s.flags.port) {
    openRecipe('しゅうしゅうばこ', 'こわれた しゅうしゅうばこ。うえの ドローンも おちて しまって いる…<br><b>なおすと ドローンが とんで、ひとの すむ まちへ しなものを うりに いけるよ！</b>', PORT_FIX, '🔧 しゅうしゅうばこを なおす', fixPort);
    return;
  }
  if (s.drone) {
    UI.say('ドローンは まちへ うりに いって いるよ。\nあしたの あさ、おかねを もって かえって くるよ！');
    return;
  }
  openPort();
}

function fixPort() {
  const s = G.save;
  if (!payRecipe(PORT_FIX)) return;
  s.flags.port = true;
  const o = G.maps.out.objs.find((x) => x.t === 'port');
  if (o) o.spr = 'port';
  UI.closePanel();
  Sfx.play('power');
  G.drone = { state: 'land', t: 1.2 };
  UI.say([
    'ガチャ ガチャ… ウィーン！',
    'しゅうしゅうばこが なおった！ ドローンも うごきだした！',
    { who: 'ドローン', text: 'ピピッ。しなものを いれて「はっしゃ」して ください。ひとの すむ まちへ うりに いきます。' },
    'オイルは そのまま うれるよ。\nさかなや やさいは、となりに「かんづめ せいさく そうち」を つくると うれるよ。',
  ]);
  persist();
}

function openPort() {
  Sfx.play('beep');
  UI.panel('しゅうしゅうばこ（ドローン）', (box) => {
    const s = G.save;
    s.cargo = s.cargo || {};
    const row = (id, n, label, fn) => {
      const r = el('div', 'row');
      r.innerHTML = `${iconImg(id, 'ic m')}<div class="info"><div class="nm">${ITEMS[id].name} × ${n}</div><div class="ds">1こ ${tradePrice(id)}G</div></div><div class="pr">${tradePrice(id) * n}G</div>`;
      const bb = el('div', 'btns');
      const bt = el('button', 'buy', label);
      bt.onclick = fn;
      bb.appendChild(bt);
      r.appendChild(bb);
      box.appendChild(r);
    };
    box.appendChild(el('div', 'wallet', `${iconImg('coin', 'ic s')} もっている おかね <b>${s.money}G</b>`));
    box.appendChild(el('p', 'help', `しなものを つんで「はっしゃ」すると、ドローンが まちへ うりに いって、<b>つぎの あさ</b> おかねを もって かえって くるよ。${revDone('market') ? `<br>🏪 いちばの ゲンさんの おかげで ${MARKET_BONUS}ばいで うれる！` : ''}${s.flags.canner ? '' : '<br>（さかな・やさいは「かんづめ せいさく そうち」が できると うれるよ）'}`));
    const cargo = Object.entries(s.cargo).filter(([, n]) => n > 0);
    if (cargo.length) {
      const value = cargo.reduce((a2, [id, n]) => a2 + tradePrice(id) * n, 0);
      box.appendChild(el('p', 'help', '<b>📦 つんだ もの</b>'));
      for (const [id, n] of cargo) row(id, n, 'おろす', () => moveCargo(id, false));
      const go = el('button', 'big go', `🚁 はっしゃ！（あしたの あさ ${value}G）`);
      go.onclick = launchDrone;
      box.appendChild(go);
    }
    const list = sellable();
    if (list.length) {
      box.appendChild(el('p', 'help', '<b>もっている もの</b>'));
      const all = el('button', 'big', 'ぜんぶ つむ');
      all.onclick = () => { for (const [id] of sellable()) moveCargo(id, true, true); UI.rebuild(); };
      box.appendChild(all);
      for (const [id, n] of list) row(id, n, 'つむ', () => moveCargo(id, true));
    } else if (!cargo.length) {
      box.appendChild(el('p', 'empty', 'いま うれる ものが ないよ。<br>（オイル・かんづめに できる さかなや やさい）'));
    }
  });
}

// もちもの ⇄ ドローンの にもつ
function moveCargo(id, load, quiet) {
  const s = G.save;
  const from = load ? s.items : s.cargo, to = load ? s.cargo : s.items;
  const n = from[id] || 0;
  if (!n) return;
  to[id] = (to[id] || 0) + n;
  delete from[id];
  if (!quiet) {
    Sfx.play('ui');
    UI.rebuild();
  }
  persist();
}

function launchDrone() {
  const s = G.save;
  const cargo = Object.entries(s.cargo || {}).filter(([, n]) => n > 0);
  if (!cargo.length) return;
  const gold = cargo.reduce((a2, [id, n]) => a2 + tradePrice(id) * n, 0);
  s.drone = { gold, n: cargo.reduce((a2, [, n]) => a2 + n, 0) };
  s.cargo = {};
  UI.closePanel();
  G.drone = { state: 'fly', t: 0 };
  Sfx.play('drone');
  UI.toast('ブーン！ ドローンが まちへ とんで いった！ あしたの あさ かえって くるよ', 3200);
  persist();
}

function useCanner() {
  if (G.save.flags.canner) {
    UI.say('かんづめ せいさく そうち。\nさかなや やさいを かんづめに して、ドローンで うれる ように して くれるよ。');
    return;
  }
  openRecipe('かんづめ せいさく そうち', 'ここに「かんづめ せいさく そうち」を つくれるよ。<br>できると、さかなや やさいを かんづめに して ドローンで うれる！', CANNER_RECIPE, '🔧 かんづめ せいさく そうちを つくる', buildCanner);
}

function buildCanner() {
  const s = G.save;
  if (!payRecipe(CANNER_RECIPE)) return;
  s.flags.canner = true;
  const o = G.maps.out.objs.find((x) => x.t === 'canner');
  if (o) o.spr = 'canner';
  UI.closePanel();
  Sfx.play('power');
  UI.say(['ガシャン ガシャン… ウィーン！', '「かんづめ せいさく そうち」が できた！', 'さかなや やさいを かんづめに して、ドローンで うれる ように なったよ！']);
  persist();
}

// ---------- むらの ふっこう ----------

const RUIN_TEXT = {
  fountain: 'ひろばの ふんすい。みずが きらきら ひかって いる。',
  house: 'ミナさんと ソラくんの いえ。パンの いい においが する。',
  market: 'いちば。ゲンさんが まちと むらの しなものを あつかって いる。',
  station: 'えき。でんしゃで まちへ いったり きたり できる。',
};

function openBoard() {
  Sfx.play('beep');
  UI.panel('ふっこう けいかく', (box) => {
    const s = G.save;
    const n = s.revival || 0;
    const back = REVIVAL.slice(0, n).reduce((a2, r) => a2 + r.back.length, 0);
    box.appendChild(el('p', 'help', `むらを なおして、はかせと みんなが かえって こられる ように しよう！<br>もどって きた むらの なかま：<b>${back}</b>`));
    REVIVAL.forEach((r, i) => {
      const open = i <= n;
      const row = el('div', `row${i > n ? ' weak' : ''}`);
      row.innerHTML = `<div class="step${i < n ? ' done' : ''}">${i < n ? '✓' : i + 1}</div><div class="info"><div class="nm">${open ? r.name : '？？？'}</div><div class="ds">${open ? r.desc : 'まえの けいかくが おわると わかるよ'}${i === n ? `<br>ひつよう：${costText(r.cost)}` : i < n ? '<br>できた！' : ''}</div></div>`;
      if (i === n) {
        const bb = el('div', 'btns');
        const bt = el('button', 'buy', 'なおす');
        bt.onclick = () => openRecipe(r.name, r.desc, r.cost, `🔧 ${r.name}`, () => doRevival(i));
        bb.appendChild(bt);
        row.appendChild(bb);
      }
      box.appendChild(row);
    });
    if (n >= REVIVAL.length) box.appendChild(el('p', 'help', '🎉 むらは ふっこう した！ これからも みんなで むらを そだてよう。'));
  });
}

function doRevival(i) {
  const s = G.save;
  const r = REVIVAL[i];
  if ((s.revival || 0) !== i || !payRecipe(r.cost)) return;
  s.revival = i + 1;
  UI.closePanel();
  refreshOutside();
  persist();
  if (r.id === 'station') {
    ending();
    return;
  }
  Sfx.play('power');
  UI.say(r.lines);
}

// そとの マップを つくりなおす（なおした ばしょ・もどった ひとを だす）
function refreshOutside() {
  const m = buildOutside(G.save);
  m.ground = G.maps.out.ground;
  G.maps.out = m;
  if (G.map.id === 'out') G.map = m;
}

// さいご：えきに でんしゃが きて、はかせと みんなが かえって くる
function ending() {
  const s = G.save;
  s.flags.ending = true;
  persist();
  G.busy = true;
  fadeTo(1, () => {
    $('fadeText').textContent = 'ポーッ！';
    Sfx.play('train');
    setTimeout(() => {
      $('fadeText').textContent = '';
      fadeTo(0, () => {
        G.busy = false;
        Sfx.play('morning');
        UI.say([
          'ガタン ゴトン… ポーッ！',
          'えきに でんしゃが とまった！',
          { who: 'はかせ', text: 'ロボ…！ ただいま！' },
          { who: 'はかせ', text: 'まちで うわさを きいたんだ。「ネオンの むらに、はたけと いけを まもる ロボが いる」って。' },
          { who: 'はかせ', text: 'あかりも ふんすいも いえも いちばも… ぜんぶ ロボが なおして くれたんだね。' },
          { who: 'むらの ひと', text: 'ただいま〜！ むらに かえって これた！' },
          { who: 'はかせ', text: 'ほんとうに ありがとう。これからは みんなで いっしょに むらを そだてて いこう！' },
          '🎉 むらが ふっこう した！ はかせと みんなが かえって きた！',
        ]);
      }, 900);
    }, 1600);
  }, 900);
}

// ---------- もちもの・ずかん ----------

function openBag() {
  Sfx.play('ui');
  UI.panel('もちもの', (box) => {
    const s = G.save;
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['items', 'もちもの'], ['parts', 'ロボの パーツ'], ['dex', 'さかな ずかん']]) {
      const b = el('button', `tab${(G.bagTab || 'items') === k ? ' on' : ''}`, label);
      b.onclick = () => { G.bagTab = k; Sfx.play('ui'); UI.rebuild(); };
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    if ((G.bagTab || 'items') === 'dex') {
      const n = Object.keys(s.dex).length;
      box.appendChild(el('div', 'wallet', `つった しゅるい <b>${n} / ${Object.keys(FISH).length}</b>`));
      const grid = el('div', 'dex');
      for (const [k, f] of Object.entries(FISH)) {
        const got = s.dex[k];
        const c = el('div', `dcard${got ? '' : ' unknown'}`);
        c.innerHTML = `${iconImg(`f_${k}`, 'ic m')}<div class="nm">${got ? f.name : '？？？'}</div><div class="ds">${got ? `${f.desc}<br>つった かず：${got}` : (f.tier > s.tools.rod ? 'もっと いい つりざおで つれるかも' : 'まだ つって いない')}</div>`;
        grid.appendChild(c);
      }
      box.appendChild(grid);
      return;
    }
    if (G.bagTab === 'parts') {
      const top = el('div', 'robo');
      top.innerHTML = `<img class="ic robo-img" src="${robotSpr('down', 0, s.parts, s.flags.awake).toDataURL()}" alt="">
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
    box.appendChild(el('div', 'wallet', `🔋 でんち <b>${unlimitedStamina() ? '∞' : s.stamina}</b> / ${CFG.staminaMax}　🛢 オイル <b>${Math.round(s.oil)}</b>　${iconImg('coin', 'ic s')} <b>${s.money}G</b>`));
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
    box.appendChild(el('p', 'help', `<b>${esc(G.profile.name)}</b> ・ ${s.day}にちめ<br>つった さかな ${s.totals.fish}ひき ・ しゅうかく ${s.totals.harvest}こ ・ かせいだ おかね ${s.totals.earned}G`));
    box.appendChild(el('p', 'help', '🔋 でんちは、さんすうアプリの「じつりょくテスト」を やると かみなりが おちて、てんすう ぶん じゅうでん されるよ。<br>うごいたり、どうぐを つかうと へるよ。スリープ しても ふえないよ。<br>🛢 オイルは うごくと へって、すくないと うごきが わるく なるよ。しぼりきで つくって さそう。'));
    add(Sfx.mute ? '🔇 おと：なし' : '🔊 おと：あり', () => { Sfx.mute = !Sfx.mute; UI.rebuild(); });
    add('👪 こどもを かえる', () => backToTitle());
    add('🧮 さんすうアプリに もどる', () => {
      persist();
      location.href = CFG.mathUrl;
    });
    if (G.dev) {
      box.appendChild(el('p', 'help', 'おとな（テスト）メニュー'));
      add('⚡ かみなりで でんちを 50 とどける（じつりょくテストの かわり）', () => { grantGameStamina(G.pid, 50, 'テスト'); UI.closePanel(); checkGrants(); });
      add('🪙 +500G', () => { s.money += 500; UI.hud(); persist(); UI.rebuild(); });
      add('🔩 ねじ +3・てつくず +8', () => { addItem('m_screw', 3); addItem('m_scrap', 8); persist(); UI.rebuild(); });
      add('🛢 オイル 100', () => { s.oil = 100; UI.hud(); persist(); UI.rebuild(); });
      add('🏗 ふっこう けいかくを 1つ すすめる（ただ）', () => {
        if ((s.revival || 0) >= REVIVAL.length) return;
        const i = s.revival || 0;
        s.revival = i + 1;
        UI.closePanel();
        refreshOutside();
        persist();
        if (REVIVAL[i].id === 'station') ending();
        else UI.say(REVIVAL[i].lines);
      });
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
  port: [30, 4], canner: [28, 4], lamp: [6, 2], fountain: [30, 6], cottage: [44, 6], market: [44, 5], station: [60, 6], board: [8, 2], npc: [9, 3],
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
    else drawSpr(g, SP[o.spr], o);
  }

  if (m.id === 'out') drawDrone(g);
  if (G.fishing) drawFishing(g, ppx, ppy);
  if (canControl() && !p.moving && G.save.flags.intro) drawCursor(g);
  if (G.bolt) drawBolt(g, ppx + T / 2, ppy + 6, cy);

  g.font = 'bold 12px sans-serif';
  g.textAlign = 'center';
  for (const f of G.fx) {
    g.globalAlpha = 1 - f.t;
    g.fillStyle = 'rgba(0,0,0,.6)';
    g.fillText(f.text, f.x + 1, f.y - f.t * 18 + 1);
    g.fillStyle = f.color;
    g.fillText(f.text, f.x, f.y - f.t * 18);
  }
  g.globalAlpha = 1;

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = G.light;
  g.fillRect(0, 0, G.cw, G.ch);
  // ロボが とまっている あいだは くらい
  if (!G.save.flags.awake) {
    g.fillStyle = 'rgba(8,6,24,.55)';
    g.fillRect(0, 0, G.cw, G.ch);
  }
  // かたづけるほど けんきゅうじょが あかるく なる
  if (m.id === 'house') {
    const n = G.save.tidy.stored.length;
    if (n < CLUTTER.length) {
      g.fillStyle = `rgba(10,12,30,${0.32 * (1 - n / CLUTTER.length)})`;
      g.fillRect(0, 0, G.cw, G.ch);
    }
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
  const spr = robotSpr(p.dir, f, G.save.parts, on);
  const px = Math.round(x + (T - spr.width) / 2), py = Math.round(y + T - spr.height + 2) + bob;
  g.drawImage(spr, px, py);
  // めの ひかり（ネオン）
  if (on && p.dir !== 'up') {
    g.fillStyle = `rgba(95,246,255,${0.18 + 0.08 * Math.sin(G.time * 4)})`;
    g.fillRect(px + (p.dir === 'down' ? 9 : p.dir === 'right' ? 19 : 8), py + 13, p.dir === 'down' ? 16 : 7, 7);
  }
  if (G.save.tidy.carry) {
    const c = CLUTTER.find((q) => q.id === G.save.tidy.carry);
    const cs = SP[`c_${c.kind}`];
    g.drawImage(cs, Math.round(x + (T - cs.width) / 2), py - cs.height + 10);
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
function drawDrone(g) {
  const s = G.save;
  if (!s.flags.port) return;
  const port = G.map.objs.find((o) => o.t === 'port');
  if (!port) return;
  const hx = (port.x + 1) * T, hy = port.y * T + 4;
  const d = G.drone;
  let x = hx, y = hy - 10 + Math.sin(G.time * 3) * 2, spr = SP.drone;
  if (d && d.state === 'fly') {
    const k = Math.min(1, d.t / 2.5);
    x = hx + k * k * 300;
    y = hy - 10 - k * 240;
    spr = SP.droneBox;
  } else if (d && d.state === 'land') {
    const k = Math.min(1, d.t / 2.5);
    x = hx + (1 - k) * (1 - k) * 300;
    y = hy - 10 - (1 - k) * 240 + Math.sin(G.time * 3) * 2;
  } else if (s.drone) {
    return; // まちへ でかけて いる
  }
  g.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height / 2));
  if (Math.sin(G.time * 40) > 0) {
    R(g, 'rgba(230,245,255,.7)', Math.round(x - 13), Math.round(y - spr.height / 2 + 3), 10, 1);
    R(g, 'rgba(230,245,255,.7)', Math.round(x + 5), Math.round(y - spr.height / 2 + 3), 10, 1);
  }
}

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
