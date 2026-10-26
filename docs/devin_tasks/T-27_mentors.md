# T-27 師匠 — done

仕様: `docs/02_growth_system.md`（M項の師匠係数・素質回復）、`docs/03_world_systems.md`（§7 効果語彙・§1 NPC）。

## やったこと
- `packages/content/mentors.json`（5名）＋ `mentors.schema.ts`（zod）＋ loader。フィールド: id/name/npc/skill/condition(条件DSL)/fee/potentialRecover/effect(T-35語彙)/flag/desc/note
- validate.ts に登録＋キー突合：`skill`↔skills.json、`npc`↔canon.figures **と** voices.npcs の両方、effect キーは書物と同じ規則（gainVs=スキル/敵/行動kind、damageVs=敵、priceVs=スキル）
- コマンド3種（step.ts）：`apprentice`（行動を消費しない弟子入り・条件DSL評価）、`leaveMentor`（別れ）、`trainWithMentor`（1行動＋礼金の稽古。gain は train と同じ式で M項に弟子期間効果、素質回復・秘伝フラグ付き）
- `GameState.mentor: {id, sinceDay} | null` を追加 → **セーブ v12**＋移行テスト
- 効果接続：`activeEffects` の第4引数（省略可）に mentors を渡すと現在の師匠の effect が M項・与ダメージ・報酬の全呼び出しに乗る
- イベント：`mentorApprenticed` / `mentorLeft` / `mentorTrained{fee,recovered,flag?}`。稽古回数は `mentor.session.<id>` カウンタ
- voices.json に師匠NPCの口調差分を追加（npc.garo/nola/cum/edel。npc.fenn は既存）
- CLI「10) 師匠」（行動残なし時は 6)）：師匠一覧（入門可/見込みなし表示）→弟子入り→稽古（難度選択・礼金・素質回復表示）→別れ
- Web「師匠」画面：一覧＋弟子入りボタン、稽古は難度4択ボタン＋礼金表示

## 受け入れ基準
- [x] 弟子入り→効果適用→別れ（または継続）が決定論的に動く（mentors.test.ts）
- [x] GameState 変更 → セーブ v12＋移行テスト（state.test.ts）

## メモ
- 師匠は同時1人・弟子入りは打診とは別コマンド・素質回復は稽古ごと（詳細は DECISIONS.md D-28）
- 秘伝フラグ（`taught.*`）はミニゲームのヒント解放の受け皿。エンジンへの配線は今後
