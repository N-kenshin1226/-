# T-25 素質の回復 — pending

仕様: `docs/02_growth_system.md`。素質は出自由来の初期値 80〜130% で、スキル1点ごとに約1%低下（実装済み）。本タスクは回復経路。

## やること
- 素質の初期値を出自（origin）から 80〜130% に（現在は一律100 — D-09）
- 休養日・師匠・書物で素質が回復する経路を実装
- 上限 `body.potentialMax` との整合

## 受け入れ基準
- [ ] 出自ごとに初期素質が変わる
- [ ] 休養日で回復する（`balance.json` の `body.restPotentialRecover` 等）
- [ ] 決定論テストあり

## メモ
- 出自（origin）のコンテンツ定義がまだない。`origins.json` 新設か newGame 引数で選ぶ形かは実装時に決める
