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
