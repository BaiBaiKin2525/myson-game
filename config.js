'use strict';
// ゲームの ルールと かず。かえる ときは ここだけ。
// おはなしと きめごとは DESIGN.md（もとの しりょう：robita_game_setting.md）。
// もじの {漢字|かんじ} は ふりがなつきで でる（ui.js）。{name} は こどもが つけた ロボの なまえ。かんじは 2ねんせい まで

const T = 32; // 1マスの おおきさ（ドット）

const CFG = {
  // 算数エネルギー（電池🔋。なかの なまえは stamina）。さんすうアプリの じつりょくテストの てんすうで じゅう電 される
  staminaMax: 1050,    // 電池の じょうげん（じつりょくテストは 1にち さいこう 150 → 1しゅうかん ぶん ためられる）
  staminaDay: 150,     // HUD の バーが いっぱいに なる 電池（1にちぶん）
  starterStamina: 0,   // はじめは からっぽ。さいしょの じつりょくテストで 目を さます
  mathUrl: '../math-app/', // さんすうアプリ（おなじ サイト）。タイトルと メニューの「もどる」ボタン
  // うごくと へる 電池
  cost: { tidy: 1, cast: 3, hoe: 3, weed: 2, rock: 4, water: 2, plant: 1 },
  // つり：なげる → さかなが よってくる → まえあたり「ツン」を なんかいか → ほんあたり（うきが スパッと しずむ）
  approach: [1.2, 3.0],   // さかなが よってくるまでの びょう
  nibbles: [2, 3],        // まえあたりの かず（この あいだに Aを おすと にげる）
  nibbleGap: [0.45, 1.0], // まえあたりの あいだの びょう
  biteDelay: [0.35, 0.9], // さいごの まえあたり から ほんあたり までの びょう
  missesAllowed: 2,     // リールで まちがえて いい かず
  // ロボの バリアオイル🛢（0〜100）。うごく たび・どうぐを つかう たび・1にち ごとに へる。すくないと おそく なる（とまる ことは ない）
  oil: { start: 40, perStep: 0.08, perAction: 0.3, perDay: 10 },
  // しりょう どおり：50より すくないと からだに ネオンスポアが くっついて 光り（oilGlow）、0 で めに みえて おそく なる
  oilSlow: [[1, 1], [0, 0.45]], // [この かず いじょう, あるく はやさ]
  oilGlow: 50,
  wildRegrow: 3,        // そとの オイル草が また さくまでの ひ
};

// ---------- 1しょう：100年目の さいきどう（けんきゅう室） ----------
// じゅんばんに なおす。energy＝つかう 電池、mats＝つかう そざい。なおすと はかせの ビデオが 見られる（VIDEOS）
const CH1 = [
  { id: 'panel',   name: 'メインパネル',         energy: 10, mats: {},                        video: 1 },
  { id: 'planter', name: 'しつない プランター',  energy: 5,  mats: { m_scrap: 2 },            video: 2 },
  { id: 'press',   name: 'オイル しぼりき',      energy: 5,  mats: { m_screw: 1 },            video: 3 },
  { id: 'pod',     name: 'サイバーか そうち',    energy: 15, mats: { m_screw: 2, m_scrap: 4 }, video: 4 },
];
const POT_SEEDS = { nanohana: 3, turnip: 2 }; // プランターを なおすと もらえる たね

// ---------- 2しょう：ネオン水ろの じょうか と さいしょの 仲間 ----------
const CH2_SEEDS = { dcarrot: 3, sunflower: 3 };  // 2しょうの はじめに もらえる たね（さびた くわ も）
const GEARS_NEED = 3;                            // ろかそうちに いる さびた 歯車
// ろかそうちを なおす：oil は どの バリアオイルでも 1つ
const FILTER_FIX = { energy: 20, mats: { m_gear: GEARS_NEED, m_screw: 2, m_scrap: 3 }, oil: 1 };
const OTTER_HEAL = 20;                           // サイバーか そうちで カワウソを なおす 電池
const OTTER_GIFT = 0.35;                         // えさを あげた つぎの 朝に 魚を おすそわけ して くれる かくりつ
const KASU_BOOST = 2;                          // ひりょう（あぶらかす）を まくと 水やり 1かいで そだつ 日

