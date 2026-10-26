# タスクキュー

夜間の自走（`.agents/skills/nightly-run/SKILL.md`）は、この表を上から読み、**状態が `todo` で、依存がすべて `done` の最初のタスク**を実行する。

状態：`todo`（未着手）／`in_progress`（作業中）／`done`（マージ済み）／`blocked`（自走では解決できない。理由を備考に書く）／`needs_human`（オーナーの作業待ち。自走は止まらずに飛ばし、他の作業を続ける）

| ID | 依頼文 | 依存 | 状態 | 備考 |
|---|---|---|---|---|
| T-01 | [T-01_scaffold.md](T-01_scaffold.md) | ― | done | |
| T-02 | [T-02_rng.md](T-02_rng.md) | T-01 | done | |
| T-03 | [T-03_time.md](T-03_time.md) | T-01 | done | |
| T-04 | [T-04_state.md](T-04_state.md) | T-02, T-03 | done | |
| T-05 | [T-05_gain.md](T-05_gain.md) | T-04 | done | |
| T-06 | [T-06_consolidation.md](T-06_consolidation.md) | T-05 | done | |
| T-07 | [T-07_tailwind.md](T-07_tailwind.md) | T-06 | done | |
| T-08 | [T-08_body.md](T-08_body.md) | T-06 | done | |
| T-10 | [T-10_conditions.md](T-10_conditions.md) | T-04 | done | |
| T-09 | [T-09_balance_gate.md](T-09_balance_gate.md) | T-07, T-08, T-10 | todo | |
| T-11 | [T-11_cli.md](T-11_cli.md) | T-09 | todo | |
| H-01 | オーナーがCLIで3日分遊び、「起床ログが気持ちいいか」を判断する | T-11 | needs_human | 自走は止まらずにM1へ進む。オーナーは都合のよいときに遊ぶ |
