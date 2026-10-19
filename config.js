'use strict';
// ゲームの ルールと かず。かえる ときは ここだけ。

const T = 32; // 1マスの おおきさ（ドット）

const CFG = {
  // でんち🔋（なかの なまえは stamina）。さんすうアプリの じつりょくテストを やると かみなりが おちて じゅうでん される
  staminaMax: 1050,    // でんちの じょうげん（じつりょくテストは 1にち さいこう 150 → 1しゅうかん ぶん ためられる）
  staminaDay: 150,     // HUD の バーが いっぱいに なる でんち（1にちぶん）
  starterStamina: 0,   // はじめは からっぽ。さいしょの じつりょくテストで めを さます
  mathUrl: '../math-app/', // さんすうアプリ（おなじ サイト）。タイトルと メニューの「もどる」ボタン
  // うごくと へる でんち
  cost: { tidy: 1, cast: 3, hoe: 3, weed: 2, rock: 4, water: 2, plant: 1 },
  // つり：なげる → さかなが よってくる → まえあたり「ツン」を なんかいか → ほんあたり（うきが スパッと しずむ）
  approach: [1.2, 3.0],   // さかなが よってくるまでの びょう
  nibbles: [2, 3],        // まえあたりの かず（この あいだに Aを おすと にげる）
  nibbleGap: [0.45, 1.0], // まえあたりの あいだの びょう
  biteDelay: [0.35, 0.9], // さいごの まえあたり から ほんあたり までの びょう
  missesAllowed: 2,     // リールで まちがえて いい かず
  // ロボの オイル🛢（0〜100）。うごく たび・どうぐを つかう たび・1にち ごとに へる。すくないと おそく なって ギシギシ いう（とまる ことは ない）
  oil: { start: 40, perStep: 0.08, perAction: 0.3, perDay: 10 },
  oilSlow: [[50, 1], [25, 0.8], [1, 0.6], [0, 0.45]], // [この かず いじょう, あるく はやさ]
  wildRegrow: 3,        // そとの なのはなが また さくまでの ひ
};

// オイル。しぼりきに さくもつを need こ いれると 1こ できる。oil＝さすと ふえる りょう、trade＝こうえきで うれる ねだん（こうえきは これから）
const OILS = {
  o_nanohana: { name: 'なのはな オイル', from: 'c_nanohana', need: 2, oil: 40, trade: 40 },
  o_goma:     { name: 'ごま オイル',     from: 'c_goma',     need: 2, oil: 60, trade: 80 },
};

// そざい（ごうせい そうちから でる）。かんづめ そうちを つくったり、しぼりきを なおしたり する
const MATS = {
  m_screw: { name: 'ねじ' },
  m_scrap: { name: 'てつくず' },
};
const PRESS_FIX = { m_screw: 1 };                   // こわれた しぼりきを なおす
const PORT_FIX = { m_scrap: 5, m_screw: 2 };        // しゅうしゅうばこ（ドローン ポート）を なおす。なおると ドローンで まちへ うりに いける
const CANNER_RECIPE = { m_scrap: 8, m_screw: 2 };   // かんづめ せいさく そうち（しゅうしゅうばこの となり）。できると さかな・やさいも うれる

// ごうせい そうち：いれた ものに よって でる ものが かわる。[でる もの, かくりつ]（のこりは なにも でない）
// seed は なのはな か ごまの たね。machine は こわれた きかい（ねじが でる）
const SYNTH = {
  machine: [['m_screw', 0.3], ['m_scrap', 0.45]],
  clutter: [['m_scrap', 0.4], ['seed', 0.25]],
  junk:    [['m_scrap', 0.5], ['seed', 0.1]],
  food:    [['seed', 0.35], ['m_scrap', 0.1]],
};
const SYNTH_SEEDS = ['nanohana', 'goma'];
const SCREW_PITY = 4;   // こわれた きかいを いれて ねじが でない ことが 4かい つづいたら、つぎは かならず でる

// ロボの パーツ。lv 0 は はじめから ついている ぼろぼろの もの、lv 1 は かたづけで みつかる「ぼろい」パーツ。
// lv 2（ふつう）は これから たんけんで みつかる ように する。ふつう より うえは そざいを あつめて レベルアップ（よてい）
const PARTS = {
  legs:   { label: 'あし',     names: ['ちいさな タイヤ', 'ガタガタ キャタピラ'], does: ['ゆっくり うごく', 'すこし はやく うごける'] },
  arm:    { label: 'うで',     names: ['ほそい うで', 'ギシギシ アーム'], does: ['かるい ものを もてる', 'おもい いしも どかせる'] },
  sensor: { label: 'センサー', names: ['こわれた アンテナ', 'さびた アンテナ'], does: ['つりの あたりが みじかい', 'つりの あたりが ながく なる'] },
};
// パーツの ちから（lv ごと）
const PART_FX = {
  walk: [3.6, 5.2],   // あし：1びょうに すすむ マス
  rockArm: 1,         // うで：この lv から いしを どかせる
  bite: [0, 0.2],     // センサー：ほんあたりで Aを おせる じかんが のびる びょう
};

