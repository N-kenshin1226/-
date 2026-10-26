# X-3 CLI戦闘・深層ループの切り出し — done

整理タスク（機能3連投後の整理枠）。`packages/sim/src/cli/game.ts` が1300行超に肥大化したため、戦闘・深層の対話ループを `cli/combat.ts` に分離する純粋リファクタ。

## やったこと
- `cli/combat.ts` 新設：`CombatIo`（out/outAll/ask/t/cfg/skillNames/applyTitles/bioLines/noteDeath を束ねる口）、`fightEnemy`（狩り・深層共通のCT戦闘対話ループ）、`runAbyss`（深層ラン全体）、`combatGainLines`（gainApplied 表示の共用化）
- `game.ts`：fightEnemy 閉包と深層ブロック（約120行）を `combatIo` 構築＋呼び出し3行に置き換え。使わなくなった import を整理（game.ts は約1200行へ）
- 挙動は不変（cli/game.test.ts のスナップショット19件が無修正で通過）

## 受け入れ基準
- [x] `pnpm --filter @trace/sim test` 緑（19件、スナップショット不変）
- [x] typecheck 緑
