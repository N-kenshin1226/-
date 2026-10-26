# T-29/T-30/T-31 ミニゲーム皮の追加 — done

M2 のミニゲーム展開。3種の皮を実装（サブエージェント作業）。

## 実装
- `performance`（タイミング皮）: 拍子の速い演奏。`unlocks{seeMeterAt,seePhraseAt}` でスキルに応じ視認情報が増える
- `fishing`（タイミング皮）: `catchMinHits` 未満で「逃がした」（品質0）、全命中で「大物」
- `appraisal`（盤面皮）: 真品=鉱脈・贋作=岩。贋作を掴むと `missPenaltyFactor` 倍。mining の固定半減を一般化
- スキル3種・注文4件・balance3節・CLIテキスト15キーを追加
- CLI: `playTiming`/`playBoard` に一般化、kind リゾルバで新 kind を手動プレイ可能
- Web: `TimingView`/`BoardView` に一般化（kind prop で切替）

## 対応するロードマップ行
- T-29 追加皮: performance（演奏）を追加
- T-30 タイミング皮の拡張: fishing（釣り）
- T-31 盤面皮の拡張: appraisal（鑑定）

## 受け入れ基準
- [x] autoplay 完走・無入力失敗・seed 再現・スキルで窓/ヒント拡大（各5〜6本）
- [x] CLI/Web の仕事フローで新 kind が動く（CLIテスト2本追加）
