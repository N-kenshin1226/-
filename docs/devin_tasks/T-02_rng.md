## タスク: [T-02] シード付き乱数

### 目的
ゲーム全体の乱数をシードから決定論的に生成する土台。世界のシード、テストの再現性、ボットのシミュレーションがすべてこれに依存する。

### 読むもの
`docs/04_tech_and_devin.md` §1（乱数の行）、§2（アーキテクチャ原則）

### 作るもの（`packages/core/src/rng/`）
```ts
export interface Rng {
  next(): number                 // [0, 1)
  int(min: number, max: number): number   // 両端を含む
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  weighted<T>(items: readonly { item: T; weight: number }[]): T
  fork(label: string): Rng       // ラベルから派生した独立の列
  state(): RngState              // シリアライズ可能な状態
}
export function createRng(seed: string | number): Rng
export function restoreRng(state: RngState): Rng
```
- アルゴリズムは xoshiro128** か mulberry32（PRに選定理由を1行）。文字列シードはハッシュ（例：cyrb128）で数値化する
- 外部ライブラリは使わない

### 受け入れ基準
- [ ] 同じシードから同じ列が出る（先頭1,000個のスナップショットテスト）
- [ ] `fork("a")` と `fork("b")` の列が異なり、親の列の消費に影響されない
- [ ] `state()` → JSON → `restoreRng()` で続きの列が一致する
- [ ] `int` の範囲・`weighted` の重みが統計的に正しい（10万回試行で許容誤差内）
- [ ] 不正な引数（min > max、空配列、重み合計0）は例外を投げる

### 共通
- `AGENTS.md` の「絶対ルール」と「完了の定義」を守る
- ゲームの数値は `packages/content/balance.json` に置き、zodスキーマ（`balance.schema.ts`）も更新する
- 乱数を使うテストはシードを固定する
- PRの説明に「判断ログ」節を設け、仕様にない判断を1行ずつ書く

### PR
- タイトル：`T-02: シード付き乱数`
- 1つのPRにまとめる
