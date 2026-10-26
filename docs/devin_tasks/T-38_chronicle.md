# T-38 年代記（別領域の保存） — done

仕様: `docs/06_endgame.md` §1・§3C（年代記は周回をまたいで厚くなる）。04 §2 原則5「年代記は別領域・別バージョン」。

## やること
- `core/src/chronicle/`：年代記エントリ（前世の名・二つ名・伝記・到達（称号/立場/日数）・シード）を蓄積する型と読み書き
- 保存は GameState と別領域（CLI: `~/.trace/chronicle.json`、Web: localStorage の別キー）
- `CHRONICLE_VERSION` と独自の移行関数
- 死亡/引退時に追記（T-40 のフローから呼ぶ）

## 受け入れ基準
- [x] 年代記が周回をまたいで残る（セーブを消しても残る）— `packages/sim/src/cli/game.test.ts` T-38 節、`apps/web/e2e/chronicle.spec.ts`
- [x] バージョン移行テスト — `packages/core/src/chronicle/chronicle.test.ts`
