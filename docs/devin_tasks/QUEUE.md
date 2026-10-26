# タスクキュー

夜間の自走（`.agents/skills/nightly-run/SKILL.md`）は、この表を上から読み、**状態が `todo` で、依存がすべて `done` の最初のタスク**を実行する。

状態：`todo`（未着手）／`in_progress`（作業中）／`done`（マージ済み）／`blocked`（自走では解決できない。理由を備考に書く）／`needs_human`（オーナーの作業待ち。自走はここで止まる）

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
| T-09 | [T-09_balance_gate.md](T-09_balance_gate.md) | T-07, T-08, T-10 | done | |
| T-11 | [T-11_cli.md](T-11_cli.md) | T-09 | done | |
| H-01 | オーナーがCLIで3日分遊び、「起床ログが気持ちいいか」を判断する | T-11 | needs_human | M0の終わり。オーナーの指示でスキップして先へ進む |

## M1

| ID | タスク | 依存 | 状態 | 備考 |
|---|---|---|---|---|
| T-12 | [T-12_minigame_engines.md](T-12_minigame_engines.md) | T-04 | done | MiniGame型と3エンジン |
| T-13 | [T-13_smithing.md](T-13_smithing.md) | T-12 | done | 鍛冶（タイミング）＋簡易判定＋CLIの仕事メニュー |
| T-14 | [T-14_mining.md](T-14_mining.md) | T-12 | done | 採掘（盤面）。ヒント半径・手動CLI |
| T-15 | [T-15_negotiation.md](T-15_negotiation.md) | T-12 | done | 交渉（駆け引き）。三すくみ・手札数は技能依存 |
| T-16 | [T-16_ledger.md](T-16_ledger.md) | T-04 | done | 作品台帳。T-13と並行可 |
| T-17 | [T-17_ct_combat.md](T-17_ct_combat.md) | T-04 | done | CT戦闘コア。予兆・防御・観察・逃走 |
| T-18 | [T-18_notify.md](T-18_notify.md) | T-10 | done | 通知予算S/A/B・気配（Sは1日1回） |
| T-19 | [T-19_society.md](T-19_society.md) | T-10, T-16 | done | 立場3段階×職業2・打診(A通知)・人生目標 |
| T-19b | [T-19b_lore.md](T-19b_lore.md) | T-10 | done | アトム型・canon骨格・lore:check・見聞録（セーブv8） |
| T-19c | [T-19c_narration.md](T-19c_narration.md) | T-16 | todo | NarrationProvider+Template |
| T-20 | [T-20_cli_town.md](T-20_cli_town.md) | T-13〜T-19 | todo | CLIで街のプレイループ |
| T-21 | [T-21_web_ui.md](T-21_web_ui.md) | T-20 | todo | Web UI（M1） |
