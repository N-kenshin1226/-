# T-48 子・弟子への継承延長 — done

仕様: docs/06_endgame.md §1（子や弟子に継承して延長できる。M4以降）。

## やること
- 引退時に「世界を変えずに次代を継ぐ」選択肢：新キャラが同じ世界 seed で開始（転生と別系統）
- 継承先は師匠の逆（弟子ポジション）や血縁として扱い、legacy とは別の弱い引継ぎ
- 同じ世界なので年代記は追記しないが、前代の記録は残る

## 受け入れ基準
- [x] 同じ世界で次代に継げる（seed 不変）
- [x] 転生（別世界）との違いが分かる表示

## 実装メモ
- `core/heir`：`succeedLife(prev, name, cfg, heirCfg)` が同じ seed の新しい
  GameState を作る（`nextWorldSeed` を通らない転生とは別系統）。`heirKindOf` が
  次代の立ち位置（子/弟子）を、弟子入り歴（現役弟子 or `mentor.session.*` カウンタ）
  から決める。`heirLegacyOf` は素質補正の小さい版だけを返す
  （記憶称号・遺物は渡さない。`balance.heir`：factor 0.05・上限10）
- 世代の刻印は GameState を増やさず counters/flags：`heir.count`（この世界での
  継承回数、`heirGenerationOf` は +1 した代目）と `flags["heir.child"|"heir.disciple"]`。
  セーブバージョン据置（v15）
- 継ぎ方の選択は引退・老衰の共通フローで行う（CLI は `reincarnate` 内、
  Web は `succession` 画面）。転生を選んだ時点で年代記に刻む
  （recordLifeEnd は選択後に移動）。次代なら刻まない
- 同じ世界なので運命の傾向は前世のものを継ぐ（選び直さない）。
  誓約は生ごとの選択として選び直せる。設計判断は D-38
