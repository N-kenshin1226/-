## タスク: [T-03] ゲーム内の時間と暦

### 目的
ゲーム内の日付・時刻帯・曜日・季節・月齢を扱う。隠し要素の出現条件や睡眠の区切りに使う。

### 読むもの
`docs/01_concept.md` §4（コアループ）、`docs/03_world_systems.md` §5（時間）

### 作るもの（`packages/core/src/time/`）
- 時間は「日」と「その日の行動回数」で進む。**1日の行動回数の上限は `balance.json` の `time.actionsPerDay`（初期値 5）**
- 時刻帯：行動の回数に応じて `morning / noon / evening / night` に割り当てる（割り当て表は balance.json）
- 暦：1週7日、1季節28日、1年4季節（いずれも balance.json）
- 月齢：周期は balance.json（初期値 28日）。`new / waxing / full / waning` を返す
- 年齢：開始年齢（初期値15）と経過日数から年齢を計算する
```ts
export type GameTime = { day: number; action: number }  // day は 0 始まり
export function advance(t: GameTime, cfg): GameTime      // 1行動進める。上限で次の日へは進めない（睡眠でだけ進む）
export function sleep(t: GameTime): GameTime             // 翌日の action 0 へ
export function describe(t: GameTime, cfg): { timeOfDay; weekday; season; year; moon; age }
```

### 受け入れ基準
- [ ] 行動回数の上限に達すると `advance` は進まず、`sleep` でだけ翌日になる
- [ ] 境界値のテスト：季節の変わり目、年の変わり目、新月・満月の日
- [ ] すべての設定値を balance.json から読む（コードに直書きしない）

### 共通
- `AGENTS.md` の「絶対ルール」と「完了の定義」を守る
- ゲームの数値は `packages/content/balance.json` に置き、zodスキーマ（`balance.schema.ts`）も更新する
- 乱数を使うテストはシードを固定する
- PRの説明に「判断ログ」節を設け、仕様にない判断を1行ずつ書く

### PR
- タイトル：`T-03: ゲーム内の時間と暦`
- 1つのPRにまとめる