// はかせの ビデオ（100年まえの ろくが）。メインパネルで 見なおせる
const HAKASE = 'はかせ（ビデオ）';
const VIDEOS = {
  1: { title: 'ビデオ01「おはよう」', lines: [
    'ザザ… ザー… 「あ、うつったかな？」',
    'おはよう、{name}！ この ビデオを {見|み}て いるなら、100{年|ねん} たっても ぶじに うごきだしたんだね。',
    '{人間|にんげん}たちは、{青|あお}く {光|ひか}る ばいきん「ネオンスポア」から にげて、{空|そら}の {上|うえ}の コロニーへ {引|ひ}っこしたんだ。',
    'ネオンスポアは、{人間|にんげん}の {頭|あたま}の {中|なか}の「でんのう」を かためて しまう。だから {町|まち}には もう、だれも いない。',
    'でも、{古|ふる}い きかいの ロボットの きみは、その びょうきに ならない。',
    'まずは けんきゅう{室|しつ}の ガラクタを かたづけて、きかいを {直|なお}して みてね。たのんだよ！',
  ] },
  2: { title: 'ビデオ02「はじめての はたけ」', lines: [
    'プランターを {直|なお}して くれたんだね！ ありがとう。',
    'オイル{草|くさ}の たねを まいて、{毎日|まいにち} じょうろで {水|みず}を あげよう。{水|みず}を あげた {日|ひ}だけ そだつよ。',
    'スリープ ポッドで ねむると、つぎの {日|ひ}に なる。オイル{草|くさ}は {3日|みっか}で {花|はな}が さくよ。',
    'かぶなどの {野|や}さいも そだてて みてね。',
  ] },
  3: { title: 'ビデオ03「バリアオイル」', lines: [
    'オイル しぼりきが うごいたね！',
    'オイル{草|くさ}を 2{本|ほん} {入|い}れると「バリアオイル」が できる。',
    '{体|からだ}に ぬると、ネオンスポアが くっつかなく なって、ギアが なめらかに うごくよ。',
    'オイルが へると、{体|からだ}に ネオンスポアが くっついて {青|あお}く {光|ひか}り、うごきが おそく なる。ときどき ぬってね。',
  ] },
  4: { title: 'ビデオ04「サイバーか そうち」', lines: [
    'サイバーか そうちを {直|なお}したんだね。すごいぞ、{name}！',
    'これは、ネオンスポアで よわった どうぶつを なおす ための そうちなんだ。',
    'なおった どうぶつは、ことばを {話|はな}せる「サイバーどうぶつ」に なって、{町|まち}の しごとを {手|て}つだって くれる。',
    'でも、うごかすには「きれいな {水|みず}」が いる。{外|そと}の {水|みず}ろは、ネオンスポアで よごれて {光|ひか}って いるね…',
    '{水|みず}ろの「ろかそうち」を {直|なお}せば、きれいな {水|みず}が ながれて くる はずだよ。',
    'つぎの ぼうけんの じゅんびを しよう。たのんだよ、{name}！',
  ] },
  5: { title: 'ビデオ05「{外|そと}の はたけ」', lines: [
    'よく ねむれたかい、{name}？ けんきゅう{室|しつ}の きかいが みんな うごいて、ほっと したよ。',
    'つぎは {外|そと}の はたけだ。どうぐばこに、わたしの {古|ふる}い くわが しまって あるんだ。',
    'くわで くさを かって、つちを たがやそう。でんきニンジンと ネオンひまわりの たねも つかってね。',
    'それから、{水|みず}ろの「ろかそうち」。{水|みず}の そこに しずんだ「さびた はぐるま」を 3つ あつめれば、{直|なお}せる はずだよ。',
  ] },
  6: { title: 'ビデオ06「きれいな {水|みず}」', lines: [
    'ろかそうちが うごいたね！ {水|みず}が すきとおって いく…！',
    'これで けんきゅう{室|しつ}の サイバーか そうちにも、きれいな {水|みず}が とどくよ。',
    'きれいに なった {水|みず}は、{南|みなみ}の {海|うみ}まで ながれて いく。{水|みず}の いきおいで、{道|みち}を ふさいで いた がれきも ながされた みたいだ。',
    '{海|うみ}は しお{風|かぜ}が つよいから、バリアオイルを わすれずに！',
  ] },
  7: { title: 'ビデオ07「{水|みず}ろの {魚|さかな}」', lines: [
    'きれいな {水|みず}には、{光|ひか}って いない {魚|さかな}が もどって くるんだ。',
    'オイルフィッシュは おなかに オイルを ためて いる。しぼりきに {入|い}れれば バリアオイルに なるよ。',
    'カワウソエビや メダカッチは、どうぶつたちの だいこうぶつ。とって おくと いい ことが あるかも？',
  ] },
  8: { title: 'ビデオ08「さいしょの なかま」', lines: [
    'サイバーか そうちで、どうぶつを なおせたんだね！',
    'なおった どうぶつは、ことばを {話|はな}せる「サイバーどうぶつ」に なる。ネオンスポアにも まけない からだだ。',
    'カワウソは {水|みず}あそびが だいすき。{魚|さかな}を あげると、きっと はたけの {水|みず}やりを {手|て}つだって くれるよ。',
    'なかまが ふえると、{町|まち}は もっと にぎやかに なる。この ちょうしだ、{name}！',
  ] },
};

