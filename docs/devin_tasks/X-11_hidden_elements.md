## タスク: [X-11] Versteckte Entdeckungen —— Zeit/Mond/Ort-Bedingungen + garantierte Hinweise

### やること（仕様 `docs/03_world_systems.md` §5）
- „隠し要素は, **時刻・天候・月齢・状態・所持品の組み合わせ**で出る。**見逃し対策として, 必ず噂のヒントを置く**。周回ごとに条件のパラメータ（場所・時期）を変える“
- 現状: lore-アトムの `unlock.flag` wird nur beim **Lesen** des Atoms gesetzt. Eine Entdeckungs-Mechanik („zu Zeit X an Ort Y unter Bedingung Z → gefunden“) existiert nicht.

### 実装
- `packages/content/discoveries.json` + zod-Schema neu: Eintrag = `{ id, name, foundText, hint, condition: Cond, setFlags: string[] }`
  - `condition` nutzt die bestehende DSL (`packages/core/src/conditions`). Für Zeit/Ort sind `time`-Bedingungen (`moon`, `timeOfDay`, `weekday`, `season`, `dayOfSeason`) bereits im Schema — fehlende Operatoren nur wenn nötig ergänzen.
  - „所持品“-Näherung über bestehende Bedingungen (Titel, Ledger-Work, flag) — kein Inventar-System bauen.
- `packages/core/src/discoveries/index.ts` neu: nach jedem `step` die Bedingungen evaluieren. Erfüllt → `found.<id>`-Flag + `discovery` Event + Notification (**B-Rank**: „――Du hast etwas entdeckt: {name}."). Idempotent: `found.<id>` schon gesetzt → kein erneutes Feuern.
- **Pflicht-Hinweis**: `hint` (ein Satz, voices-Ton) wird in die tägliche Gerüchte-Rotation (town rumour / newspaper rumors) gemischt, **solange die Entdeckung noch nicht gefunden** ist — der Hinweis muss vor der Entdeckung auffindbar sein.
- **Verknüpfung**: `found.<id>`-Flags können von lore-Atoms (`unlock.flag`), Bücher-`condition` oder anderen Bedingungen referenziert werden — `place.old_forge`/`found.old_forge` ist die bestehende Vorlage.
- **周回変化**: wo sinnvoll, Parameter aus `state.worldSeed` ableiten (z. B. welcher Wochentag / welche Mondphase) — gleiche Welt = gleiche Bedingung, neue Welt = andere Parameter. Deterministisch!
- Weltübergreifend: Flags sind pro Welt — keine neue Persistenz nötig (`state.flags` reicht, kein GameState-Change).

### Grenzen
- `docs/devin_tasks/QUEUE.md` nicht anfassen (Parent pflegt)
- `packages/core/src/crisis/**`, `occasions/**`, `apps/web/src/screens/ending.tsx`, `occasion.tsx`, `e2e/ending.spec.ts`, `occasion.spec.ts` nicht anfassen
- `packages/content/pinnacles.json`, `lore/atoms/` nicht ändern (X-9 gerade gelandet)
- `packages/content/hidden/` nicht lesen
- Kein GameState-Change (nutzt `state.flags` + `state.lore`)

### 受け入れ基準
- [ ] Unit-Tests (Seed fest): Bedingung erfüllt → Flag + Event + Notification; zweimaliges Erfüllen feuert nicht doppelt; Hinweis erscheint nur vor der Entdeckung
- [ ] Zeit-/Mond-Bedingungen funktionieren über die `time`-Bedingung
- [ ] Mindestens 2 Beispiel-Entdeckungen in `discoveries.json` (z. B. eine mit Mondphase, eine mit Ort/Handlung)
- [ ] `pnpm check` komplett grün

### Commit
- `X-11: Versteckte Entdeckungen —— Zeit/Mond/Ort-Bedingungen + garantierte Hinweise` + Devin-Trailer. Nicht pushen.
