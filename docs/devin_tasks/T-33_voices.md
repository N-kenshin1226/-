# T-33 voices.json 基盤 — done

仕様: `docs/03_world_systems.md` §6 周辺のNPC口調・`docs/07_story.md` の語り差分。

## 実装
- `packages/content/voices.json` 新規: canon の NPC 3人（門番サド・宿屋の主マルタ・採掘場まとめ役フェン）× 立場（drifter/citizen/adventurer）の口調差分
- `voices.schema.ts` / `voices.ts` ローダー / index export / `validate.ts` 登録（byStanding キーと society.json の立場IDの突合検査つき）
- `lines` 形は `NarrationTemplates["npcWord"]` と同型 — `new TemplateProvider({...narration, npcWord: npc.lines})` でそのまま利用可能

## 未実装（意図的）
- 「話す」導線（コマンド・UI）は未作成。将来 `standing: state.society.standing` を渡せば立場差分が出る

## 受け入れ基準
- [x] スキーマ検証・立場キー突合・全ゲート緑
