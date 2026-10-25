# 調査メモ（2026-10時点）

> 二次情報や未確認のものは「要検証」と明記している。数値はコミュニティwiki由来のものが多い。

## 使用型成長の先行例と、本作での使い方

| ゲーム | 仕組み | 本作での採用 | 出典 |
|---|---|---|---|
| Ultima Online | 使うと確率で上昇。上昇しない期間が続くと最低保証（Guaranteed Gain System）。高値帯ほど上昇間隔が長い。合計約700のキャップ | 高値帯の逓減、合計のソフトキャップ（脳の容量） | https://uo.com/?p=6342 ほか |
| Oblivion / Skyrim | スキルは使用で上昇。Oblivionのジャンプ稼ぎ（地面からの跳躍1回ごとに0.3）が有名。訓練はレベルあたり5回まで | 新規性係数N、訓練の上限 | https://content1.uesp.net/wiki/Oblivion:Acrobatics |
| Kenshi | 被弾・敗北で靭性が上がる。重い荷物で筋力が上がる | 基礎能力の負荷成長、相手との差の補正 | https://kenshi.fandom.com/wiki/Toughness |
| Dwarf Fortress | 使わない技能が錆びる（進むと恒久的に損失） | 錆。ただし下限70%と再習得×3に緩和 | https://www.dwarffortresswiki.org/index.php/Rust |
| Project Zomboid | 技能本が特定のレベル帯でXP倍率を与える。読書に時間がかかる | 書物の帯域倍率 | https://pzfans.com/ProjectZomboidB42LevelMechanics/（第三者） |
| Elona | 素質（potential）がスキルの上昇ごとに減る。トレーナーで回復 | 素質（減衰を緩める） | https://elona.fandom.com/wiki/Skills |
| Mount & Blade Bannerlord | 学習限界を超えると上昇が遅くなるソフトキャップ | 挑戦係数・素質の考え方の補強 | https://mountandblade.fandom.com/wiki/Skills_(Bannerlord) |

## 「生きた世界」の先行例
- **Caves of Qud**：世界ごとにスルタンの歴史を生成。出来事を先に生成し、理由を後付けする方式 → 本作の歴史生成（GDC：https://gdcvault.com/play/1024990/）
- **Shadow of Mordor（Nemesis）**：敵の記憶と再登場 → ユニークモンスター、ネームドのライバル
- **RimWorld**：ストーリーテラーが出来事の頻度と強さを調整 → NPC冒険者の進行速度の調整

## ラノベ・Web小説の要素
- シャングリラ・フロンティア：ユニークシナリオ、条件付きで出現するNPC・ボス（夜のみ、満月のみ）、ゲーム経験の持ち越し（Wikipedia／講談社の作品紹介）
- 称号やワールドアナウンスの細かい描写は、原作での確認が必要（要検証）

## Devin・技術
- Devin公式：https://docs.devin.ai/essential-guidelines/when-to-use-devin ／ https://docs.devin.ai/essential-guidelines/instructing-devin-effectively
- Knowledgeは非推奨になり、Skillsへ移行中：https://docs.devin.ai/product-guides/knowledge
- 料金：https://devin.ai/pricing（統合後の内容で、二次情報と食い違う。**要確認**）
- Godot Web書き出しの制約：https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- Cloudflare Pagesの上限：https://developers.cloudflare.com/pages/platform/limits/
- itch.io：https://itch.io/docs/creators/faq ／ Steam Direct：https://partner.steamgames.com/steamdirect
- Kenney（CC0）：https://kenney.nl/support
- Chrome Prompt API：https://developer.chrome.com/docs/ai/prompt-api ／ WebLLM：https://github.com/mlc-ai/web-llm

## 未調査（今後必要になったら）
- RuneScapeの成長、UOのマクロ対策、Skyrimの開発者発言、RimWorldのGDC講演本文
- Phaser 4 / PixiJS の最新状況（2Dマップを付けるとき）
- AI生成アセットの規約
