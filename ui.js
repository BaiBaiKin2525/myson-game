'use strict';
// がめんの うえの もの：おと・おしらせ・かいわ・パネル（おみせ・もちもの）・HUD・ホットバー

const $ = (id) => document.getElementById(id);

// ---------- ふりがな ----------
// もじの なかの {漢字|かんじ} を ふりがな（ルビ）つきに する。{name} は ロボの なまえ（こどもが つける）
// かんじは しょうがく 2ねんせい までに ならう もの だけ つかう
const RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;
const escHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const withName = (text) => String(text).replace(/\{name\}/g, (typeof G !== 'undefined' && G.save && G.save.name) || 'ロビタ');
// ひともじずつ（ふりがなの ついた ことばは ひとかたまり）に わける。かいわの もじおくり で つかう
function rubyTokens(text) {
  const s = withName(text), out = [];
  let i = 0, m;
  RUBY_RE.lastIndex = 0;
  while ((m = RUBY_RE.exec(s))) {
    for (const ch of s.slice(i, m.index)) out.push(ch);
    out.push({ b: m[1], r: m[2] });
    i = RUBY_RE.lastIndex;
  }
  for (const ch of s.slice(i)) out.push(ch);
  return out;
}
function tokensHTML(tokens, n = tokens.length) {
  let h = '';
  for (let k = 0; k < n; k++) {
    const t = tokens[k];
    h += typeof t === 'string' ? escHTML(t) : `<ruby>${escHTML(t.b)}<rt>${escHTML(t.r)}</rt></ruby>`;
  }
  return h;
}
const rt = (text) => tokensHTML(rubyTokens(text));                              // ふつうの もじ → HTML
const rbh = (html) => withName(html).replace(RUBY_RE, '<ruby>$1<rt>$2</rt></ruby>'); // HTML の なかの ふりがな
const kana = (text) => withName(text).replace(RUBY_RE, '$2');                    // よみ だけ（canvas の もじ・title など）

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = rbh(html);
  return e;
};
const iconImg = (id, cls = 'ic') => `<img class="${cls}" src="${iconURL(id)}" alt="">`;

// ---------- おと（WebAudio で つくる） ----------

const Sfx = {
  ctx: null,
  mute: false,
  init() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(f, d, type = 'square', v = 0.12, delay = 0, f2 = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  },
  noise(d, v = 0.15, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate);
    const a = buf.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
    const s = c.createBufferSource();
    const g = c.createGain();
    s.buffer = buf;
    g.gain.value = v;
    s.connect(g).connect(c.destination);
    s.start(t);
  },
  play(name) {
    if (this.mute || !this.ctx) return;
    try {
      const S = {
        ui: () => this.tone(660, 0.06, 'square', 0.06),
        pick: () => { this.tone(520, 0.08); this.tone(780, 0.1, 'square', 0.1, 0.07); },
        store: () => { this.tone(400, 0.08, 'triangle', 0.2); this.tone(600, 0.12, 'triangle', 0.2, 0.08); },
        coin: () => { this.tone(988, 0.07, 'square', 0.08); this.tone(1319, 0.18, 'square', 0.08, 0.07); },
        err: () => this.tone(196, 0.18, 'square', 0.08, 0, 150),
        cast: () => { this.tone(300, 0.2, 'triangle', 0.15, 0, 700); this.noise(0.12, 0.1, 0.25); },
        bite: () => { this.tone(1046, 0.08, 'square', 0.1); this.tone(1046, 0.08, 'square', 0.1, 0.12); },
        nibble: () => { this.tone(1500, 0.03, 'square', 0.05); this.tone(900, 0.05, 'triangle', 0.1, 0.02); },
        sink: () => { this.noise(0.2, 0.3); this.tone(700, 0.2, 'sine', 0.18, 0, 160); },
        heavy: () => this.tone(220, 0.4, 'triangle', 0.15, 0, 110),
        hit: () => this.tone(880, 0.07, 'triangle', 0.2),
        miss: () => this.tone(220, 0.12, 'sawtooth', 0.06),
        catch: () => [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'square', 0.08, i * 0.08)),
        lose: () => this.tone(330, 0.35, 'triangle', 0.15, 0, 120),
        till: () => this.noise(0.12, 0.25),
        cut: () => { this.noise(0.08, 0.2); this.tone(500, 0.05, 'square', 0.05); },
        water: () => { this.noise(0.25, 0.08); this.tone(900, 0.15, 'sine', 0.05, 0, 500); },
        plant: () => this.tone(700, 0.08, 'triangle', 0.18),
        harvest: () => [660, 880, 1175].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.2, i * 0.07)),
        sleep: () => [523, 392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'sine', 0.15, i * 0.22)),
        morning: () => [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.15, i * 0.12)),
        door: () => this.tone(240, 0.1, 'triangle', 0.2, 0, 180),
        power: () => [523, 659, 784, 1046, 1319].forEach((f, i) => this.tone(f, 0.12, 'square', 0.08, i * 0.06)),
        // かみなり：バリッ と ゴロゴロ
        thunder: () => { this.noise(0.25, 0.45); this.tone(90, 1.2, 'sawtooth', 0.12, 0.05, 40); this.noise(0.9, 0.18, 0.2); },
        // ロボが きどう する
        boot: () => [262, 392, 523, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'square', 0.07, i * 0.1)),
        squeak: () => { this.tone(1900, 0.05, 'sawtooth', 0.04, 0, 1400); this.tone(1500, 0.06, 'sawtooth', 0.03, 0.06, 1900); },
        oil: () => [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.14, i * 0.07)),
        synth: () => { this.tone(220, 0.35, 'sawtooth', 0.06, 0, 880); this.noise(0.15, 0.08, 0.3); },
        press: () => { this.noise(0.1, 0.15); this.tone(160, 0.2, 'square', 0.08, 0.1, 120); },
        drone: () => { this.tone(180, 0.9, 'sawtooth', 0.04, 0, 520); this.tone(240, 0.9, 'square', 0.02, 0.05, 600); },
        train: () => { this.tone(660, 0.5, 'square', 0.1); this.tone(880, 0.7, 'square', 0.1, 0.45); this.noise(0.6, 0.08, 0.2); },
        beep: () => { this.tone(1320, 0.06, 'square', 0.06); this.tone(1760, 0.08, 'square', 0.06, 0.08); },
      };
      if (S[name]) S[name]();
    } catch { /* おとが でなくても あそべる */ }
  },
};

