# さんすうアプリ → ゲーム：ロボの でんち🔋 の とどけかた

ゲーム（ネオン ロボファーム）の「でんち🔋」は、さんすうアプリの **実力テストの点数** で増える（ゲームの中では かみなりが落ちて じゅうでん される）。
はじめての届けで、とまっていたロボが めをさます。
2つのアプリは localStorage でつながるので、**同じサイト（同じオリジン）で公開する** 必要がある。

- 例：`https://baibaikin2525.github.io/math-app/` と `https://baibaikin2525.github.io/myson-game/`
  → オリジン（`https://baibaikin2525.github.io`）が同じなので localStorage を共有できる
- 別ドメイン・別ポートだと共有できない（ローカルで試すときは `?dev=1` のテスト用メニューを使う）

## キー

| キー | 書く側 | 中身 |
|---|---|---|
| `mathapp.v1.profiles` / `mathapp.v1.current` | さんすうアプリ | こども一覧（ゲームは読むだけ。同じ子供で遊べる） |
| `mathapp.v1.game.grants.<こどものid>` | さんすうアプリ | でんちの届け `[{ id, date, amount, reason }]`（新しい200件） |
| `mathapp.v1.game.save.<こどものid>` | ゲーム | ゲームのセーブ |
| `mathapp.v1.game.unlimited` | さんすうアプリ | `true` のとき でんち無制限（保護者メニューで あいことば `claude` を入れた端末。ゲームは読むだけ） |

- どれも `mathapp.` で始まるので、さんすうアプリの「バックアップ・もどす」に一緒に入る
- 届けは **さんすうアプリが追加するだけ**、ゲームは **読むだけ**（取りこんだ `id` をセーブ側で覚える）。
  2つのアプリが同じキーを書き合わないので、同時に開いていても壊れない
- ゲームは 起動時・画面に戻ったとき・4秒ごと・別タブで書かれたとき（`storage` イベント）に取りこむ
- でんちの上限は 1050（`config.js` の `CFG.staminaMax`）。実力テストは1日1回・最高150点なので、1週間分（150 × 7）ためられる。あふれた分は捨てる
- 画面のバーは1日分（`CFG.staminaDay` = 150）で いっぱいになり、それより多い分は数字でわかる
- 無制限フラグは 起動時・4秒ごと・別タブで書かれたときに読みなおす。オンの間は でんちが へらず、画面は「∞」。とまっているロボも めをさます

## さんすうアプリ側に足すコード（rewards.js など）

```js
// 実力テストが おわったら よぶ。score（てんすう）が そのまま ゲームの でんちに なる
function grantGameStamina(score, reason = 'じつりょくテスト') {
  const profile = currentProfile();
  if (!profile) return;
  const key = `mathapp.v1.game.grants.${profile.id}`;
  const list = readJSON(key, []);
  const arr = Array.isArray(list) ? list : [];
  arr.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, // かぶらない id
    date: new Date().toISOString(),
    amount: Math.max(0, Math.floor(score)),
    reason,
  });
  writeJSON(key, arr.slice(-200));
}
```

点数の決め方は さんすうアプリ側で決める（いまは 5セット終わると開く10問、1問10点＋はやさボーナスで最高150点、1日1回。くわしくは math-app の README「実力テスト」）。
ゲーム側は `amount` をそのまま足すだけ。