// オイル。しぼりきに さくもつを need こ いれると 1こ できる。oil＝ぬると ふえる りょう
const OILS = {
  o_nanohana: { name: 'バリアオイル',        from: 'c_nanohana', need: 2, oil: 40, trade: 40 },
  o_goma:     { name: 'ごまの バリアオイル', from: 'c_goma',     need: 2, oil: 60, trade: 80 },
  o_sun:      { name: 'ひまわりの バリアオイル', from: 'c_sunflower', need: 1, oil: 45, trade: 35 },
  o_fish:     { name: 'さかなの バリアオイル',   from: 'f_oilfish',   need: 1, oil: 35, trade: 30 },
};

// そざい（ごうせい そうちから でる）
const MATS = {
  m_screw: { name: 'ねじ' },
  m_scrap: { name: 'てつくず' },
  m_kasu:  { name: 'あぶらかす', note: 'ひりょうに なる' },
  m_gear:  { name: 'さびた はぐるま', note: '{水|みず}の そこに しずんで いた。ろかそうちに つかう' },
};

// ごうせい そうち：いれた ものに よって でる ものが かわる。[でる もの, かくりつ]（のこりは なにも でない）
// seed は オイル草 か ごまの たね。machine は こわれた きかい（ねじが でる）。glow は 光る さかな（あぶらかすが でる）
const SYNTH = {
  machine: [['m_screw', 0.3], ['m_scrap', 0.45]],
  clutter: [['m_scrap', 0.4], ['seed', 0.25]],
  junk:    [['m_scrap', 0.5], ['seed', 0.1]],
  food:    [['seed', 0.35], ['m_scrap', 0.1]],
  glow:    [['m_kasu', 1]],
};
const SYNTH_SEEDS = ['nanohana', 'goma'];
const SYNTH_SEEDS_CH2 = ['turnip', 'dcarrot', 'sunflower']; // 2しょう から ふえる たね
const SCREW_PITY = 4;   // こわれた きかいを いれて ねじが でない ことが 4かい つづいたら、つぎは かならず でる

