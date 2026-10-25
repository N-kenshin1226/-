## タスク: [T-10] 条件DSLと称号

### 目的
称号・派生スキル・認定・隠し要素の条件を、コードではなくデータで書けるようにする。

### 読むもの
**`docs/03_world_systems.md` §7**、§6（通知ランク）、`docs/02_growth_system.md` §9

### 作るもの
- `packages/core/src/conditions/`：条件式の評価器 `evaluate(cond, state) → boolean`
  - 演算：`counter`（gte/lte/eq）、`flag`、`skill`（値の比較）、`stat`、`time`（GameTime の describe の項目）、`and`、`or`、`not`、`within`（直近N日の間に）
  - `work`（作品台帳）は台帳がまだないので、型だけ定義して評価は「常にfalse」＋TODOコメント
- `packages/content/titles.json` の zodスキーマ（id、name、rank: S/A/B、hidden、condition、effect、message）
- 称号の判定を T-04 の購読者として実装し、獲得時にイベント `{ type: "titleGained", id, rank }` を出す
- **到達可能性の検査**：`pnpm lore:check` とは別に、`packages/content` のテストで「すべての称号の条件に、矛盾した条件（例：x ≥ 10 かつ x ≤ 5）がない」ことを静的に検査する
- サンプル称号を5個（ランクB4個、A1個）。**サンプルは `packages/content/titles.json` に置き、隠し扱いにしない**

### 受け入れ基準
- [ ] すべての演算のテスト（真・偽の両方）
- [ ] 矛盾した条件を含む称号データで検査が失敗する
- [ ] 称号の獲得イベントが1回だけ出る（同じ称号を二重に獲得しない）
- [ ] message はシステムメッセージの書式（「――」「《》」）に従う

### 共通
- `AGENTS.md` の「絶対ルール」と「完了の定義」を守る
- ゲームの数値は `packages/content/balance.json` に置き、zodスキーマ（`balance.schema.ts`）も更新する
- 乱数を使うテストはシードを固定する
- PRの説明に「判断ログ」節を設け、仕様にない判断を1行ずつ書く

### PR
- タイトル：`T-10: 条件DSLと称号`
- 1つのPRにまとめる
