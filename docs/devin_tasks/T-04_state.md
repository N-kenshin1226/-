## タスク: [T-04] GameState と step() とイベント

### 目的
ゲームの状態とその更新の骨格。以降の全機能はこの上に乗る。

### 読むもの
`docs/04_tech_and_devin.md` §2（アーキテクチャ原則 1〜5）

### 作るもの（`packages/core/src/`）
- `state/`：`GameState`（シリアライズ可能なプレーンオブジェクト）。今回の中身は `version`、`seed`、`rng`（RngState）、`time`（GameTime）、`player`（name、skills: Record<SkillId, {value, peak, pending, potential, lastUsedDay}>、stats、fatigue）、`counters`（Record<string, number>）、`flags`（Record<string, boolean>）
- `step.ts`：`step(state, command) → { state, events }`。純関数。入力の state を変更しない（イミュータブル）
- コマンドは判別共用体。今回は `{ type: "wait" }` と `{ type: "sleep" }` だけ実装する
- `events/`：`ActionEvent` の型（判別共用体）と、イベントを受け取って派生状態を更新する「購読者」の仕組み（`subscribers: ((state, event) => state)[]`）。今回はカウンタを数える購読者1つ
- `save/`：`serialize(state) → string`、`deserialize(string) → GameState`。`version` を持ち、移行関数の登録の仕組み（`migrations: Record<number, (old) => new>`）を用意する
- スキルの一覧は `packages/content/skills.json`（id と表示名だけ。剣術・回避・観察・鍛冶・採掘・弁舌の6つ）＋ zodスキーマ

### 受け入れ基準
- [ ] `step` が入力の state を変更しない（凍結したオブジェクトでテスト）
- [ ] 同じ初期状態とコマンド列から、同じ最終状態が得られる
- [ ] serialize → deserialize で完全に往復する
- [ ] version 0 のダミーデータが移行関数で version 1 に変換されるテスト

### 共通
- `AGENTS.md` の「絶対ルール」と「完了の定義」を守る
- ゲームの数値は `packages/content/balance.json` に置き、zodスキーマ（`balance.schema.ts`）も更新する
- 乱数を使うテストはシードを固定する
- PRの説明に「判断ログ」節を設け、仕様にない判断を1行ずつ書く

### PR
- タイトル：`T-04: GameState と step() とイベント`
- 1つのPRにまとめる