// ロボの パーツ。lv 0 は はじめから ついている ぼろぼろの もの、lv 1 は かたづけで みつかる「ぼろい」パーツ
const PARTS = {
  legs:   { label: 'あし',     names: ['ちいさな タイヤ', 'ガタガタ キャタピラ'], does: ['ゆっくり うごく', 'すこし はやく うごける'] },
  arm:    { label: 'うで',     names: ['ほそい うで', 'ギシギシ アーム'], does: ['かるい ものを もてる', 'おもい いしも どかせる'] },
  sensor: { label: 'センサー', names: ['こわれた アンテナ', 'さびた アンテナ'], does: ['つりの あたりが みじかい', 'つりの あたりが ながく なる'] },
};
const PART_FX = {
  walk: [3.6, 5.2],   // あし：1びょうに すすむ マス
  rockArm: 1,         // うで：この lv から いしを どかせる
  bite: [0, 0.2],     // センサー：ほんあたりで Aを おせる じかんが のびる びょう
};

// さかな（2しょうで 水ろが きれいに なると つれる もとの すがた）。tier＝つりざおの つよさ、w＝でやすさ、zone＝みどりの はば、hits＝ひつような せいこう
// speed＝メーターの はやさ、bite＝ほんあたりで Aを おせる びょう（おおきい さかなほど みじかい）
const FISH = {
  medaka: { name: 'メダカ',   sell: 8,   tier: 1, w: 30, zone: 0.26, hits: 1, speed: 1.0, bite: 0.7, kind: 'round', size: 1, col: ['#9a9468', '#e0dbaa', '#bdb88d'], desc: 'ちいさくて すばやい。むれで およぐ。' },
  tanago: { name: 'タナゴ',   sell: 15,  tier: 1, w: 26, zone: 0.23, hits: 1, speed: 1.1, bite: 0.65, kind: 'round', size: 1, col: ['#86b8cc', '#efe0d2', '#e2705c'], desc: 'キラキラ ひかる ちいさな さかな。' },
  funa:   { name: 'フナ',     sell: 24,  tier: 1, w: 22, zone: 0.21, hits: 1, speed: 1.2, bite: 0.6, kind: 'round', size: 2, col: ['#8e8a5a', '#d8cf94', '#76723f'], desc: 'いけに よく いる。じょうぶ。' },
  dojo:   { name: 'ドジョウ', sell: 34,  tier: 1, w: 14, zone: 0.19, hits: 1, speed: 1.35, bite: 0.55, kind: 'thin',  size: 2, col: ['#a58a58', '#d7c08a', '#7f6a3a'], desc: 'どろの なかに かくれる。ひげが ある。' },
  koi:    { name: 'コイ',     sell: 95,  tier: 2, w: 10, zone: 0.16, hits: 2, speed: 1.35, bite: 0.5, kind: 'round', size: 3, col: ['#e8742a', '#f6e6d0', '#d85a1a'], desc: 'おおきくて ちからもち。' },
  namazu: { name: 'ナマズ',   sell: 150, tier: 2, w: 7,  zone: 0.14, hits: 2, speed: 1.5, bite: 0.45, kind: 'cat',   size: 3, col: ['#4b4f55', '#9aa0a6', '#33373c'], desc: 'ながい ひげの いけの ぬし。' },
  unagi:  { name: 'ウナギ',   sell: 240, tier: 2, w: 4,  zone: 0.12, hits: 3, speed: 1.7, bite: 0.4, kind: 'eel',   size: 3, col: ['#3d3a2e', '#a39a72', '#2e2c22'], desc: 'にょろにょろ。なかなか つれない。' },
  // しりょうの さかな（きれいに なった 水ろ）
  medacchi:   { name: 'メダカッチ',     sell: 20, tier: 1, w: 28, zone: 0.26, hits: 1, speed: 1.0, bite: 0.7,  kind: 'round', size: 1, col: ['#7fd6e8', '#e8fcff', '#5ff6ff'], desc: 'きれいに なった {水|みず}に だけ すむ ちいさな {魚|さかな}。むれで キラキラ およぐよ。', love: true },
  oilfish:    { name: 'オイルフィッシュ', sell: 30, tier: 1, w: 18, zone: 0.22, hits: 1, speed: 1.15, bite: 0.6, kind: 'round', size: 2, col: ['#d8a83a', '#fff0b0', '#a87a1a'], desc: 'おなかに オイルを ためて いる ふしぎな {魚|さかな}。オイル しぼりきで バリアオイルが つくれるよ。' },
  neonkingyo: { name: 'ネオン{金魚|きんぎょ}', sell: 40, tier: 1, w: 12, zone: 0.2, hits: 1, speed: 1.25, bite: 0.55, kind: 'round', size: 2, col: ['#ff6a8a', '#ffd0dc', '#5ff6ff'], desc: 'ひれが ネオンの ドレスみたいに ひらひら {光|ひか}る {金魚|きんぎょ}。' },
  kawauebi:   { name: 'カワウソエビ',   sell: 50, tier: 1, w: 10, zone: 0.2, hits: 1, speed: 1.3, bite: 0.5,  kind: 'thin',  size: 1, col: ['#ff8a5a', '#ffd8c0', '#e2502e'], desc: 'サイバーカワウソが いちばん すきな エビ。あげると おおよろこび！', love: true },
  // 海の いきもの（ていぼう から）
  aji:  { name: 'ネオンアジ', sell: 20, tier: 1, w: 30, zone: 0.25, hits: 1, speed: 1.1, bite: 0.65, kind: 'round', size: 2, col: ['#7a9ab8', '#e8f4ff', '#5ff6ff'], desc: '{海|うみ}を むれで およぐ。せなかに {青|あお}い {光|ひかり}の すじ。', sea: true },
  haze: { name: 'ピカハゼ',   sell: 15, tier: 1, w: 26, zone: 0.28, hits: 1, speed: 1.0, bite: 0.7,  kind: 'thin',  size: 1, col: ['#a89a72', '#efe6c8', '#ffd23f'], desc: 'すなの {上|うえ}で じっと して いる。ときどき ピカッと {光|ひか}る。', sea: true },
  kani: { name: 'エレキガニ', sell: 35, tier: 1, w: 14, zone: 0.22, hits: 1, speed: 1.2, bite: 0.55, kind: 'crab',  size: 2, col: ['#e2392c', '#ffb0a0', '#5ff6ff'], desc: 'はさみから パチパチ {小|ちい}さな {電気|でんき}を だす カニ。', sea: true },
  tako: { name: 'ネオンダコ', sell: 45, tier: 1, w: 9,  zone: 0.19, hits: 2, speed: 1.3, bite: 0.5,  kind: 'octo',  size: 3, col: ['#b05ac2', '#f0c8f8', '#ff4fd8'], desc: 'からだの いろを ネオンの ように かえる {頭|あたま}の よい タコ。', sea: true },
};
// 1しょうの よごれた 水ろで つれる「光る すがた」（ネオンスポアが くっついて いて、オイルは とれない）
const GLOW = {
  medaka: { col: ['#3fd8e8', '#b8f8ff', '#ff6fe0'], desc: 'ネオンスポアで {青|あお}く {光|ひか}って いる。' },
  tanago: { col: ['#5f8aff', '#d8e4ff', '#ff4fd8'], desc: 'からだじゅう キラキラ {光|ひか}って いる。' },
  funa:   { col: ['#4f6ad8', '#a8f0ff', '#7dff9a'], desc: 'うろこに ネオンスポアが びっしり。' },
  dojo:   { col: ['#7a5ad8', '#c8b8ff', '#5ff6ff'], desc: 'どろの {中|なか}でも ぼんやり {光|ひか}る。' },
};

