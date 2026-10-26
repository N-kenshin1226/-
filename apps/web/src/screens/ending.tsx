/**
 * 終幕の画面（W-04、docs/08 §7）：危機が決着した世界の結末を見せる一頁。
 * 重なった紙の層 ―― 手前に危機の型の語りと主人公の痕跡、奥にその世界の年代記。
 * 解決と滅びは同じ器で別の顔をする：解決は焼けた紙、滅びは沈んだ青。
 * 閉じれば世界は続く ―― 終幕はゲームの終わりではなく、世界の出来事の区切り
 */
import type { GameState } from "@trace/core";
import { narration } from "@trace/content";
import { endingOf, endingPageLines } from "../game.js";
import { CommandMenu, HintBar, Kicker, Paper, pos } from "../ui.js";
import { theme } from "../theme.js";

const P = theme.colors.paper;

export function EndingScreen({ state, back }: { state: GameState; back: () => void }) {
  const ending = endingOf(state);
  if (ending === null) {
    // 終幕の無い世界で開かれたら、静かにメニューへ戻すだけの紙
    return (
      <div data-testid="screen-ending" className="scene">
        <Paper style={{ ...pos({ left: 420, top: 300, width: 440 }), padding: "30px" }}>
          <p style={{ margin: 0, color: P.text }}>――この世界の出来事は、まだ続いている。</p>
        </Paper>
        <HintBar items={[["Esc", "戻る"]]} />
      </div>
    );
  }
  const ruin = ending.outcome === "ruin";
  const page = endingPageLines(state);
  return (
    <div data-testid="screen-ending" className="scene">
      {/* 滅びの世は画面全体が沈む（景色の差分は SceneBackground の霞と合わせる） */}
      {ruin && (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(10,14,22,0) 0%, rgba(6,8,14,.72) 100%)",
          }}
        />
      )}

      {/* 奥の紙：その世界の年代記の一頁（世界の記録が日付順に並ぶ） */}
      <Paper
        tilt={1.4}
        testId="ending-page"
        style={{
          ...pos({ left: 690, top: 84, width: 440, bottom: 108 }),
          padding: "26px 30px",
          ...(ruin ? { filter: "saturate(.55) brightness(.86)" } : {}),
        }}
      >
        <p
          style={{
            margin: "0 0 10px",
            fontFamily: theme.font.sys,
            fontSize: 12,
            letterSpacing: "0.3em",
            color: P.dim,
            borderBottom: `2px solid ${P.text}`,
            paddingBottom: 8,
          }}
        >
          {narration.crisis.ending.pageHeader}
        </p>
        <div
          className="scroll"
          style={{ maxHeight: "88%", overflowY: "auto", fontSize: 13, color: P.sub }}
        >
          {page.map((l, i) => (
            <p key={i} style={{ margin: "0 0 7px", lineHeight: 1.6 }}>
              <span style={{ color: P.dim, fontFamily: theme.font.en, marginRight: 8 }}>
                {l.day}
              </span>
              {l.text}
            </p>
          ))}
        </div>
      </Paper>

      {/* 手前の紙：危機の型の語り＋主人公の痕跡（段落の層） */}
      <Paper
        tilt={-1.1}
        testId="ending-narration"
        style={{
          ...pos({ left: 130, top: 64, width: 600, bottom: 96 }),
          padding: "30px 36px",
          ...(ruin ? { filter: "saturate(.5) brightness(.82)" } : {}),
        }}
      >
        <Kicker text={ruin ? "THE FALL" : "THE END"} />
        <h1
          style={{
            margin: "4px 0 14px",
            fontFamily: theme.font.mincho,
            fontWeight: 800,
            fontSize: 34,
            letterSpacing: "0.18em",
            color: ruin ? "#5a4a3a" : P.head,
          }}
        >
          {ruin ? narration.crisis.ending.ruinTitle : narration.crisis.ending.resolvedTitle}
        </h1>
        <div className="scroll" style={{ maxHeight: "76%", overflowY: "auto" }}>
          {ending.narration.map((line, i) => (
            <p
              key={i}
              style={{
                margin: "0 0 12px",
                fontFamily: theme.font.mincho,
                fontSize: 16,
                lineHeight: 1.9,
                color: P.text,
              }}
            >
              {line}
            </p>
          ))}
          {/* 主人公の痕跡：関与の段階に応じた1行（あなたがこの終幕に残したもの） */}
          {ending.trace.map((line, i) => (
            <p
              key={i}
              data-testid="ending-trace"
              style={{
                margin: "16px 0 0",
                paddingTop: 10,
                borderTop: `1px solid ${P.line}`,
                fontSize: 14,
                lineHeight: 1.8,
                color: P.dim,
              }}
            >
              {line}
            </p>
          ))}
        </div>
      </Paper>

      {/* 終幕のあとも世界は続く ―― 閉じれば日常に戻る */}
      <div style={pos({ left: 130, bottom: 30, width: 600 })}>
        <CommandMenu
          entries={[
            {
              id: "ending-continue",
              label: narration.crisis.ending.continue,
              primary: true,
              onPick: back,
            },
          ]}
          onBack={back}
        />
      </div>
      <HintBar items={[["Enter", narration.crisis.ending.continue]]} />
    </div>
  );
}
export {};
