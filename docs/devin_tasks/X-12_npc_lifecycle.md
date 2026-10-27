## タスク: [X-12] NPCの歳月 —— 師匠・ライバル・住人の物語が進み、終わる

### やること（仕様 `docs/07_story.md` §3 終盤）
- „NPCも年を取る：一生の間に、NPCの物語は進んだり終わったりする（引退、結婚、死）。結末は年代記に残る“
- 現状: 師匠（`mentors.json`）は永遠に若い・同じ。ライバルはランキング点だけ。街の声（voices）に老いない。危機によるNPC離散はある（W-01）が、**平時の時間経過による変化はない**。

### 実装
- `packages/content/npc_lifecycle.json` + zod スキーマ: `{ npcId, name, events: [{ at: Cond, kind: "retire"|"marry"|"depart"|"die"|"promote", text, effects?: {...} }] }`
  - `at` は既存の条件DSL（`time.year/dayOfSeason`・`flag`・`counter` 等）。時期は「その世界の暦」で決定的
  - `kind` の効果:
    - `retire`/`die`/`depart`: その NPC が以後使えない（師匠なら入門・稽古不可、voices からも消える）。ライバルならランキングから退場
    - `marry`/`promote`: 台詞・見出しに変化（新聞に載る）
  - 全イベントは `chronicle`（その世界の年代記）に一行刻む＋新聞に載る＋噂に混ざる
- `packages/core/src/npclife/index.ts`: step の季節/日境界でイベント判定（`npc.done.<id>` カウンタで冪等）。GameState 非変更（flags/counters で導出）
- 対象NPC: 師匠5名全員・ライバルキャスト・voices の主な話者に、まず3〜5件のイベントを割り当てる（例: 老師匠が X年目に引退→弟子が跡を継ぐ／ライバルが結婚でランキング引退／宿屋の女主人が亡くなり次の女将に）
- 発生時の見せ方: 新聞記事＋噂＋街の声（関連 NPC が言及）＋該当者の可用性変化。ランクBログ（「――{name}が引退しました。」）
- セーブ互換: GameState 形は変えない（npc.done.* カウンタ）。v16 のまま
- CLI・sim・Web 同じ core 経路（availability は mentors/rivals/voices の各 selector で npc flags を見る）

### 境界
- `docs/devin_tasks/QUEUE.md` は触らない（親が更新）
- `packages/core/src/crisis/**`・`occasions/**`・`discoveries/**`・`packages/content/hidden/` は触らない
- `balance.json`/`cli.json`/`voices.json`/`narration.json` は**追記のみ**
- 既存の師匠・ライバル・voices の**識別子・口調は変えない**（消えるのは利用可否だけ）

### 受け入れ基準
- [ ] ユニットテスト（シード固定）: 条件を満たす世界でイベント発火→冪等・可用性低下・chronicle/新聞に記録
- [ ] 条件を満たさない世界では何も起きない
- [ ] e2e または sim で「師匠が引退→以後入門不可」の流れを1つ検証
- [ ] `pnpm check` 全緑

### Commit
- `X-12: NPCの歳月 —— 師匠・ライバル・住人の物語が進み、終わる` + Devin-Trailer。push しない。
