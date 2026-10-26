# タスクキュー

夜間の自走（`.agents/skills/nightly-run/SKILL.md`）は、この表を上から読み、**状態が `todo` で、依存がすべて `done` の最初のタスク**を実行する。

状態：`todo`（未着手）／`in_progress`（作業中）／`done`（マージ済み）／`blocked`（自走では解決できない。理由を備考に書く）／`needs_human`（オーナーの作業待ち。自走は止まらずに飛ばし、他の作業を続ける）

| ID | 依頼文 | 依存 | 状態 | 備考 |
|---|---|---|---|---|
| UI-01 | [UI-01_redesign.md](UI-01_redesign.md) | ― | done | **最優先**。デザイン見本（docs/design/）に合わせてUIを作り直す |
| W-01 | [W-01_crisis_core.md](W-01_crisis_core.md) | ― | todo | 危機の筋書きと世界の備え（docs/08_world_crisis.md） |
| W-02 | [W-02_touchpoints.md](W-02_touchpoints.md) | W-01 | todo | 接点（危機が日常に混ざる）と寄与 |
| W-03 | [W-03_involvement.md](W-03_involvement.md) | W-02 | todo | 関与の段階と英雄への道 |
| W-05 | [W-05_sim_crisis.md](W-05_sim_crisis.md) | W-03 | todo | 危機のバランスCIゲート |
| W-04 | [W-04_endings_ui.md](W-04_endings_ui.md) | W-03, UI-01 | todo | 危機の見せ方と終幕の画面 |
| C-01 | [C-01_crisis_content.md](C-01_crisis_content.md) | W-01 | needs_human | Opus 5.5 が担当。Devinは飛ばす |
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
| T-19c | [T-19c_narration.md](T-19c_narration.md) | T-16 | done | NarrationProvider+Template（セーブv9経由のnarration状態） |
| T-20 | [T-20_cli_town.md](T-20_cli_town.md) | T-13〜T-19 | done | 所持金・宿代・特別注文・街の記録（セーブv9） |
| T-21 | [T-21_web_ui.md](T-21_web_ui.md) | T-20 | done | Web UI（M1。ブラウザで3日分プレイ可・e2e拡張） |
| T-22 | [T-22_titles.md](T-22_titles.md) | T-18 | done | 称号20個（B習慣系〜S頂点） |
| T-23 | [T-23_areas.md](T-23_areas.md) | T-17 | done | 周辺2エリア（近郊の森/旧街道）＋敵5体 |
| T-24 | [T-24_rust.md](T-24_rust.md) | T-06 | done | 錆：猶予14日→0.1/日低下・床peak×0.7・再習得3倍・脳容量 |
| T-25 | [T-25_potential.md](T-25_potential.md) | T-08 | done | 素質の回復と出自（origins.json・potentialCap・セーブv10） |
| T-26 | [T-26_books.md](T-26_books.md) | T-04 | done | 書物（効果・読む行動・入手経路） |
| T-27 | [T-27_mentors.md](T-27_mentors.md) | T-19, T-33 | done | 師匠（弟子入り・M項/素質/ヒント効果） |
| T-28 | [T-28_derived_skills.md](T-28_derived_skills.md) | T-10 | done | 派生スキル4種（unlock条件DSL・flags解放・skillUnlocked） |
| T-29 | [T-29_skins.md](T-29_skins.md) | T-12 | done | ミニゲーム皮追加：演奏（タイミング） |
| T-30 | [T-29_skins.md](T-29_skins.md) | T-12 | done | タイミング皮拡張：釣り |
| T-31 | [T-29_skins.md](T-29_skins.md) | T-12 | done | 盤面皮拡張：鑑定 |
| T-32 | [T-32_newspaper.md](T-32_newspaper.md) | T-19c | done | 新聞強化（作品・死亡・噂・立場差分） |
| T-33 | [T-33_voices.md](T-33_voices.md) | T-19b | done | voices.json（NPC3人×立場の口調差分） |
| T-34 | [T-34_life_goals.md](T-34_life_goals.md) | T-19 | done | 人生目標15件（society.offerカウンタ・simReachable・sim到達性ゲート） |
| T-35 | [T-35_effects.md](T-35_effects.md) | T-19, T-22 | done | 称号・職業の効果をgain/報酬/与ダメージへ接続（effect語彙） |
| T-36 | [T-36_aging.md](T-36_aging.md) | T-03 | done | 寿命・加齢（年齢帯で伸び変化・老いの兆候・老衰死） |
| T-37 | [T-37_biography.md](T-37_biography.md) | T-19c | done | 伝記の自動生成（biography リクエスト種別） |
| T-38 | [T-38_chronicle.md](T-38_chronicle.md) | T-04 | done | 年代記（別領域・別バージョンの蓄積） |
| T-39 | [T-39_legacy.md](T-39_legacy.md) | T-25 | done | 継承3項目（素質補正・称号・遺物）→newGame |
| T-40 | [T-40_reincarnation.md](T-40_reincarnation.md) | T-36〜T-39 | done | 引退・転生フロー（伝記→年代記→継承→新シード） |
| T-41 | [T-41_pinnacle.md](T-41_pinnacle.md) | T-19 | done | 頂点ルート2本（条件鎖＋エンディング） |
| T-42 | [T-42_legend.md](T-42_legend.md) | T-38, T-40 | done | 前世の伝説最小版（年代記に名・二つ名） |

