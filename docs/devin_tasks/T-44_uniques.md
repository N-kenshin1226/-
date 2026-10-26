# T-44 強化版ユニークとの再戦・図鑑 — done

仕様: docs/06_endgame.md §3B（強化版ユニーク再戦、図鑑・称号コンプリート）。

## やったこと
- 再戦ユニークは係数生成：`balance.combat.unique`（afterKills/hpFactor/powerFactor/challengeBonus/agilityBonus、zod検証済み）を `enhancedEnemy` で素の敵に適用。パターン・行動間隔・技名はそのまま（プレイヤーの学習が効く）
- 解禁判定：`kill.species.<id>` カウンタが afterKills に達すると狩りリストに現れる（`canFightUnique`、CLI・Web 両方）
- 記録：勝利で `kill.unique.<id>`・`kill.unique.total` カウンタ＋`uniqueDefeated` イベント（表示は cli.json の uniqueDefeated テンプレート）。GameState の形は不変（セーブ v13 据置）
- 図鑑：街の記録に「── 討伐図鑑 ──」節を追加（kill.species.*/kill.unique.* から生成、CLI・Web 共通テンプレート）
- 称号：`title.unique_hunter`（B、kill.unique.total≥1、combat gain×1.05）・`title.compendium`（A、全5種討伐、combat gain×1.1）

## 受け入れ基準
- [x] 再戦ユニークが強化されている（HP×1.6・攻撃×1.5・挑戦差+10・敏捷+2）
- [x] 図鑑が実績に基づく一覧になる
- [x] 勝利が決定的にカウンタ・イベントへ記録される（unique.test.ts 9件）
- [x] 既存の通常戦闘を壊さない（unique 省略時は従来どおり）
