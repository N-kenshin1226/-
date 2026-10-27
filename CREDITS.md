# CREDITS

## 音（S-01）

**全音源 Web Audio 生成・外部素材なし**

BGM・環境音・効果音のすべてを、ブラウザの Web Audio API（オシレータと
生成ノイズ）でその場合成している。外部の音源ファイルは一切使っていないため、
出典・ライセンス表記の対象はない。

- **効果音**：`apps/web/src/fx/sound.ts`（音のレシピ）
- **BGM**：`packages/content/audio.json` の `tracks`（midi ノート列の生成レシピ。
  場面への割り当ては `assign.bgm`）。再生は `apps/web/src/fx/music.ts`
- **環境音**：`packages/content/audio.json` の `ambient`（ノイズ／持続音／
  周期パターンの層レシピ。割り当ては `assign.ambient`）。再生は
  `apps/web/src/fx/ambient.ts`

将来 CC0 の外部素材へ差し替える場合は、`audio.json` のレシピを差し替えるだけでよい
（その場合はここに素材ごとの出典を追記する）。
