## タスク: [T-01] リポジトリの雛形と品質ゲート

### 背景
個人開発のブラウザRPG『TRACE』の最初のタスクです。仕様はすべて `docs/` にあります。
今回はゲームの機能は作らず、**今後のタスクがすべてこの上に乗る土台**だけを作ります。

### 最初に読むもの
1. `AGENTS.md`（作業ルール。必ず守る）
2. `docs/04_tech_and_devin.md` §1〜2（技術スタックとディレクトリ構成）
3. `docs/05_roadmap.md`（全体の中での位置づけ。T-01の行）

`docs/01〜03, 06, 07` は今回は流し読みで構いません。

### 作るもの
1. **pnpm workspaces の monorepo**
   ```
   packages/core      # 純TSのゲームロジック（今回は空の骨組み）
   packages/content   # JSONデータ＋zodスキーマ（今回は balance.json の雛形だけ）
   packages/sim       # ヘッドレスのシミュレータ（今回は空のCLIだけ）
   packages/lore-check # 物語データの検証CLI（今回は空のCLIだけ）
   apps/web           # React + Vite（今回は「TRACE」と表示するだけの1画面）
   ```
2. **TypeScript**：strict を有効にする。共通の `tsconfig.base.json` を各パッケージが継承する
3. **ESLint と Prettier**：
   - `packages/core` で `Math.random`、`Date.now`、`new Date()`、DOM・ブラウザAPI（`window`、`document`、`localStorage` など）の使用を **lint エラーにする**
   - `packages/core` から `react`・`apps/*` を import したらエラーにする
4. **Vitest**：各パッケージにサンプルのテストを1本ずつ置く
5. **`packages/content/balance.json`** と、その zod スキーマ `balance.schema.ts`
   - 中身は `{ "version": 1 }` だけでよい。スキーマ検証のテストを1本書く
6. **ルートのスクリプト**
   - `pnpm check`：lint → 型検査 → テスト → コンテンツのスキーマ検証 → ビルド を順に実行し、どれか失敗したら非ゼロで終了
   - `pnpm sim:growth`、`pnpm sim:retention`、`pnpm lore:check`、`pnpm play:cli`：今は「未実装」と表示して正常終了するだけのプレースホルダ
   - `pnpm dev`：`apps/web` の開発サーバーを起動
7. **GitHub Actions**：push と PR で `pnpm check` を実行する
8. **Playwright**：`apps/web` を起動して、トップ画面に「TRACE」が表示されることを確認するスモークテスト1本と、スクリーンショットの保存
9. **`.gitignore`、`.nvmrc`（Node の LTS）、`packageManager` フィールド**
10. **`packages/content/hidden/`**（空のディレクトリ＋ `README.md`）
    - README に「ネタバレ防止のため、オーナーが読まない隠し要素の置き場。中身をPRの説明やコメントに書かないこと」と記載する（`docs/07_story.md` §5）

11. **`docs/reports/`** はすでにあるので変更しない
12. GitHub Actions のジョブ名は **`check`** にする（ブランチ保護の必須チェックとして指定するため）

### 範囲
- 変更してよい：上記の新規ファイル、ルートの設定ファイル、`README.md` の「開発の始め方」節の追記
- 変更しない：`docs/` 配下、`AGENTS.md`（仕様と矛盾する点を見つけたら、変更せずPRで指摘する）
- ゲームのロジック（成長式、戦闘など）は **書かない**。T-02 以降で行う

### 受け入れ基準
- [ ] クリーンな clone から `pnpm install && pnpm check` が成功する
- [ ] GitHub Actions が緑になる
- [ ] `packages/core` に `Math.random()` を1行書くと `pnpm check` が失敗することを確認した（確認後はその行を消す。PRに確認結果を書く）
- [ ] `balance.json` の `version` を文字列に変えると `pnpm check` が失敗することを確認した（同上）
- [ ] `pnpm dev` で「TRACE」と表示される。Playwright のスクリーンショットをPRに添付する
- [ ] プレースホルダの各スクリプトが正常終了する
- [ ] README に「開発の始め方」（必要なNodeのバージョン、install、check、dev）を追記した
- [ ] ライブラリはすべて最新の安定版を使い、バージョンを固定する（lockfile をコミットする）

### 検証方法
PRに次を貼ってください。
- `pnpm check` の出力の末尾
- 受け入れ基準の「失敗することを確認した」2項目の、失敗時の出力の抜粋
- Playwright のスクリーンショット

### 進め方の注意
- 判断に迷う選択（ライブラリの選定など）は、勝手に大きく決めず、最も標準的なものを選んでPRに理由を一行書く
- 1つのPRにまとめる。PRのタイトルは `T-01: リポジトリの雛形と品質ゲート`
- 同じPRで `docs/devin_tasks/QUEUE.md` の T-01 の状態を `done` にする