// さかな。tier＝つりざおの つよさ（ぼろい 1、ふつう 2）、w＝でやすさ、zone＝みどりの はば、hits＝ひつような せいこう
// speed＝メーターの はやさ、bite＝ほんあたりで Aを おせる びょう（おおきい さかなほど みじかい）
const FISH = {
  medaka: { name: 'メダカ',   sell: 8,   tier: 1, w: 30, zone: 0.26, hits: 1, speed: 1.0, bite: 0.7, kind: 'round', size: 1, col: ['#9a9468', '#e0dbaa', '#bdb88d'], desc: 'ちいさくて すばやい。むれで およぐ。' },
  tanago: { name: 'タナゴ',   sell: 15,  tier: 1, w: 26, zone: 0.23, hits: 1, speed: 1.1, bite: 0.65, kind: 'round', size: 1, col: ['#86b8cc', '#efe0d2', '#e2705c'], desc: 'キラキラ ひかる ちいさな さかな。' },
  funa:   { name: 'フナ',     sell: 24,  tier: 1, w: 22, zone: 0.21, hits: 1, speed: 1.2, bite: 0.6, kind: 'round', size: 2, col: ['#8e8a5a', '#d8cf94', '#76723f'], desc: 'いけに よく いる。じょうぶ。' },
  dojo:   { name: 'ドジョウ', sell: 34,  tier: 1, w: 14, zone: 0.19, hits: 1, speed: 1.35, bite: 0.55, kind: 'thin',  size: 2, col: ['#a58a58', '#d7c08a', '#7f6a3a'], desc: 'どろの なかに かくれる。ひげが ある。' },
  koi:    { name: 'コイ',     sell: 95,  tier: 2, w: 10, zone: 0.16, hits: 2, speed: 1.35, bite: 0.5, kind: 'round', size: 3, col: ['#e8742a', '#f6e6d0', '#d85a1a'], desc: 'おおきくて ちからもち。' },
  namazu: { name: 'ナマズ',   sell: 150, tier: 2, w: 7,  zone: 0.14, hits: 2, speed: 1.5, bite: 0.45, kind: 'cat',   size: 3, col: ['#4b4f55', '#9aa0a6', '#33373c'], desc: 'ながい ひげの いけの ぬし。' },
  unagi:  { name: 'ウナギ',   sell: 240, tier: 2, w: 4,  zone: 0.12, hits: 3, speed: 1.7, bite: 0.4, kind: 'eel',   size: 3, col: ['#3d3a2e', '#a39a72', '#2e2c22'], desc: 'にょろにょろ。なかなか つれない。' },
};

const JUNK = {
  can:  { name: 'あきかん', sell: 1, w: 4, zone: 0.3, hits: 1, speed: 0.9, bite: 0.9 },
  boot: { name: 'ながぐつ', sell: 1, w: 4, zone: 0.3, hits: 1, speed: 0.9, bite: 0.9 },
};

// やさい。seed＝たねの ねだん、days＝そだつまでに みずを あげる ひ
const CROPS = {
  nanohana: { name: 'なのはな', seed: 15, days: 3, sell: 30 },
  goma:     { name: 'ごま',     seed: 25, days: 5, sell: 55 },
  turnip:  { name: 'かぶ',     seed: 20,  days: 3, sell: 50 },
  carrot:  { name: 'にんじん', seed: 35,  days: 4, sell: 85 },
  tomato:  { name: 'トマト',   seed: 60,  days: 6, sell: 170 },
  pumpkin: { name: 'かぼちゃ', seed: 110, days: 8, sell: 340 },
};

// どうぐ。price が ある ものは じどう はんばいきで かう
const TOOLS = {
  rod: { name: ['', 'ぼろい つりざお', 'ふつうの つりざお'] },
  net: { name: 'ちいさな むしあみ' },
  hoe: { name: 'さびた くわ' },
  can: { name: 'じょうろ', price: 150 },
};
const ROD2_PRICE = 600;