// しりょうの さかな（2しょうで 水ろが きれいに なると つれる）。sea：海の いきもの
const NEW_FISH = ['medacchi', 'oilfish', 'neonkingyo', 'kawauebi'];

// ごみ。item が ある ものは その もちものに なる（水ぞこの きかいは ごうせい そうちで ねじが でる）
const JUNK = {
  boot: { name: 'ながぐつ', w: 4, zone: 0.3, hits: 1, speed: 0.9, bite: 0.9 },
  gear: { name: '{水|みず}ぞこの きかい', w: 6, zone: 0.3, hits: 1, speed: 0.9, bite: 0.9, item: 'scrap' },
};

// やさい。days＝そだつまでに 水を あげる ひ
const CROPS = {
  nanohana: { name: 'オイル{草|くさ}', seed: 15, days: 3, sell: 30 },
  goma:     { name: 'ごま',     seed: 25, days: 5, sell: 55 },
  turnip:   { name: 'ライトかぶ', seed: 20, days: 3, sell: 50 },
  dcarrot:  { name: 'でんきニンジン', seed: 20, days: 4, sell: 40 }, // 2しょう〜
  sunflower:{ name: 'ネオンひまわり', seed: 20, days: 5, sell: 35 }, // 2しょう〜。1つで バリアオイル
  carrot:   { name: 'にんじん', seed: 35, days: 4, sell: 85 },
  tomato:   { name: 'トマト',   seed: 60, days: 6, sell: 170 },
  pumpkin:  { name: 'かぼちゃ', seed: 110, days: 8, sell: 340 },
};

