## タスク: [T-19b] 物語：アトムの型・正史の骨格・lore:check・見聞録

### 目的
小さな物語のネットワークの土台。検証パイプラインを先に通す。

### 読むもの
`docs/07_story.md` §2〜§5、§7

### 作るもの
- アトムの zod スキーマ（`packages/content/src/atom.schema.ts`）：id/kind/title/text/refs/reveals/reliability/unlock
- `packages/content/lore/canon.json`：正史の骨格（時代・大きな出来事・主要人物の名前のみ。細部は hidden/）
- `pnpm lore:check`（packages/lore-check）：zod検証・参照IDの存在・factが正史と一致・文体lint（禁止語・長さ）・似文の重複
- 見聞録：読んだアトムと分かった事実を GameState に記録（`lore` 状態）。つながりの報酬は最小1つ
- アトムの仮データを少量だけ（型の動作確認用。本編は別担当）

### 受け入れ基準
- [ ] `pnpm lore:check` が参照切れ・rumor/fact違反・文体違反で落ちる
- [ ] 見聞録に記録が残り、条件を満たすと報酬（隠し依頼フラグ等）が開くテスト

### PR
- タイトル：`T-19b: 物語アトムと lore:check`
- 注意：隠し要素の内容をPR説明に書かない