// もちもの（id → なまえ・ねだん・しゅるい）。しゅっか できるのは さかな と やさい だけ（かんづめ そうちが できてから）
const ITEMS = {};
for (const [k, f] of Object.entries(FISH)) ITEMS[`f_${k}`] = { name: f.name, sell: f.sell, cat: 'fish' };
for (const [k, j] of Object.entries(JUNK)) ITEMS[`j_${k}`] = { name: j.name, sell: 0, cat: 'junk' };
for (const [k, c] of Object.entries(CROPS)) ITEMS[`c_${k}`] = { name: c.name, sell: c.sell, cat: 'crop' };
for (const [k, o] of Object.entries(OILS)) ITEMS[k] = { name: o.name, sell: 0, cat: 'oil' };
for (const [k, m] of Object.entries(MATS)) ITEMS[k] = { name: m.name, sell: 0, cat: 'mat' };
ITEMS.stone = { name: 'いし', sell: 0, cat: 'junk' };
ITEMS.scrap = { name: 'こわれた きかい', sell: 0, cat: 'machine' };

// そとに さいている なのはな（さいしょは 2ほん だけ）と、みちに おちている こわれた きかい
const WILD = [
  { id: 'w1', x: 9, y: 6 },
  { id: 'w2', x: 20, y: 7 },
];
const SCRAPS = [
  { id: 's1', x: 13, y: 10 },
  { id: 's2', x: 19, y: 10 },
  { id: 's3', x: 26, y: 10 },
  { id: 's4', x: 28, y: 8 },
];

// くずれかけた けんきゅうじょの がらくた（ごうせい そうちに いれる）。machine は こわれた きかい（ねじが でる かも）
const CLUTTER = [
  { id: 'c1',  kind: 'crate',   x: 2,  y: 6, name: 'ほこりまみれの コンテナ' },
  { id: 'c2',  kind: 'cable',   x: 4,  y: 4, name: 'からまった ケーブル' },
  { id: 'c3',  kind: 'beaker',  x: 9,  y: 3, name: 'われた ビーカー' },
  { id: 'c4',  kind: 'monitor', x: 11, y: 5, name: 'こわれた モニター', machine: true },
  { id: 'c5',  kind: 'crate',   x: 3,  y: 8, name: 'ちいさな コンテナ' },
  { id: 'c6',  kind: 'machine', x: 10, y: 7, name: 'こわれた そうじ ロボ', machine: true },
  { id: 'c7',  kind: 'coat',    x: 12, y: 8, name: 'はかせの やぶれた はくい' },
  { id: 'c8',  kind: 'gears',   x: 5,  y: 7, name: 'はぐるまの やま', machine: true },
  { id: 'c9',  kind: 'notes',   x: 1,  y: 5, name: 'ふるい けんきゅう ノート' },
  { id: 'c10', kind: 'crate',   x: 8,  y: 8, name: 'おおきな コンテナ' },
];

// ごうせい そうちに いれた かずで かならず でる だいじな もの（part:◯◯ は ロボの ぼろい パーツ）。ほかの ときは SYNTH の かくりつ
const MILESTONES = {
  2: { give: 'part:legs', lines: ['{n}を いれたら… ウィーン… ポン！\nなにか でてきた！', 'パーツ「ガタガタ キャタピラ」が できた！', 'ガシャン！ あしに つけた。\nすこし はやく うごける ように なった！'] },
  3: { give: 'rod', lines: ['{n}を いれたら… ガタガタ… ポン！', '「ぼろい つりざお」が でてきた！', 'はかせの つりざおかな？\nうらの いけで さかなが つれそう！'] },
  5: { give: 'part:sensor', lines: ['{n}を いれたら… ピカッ！\nキラッと ひかる ものが でてきた！', 'パーツ「さびた アンテナ」が できた！', 'ピピッ… あたまに つけた。\nつりで さかなが くいつくのが わかりやすく なった！'] },
  6: { give: 'net', lines: ['{n}を いれたら… ポン！', '「ちいさな むしあみ」が でてきた！', '（むしとりは もうすこし あとで できるように なるよ）'] },
  8: { give: 'hoe', lines: ['{n}を いれたら… ガシャン！', '「さびた くわ」が でてきた！', 'これで くさを かったり、はたけを たがやしたり できる！'] },
  9: { give: 'part:arm', lines: ['{n}を いれたら… ゴゴゴ… ポン！', 'パーツ「ギシギシ アーム」が できた！', 'ウィーン… うでに つけた。\nはたけの おもい いしも どかせる ように なった！'] },
  10: { give: 'letter', lines: ['ぜんぶ かたづいた！\nけんきゅうじょに あかりが もどった！', 'ごうせい そうちから、ふるい てがみが でてきた…', '「ロボへ。\nむらの みんなは まちへ ひっこして しまった。\nうらの いけと みなみの はたけを たのむよ。\nオイルを わすれずに さすんだよ。\nすこしだけど おかねを のこして おくね。\n ― はかせより」', '50G てに いれた！'] },
};