## M4（06_endgame.md §3、継続的追加）

| ID | 票 | 依存 | 状態 | 内容 |
|---|---|---|---|---|
| T-43 | [T-43_abyss.md](T-43_abyss.md) | T-17, T-38 | done | 無限深層ダンジョン（時間制限＋自己ベスト） |
| T-44 | [T-44_uniques.md](T-44_uniques.md) | T-17, T-23 | done | 強化版ユニーク再戦・図鑑 |
| T-45 | [T-45_tendency.md](T-45_tendency.md) | T-40 | done | 運命の傾向（開始時3択・1軸） |
| T-46 | [T-46_vows.md](T-46_vows.md) | T-45 | done | 誓約（難度修飾子5個＋称号） |
| T-47 | [T-47_rivals.md](T-47_rivals.md) | T-38 | done | ライバル・ランキング（簡易版） |
| T-48 | [T-48_heir.md](T-48_heir.md) | T-39, T-40 | done | 子・弟子への継承延長（同じ世界） |

## 整理タスク

| ID | 票 | 依存 | 状態 | 内容 |
|---|---|---|---|---|
| X-2 | [X-2_app_split.md](X-2_app_split.md) | ― | done | App.tsx を画面単位で分割（純粋リファクタ。screens/＋ui.tsx 新設） |
| X-3 | [X-3_cli_combat_split.md](X-3_cli_combat_split.md) | ― | done | cli/game.ts から戦闘・深層対話ループを combat.ts に切り出し（純粋リファクタ） |
| X-4 | [X-4_true_end.md](X-4_true_end.md) | T-41 | done | **範囲変更**：大賢者ルートの追加だけ行う。真エンドの部分はやらない（W-01〜W-05 に置き換え） |
| X-5 | [X-5_lost_legacy.md](X-5_lost_legacy.md) | T-39, T-40 | done | 前世の技が次の世界に残る（失われた書物。年代記に代表技能を記録） |
| X-7 | [X-7_stage_scaling.md](X-7_stage_scaling.md) | UI-01 | done | Stage の解像度スケーリング検証（e2e。UI-01 残り受け入れ） |
| X-8 | [X-8_e2e_coverage.md](X-8_e2e_coverage.md) | UI-01 | done | 未カバー画面の e2e 追加（能力・立場・書店・新聞・記録削除・家で休む） |