const TOOLS = {
  rod: { name: ['', 'ぼろい つりざお', 'ふつうの つりざお'] },
  net: { name: 'ちいさな むしあみ' },
  hoe: { name: 'さびた くわ' },
  can: { name: 'じょうろ' },
};

// もちもの（id → なまえ・しゅるい）。1しょうでは うらない（おかねは 2しょう から）
const ITEMS = {};
for (const [k, f] of Object.entries(FISH)) ITEMS[`f_${k}`] = { name: f.name, sell: f.sell, cat: 'fish' };
for (const k of Object.keys(GLOW)) ITEMS[`g_${k}`] = { name: `{光|ひか}る ${FISH[k].name}`, sell: 0, cat: 'glow', note: 'オイルは とれない… ごうせい そうちへ' };
for (const [k, j] of Object.entries(JUNK)) if (!j.item) ITEMS[`j_${k}`] = { name: j.name, sell: 0, cat: 'junk' };
for (const [k, c] of Object.entries(CROPS)) ITEMS[`c_${k}`] = { name: c.name, sell: c.sell, cat: 'crop' };
for (const [k, o] of Object.entries(OILS)) ITEMS[k] = { name: o.name, sell: 0, cat: 'oil' };
for (const [k, m] of Object.entries(MATS)) ITEMS[k] = { name: m.name, sell: 0, cat: 'mat', note: m.note };
ITEMS.stone = { name: 'いし', sell: 0, cat: 'junk' };
ITEMS.scrap = { name: 'こわれた きかい', sell: 0, cat: 'machine', note: 'ごうせい そうちに {入|い}れると ねじが でるかも' };

// そとに さいている オイル草（さいしょは 2ほん だけ）と、みちに おちている こわれた きかい
const WILD = [
  { id: 'w1', x: 9, y: 6 },
  { id: 'w2', x: 20, y: 7 },
];
const SCRAPS = [
  { id: 's1', x: 13, y: 10 },
  { id: 's2', x: 19, y: 10 },
  { id: 's3', x: 24, y: 10 },
  { id: 's4', x: 26, y: 8 },
];

// けんきゅう室の ガラクタ（ごうせい そうちに いれる）。machine は こわれた きかい（ねじが でる かも）
const CLUTTER = [
  { id: 'c1',  kind: 'crate',   x: 2,  y: 5, name: 'ほこりまみれの コンテナ' },
  { id: 'c2',  kind: 'cable',   x: 4,  y: 4, name: 'からまった ケーブル' },
  { id: 'c3',  kind: 'beaker',  x: 9,  y: 4, name: 'われた ビーカー' },
  { id: 'c4',  kind: 'monitor', x: 8,  y: 6, name: 'こわれた モニター', machine: true },
  { id: 'c5',  kind: 'crate',   x: 3,  y: 6, name: 'ちいさな コンテナ' },
  { id: 'c6',  kind: 'machine', x: 10, y: 7, name: 'こわれた そうじ ロボ', machine: true },
  { id: 'c7',  kind: 'coat',    x: 12, y: 7, name: 'はかせの やぶれた はくい' },
  { id: 'c8',  kind: 'gears',   x: 4,  y: 6, name: 'はぐるまの やま', machine: true },
  { id: 'c9',  kind: 'notes',   x: 1,  y: 4, name: '{古|ふる}い けんきゅう ノート' },
  { id: 'c10', kind: 'crate',   x: 9,  y: 6, name: '{大|おお}きな コンテナ' },
];