// ---------- むらの ふっこう ----------
// ふっこう けいかく：おかね（gold）と そざいで むらの ばしょを じゅんばんに なおす。なおす たびに むらの ひとが もどって くる。
// さいごに えきを なおすと、でんしゃで はかせと みんなが かえって くる
const REVIVAL = [
  { id: 'lights',   name: 'むらの あかり', desc: 'こわれた がいとうを なおす',     cost: { gold: 100, m_scrap: 3 },              back: ['cat'],
    lines: ['バチッ… ポッ ポッ ポッ…', 'むらに ネオンの あかりが ともった！', 'あかりを みて、どこからか ネコが やって きた。'] },
  { id: 'fountain', name: 'ひろばの ふんすい', desc: 'ひろばの ふんすいを なおす', cost: { gold: 300, stone: 6, m_screw: 1 },   back: ['mina'],
    lines: ['シャーッ…！ ふんすいから みずが ふきだした！', 'ひろばが きらきら ひかって いる。', 'パンやの ミナさんが もどって きた！'] },
  { id: 'house',    name: 'いえを なおす', desc: 'こわれた いえを すめる ように する', cost: { gold: 600, m_scrap: 8, m_screw: 3 }, back: ['sora'],
    lines: ['トントン カンカン…', 'いえが なおった！ やねも まども ぴかぴか。', 'ミナさんの こども、ソラくんも もどって きた！'] },
  { id: 'market',   name: 'いちばを ひらく', desc: 'いちばの やたいを なおす（ドローンで たかく うれる）', cost: { gold: 1000, m_scrap: 10, m_screw: 4 }, back: ['gen'],
    lines: ['いちばの やたいが なおった！', 'あきんどの ゲンさんが もどって きた！', 'ゲンさん「ドローンの しなものは、わしが まちで たかく うって やろう！」'] },
  { id: 'station',  name: 'えきを なおす', desc: 'でんしゃが とまれる ように する（さいごの けいかく）', cost: { gold: 2000, m_scrap: 15, m_screw: 6 }, back: ['hakase', 'v1', 'v2'],
    lines: [] },
];
const MARKET_BONUS = 1.2;   // いちばを ひらくと ドローンの うりね が 1.2ばい

// むらの ひと（もどって くると ひろばに たつ）
const NPCS = {
  cat:    { name: 'ネコの タマ', x: 24, y: 19, lines: ['ニャーン。', 'ゴロゴロ… （ロボの あしに すりよって きた）', 'ニャ？ （ふんすいの みずを みて いる）'] },
  mina:   { name: 'パンやの ミナ', x: 17, y: 17, lines: ['ロボちゃん、ありがとう！ また ここで パンを やけるわ。', 'まちで うわさに なってるのよ。「ネオンの むらに すごい ロボが いる」って！', 'はかせも きっと よろこぶわね。'] },
  sora:   { name: 'ソラ', x: 16, y: 18, lines: ['ロボ！ いっしょに つりに いこうよ！', 'ねえねえ、さんすう できる？ ぼくは くくが とくい！', 'ドローン かっこいい〜！'] },
  gen:    { name: 'あきんどの ゲン', x: 23, y: 14, lines: ['いらっしゃい！ ドローンの しなものは まかせなさい。', 'ごま オイルは まちで だいにんき じゃよ。', 'えきが なおれば、みんな かえって こられるんじゃが…'] },
  hakase: { name: 'はかせ', x: 22, y: 22, lines: ['ロボ、ほんとうに ありがとう。むらが こんなに げんきに なるなんて！', 'でんちと オイルは だいじょうぶかい？ ちゃんと さすんだよ。', 'これからも いっしょに むらを そだてて いこう！'] },
  v1:     { name: 'むらの ひと', x: 23, y: 22, lines: ['ただいま！ むらが ぴかぴかに なってる！', 'ロボくんの おかげだね！'] },
  v2:     { name: 'むらの ひと', x: 24, y: 21, lines: ['でんしゃで かえって きたよ。ネオンが きれいだね！', 'はたけの やさい、おいしそう！'] },
};
