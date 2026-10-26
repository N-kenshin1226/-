# X-5 前世の技が次の世界に残る（失われた書物） — todo

仕様: docs/06_endgame.md §2「M4以降：前世の技が、次の世界の師匠NPCや
失われた書物として現れる」。M3/T-42 では年代記に名・二つ名だけを載せた最小版。

## やること
1. **年代記に前世の代表技能を記録する**：ChronicleEntry にその人生の
   最終技能の上位（例: `peakSkills: { id, value }[]` 最大2〜3件）を追加する。
   年代記は独自バージョン（CHRONICLE_VERSION）を持つので、バンプして
   `chronicleMigrations` に移行関数とテストを書く
2. **失われた書物として現れる（保守的案）**：転生で別世界に生まれたとき、
   前世の代表技能が閾値（balance.json に新しい節。数値はコードに直書きしない）
   を超えていれば、その世界の書店に「先達の手記」系の書物が並ぶ。
   実装は GameState を増やさず flags を使う方向で（例: `flags["lostbook.<skillId>"]`
   を newGame/転生時に立て、books.json に flag 条件で出る書物を定義する）。
   書物を読むとその技能の素質や経験に恩恵がある（既存の BookDef の効果語彙を使う）
3. **師匠NPC案は大きいので今回はやらない**：判断ログに「師匠NPC化は未実装」と書く
4. CLI と Web の両方で確認できること（書店の棚・読了ログ）

## 受け入れ基準
- [ ] ChronicleEntry が代表技能を記録し、旧バージョンからの移行テストがある
- [ ] 前世の技能が閾値超のとき、次の世界の書店に対応する書物が出るテスト
- [ ] 閾値未満では出ないテスト
- [ ] 書物の名前・説明文が content（books.json / テンプレート）由来で、
      コードに文面を直書きしていない
- [ ] `pnpm check` 全緑

## 範囲
- 変更してよい: packages/core, packages/content, packages/sim, apps/web
- QUEUE.md・docs/proposals/DECISIONS.md・docs/reports/ は触らない
  （統合時に親エージェントが更新する）

## 実装メモ（2026-10-27）

保守的な「失われた書物」案で実装した。GameState の形は増やさず、
既存の flags・条件DSL・書物機構（T-26）に乗せている。

- **年代記**：`ChronicleEntry.peakSkills`（`{ id, value }[]`、任意）を追加。
  `lifeEntryOf` が各技能の **最高到達値 `peak`**（錆びた現在値 `value` ではない）の
  上位を記録する（既定3件・`maxSkills` で変更可。同値はスキルID昇順で決定論的）。
  `CHRONICLE_VERSION` を 3 に上げ、v2→v3 の移行関数と移行・記録のテストを追加。
  peakSkills の無い旧頁は任意フィールドなのでそのまま読める。
- **フラグ導出**：新モジュール `core/lostbooks` の `lostBookFlags(chronicle, cfg, seed)` が
  年代記の直前の人生（`worldSeed` が一致する最新の頁）を読み、
  `peakSkills.value >= skillThreshold` の技能を上位から `maxBooks` 件
  `lostbook.<skillId>` フラグに変換する。閾値・上限・接頭辞は
  `balance.json` の `lostBooks` 節（`skillThreshold: 60`、`maxBooks: 3`、
  `flagPrefix: "lostbook."`）に置き、コードへの数値直書きはしていない。
- **GameState**：変更なし。`NewGameConfig.flags`（開始時に立てる任意フラグ）を足し、
  CLI `reincarnate` / Web `born` が `lostBookFlags` の結果を `newGame` に渡す。
  `heirLife`（次代・同じ世界）には渡さない —— 手記が現れるのは「別世界」の転生だけ。
- **棚条件**：`BookDefLike.condition`（条件DSL。省略時は常に並ぶ）を追加し、
  `shelfBooks(state, cfg, time)` で棚を絞る。`buyBook` も購入側で同じ条件を判定し、
  一覧に出さないだけの抜け道を塞ぐ。CLI `booksMenu` と Web `BookScreen` は
  `shelfBooks` の結果だけを表示する。
- **書物データ**：`books.json` に技能ごとの「先達の手記」を13冊追加
  （condition: `{flag: "lostbook.<skillId>"}`、effect.gainVs 1.25・7日、
  potentialRecover 15）。名前・説明文・読了文はすべて content 由来。
  読了は既存の `readBook`／step の `bookRead` イベントと同じ流れで、
  通常の読了ログ（cli.json `bookRead`）に出る。
- **転生の告知**：`rebirthLostBooks` 文テンプレを cli.json に追加し、
  CLI・Web 双方の転生ログに「どの技能の手記が遺ったか」を1行出す
  （技能名は skills.json の name から解決）。
- **未実装**：師匠NPCとして現れる案（06 §2 のもう片方）は今回実装しない。
  NPC会話・技能伝授の設計が大きいため、書物として残る保守的案に留めた。
- **検証**：chronicle/lostbooks/books のユニットテスト（閾値の上下・
  棚フィルタ・購入拒否・読了効果・移行）と Web e2e（`e2e/lostbooks.spec.ts`、
  閾値超で棚に出て買って読める／閾値未満で出ない）を追加。
