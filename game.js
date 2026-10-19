'use strict';
// ゲームの ほんたい：うごく・かたづける・つる・たがやす・ねる・かう・うる

const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pickOne = (a) => a[(Math.random() * a.length) | 0];

const G = {
  save: null, pid: null, profile: null,
  maps: {}, map: null, p: null,
  time: 0, scale: 3, cw: 0, ch: 0, canvas: null, ctx: null,
  fishing: null, busy: false, pendingA: false,
  dirs: [], fx: [], splash: null,
  saveT: 0, grantT: 0,
  dev: /[?&]dev=1/.test(location.search), infinite: false,
};

// ---------- はじめる ----------

window.addEventListener('load', () => {
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
    const sub = s ? `${s.day}にちめ ・ ⚡${s.stamina}` : 'はじめから';
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
  else setMap('house', 6, 6, 'down');
  $('title').classList.add('hidden');
  $('play').classList.remove('hidden');
  UI.hud();
  UI.hotbar();
  checkGrants();
  persist();
  if (!G.save.flags.intro) {
    UI.say([
      'ここは おじいちゃんが のこして くれた いえ。',
      'ながい あいだ だれも すんで いなかったから、ほこりだらけ…',
      'まずは かたづけから はじめよう！',
      'がらくたの まえで Ⓐボタン を おすと もちあげられるよ。\nたんす まで はこんで、もういちど Ⓐ で しまおう。',
      'うごく どうぐを つかったり、ものを もちあげると げんき⚡ が へるよ。\nげんきは さんすうアプリの「じつりょくテスト」を やると ふえるよ！',
    ], () => {
      G.save.flags.intro = true;
      persist();
    });
  }
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

// ---------- げんき ----------

function spend(n) {
  const s = G.save;
  if (unlimitedStamina()) return true;
  if (s.stamina < n) {
    Sfx.play('err');
    UI.flashStamina();
    UI.say([
      'ふぅ… つかれちゃった。げんき⚡が たりないよ。',
      'さんすうアプリで「じつりょくテスト」を がんばると、げんきが もどるよ！',
    ]);
    return false;
  }
  s.stamina -= n;
  UI.hud();
  addFx(`-${n}⚡`, '#ffe36a');
  return true;
}

// さんすうアプリから とどいた げんきを とりこむ
function checkGrants() {
  if (!G.save) return;
  const got = pullGrants(G.pid, G.save);
  if (!got.length) return;
  const added = got.reduce((a, g) => a + g.added, 0);
  const sent = got.reduce((a, g) => a + g.amount, 0);
  persist();
  UI.hud();
  UI.flashStamina();
  Sfx.play('power');
  const reason = got[got.length - 1].reason || 'じつりょくテスト';
  UI.toast(`${reason}の けっか！ げんき⚡ +${added}${added < sent ? '（いっぱいに なった！）' : ''}`, 3500);
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
  $('bagBtn').onclick = () => { Sfx.init(); if (canControl()) openBag(); };
  $('menuBtn').onclick = () => { Sfx.init(); if (canControl()) openMenu(); };
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
    else checkGrants();
  });
  addEventListener('focus', checkGrants);
  addEventListener('storage', (e) => {
    if (G.pid && e.key === KEY.grants(G.pid)) checkGrants();
    if (e.key === KEY.unlimited) UI.hud();
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

const canControl = () => !!G.save && !G.busy && !UI.dialogOpen() && !UI.panelOpen && !UI.catchOpen && !G.fishing;

function pressA() {
  if (!G.save) return;
  if (UI.catchOpen) { UI.closeCatch(); return; }
  if (UI.dialogOpen()) { UI.advance(); return; }
  if (UI.panelOpen || G.busy) return;
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
    p.t += dt * CFG.walkSpeed;
    if (p.t >= 1) {
      p.x = p.tx;
      p.y = p.ty;
      p.moving = false;
      p.t = 0;
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
  G.saveT += dt;
  if (G.saveT > 15) { G.saveT = 0; persist(); }
  G.grantT += dt;
  if (G.grantT > 4) { G.grantT = 0; checkGrants(); UI.hud(); }
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
    UI.say('そとに でる まえに、いえの なかを かたづけよう。\nなにか いい ものが みつかるかも！');
    return false;
  }
  if (G.save.tidy.carry) {
    UI.say('もっている ものを たんすに しまってから でかけよう。');
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
          'そとに でた！ いい てんき！',
          'みぎの ほうに いけが ある。\nみずの まえで つりざおを えらんで Ⓐ！',
          'つった さかなは、いえの よこの「しゅっかばこ」で おかねに なるよ。',
          'みちの さきには おみせも あるみたい。',
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
    if (o && o.act === 'closet') storeClutter();
    else {
      Sfx.play('err');
      UI.toast('たんすの まえで Ⓐ を おして しまおう');
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
    UI.toast(`${c.name}を もちあげた！ たんすへ はこぼう`);
    persist();
  },
  closet() {
    const n = G.save.tidy.stored.length;
    UI.say(n >= CLUTTER.length
      ? 'たんすの なかは きれいに かたづいて いる。'
      : `たんす。がらくたを ここに しまおう。（${n}/${CLUTTER.length}）`);
  },
  bed() {
    UI.ask('ベッドだ。ねて あしたに する？\n（みずを あげた やさいが そだつよ。げんき⚡は もどらないよ）', ['ねる', 'まだ ねない'], (k) => {
      if (k === 0) sleep();
    });
  },
  stove() {
    UI.say('ふるい かまど。おじいちゃんは ここで ごはんを つくって いたのかな。');
  },
  table() {
    UI.say([
      'テーブルの うえに しゃしんが ある。',
      'おじいちゃんと、ちいさい ころの じぶんが うつって いる…',
      G.save.flags.letter ? 'おじいちゃん、この いえを たいせつに するね！' : 'この いえを きれいに してあげよう！',
    ]);
  },
  bin() { openSell(); },
  stall() { talkGranny(); },
  signFarm() { UI.say('「はたけ」\nくわで くさを かって、つちを たがやそう。\nたねを まいたら まいにち みずを あげよう。'); },
  signPond() { UI.say('「いけ」\nみずの まえで つりざおを つかおう。\nうきが しずんだら Ⓐ！'); },
};

function storeClutter() {
  const s = G.save;
  const c = CLUTTER.find((x) => x.id === s.tidy.carry);
  s.tidy.carry = null;
  s.tidy.stored.push(c.id);
  const n = s.tidy.stored.length;
  Sfx.play('store');
  if (n === 5) for (const o of G.map.objs.filter((x) => x.web)) removeObj(G.map, o);
  const ms = MILESTONES[n];
  if (ms) {
    giveMilestone(ms.give);
    setTimeout(() => Sfx.play('power'), 150);
    const lines = ms.lines.map((t) => t.replace('{n}', c.name));
    if (ms.give === 'rod') lines.push('かたづけの つづきも できるし、そとへ でかけても いいよ！');
    UI.say(lines);
  } else {
    UI.toast(`${c.name}を しまった！（${n}/${CLUTTER.length}）`);
  }
  UI.hud();
  persist();
}

function giveMilestone(give) {
  const s = G.save;
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
    UI.toast('いえの なかでは つかえないよ');
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
    G.p.dir = 'down';
    persist();
    UI.hud();
    $('fadeText').textContent = `${s.day}にちめ の あさ`;
    setTimeout(() => {
      $('fadeText').textContent = '';
      fadeTo(0, () => {
        G.busy = false;
        Sfx.play('morning');
        const lines = [`${s.day}にちめの あさ！ おはよう！`];
        if (grown) lines.push(`みずを あげた やさいが そだったよ！${ready ? `\nしゅうかく できる やさいが ${ready}こ あるよ！` : ''}`);
        if (s.stamina < 10) lines.push('げんき⚡が すくないね。\nさんすうアプリの「じつりょくテスト」で げんきを ためよう！');
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
  } else if (f.state === 'bite' && f.t > f.spec.bite) {
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

// ---------- おみせ ----------

function talkGranny() {
  const s = G.save;
  const who = 'ポポばあちゃん';
  const lines = [];
  if (!s.flags.metGranny) {
    s.flags.metGranny = true;
    lines.push(
      { who, text: 'おや、あんたが おじいさんの まごだね？\nわたしは となりの ポポ。よろしくね。' },
      { who, text: 'うちでは タネや どうぐを うって いるよ。' },
      { who, text: 'つった さかなや やさいは、いえの よこの「しゅっかばこ」に いれると おかねに なるよ。' },
    );
    if (!s.tools.can) lines.push({ who, text: 'はたけを やるなら じょうろが いるね。150G だよ。\nまずは つりで おかねを ためて ごらん。' });
  } else {
    lines.push({ who, text: pickOne(['いらっしゃい！ なにに するかい？', 'きょうも げんきだねえ！', 'はたけの ちょうしは どうだい？', 'いけの ぬしは おおきな ナマズ らしいよ。']) });
  }
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
  UI.panel('ポポの おみせ', (box) => {
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

// ---------- しゅっかばこ ----------

function sellable() {
  return Object.entries(G.save.items).filter(([id, n]) => n > 0 && ITEMS[id]);
}

function openSell() {
  if (!sellable().length) {
    UI.say('しゅっかばこ。\nさかなや やさいを いれると おかねに なるよ。\n（いまは うれる ものが ないよ）');
    return;
  }
  UI.panel('しゅっかばこ', (box) => {
    const list = sellable();
    const s = G.save;
    box.appendChild(el('div', 'wallet', `${iconImg('coin', 'ic s')} もっている おかね <b>${s.money}G</b>`));
    if (!list.length) {
      box.appendChild(el('p', 'empty', 'ぜんぶ うれたよ！'));
      return;
    }
    const total = list.reduce((a, [id, n]) => a + ITEMS[id].sell * n, 0);
    const all = el('button', 'big', `ぜんぶ うる（${total}G）`);
    all.onclick = () => sell(list.map(([id]) => id));
    box.appendChild(all);
    for (const [id, n] of list) {
      const it = ITEMS[id];
      const row = el('div', 'row');
      row.innerHTML = `${iconImg(id, 'ic m')}<div class="info"><div class="nm">${it.name} × ${n}</div><div class="ds">1こ ${it.sell}G</div></div><div class="pr">${it.sell * n}G</div>`;
      const b = el('button', 'buy', 'うる');
      b.onclick = () => sell([id]);
      const bb = el('div', 'btns');
      bb.appendChild(b);
      row.appendChild(bb);
      box.appendChild(row);
    }
  });
}

function sell(ids) {
  const s = G.save;
  let total = 0;
  for (const id of ids) {
    total += (s.items[id] || 0) * ITEMS[id].sell;
    delete s.items[id];
  }
  if (!total) return;
  s.money += total;
  s.totals.earned += total;
  Sfx.play('coin');
  UI.toast(`${total}G に なった！`);
  UI.rebuild();
  UI.hud();
  persist();
}

// ---------- もちもの・ずかん ----------

function openBag() {
  Sfx.play('ui');
  UI.panel('もちもの', (box) => {
    const s = G.save;
    const tabs = el('div', 'tabs');
    for (const [k, label] of [['items', 'もちもの'], ['dex', 'さかな ずかん']]) {
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
    box.appendChild(el('div', 'wallet', `⚡ げんき <b>${unlimitedStamina() ? '∞' : s.stamina}</b> / ${CFG.staminaMax}　${iconImg('coin', 'ic s')} <b>${s.money}G</b>`));
    const grid = el('div', 'grid');
    const cell = (icon, name, n) => {
      const c = el('div', 'cell', `${iconImg(icon, 'ic m')}${n != null ? `<b>${n}</b>` : ''}<span>${name}</span>`);
      grid.appendChild(c);
    };
    for (const it of hotbarItems()) cell(it.icon, it.name, it.n);
    for (const [id, n] of sellable()) cell(id, ITEMS[id].name, n);
    if (!grid.children.length) box.appendChild(el('p', 'empty', 'まだ なにも もって いないよ。'));
    else box.appendChild(grid);
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
    box.appendChild(el('p', 'help', '⚡ げんきは、さんすうアプリの「じつりょくテスト」の てんすう ぶん ふえるよ。<br>うごいたり、どうぐを つかうと へるよ。ねても もどらないよ。'));
    add(Sfx.mute ? '🔇 おと：なし' : '🔊 おと：あり', () => { Sfx.mute = !Sfx.mute; UI.rebuild(); });
    add('👪 こどもを かえる', () => backToTitle());
    add('🧮 さんすうアプリに もどる', () => {
      persist();
      location.href = CFG.mathUrl;
    });
    if (G.dev) {
      box.appendChild(el('p', 'help', 'おとな（テスト）メニュー'));
      add('⚡ げんきを 50 とどける（じつりょくテストの かわり）', () => { grantGameStamina(G.pid, 50, 'テスト'); UI.closePanel(); checkGrants(); });
      add('🪙 +500G', () => { s.money += 500; UI.hud(); persist(); UI.rebuild(); });
      add(G.infinite ? '⚡ げんき むげん：オン' : '⚡ げんき むげん：オフ', () => { G.infinite = !G.infinite; UI.hud(); UI.rebuild(); });
      add('🧹 いえを ぜんぶ かたづける', () => {
        while (s.tidy.stored.length < CLUTTER.length) {
          const c = CLUTTER.find((x) => !s.tidy.stored.includes(x.id));
          s.tidy.stored.push(c.id);
        }
        s.tidy.carry = null;
        for (const g of ['rod', 'net', 'hoe', 'letter']) giveMilestone(g);
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
  tree: [24, 6], bush: [15, 4], rock: [12, 3], stall: [44, 5], bin: [28, 4], sign: [9, 3],
  clutter: [12, 3], reed: [6, 2], table: [28, 4], closet: [30, 3], stove: [30, 3], bed: [30, 3],
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
  g.fillStyle = m.id === 'house' ? 'rgba(40,20,8,.22)' : 'rgba(20,40,10,.26)';
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

  if (G.fishing) drawFishing(g, ppx, ppy);
  if (canControl() && !p.moving && G.save.flags.intro) drawCursor(g);

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
  // かたづけるほど いえが あかるく なる
  if (m.id === 'house') {
    const n = G.save.tidy.stored.length;
    if (n < CLUTTER.length) {
      g.fillStyle = `rgba(90,75,55,${0.28 * (1 - n / CLUTTER.length)})`;
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
  const spr = SP[`p_${p.dir}_${f}`];
  const px = Math.round(x + (T - spr.width) / 2), py = Math.round(y + T - spr.height + 2) + bob;
  g.drawImage(spr, px, py);
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
