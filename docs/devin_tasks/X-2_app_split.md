# X-2 App.tsx 画面単位分割 — done

整理タスク。`apps/web/src/App.tsx`（2162行）が画面への連続変更で肥大化していたので、
画面ごとのファイルに分けて見通しを良くする**純粋リファクタ**。挙動は一切変えない。

## やること
- `apps/web/src/screens/` を新設し、画面コンポーネントを分ける
- 共有部品（Btn・css・Screen 型・Act 型・push 型）は `apps/web/src/ui.tsx` に集約
- `game.ts` の公開 API・`@trace/content` / `@trace/core` の挙動は変えない
- コンポーネントの props・state・hooks・イベント順序・testId はそのまま（移動のみ）

## 受け入れ基準
- [x] `pnpm run lint` / `format:check` / `typecheck`（web）/ `test` / `build` / `test:e2e` が緑
- [x] e2e の testId・遷移を壊さない（testId 名の差分なしを確認済み）

## 実装メモ
- 分割先：
  - `src/ui.tsx` — `css`・`Btn`・`Screen` 型・`Act` 型・`Push` 型の共有部品
  - `src/screens/title.tsx` — `TitleScreen`（旧 App の `!state` 分岐をそのまま切出し）・`FatePickers`
  - `src/screens/menu.tsx` — `MenuScreen`
  - `src/screens/town.tsx` — `TrainScreen`・`SleepScreen`・`BookScreen`・`StatusScreen`
  - `src/screens/work.tsx` — `workResultLines`・`kindToMinigame`・`WorkScreen`・`WorkModeScreen`・`MinigameScreen`・`TimingView`・`BoardView`・`NegotiationView`
  - `src/screens/hunt.tsx` — `HuntScreen`・`CombatScreen`・`AbyssScreen`
  - `src/screens/records.tsx` — `RecordsScreen`・`ChronicleView`・`LoreScreen`
  - `src/screens/society.tsx` — `SocietyScreen`・`MentorScreen`
  - `src/screens/end.tsx` — `RetireScreen`・`SuccessionScreen`・`HeirScreen`・`RebirthScreen`
- `App.tsx`（2162→371行）には App（状態・ログ・act・継承系コールバック）と
  `StatusHeader`・`ScreenView`（画面の振り分け）だけを残す
- 唯一の構造上の変更：`!state` 分岐の JSX を `TitleScreen` コンポーネントとして
  切り出した（JSX 自体は verbatim、`startNew` を props で注入）。
  `Act` 型の引数は `Parameters<typeof step>[1]` と同じ `Command` 型を direct に使用
- barrel（index.ts）は作らず、App.tsx と end.tsx が各ファイルを直接 import
  （`end.tsx`→`title.tsx` の `FatePickers` 依存のみ。循環なし）
- `workResultLines` は元から export 済み。他ファイルからの参照はないため work.tsx に
  export のまま移動（App.tsx からの再 export なし）

## 検証
- lint / format:check / typecheck / test（398件）/ build / test:e2e（10件）すべて緑
- `git show HEAD:App.tsx` との差分確認：関数名の集合が一致（追加は TitleScreen のみ）、
  testId / data-testid の集合が完全一致
