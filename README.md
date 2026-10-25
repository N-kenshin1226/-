# 仮題『TRACE（トレース）』

> 「あなたの行動の痕跡（トレース）が、そのままステータスになる」

**第一の目的はオーナー自身が満足して遊べること。** 公開は未定（公開できる余地は残す）。

ソロ・ブラウザで遊べる、**ラノベ／Web小説に出てくる“あのゲーム”のシステム**を持つ生活×冒険RPG。
テーマは **「成長」と「リアリティ」**。最優先は **「飽きないこと」**。

- 異世界ステータス系＋シャンフロ/SAO的システム：熟練度、称号、派生スキル、認定職、ユニークシナリオ、システムメッセージ、「世界初」
- 自由な生き方：立場×職業の2軸。ミニゲームは多め（アクション系も含む）で、日常の作業ではなく「ここ一番の勝負所」で出る
- 一生＝1周：任意の引退 → 伝記 → 転生（継承）で周回する
- 世界観：王道の異世界ファンタジー（加護によってステータスが見える世界）
- 物語：一本道のメインストーリーではなく、物・場所・NPCの小さな物語がつながっていくネットワーク型

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/01_concept.md](docs/01_concept.md) | ビジョン・5本柱・コアループ・目指す瞬間 |
| [docs/02_growth_system.md](docs/02_growth_system.md) | 成長システム（数式・パラメータ・検証） |
| [docs/03_world_systems.md](docs/03_world_systems.md) | 立場×職業、ミニゲーム基盤、戦闘、称号、通知、年代記 |
| [docs/04_tech_and_devin.md](docs/04_tech_and_devin.md) | 技術スタック・アーキテクチャ・Devin運用 |
| [docs/05_roadmap.md](docs/05_roadmap.md) | マイルストーン（M0〜M4）・Devin用タスク一覧 |
| [docs/06_endgame.md](docs/06_endgame.md) | 寿命・転生・エンドコンテンツ |
| [docs/07_story.md](docs/07_story.md) | ストーリー（物・場所・NPCの小さな物語のネットワーク）とLLM生成パイプライン |
| [docs/meeting_2026-10-25.md](docs/meeting_2026-10-25.md) | 設計会議の議事録（5視点×2ラウンド） |
| [docs/research_notes.md](docs/research_notes.md) | 参考ゲームの調査メモ（出典付き） |
| [docs/devin_tasks/](docs/devin_tasks/QUEUE.md) | Devinへの依頼文とタスクキュー。夜間自走のセットアップは [AUTOMATION_SETUP.md](docs/devin_tasks/AUTOMATION_SETUP.md) |
| [AGENTS.md](AGENTS.md) | AIエージェント（Devin等）向け作業ルール |

## 開発の始め方

- **Node**: `.nvmrc` のバージョン（22 LTS）。**パッケージマネージャ**: pnpm（`packageManager` フィールドのバージョン）。
- `pnpm install` — 依存をインストール（lockfile 固定）
- `pnpm check` — lint → フォーマット → 型検査 → テスト → コンテンツのスキーマ検証 → ビルド → e2e を1コマンドで実行（CI と同じ）
- `pnpm dev` — `apps/web` の開発サーバーを起動
- `pnpm play:cli` — CLI で遊ぶ
- `pnpm sim:growth` / `pnpm sim:retention` — バランスCIゲート（`docs/02_growth_system.md` §10）
- `pnpm lore:check` — 物語アトムの検証（`docs/07_story.md` §5）

e2e を初めて実行するときは `pnpm --filter @trace/web exec playwright install chromium` が必要。
