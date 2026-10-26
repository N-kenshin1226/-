# T-32 新聞生成の強化 — done

仕様: `docs/07_story.md` の語り（新聞）。TemplateProvider の分類を拡張。

## 実装
- `NarrationRequest.newspaper` に `works`（当日の作品: name/quality/tier）と `deaths`（通算死亡数）を追加（optional・後方互換）
- 分類優先度: title > offer > work > 行動連鎖 > quiet。rumor は候補プールに1件混ぜる方式（配列量で自然に確率が決まる）
- `deaths>0` の日は death 行が見出しプールに混ざる（死亡歴は通算カウンタ — GameState 非変更の制約下での代替）
- `npcWord` に `byStanding`（立場ごとの口調差分）を追加
- `narration.json`: work/death/rumor 行と既存行の増量、立場差分
- CLI `newspaper()` / Web `wakeLines()` が ledger 当日作品と `death.count` を渡す

## 受け入れ基準
- [x] 作品言及が確実に出る / deaths 混入 / rumor 混入 / 立場差分（新テスト4件）
- [x] 呼び出し互換（works/deaths 未指定でも動く）
