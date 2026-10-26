## タスク: [T-19c] NarrationProvider と TemplateProvider

### 目的
実行時の語り層。LLMなしでも動く標準実装（テンプレート）を先に作る。

### 読むもの
`docs/07_story.md` §6

### 作るもの
- `NarrationProvider` インターフェース（core か sim。文章だけ返す。結果は決めない）
- `TemplateProvider`：新聞1行・NPCの一言・見聞録まとめ・伝記のテンプレ実装。入力は構造化データのみ
- 呼び出し箇所は睡眠時の新聞など1箇所でよい（まず配管）

### 受け入れ基準
- [ ] TemplateProvider で新聞1行が出るテスト
- [ ] プロバイダー差し替え口（DI）が用意されている

### PR
- タイトル：`T-19c: NarrationProvider`
