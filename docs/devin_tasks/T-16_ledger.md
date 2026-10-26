## タスク: [T-16] 作品台帳（Work）

### 目的
作品・偉業を記録する唯一の帳簿。成長（ティア更新）、称号、新聞、年代記、転生の遺物の元データ。

### 読むもの
`docs/03_world_systems.md` §3、`docs/02_growth_system.md` §2（ティア更新で大きく伸びる）

### 作るもの
- `Work` 型：`{ id; kind; maker; quality; tier; order; flags; day; worldSeed }`（シリアライズ可能）
- `GameState` に `ledger: Work[]` を追加（セーブバージョンを上げる）
- `step` 経由で作品が記録される導線（minigame 結果 → 台帳 append のイベント `workRecorded`）
- ティア更新判定：同一 kind の品質の自己ベスト更新でティア+1、大きな経験ボーナス（係数は balance.json）
- 相場の反復減衰：同じ kind の販売が続くと収益が下がる（数値は balance.json。M0 の money はまだ無いので台帳上の `marketValue` として保持）

### 受け入れ基準
- [ ] 台帳への記録・読み出し・ティア更新のテスト
- [ ] セーブ移行（旧バージョン → 新）のテスト
- [ ] 称号条件DSLに `work` 参照が足せること（種類・ティア・品質・件数の条件）

### PR
- タイトル：`T-16: 作品台帳`
