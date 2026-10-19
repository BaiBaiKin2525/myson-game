'use strict';
// ゲームの ルールと かず。かえる ときは ここだけ。

const T = 16; // 1マスの おおきさ（ドット）

const CFG = {
  staminaMax: 200,     // げんきの じょうげん（じつりょくテスト 2かいぶん くらい）
  starterStamina: 40,  // はじめて あそぶ ときの げんき
  // うごくと へる げんき
  cost: { tidy: 1, cast: 3, hoe: 3, weed: 2, rock: 4, water: 2, plant: 1 },
  biteWait: [1.2, 3.2], // うきが しずむまでの びょう
  biteWindow: 1.5,      // あたりの あと Aを おせる じかん
  missesAllowed: 2,     // リールで まちがえて いい かず
  walkSpeed: 5.2,       // 1びょうに すすむ マス
};

// さかな。tier＝つりざおの つよさ（ぼろい 1、ふつう 2）、w＝でやすさ、zone＝みどりの はば、hits＝ひつような せいこう
const FISH = {
  medaka: { name: 'メダカ',   sell: 8,   tier: 1, w: 30, zone: 0.36, hits: 1, speed: 0.7, kind: 'round', size: 1, col: ['#9a9468', '#e0dbaa', '#bdb88d'], desc: 'ちいさくて すばやい。むれで およぐ。' },
  tanago: { name: 'タナゴ',   sell: 15,  tier: 1, w: 26, zone: 0.32, hits: 1, speed: 0.8, kind: 'round', size: 1, col: ['#86b8cc', '#efe0d2', '#e2705c'], desc: 'キラキラ ひかる ちいさな さかな。' },
  funa:   { name: 'フナ',     sell: 24,  tier: 1, w: 22, zone: 0.30, hits: 1, speed: 0.9, kind: 'round', size: 2, col: ['#8e8a5a', '#d8cf94', '#76723f'], desc: 'いけに よく いる。じょうぶ。' },
  dojo:   { name: 'ドジョウ', sell: 34,  tier: 1, w: 14, zone: 0.28, hits: 1, speed: 1.0, kind: 'thin',  size: 2, col: ['#a58a58', '#d7c08a', '#7f6a3a'], desc: 'どろの なかに かくれる。ひげが ある。' },
  koi:    { name: 'コイ',     sell: 95,  tier: 2, w: 10, zone: 0.24, hits: 2, speed: 1.0, kind: 'round', size: 3, col: ['#e8742a', '#f6e6d0', '#d85a1a'], desc: 'おおきくて ちからもち。' },
  namazu: { name: 'ナマズ',   sell: 150, tier: 2, w: 7,  zone: 0.22, hits: 2, speed: 1.1, kind: 'cat',   size: 3, col: ['#4b4f55', '#9aa0a6', '#33373c'], desc: 'ながい ひげの いけの ぬし。' },
  unagi:  { name: 'ウナギ',   sell: 240, tier: 2, w: 4,  zone: 0.20, hits: 3, speed: 1.2, kind: 'eel',   size: 3, col: ['#3d3a2e', '#a39a72', '#2e2c22'], desc: 'にょろにょろ。なかなか つれない。' },
};

const JUNK = {
  can:  { name: 'あきかん', sell: 1, w: 4 },
  boot: { name: 'ながぐつ', sell: 1, w: 4 },
};

// やさい。seed＝たねの ねだん、days＝そだつまでに みずを あげる ひ
const CROPS = {
  turnip:  { name: 'かぶ',     seed: 20,  days: 3, sell: 50 },
  carrot:  { name: 'にんじん', seed: 35,  days: 4, sell: 85 },
  tomato:  { name: 'トマト',   seed: 60,  days: 6, sell: 170 },
  pumpkin: { name: 'かぼちゃ', seed: 110, days: 8, sell: 340 },
};

// どうぐ。price が ある ものは おみせで かう
const TOOLS = {
  rod: { name: ['', 'ぼろい つりざお', 'ふつうの つりざお'] },
  net: { name: 'ちいさな むしあみ' },
  hoe: { name: 'さびた くわ' },
  can: { name: 'じょうろ', price: 150 },
};
const ROD2_PRICE = 600;

// うれる もの（id → なまえ・ねだん）
const ITEMS = {};
for (const [k, f] of Object.entries(FISH)) ITEMS[`f_${k}`] = { name: f.name, sell: f.sell, cat: 'fish' };
for (const [k, j] of Object.entries(JUNK)) ITEMS[`j_${k}`] = { name: j.name, sell: j.sell, cat: 'junk' };
for (const [k, c] of Object.entries(CROPS)) ITEMS[`c_${k}`] = { name: c.name, sell: c.sell, cat: 'crop' };
ITEMS.stone = { name: 'いし', sell: 2, cat: 'misc' };

// おじいちゃんの いえの がらくた（しまう ばしょは たんす）
const CLUTTER = [
  { id: 'c1',  kind: 'box',    x: 2,  y: 6, name: 'ほこりまみれの はこ' },
  { id: 'c2',  kind: 'news',   x: 4,  y: 4, name: 'ふるい しんぶん' },
  { id: 'c3',  kind: 'pot',    x: 9,  y: 3, name: 'われた つぼ' },
  { id: 'c4',  kind: 'boots',  x: 11, y: 5, name: 'ふるい ながぐつ' },
  { id: 'c5',  kind: 'box',    x: 3,  y: 8, name: 'ちいさな はこ' },
  { id: 'c6',  kind: 'bucket', x: 10, y: 7, name: 'さびた バケツ' },
  { id: 'c7',  kind: 'cloth',  x: 12, y: 8, name: 'やぶれた ぬの' },
  { id: 'c8',  kind: 'kettle', x: 5,  y: 7, name: 'すすけた やかん' },
  { id: 'c9',  kind: 'book',   x: 1,  y: 5, name: 'ふるい ほん' },
  { id: 'c10', kind: 'box',    x: 8,  y: 8, name: 'おおきな はこ' },
];

// しまった かずで みつかる もの
const MILESTONES = {
  3: { give: 'rod', lines: ['{n}を しまったら…\nおくから なにか でてきた！', '「ぼろい つりざお」を みつけた！', 'おじいちゃんの つりざおかな？\nうらの いけで さかなが つれそう！'] },
  6: { give: 'net', lines: ['{n}を しまったら…\nたんすの すきまに なにか ある！', '「ちいさな むしあみ」を みつけた！', '（むしとりは もうすこし あとで できるように なるよ）'] },
  8: { give: 'hoe', lines: ['{n}を しまったら…\nかべに なにか たてかけて ある！', '「さびた くわ」を みつけた！', 'これで くさを かったり、はたけを たがやしたり できる！'] },
  10: { give: 'letter', lines: ['ぜんぶ かたづいた！\nいえが ピカピカに なった！', 'あれ？ たんすの おくに てがみが ある…', '「よく がんばったね。\nうらの いけには さかなが いる。\nみなみの はたけも つかって いいよ。\nすこしだけど おこづかいを どうぞ。\n ― おじいちゃんより」', '50G もらった！'] },
};
