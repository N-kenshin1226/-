/**
 * 導入の会話窓（F-06）：初めての生（年代記に頁が無い）の冒頭にだけ出す短い案内。
 * 人の言葉は金の窓（README 決まりごと3）—— 宿屋の主マルタが、ここがどこか・
 * 何ができるか・眠ると経験が定着することを2頁で教える。Enterで読み進め、
 * Esc/クリックで飛ばせる
 */
import { useState } from "react";
import type { GameState } from "@trace/core";
import { voices } from "@trace/content";
import { t, tpl, townName } from "../game.js";
import { isGenWorld, npcNameOf, townTitleOf, townTypeNameOf } from "../world.js";
import { DialogueBox, HintBar, Plate, pos, useHotkeys, type Screen } from "../ui.js";
import { theme } from "../theme.js";

export function IntroScreen({
  state,
  name,
  setScreen,
}: {
  state: GameState;
  /** プレイヤー名（{name} の差し込み元） */
  name: string;
  setScreen: (s: Screen) => void;
}) {
  // 案内人は宿屋の主（G-01：生成地方は生成の住人、固定マップはマルタ）
  const host = isGenWorld(state)
    ? { role: "宿屋の主", name: npcNameOf(state, `npc.${state.life.town}.innkeeper`) }
    : (voices.npcs.find((n) => n.id === "npc.marta") ?? {
        role: "宿屋の主",
        name: "マルタ",
      });
  const town = townTitleOf(state, state.life.town);
  const pages = [tpl(t.text.introWelcome, { name, town }), tpl(t.text.introGuide, { name })];
  const [page, setPage] = useState(0);

  const next = () => {
    if (page < pages.length - 1) setPage(page + 1);
    else setScreen({ name: "menu" });
  };
  const skip = () => setScreen({ name: "menu" });
  useHotkeys({ enter: next, escape: skip });

  return (
    // 会話窓はクリックでも進められる（右下の▼＝続きがある合図）
    <div data-testid="screen-intro" className="scene" onClick={next} style={{ cursor: "pointer" }}>
      {/* 場所の名札（TopChrome と同じ形。「ここがどこか」の手がかり） */}
      <Plate style={pos({ left: 28, top: 22 })}>
        <span style={{ fontFamily: theme.font.mincho, fontSize: 16 }}>
          {townName(state, state.life.town)}
          <span style={{ color: theme.colors.world.dim, fontSize: 13 }}>
            {" "}
            ―― {townTypeNameOf(state, state.life.town) || "街"}
          </span>
        </span>
      </Plate>
      <DialogueBox
        speaker={`${host.role} ${host.name}`}
        testId="intro-dialogue"
        style={pos({ left: 220, right: 220, bottom: 110, height: 180 })}
      >
        {pages[page]}
      </DialogueBox>
      <HintBar
        items={[
          ["Enter", "進む"],
          ["Esc", "とばす"],
        ]}
      />
    </div>
  );
}
