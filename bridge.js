'use strict';
// さんすうアプリ との つなぎ と、ほぞん。
//
// おなじ サイト（おなじ ドメイン）で ひらくと localStorage を いっしょに つかえる。
//   こども         mathapp.v1.profiles / mathapp.v1.current   … さんすうアプリが つくる（よむ だけ）
//   でんちの とどけ mathapp.v1.game.grants.<こどもの id>      … さんすうアプリが「じつりょくテスト」の あとに ついか する
//                   [{ id, date, amount, reason }]（あたらしい 200 けん）
//   ゲームの きろく mathapp.v1.game.save.<こどもの id>        … ゲームだけが かく
// どちらも「mathapp.」で はじまるので、さんすうアプリの バックアップに いっしょに はいる。
// くわしくは BRIDGE.md。

const KEY = {
  profiles: 'mathapp.v1.profiles',
  current: 'mathapp.v1.current',
  unlimited: 'mathapp.v1.game.unlimited', // さんすうアプリの ほごしゃ メニューで あいことば を いれると true（でんち むせいげん）
  grants: (id) => `mathapp.v1.game.grants.${id}`,
  save: (id) => `mathapp.v1.game.save.${id}`,
};

const Store = {
  get(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ほぞん できない ブラウザ */ }
  },
};

// さんすうアプリの こども。まだ ない とき（ちがう サイトで ひらいた とき など）は おなじ きほんの 2人
function loadProfiles() {
  const list = Store.get(KEY.profiles, null);
  if (Array.isArray(list) && list.length) return list;
  return [
    { id: 'p1', name: 'こども 1', icon: '🦊' },
    { id: 'p2', name: 'こども 2', icon: '🐰' },
    { id: 'p3', name: 'こども 3', icon: '🐻' },   // さんすうアプリと おなじ 3にん
  ];
}

const currentProfileId = () => Store.get(KEY.current, null);

// おとなの デバッグ：さんすうアプリで「claude」を いれた たんまつ（または ?dev=1 の むげん スイッチ）では でんちが へらない
const unlimitedStamina = () => Store.get(KEY.unlimited, false) === true || (G.dev && G.infinite);

// ロボの おはなしに なった ときに 2 に した（1 の セーブは つかわず さいしょから）
const SAVE_V = 2;

function newSave() {
  return {
    v: SAVE_V,
    created: new Date().toISOString(),
    day: 1,
    money: 0,
    stamina: CFG.starterStamina,
    seen: [],                                   // とりこんだ でんちの とどけ（id）
    tools: { rod: 0, net: 0, hoe: 0, can: 0 },  // rod は つよさ（0 なし・1 ぼろい・2 ふつう）
    parts: { legs: 0, arm: 0, sensor: 0 },      // ロボの パーツの lv（PARTS）
    sel: null,                                  // てに もっている もの（'rod' 'hoe' 'can' 'seed:turnip' …）
    items: {},                                  // うれる もの（ITEMS の id → かず）
    seeds: {},                                  // たね（CROPS の id → かず）
    dex: {},                                    // つった さかなの かず（FISH の id → かず）
    tidy: { stored: [], carry: null },          // しまった がらくた・いま もっている がらくた
    plots: {},                                  // はたけ 'x,y' → { w: みずを あげた, c: { id, d: そだった ひ } }
    cleared: [],                                // かりとった くさ・いし 'x,y'
    oil: CFG.oil.start,                         // ロボの オイル（0〜100）
    wild: {},                                   // そとの なのはなを とった ひ（id → day）
    picked: [],                                 // ひろった みちの こわれた きかい（id）
    synthMiss: 0,                               // こわれた きかいを いれて ねじが でなかった かず（SCREW_PITY）
    cargo: {},                                  // ドローンに つんだ もの（id → かず）
    drone: null,                                // まちへ うりに いって いる ドローン { gold, n }（つぎの あさ かえる）
    revival: 0,                                 // なおした ふっこう けいかくの かず（REVIVAL）
    flags: {},                                  // awake：めを さました・pressFixed：しぼりきを なおした・port：しゅうしゅうばこを なおした・canner：かんづめ そうちを つくった・ending：むらが ふっこう した
    pos: { map: 'house', x: 5, y: 3, dir: 'up' }, // じゅうでんきの まえで とまっている
    totals: { fish: 0, harvest: 0, earned: 0 },
  };
}

function loadSave(id) {
  const s = Store.get(KEY.save(id), null);
  if (!s || s.v !== SAVE_V) return null;
  const base = newSave();
  return {
    ...base, ...s,
    tools: { ...base.tools, ...s.tools },
    parts: { ...base.parts, ...s.parts },
    tidy: { ...base.tidy, ...s.tidy },
    totals: { ...base.totals, ...s.totals },
    pos: { ...base.pos, ...s.pos },
  };
}

function writeSave(id, s) {
  s.seen = s.seen.slice(-500); // とどけは 200 けんまで なので、こちらを おおめに おぼえる
  s.savedAt = new Date().toISOString();
  return Store.set(KEY.save(id), s);
}

// とどいた でんちを とりこむ。とりこんだ ぶんの リストを かえす
function pullGrants(id, s) {
  const grants = Store.get(KEY.grants(id), []);
  if (!Array.isArray(grants)) return [];
  const got = [];
  for (const g of grants) {
    if (!g || !g.id || s.seen.includes(g.id)) continue;
    s.seen.push(g.id);
    const amount = Math.max(0, Math.floor(Number(g.amount) || 0));
    if (!amount) continue;
    const before = s.stamina;
    s.stamina = Math.min(CFG.staminaMax, s.stamina + amount);
    got.push({ ...g, amount, added: s.stamina - before });
  }
  return got;
}

// テスト用・さんすうアプリが つかう かきかたの みほん（BRIDGE.md と おなじ）
function grantGameStamina(childId, amount, reason = 'じつりょくテスト') {
  const key = KEY.grants(childId);
  const list = Store.get(key, []);
  const arr = Array.isArray(list) ? list : [];
  arr.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toISOString(), amount, reason });
  Store.set(key, arr.slice(-200));
}