// ごうせい そうちに いれた かずで かならず でる だいじな もの（part:◯◯ は ロボの ぼろい パーツ、seed:◯◯:n は たね）
const MILESTONES = {
  2: { give: 'part:legs', lines: ['{n}を {入|い}れたら… ウィーン… ポン！', 'パーツ「ガタガタ キャタピラ」が できた！', 'ガシャン！ {足|あし}に つけた。すこし はやく うごける ように なった！'] },
  3: { give: 'rod', lines: ['{n}を {入|い}れたら… ガタガタ… ポン！', '「ぼろい つりざお」が {出|で}て きた！', 'はかせの つりざお かな？ {外|そと}の {水|みず}ろで つりが できそう！'] },
  5: { give: 'part:sensor', lines: ['{n}を {入|い}れたら… ピカッ！', 'パーツ「さびた アンテナ」が できた！', 'ピピッ… {頭|あたま}に つけた。つりで さかなが くいつくのが わかりやすく なった！'] },
  6: { give: 'seed:nanohana:2', lines: ['{n}を {入|い}れたら… ポン！', 'オイル{草|くさ}の たねが 2こ {出|で}て きた！'] },
  8: { give: 'seed:goma:2', lines: ['{n}を {入|い}れたら… ポン！', 'ごまの たねが 2こ {出|で}て きた！ ごまからも バリアオイルが できるよ。'] },
  9: { give: 'part:arm', lines: ['{n}を {入|い}れたら… ゴゴゴ… ポン！', 'パーツ「ギシギシ アーム」が できた！', 'ウィーン… うでに つけた。おもい いしも どかせる ように なった！'] },
  10: { give: 'clean', lines: ['ぜんぶ かたづいた！', 'けんきゅう{室|しつ}が すっきり した。はかせも きっと よろこぶね。'] },
};

// ---------- 町の 地図（DESIGN.md「全体マップ」） ----------
// 水ろが せぼね：上流は 鉱山、下流は 海。col／row は 地図の 画面での ばしょ（col 0 が 水ろの ならび）
// built：もう マップが ある。ch：その しょうから 行ける
const AREAS = {
  mine:    { name: 'ネオン こうざん',             col: 0, row: 0, ch: 4, built: false, note: 'じょうりゅう。{水|みず}ろが わき{出|で}す {山|やま}' },
  station: { name: 'スカイステーション',          col: 1, row: 0, ch: 5, built: false, note: '{町|まち}の いちばん {北|きた}' },
  plaza:   { name: 'ちゅうおう {広場|ひろば}',     col: 0, row: 1, ch: 3, built: true,  note: '{空気|くうき}じょうか ツリー・かじゅえん（4しょう）' },
  shop:    { name: 'ネオン しょう{店|てん}がい',   col: 1, row: 1, ch: 3, built: false, note: 'サイバーどうぶつの お{店|みせ}' },
  out:     { name: 'けんきゅう{室|しつ} まわり',   col: 0, row: 2, ch: 1, built: true,  note: 'けんきゅう{室|しつ}・{水|みず}ろ・はたけ' },
  sea:     { name: '{海|うみ}と みなと',           col: 0, row: 3, ch: 2, flag: 'cleanWater', built: true,  note: 'かりゅう。しお{風|かぜ}で オイルが へりやすい' },
};
// ふさがった 道（がれきと ネオンスポアの きり）。to の エリアへの 道を ch しょうまで ふさぐ
const GATES = {
  toPlaza: { to: 'plaza', ch: 3 },
  toSea:   { to: 'sea',   ch: 2, flag: 'cleanWater' }, // ろかそうちを なおしたら
  toShop:  { to: 'shop',  ch: 3 },
  toMine:  { to: 'mine',  ch: 4 },
};
const SEA_OIL = 2; // 海では しお風で バリアオイルの へりが 2ばい