// ---------- おしらせ ----------

const UI = {};

UI.toast = (msg, ms = 1900) => {
  const t = $('toast');
  t.innerHTML = rt(msg);
  t.classList.add('show');
  clearTimeout(UI._tt);
  UI._tt = setTimeout(() => t.classList.remove('show'), ms);
};

// ---------- かいわ ----------

const Dlg = { open: false, lines: [], i: 0, shown: 0, cb: null };

// lines：もじれつ か { who, text, choices: [ラベル], pick: (ばんごう) => {}, holo: はかせの ビデオ } の ならび
UI.say = (lines, cb) => {
  Dlg.lines = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? { text: l } : l));
  Dlg.i = 0;
  Dlg.cb = cb || null;
  Dlg.open = true;
  $('dialog').classList.remove('hidden');
  showLine();
};

UI.ask = (text, choices, pick, who) => UI.say([{ who, text, choices, pick }]);

function showLine() {
  const l = Dlg.lines[Dlg.i];
  l.tokens = rubyTokens(l.text);
  $('dWho').innerHTML = l.who ? rt(l.who) : '';
  $('dWho').style.display = l.who ? '' : 'none';
  $('dialog').classList.toggle('holo', !!l.holo);
  $('dText').innerHTML = '';
  $('dChoices').innerHTML = '';
  $('dNext').style.visibility = 'hidden';
  Dlg.shown = 0;
}

function lineDone() {
  const l = Dlg.lines[Dlg.i];
  $('dText').innerHTML = tokensHTML(l.tokens);
  Dlg.shown = l.tokens.length;
  if (l.choices) {
    const box = $('dChoices');
    box.innerHTML = '';
    l.choices.forEach((c, k) => {
      const b = el('button', 'choice', rt(c));
      b.onclick = (e) => {
        e.stopPropagation();
        Sfx.play('ui');
        closeDialog();
        l.pick(k);
      };
      box.appendChild(b);
    });
  } else {
    $('dNext').style.visibility = 'visible';
  }
}

function closeDialog() {
  Dlg.open = false;
  $('dialog').classList.add('hidden');
  $('dialog').classList.remove('holo');
}

UI.dialogOpen = () => Dlg.open;
UI.close = closeDialog;

// ロボが とまっている ときの おしらせ（さんすうアプリへの ボタン つき）
UI.offNote = (show) => $('offNote').classList.toggle('hidden', !show);

UI.advance = () => {
  if (!Dlg.open) return;
  const l = Dlg.lines[Dlg.i];
  if (Dlg.shown < l.tokens.length) {
    lineDone();
    return;
  }
  if (l.choices) return; // えらぶまで まつ
  Dlg.i++;
  if (Dlg.i >= Dlg.lines.length) {
    closeDialog();
    const cb = Dlg.cb;
    Dlg.cb = null;
    if (cb) cb();
  } else {
    showLine();
  }
};

