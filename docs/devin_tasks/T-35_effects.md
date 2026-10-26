# T-35 称号・職業の効果接続 — pending

仕様: `docs/03_world_systems.md`。現在称号 effect と職業の効果はデータ保持のみ（D-07）。

## やること
- `titles.json` の `effect` を gain の M 項・戦闘・その他に接続（語彙を zod で具体化）
- 職業（professions）の効果: 対応する仕事/スキルの経験係数・認定による値段変化など
- 上限 `balance.gain.modifierCap`（×2.5）内に収める

## 受け入れ基準
- [ ] 効果を持つ称号が実際に gain/戦闘へ効く（テストで差が出る）
- [ ] sim:growth/retention が変化範囲内で緑
