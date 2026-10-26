# T-28 派生スキル — done

仕様: `docs/02_growth_system.md`（素スキルが育つと派生が開花）。

## 実装
- `skills.json` のスキルに `unlock`（条件DSL）を追加。派生4種を定義:
  - `iaijutsu` 居合（剣術25＆観察15）
  - `parry` 受け流し（回避20＆観察15）
  - `prospecting` 鉱脈勘（採掘20＆知覚15）
  - `flourish` 妙技（演奏15＆器用15）
- `core/src/skills/`: `isSkillUnlocked`（flags["skill.unlock.<id>"] または条件なし）、`unlockSkills`（条件評価→フラグ付与）
- `step.ts`: 称号判定の直後に解放を評価し `skillUnlocked` イベントを発行（**GameState 不変＝セーブ据置**）
- CLI/Web の訓練メニュー・能力表示は解放済みのみ列挙（未解放の名前・条件は見せない）
- 通知は B ランク相当の1行「――身体が理屈を掴んだ。《{name}》を鍛えられるようになった。」（`cli.json` テンプレ）

## 受け入れ基準
- [x] 条件を満たすと解放されメニューに現れる（skills.test.ts 3件＋CLI動作）
- [x] 未解放の派生スキルは選択肢に出ない
- [x] 同じ解放は二度発火しない（flags で冪等）

## 残課題
- 派生スキルは値0で始まる。居合のタイミング皮・受け流しの戦闘効果など「効果の接続」は今後のタスク