UI.tick = (dt) => {
  if (!Dlg.open) return;
  const l = Dlg.lines[Dlg.i];
  if (Dlg.shown >= l.tokens.length) return;
  Dlg.shown += dt * 34;
  if (Dlg.shown >= l.tokens.length) lineDone();
  else $('dText').innerHTML = tokensHTML(l.tokens, Math.floor(Dlg.shown));
};

// ---------- パネル ----------

UI.panel = (title, build) => {
  UI._build = build;
  $('panelTitle').innerHTML = rt(title);
  UI.rebuild();
  $('panel').classList.remove('hidden');
  UI.panelOpen = true;
};
UI.rebuild = () => {
  const b = $('panelBody');
  b.innerHTML = '';
  UI._build(b);
};
UI.closePanel = () => {
  $('panel').classList.add('hidden');
  UI.panelOpen = false;
  if (UI._onClose) { UI._onClose(); UI._onClose = null; }
};

// ---------- HUD ----------

UI.hud = () => {
  const s = G.save;
  if (!s) return;
  const inf = unlimitedStamina();
  $('stNum').textContent = inf ? '∞' : s.stamina;
  // バーは 1にちぶん（150）で いっぱい。それより おおい ぶんは かずで わかる
  const ratio = inf ? 1 : Math.min(1, s.stamina / CFG.staminaDay);
  $('stBar').style.width = `${Math.round(ratio * 100)}%`;
  $('stamina').classList.toggle('low', !inf && s.stamina < 10);
  $('oilNum').textContent = Math.round(s.oil);
  $('oilChip').classList.toggle('low', s.oil < 25);
  $('moneyNum').textContent = s.money;
  $('coinChip').style.display = s.money > 0 ? '' : 'none'; // おかねは 2しょう から（1しょうでは つかわない）
  $('dayNum').textContent = s.day;
  const goal = typeof goalText === 'function' ? goalText() : '';
  $('goalChip').style.display = goal && s.flags.awake ? '' : 'none';
  $('goalText').innerHTML = rt(goal);
  const tidyChip = $('tidyChip');
  const n = s.tidy.stored.length;
  tidyChip.style.display = G.map && G.map.id === 'house' && n < CLUTTER.length ? '' : 'none';
  $('tidyNum').textContent = `${n}/${CLUTTER.length}`;
};

UI.flashStamina = () => {
  const e = $('stamina');
  e.classList.remove('flash');
  void e.offsetWidth;
  e.classList.add('flash');
};

// ---------- ホットバー（てに もつ もの） ----------

function hotbarItems() {
  const s = G.save;
  const list = [];
  if (s.tools.rod) list.push({ id: 'rod', icon: `rod${s.tools.rod}`, name: TOOLS.rod.name[s.tools.rod] });
  if (s.tools.net) list.push({ id: 'net', icon: 'net', name: TOOLS.net.name });
  if (s.tools.hoe) list.push({ id: 'hoe', icon: 'hoe', name: TOOLS.hoe.name });
  if (s.tools.can) list.push({ id: 'can', icon: 'can', name: TOOLS.can.name });
  if (s.items.m_kasu > 0) list.push({ id: 'kasu', icon: 'm_kasu', name: 'あぶらかす（ひりょう）', n: s.items.m_kasu });
  for (const k of Object.keys(CROPS)) {
    if (s.seeds[k] > 0) list.push({ id: `seed:${k}`, icon: `seed_${k}`, name: `${CROPS[k].name}の たね`, n: s.seeds[k] });
  }
  return list;
}

UI.hotbar = () => {
  const bar = $('hotbar');
  bar.innerHTML = '';
  const list = hotbarItems();
  const s = G.save;
  if (s.sel && !list.some((x) => x.id === s.sel)) s.sel = list.length ? list[0].id : null;
  list.forEach((it, k) => {
    const b = el('button', `slot${s.sel === it.id ? ' on' : ''}`, `${iconImg(it.icon)}${it.n ? `<b>${it.n}</b>` : ''}<i>${k + 1}</i>`);
    b.title = kana(it.name);
    b.onpointerdown = (e) => {
      e.preventDefault();
      Sfx.init();
      selectItem(it.id);
    };
    bar.appendChild(b);
  });
  bar.style.display = list.length ? '' : 'none';
  const cur = list.find((x) => x.id === s.sel);
  $('selName').innerHTML = cur ? rt(cur.name) : '';
};

function selectItem(id) {
  G.save.sel = id;
  Sfx.play('ui');
  UI.hotbar();
  const it = hotbarItems().find((x) => x.id === id);
  if (it) UI.toast(it.name, 900);
}

function cycleItem(step) {
  const list = hotbarItems();
  if (!list.length) return;
  const k = list.findIndex((x) => x.id === G.save.sel);
  selectItem(list[(k + step + list.length) % list.length].id);
}

