# T-25 素質の回復・出自 — done（師匠/書物経路は T-26/T-27）

仕様: `docs/02_growth_system.md`（素質 80〜130%、休養で回復）。

## 実装
- `packages/content/origins.json`（新規・zod 検証・affinity↔skills 突合）: 3出自
  - `origin.wanderer` 流れてきた孤児（base 100、affinity なし）
  - `origin.smith_child` 鍛冶屋の子（base 90、鍛冶+30/鑑定+10/採掘+10）
  - `origin.hunter_child` 猟師の子（base 95、観察+25/釣り+15）
- `SkillState.potentialCap`（回復上限=初期値）と `PlayerState.origin` を追加 → **セーブ v10**
  - 移行 9→10: origin=`origin.wanderer`、potentialCap=100（旧一律初期値を踏襲）
- 初期素質: `fork("origin:<id>")` で `base + int(-15..15) + affinity` を `[potentialInitMin, Max]`=[80,130] にクランプ（決定論・親rng不消費）
- 休養日の素質回復は `potentialCap` までに修正（旧: 一律 potentialMax 上限）
- CLI は新規開始時に出自を3択で選ぶ。Web はタイトル画面で出自ボタン（e2e は `origin-wanderer`）

## 判断（D-25）
- ばらつき ±15 は出自の「幅」の演出で、範囲上下限は balance の `potentialInitMin/Max` に置いた
- 師匠・書物による素質回復は T-26/T-27 に委譲（回復先は `potentialCap`）

## 受け入れ基準
- [x] 出自ごとに初期素質が変わる（affinity で差が出る・決定論）
- [x] 休養日で `potentialCap` まで回復する（既存 `restPotentialRecover` 経路）
- [x] v9→v10 移行テスト・出自テスト（state.test.ts）
