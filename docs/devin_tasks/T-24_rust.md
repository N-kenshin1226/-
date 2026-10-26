# T-24 錆（rust）— done

仕様: `docs/02_growth_system.md` §7「取り戻す快感の供給源」。

## 実装
- `packages/core/src/growth/rust.ts` — `rustedValue`（猶予超過で ratePerDay/日低下・床は peak×floorFactor）・`effectiveGraceDays`（合計スキル値 > capacityThreshold で猶予が線形に縮む、下限係数あり）
- `consolidate.ts` — 睡眠時に全スキルを検査して錆を適用し、錆びたスキルと再習得加速を `WakeReport.surprises` に載せる
- 再習得: value < peak の間は定着が `relearnFactor` 倍。peak に達した時点で打ち切り、残りは1倍
- テキストは `cli.json` の `wake.rusted`/`wake.relearning` テンプレート（`――《{name}》が錆びついている（-{loss}）`／`――身体が覚えている。…`）
- 設定は `balance.json` の `rust` 節（graceDays 14 / ratePerDay 0.1 / floorFactor 0.7 / relearnFactor 3 / capacityThreshold 300 / capacityGraceMinFactor 0.25）
- スキル表示名は `StepConfig.skillNames` で注入（core→content 依存を避ける）

## 判断（D-23）
- 錆は「表示値」ではなく値そのものに適用する（gain・条件判定・UI が同じ値を見る。spec の「表示値」文言は UI 上の見え方の指摘と解釈）
- GameState の形は変わらない（peak/lastUsedDay は既存フィールド）ためセーブバージョン据え置き

## 受け入れ基準
- [x] 猶予内は低下しない、超過で rate/日低下、peak×0.7 で止まる
- [x] 床以下の値を持ち上げない
- [x] 脳の容量超過で猶予が縮む（下限あり）
- [x] 再習得が3倍速く、peak 超過分は1倍
- [x] 起床サプライズに両パターン出る（`rust.test.ts` 8件）