// ---------- つれた！ ----------

UI.catchCard = (itemId, isNew, cb) => {
  const it = ITEMS[itemId];
  const box = $('catch');
  const price = it.sell > 0 ? `<div class="pr">${iconImg('coin', 'ic s')} ${it.sell}G</div>` : (it.note ? `<div class="pr small">${it.note}</div>` : '');
  box.innerHTML = rbh(`<div class="card">${isNew ? '<div class="new">はじめて！</div>' : ''}${iconImg(itemId, 'ic big')}<div class="nm">${it.name}</div>${price}<div class="tap">タップ / A で つぎへ</div></div>`);
  box.classList.remove('hidden');
  UI.catchOpen = true;
  UI._catchCb = cb;
};
UI.closeCatch = () => {
  $('catch').classList.add('hidden');
  UI.catchOpen = false;
  const cb = UI._catchCb;
  UI._catchCb = null;
  if (cb) cb();
};

// ---------- つりの メーター ----------

UI.fishGauge = (show) => $('fishUI').classList.toggle('hidden', !show);
UI.cutin = (show) => {
  $('fishPanel').classList.toggle('hidden', !show);
  if (!show) $('cutText').className = '';
};
// 「ツン」「スパッ！」などの もじ
UI.cutText = (text) => {
  const e = $('cutText');
  e.textContent = text;
  e.className = '';
  void e.offsetWidth;
  e.className = 'pop';
};
UI.fishDraw = (f) => {
  $('fzone').style.left = `${(f.zc - f.zw / 2) * 100}%`;
  $('fzone').style.width = `${f.zw * 100}%`;
  $('fcur').style.left = `${f.pos * 100}%`;
  $('fhits').textContent = '⭐'.repeat(f.hits) + '☆'.repeat(Math.max(0, f.need - f.hits));
  $('fmiss').textContent = '💧'.repeat(Math.max(0, CFG.missesAllowed - f.miss + 1));
};
UI.fishMsg = (msg) => { $('fmsg').textContent = msg; };

// ---------- ロボの なまえを きめる（ひらがな・カタカナの ボタン） ----------

const KANA_ROWS = [
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ を ん',
  'がぎぐげご', 'ざじずぜぞ', 'だぢづでど', 'ばびぶべぼ', 'ぱぴぷぺぽ', 'ぁぃぅぇぉ', 'ゃゅょっー',
];
const NAME_MAX = 6;
const toKata = (ch) => (ch >= 'ぁ' && ch <= 'ゖ' ? String.fromCharCode(ch.charCodeAt(0) + 0x60) : ch);

UI.nameEntry = (first, done) => {
  const st = { name: first, kata: true };
  UI.naming = true;
  UI.panel('ロボットの {名前|なまえ}を きめよう', (box) => {
    box.appendChild(el('div', 'nameShow', `<span>${escHTML(st.name) || '　'}</span>`));
    const tabs = el('div', 'tabs');
    for (const [k, label] of [[false, 'ひらがな'], [true, 'カタカナ']]) {
      const b = el('button', `tab${st.kata === k ? ' on' : ''}`, label);
      b.onclick = () => { st.kata = k; Sfx.play('ui'); UI.rebuild(); };
      tabs.appendChild(b);
    }
    box.appendChild(tabs);
    const grid = el('div', 'kana');
    for (const row of KANA_ROWS) {
      for (const ch0 of row) {
        const ch = st.kata ? toKata(ch0) : ch0;
        const b = el('button', ch0 === ' ' ? 'k blank' : 'k', ch0 === ' ' ? '' : escHTML(ch));
        if (ch0 !== ' ') {
          b.onclick = () => {
            if ([...st.name].length >= NAME_MAX) { Sfx.play('err'); return; }
            st.name += ch;
            Sfx.play('ui');
            UI.rebuild();
          };
        }
        grid.appendChild(b);
      }
    }
    box.appendChild(grid);
    const bb = el('div', 'nameBtns');
    const del = el('button', 'big', '⌫ 1もじ けす');
    del.onclick = () => { st.name = [...st.name].slice(0, -1).join(''); Sfx.play('ui'); UI.rebuild(); };
    const ok = el('button', 'big ok', '✔ これに する');
    ok.onclick = () => {
      if (!st.name) { Sfx.play('err'); UI.toast('{名前|なまえ}を 1もじ いじょう いれてね'); return; }
      Sfx.play('power');
      UI.naming = false;
      UI.closePanel();
      done(st.name);
    };
    bb.appendChild(del);
    bb.appendChild(ok);
    box.appendChild(bb);
  });
  $('panelClose').style.display = 'none'; // きめるまで とじられない
  UI._onClose = () => { $('panelClose').style.display = ''; };
};
