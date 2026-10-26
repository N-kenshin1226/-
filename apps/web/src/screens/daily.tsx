/**
 * 一日の節目の窓（UI-01）：
 *   WakeScreen    … 起床ログ（Wake見本：加護の窓・区切りゲージ・贈り物の帯）
 *   NewsScreen    … 朝刊（News見本：紙・三面記事・街の声）
 *   NoticeOverlay … S/A通知（Notice見本：S=画面中央の帯、A=光る窓）
 */
import type { CSSProperties } from "react";
import type { ActionEvent, GameState, WakeReport } from "@trace/core";
import { narration } from "@trace/content";
import { dateLabel, endingPageLines, newsPack, t, wakePack, type Notice } from "../game.js";
import {
  BlessingWindow,
  CommandMenu,
  DialogueBox,
  HintBar,
  Paper,
  SegGauge,
  WindChip,
  pos,
  useHotkeys,
  type Screen,
} from "../ui.js";
import { NEWSPAPER } from "../ui/vocab.js";
import { theme } from "../theme.js";

const B = theme.colors.bless;

/* ================= 起床（Wake見本） ================= */

export function WakeScreen({
  state,
  report,
  events,
  atHome,
  setScreen,
}: {
  state: GameState;
  report: WakeReport;
  events: ActionEvent[];
  atHome: boolean;
  setScreen: (s: Screen) => void;
}) {
  const p = wakePack(report, events, atHome, state);
  const wake = () => setScreen({ name: "menu" });
  const news = () => setScreen({ name: "news", events });
  const status = () => setScreen({ name: "status" });
  useHotkeys({ s: status, n: news });
  return (
    <div data-testid="screen-wake" className="scene">
      {/* 朝の気配の一文（見本の最上段。白んでいく窓の外） */}
      <p
        style={{
          ...pos({ left: 0, right: 0, top: 34 }),
          margin: 0,
          textAlign: "center",
          fontFamily: theme.font.mincho,
          fontSize: 17,
          color: "#b8cfd6",
          textShadow: "0 1px 3px #000",
        }}
      >
        窓の外が白んでいく。身体の奥で、昨日の何かが形になった。
      </p>
      <BlessingWindow
        style={pos({ left: 270, top: 84, width: 740, height: 560 })}
        corners={["tl", "br"]}
      >
        {/* 見出し：AWAKENING ＋ 起 床 ＋ 日付・宿・睡眠の質 */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "22px 0 14px",
          }}
        >
          <span
            style={{
              height: 1,
              width: 120,
              background: `linear-gradient(90deg, transparent, ${B.frame})`,
            }}
          />
          <span
            style={{
              fontFamily: theme.font.en,
              fontSize: 13,
              letterSpacing: "0.5em",
              color: B.glow,
            }}
          >
            AWAKENING
          </span>
          <span
            style={{
              height: 1,
              width: 120,
              background: `linear-gradient(270deg, transparent, ${B.frame})`,
            }}
          />
        </header>
        <h1
          style={{
            margin: 0,
            textAlign: "center",
            fontFamily: theme.font.mincho,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: "0.3em",
            color: "#eaf8fb",
          }}
        >
          起 床
        </h1>
        <p style={{ margin: "6px 0 0", textAlign: "center", fontSize: 14, color: B.dim }}>
          {dateLabel(state)}・{p.inn}
          {p.dinner !== "" && `・夕食${p.dinner}`}・睡眠の質{" "}
          <span style={{ color: "#eaf8fb", fontWeight: 700 }}>{p.quality}</span>
        </p>

        {/* 定着した技能：名前 ｜ 区切りゲージ ｜ from›to ｜ +delta */}
        <div style={{ margin: "16px 40px 0" }}>
          {p.skillLines.map((l) => (
            <div
              key={l.name}
              style={{
                display: "grid",
                gridTemplateColumns: "150px minmax(0,1fr) 150px 70px",
                alignItems: "center",
                gap: 16,
                height: 52,
                borderBottom: `1px solid ${B.frameInner}`,
              }}
            >
              <span
                style={{
                  fontFamily: theme.font.mincho,
                  fontSize: 19,
                  color: "#eaf8fb",
                }}
              >
                《{l.name}》
              </span>
              <SegGauge from={l.from} to={l.to} />
              <span
                style={{
                  fontFamily: theme.font.en,
                  fontSize: 18,
                  color: B.dim,
                  textAlign: "right",
                }}
              >
                {l.from.toFixed(1)} <span style={{ color: B.faint }}>›</span>{" "}
                <span style={{ color: "#eaf8fb", fontWeight: 700 }}>{l.to.toFixed(1)}</span>
              </span>
              <span
                style={{
                  fontFamily: theme.font.en,
                  fontSize: 18,
                  fontWeight: 700,
                  color: l.delta < 0 ? theme.colors.warn : theme.colors.grow,
                  textAlign: "right",
                }}
              >
                {l.delta >= 0 ? "+" : ""}
                {l.delta.toFixed(1)}
              </span>
            </div>
          ))}
          {p.skillLines.length === 0 && (
            <p style={{ color: B.dim, textAlign: "center", margin: "18px 0" }}>
              {t.text.wake.noChange}
            </p>
          )}
          {p.restDay && (
            <p style={{ color: B.dim, textAlign: "center", margin: "8px 0 0" }}>
              {t.text.wake.restDayLine}
            </p>
          )}

          {/* 身体の変化＋今日の風（見本の下段） */}
          <div
            style={{
              display: "flex",
              gap: 24,
              height: 44,
              alignItems: "center",
              fontSize: 14,
              color: B.dim,
            }}
          >
            {p.statLines.map((s) => (
              <span key={s.name}>
                {s.name}{" "}
                <span style={{ fontFamily: theme.font.en, color: theme.colors.grow }}>
                  {s.delta >= 0 ? "+" : ""}
                  {s.delta.toFixed(1)}
                </span>
              </span>
            ))}
            {p.winds.length === 0 ? (
              <span style={{ marginLeft: "auto" }}>{t.text.wake.windsNone}</span>
            ) : (
              <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
                本日の風
                {p.winds.map((w, i) => (
                  <WindChip key={i} direction={w.direction} label={w.label} />
                ))}
              </span>
            )}
          </div>
        </div>

        {/* 世界からの贈り物（NEW SKILL などの帯）＋その他の出来事 */}
        {(p.gifts.length > 0 || p.others.length > 0) && (
          <div
            style={{
              margin: "10px 40px 0",
              padding: "14px 20px",
              background:
                "linear-gradient(90deg, rgba(111,208,227,0), rgba(111,208,227,.16), rgba(111,208,227,0))",
              borderTop: `1px solid ${B.glow}`,
              borderBottom: `1px solid ${B.glow}`,
              textAlign: "center",
              maxHeight: 150,
              overflow: "hidden",
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: theme.font.en,
                fontSize: 11,
                letterSpacing: "0.5em",
                color: B.glow,
              }}
            >
              {p.gifts.length > 0 ? "NEW SKILL" : "REPORTS"}
            </p>
            {[...p.gifts, ...p.others].map((g, i) => (
              <p key={i} style={{ margin: "6px 0 0", fontSize: 15, color: "#f2fcfe" }}>
                {g}
              </p>
            ))}
          </div>
        )}

        {/* 下段の選択（マウスでも選べる。キーはホットキー） */}
        <div style={{ position: "absolute", left: 40, right: 40, bottom: 12 }}>
          <CommandMenu
            bless
            entries={[
              { id: "wake-done", label: "起きる", sub: "Enter", onPick: wake },
              { id: "wake-news", label: "今朝の新聞をひらく", sub: "N", onPick: news },
              { id: "wake-status", label: "能力を見る", sub: "S", onPick: status },
            ]}
            onBack={wake}
          />
        </div>
      </BlessingWindow>
      <HintBar
        bless
        items={[
          ["Enter", "起きる"],
          ["S", "ステータス"],
          ["N", "新聞"],
        ]}
      />
    </div>
  );
}

/* ================= 朝刊（News見本） ================= */

export function NewsScreen({
  state,
  events,
  back,
}: {
  state: GameState;
  events: ActionEvent[];
  back: () => void;
}) {
  const pack = newsPack(state, events);
  useHotkeys({ escape: back });
  const P = theme.colors.paper;
  const colStyle: CSSProperties = { flex: "1 1 0", minWidth: 0 };
  return (
    <div data-testid="screen-news" className="scene">
      <Paper style={pos({ left: 230, top: 36, width: 820, height: 640 })}>
        {/* 題字：日付・号数・価格 → 紙名 → 欧文 */}
        <header
          style={{
            textAlign: "center",
            borderBottom: `4px double ${P.text}`,
            paddingBottom: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: theme.font.sys,
              fontSize: 12,
              color: P.dim,
            }}
          >
            <span>{pack.dateLabel}</span>
            <span>
              {NEWSPAPER.issue(pack.issueDay)}・{NEWSPAPER.price}
            </span>
          </div>
          <p
            style={{
              margin: "4px 0 0",
              fontWeight: 800,
              fontSize: 46,
              letterSpacing: "0.35em",
              lineHeight: 1.1,
            }}
          >
            {NEWSPAPER.name}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontFamily: theme.font.en,
              fontSize: 11,
              letterSpacing: "0.4em",
              color: P.dim,
            }}
          >
            {NEWSPAPER.en}
          </p>
        </header>

        <div style={{ display: "flex", gap: 26, marginTop: 18 }}>
          {/* 一面：大見出しと続報 */}
          <div style={colStyle}>
            {pack.extra && (
              <p
                style={{
                  margin: 0,
                  display: "inline-block",
                  padding: "1px 10px",
                  background: P.head,
                  color: "#f6ead0",
                  fontFamily: theme.font.sys,
                  fontSize: 12,
                  letterSpacing: "0.2em",
                }}
              >
                号外級
              </p>
            )}
            <h1
              style={{
                margin: "8px 0 0",
                fontWeight: 800,
                fontSize: 26,
                lineHeight: 1.4,
              }}
            >
              {pack.day < 0 ? "創刊前夜" : pack.lead}
            </h1>
            <p
              style={{
                margin: "8px 0 12px",
                fontSize: 14,
                color: P.sub,
                borderBottom: `1px solid ${P.line}`,
                paddingBottom: 10,
              }}
            >
              {pack.day < 0 ? "この街の記録は、今日から始まる。" : ""}
            </p>
            {pack.rumors.map((r, i) => (
              <div key={i} style={{ marginTop: 12 }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{r}</h2>
              </div>
            ))}
            <div
              style={{
                borderTop: `1px solid ${P.line}`,
                marginTop: 14,
                paddingTop: 10,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>昨日の記録</h2>
              {pack.record.length === 0 && (
                <p style={{ margin: "6px 0 0", fontSize: 13, color: P.sub }}>――動きはなかった。</p>
              )}
              <ol
                style={{
                  margin: "6px 0 0",
                  paddingLeft: "1.3em",
                  fontSize: 13,
                  lineHeight: 1.9,
                  color: P.sub,
                }}
              >
                {pack.record.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </div>
          </div>

          {/* 街の声：住人の一言 */}
          <div style={colStyle}>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: theme.font.sys,
                fontSize: 12,
                letterSpacing: "0.3em",
                color: P.dim,
              }}
            >
              街の声
            </p>
            {pack.voices.map((v, i) => (
              <p key={i} style={{ margin: "0 0 10px", fontSize: 14, lineHeight: 1.7 }}>
                <span
                  style={{
                    fontFamily: theme.font.sys,
                    fontSize: 12,
                    color: P.dim,
                    marginRight: 10,
                  }}
                >
                  {v.role}
                  {v.name}
                </span>
                <br />
                {v.text}
              </p>
            ))}
          </div>

          {/* サイド：あなたへの風＋宿賃 */}
          <div style={{ ...colStyle, flex: "0 0 200px" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: theme.font.sys,
                fontSize: 12,
                letterSpacing: "0.3em",
                color: P.dim,
              }}
            >
              あなたへの風
            </p>
            {pack.winds.length === 0 && (
              <p style={{ margin: 0, fontSize: 13, color: P.sub }}>――今日は凪。</p>
            )}
            {pack.winds.map((w, i) => (
              <div key={i} style={{ margin: "0 0 6px", fontSize: 13 }}>
                <span style={{ color: w.direction === "tailwind" ? "#8a5a10" : "#8a3b22" }}>
                  {w.direction === "tailwind" ? "▲" : "▼"} {w.label}
                </span>
              </div>
            ))}
            <p
              style={{
                margin: "16px 0 8px",
                fontFamily: theme.font.sys,
                fontSize: 12,
                letterSpacing: "0.3em",
                color: P.dim,
              }}
            >
              宿場案内
            </p>
            {(
              [
                ["cheap", "木賃"],
                ["normal", "通常"],
                ["good", "上宿"],
              ] as const
            ).map(([inn]) => (
              <p key={inn} style={{ margin: "0 0 4px", fontSize: 13, color: P.sub }}>
                {t.display.innNames[inn]}
              </p>
            ))}
          </div>
        </div>
      </Paper>
      <HintBar items={[["Esc", "閉じる"]]} />
    </div>
  );
}

/* ================= S/A通知（Notice見本） ================= */

export function NoticeOverlay({
  state,
  notice,
  onEnd,
  onClose,
}: {
  state: GameState;
  notice: Notice;
  /** 「一頁を開く」先（W-04：終幕の通知から結末画面へ） */
  onEnd?: () => void;
  onClose: () => void;
}) {
  const done = () => {
    onClose();
    if (notice.openEnding === true) onEnd?.();
  };
  useHotkeys({ enter: done, escape: done });
  const isS = notice.rank === "S";
  // 終幕の通知：その世界の年代記の一頁の予告を帯の内側に差す（W-04）
  const page = notice.openEnding === true ? endingPageLines(state).slice(-4) : [];
  return (
    <div
      data-testid={isS ? "notice-s" : "notice-a"}
      className="notice-in"
      onClick={done}
      style={{ position: "absolute", inset: 0, zIndex: 30 }}
    >
      {/* 世界が黙る：全体を薄暗く */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(2,3,8,.6)" }} />
      {isS ? (
        /* S：画面中央に横切る暗い帯（一回きり） */
        <section
          aria-label="世界初の通知"
          className="notice-band"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 196,
            minHeight: 300,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: "12%",
              right: "12%",
              height: 1,
              background: "linear-gradient(90deg, transparent, #e8c77f, transparent)",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "12%",
              right: "12%",
              height: 1,
              background: "linear-gradient(90deg, transparent, #e8c77f, transparent)",
            }}
          />
          {/* 帯の上辺の菱形飾り */}
          <svg
            width="64"
            height="64"
            viewBox="0 0 64 64"
            aria-hidden="true"
            style={{ position: "absolute", top: -32, left: "calc(50% - 32px)" }}
          >
            <rect
              x="12"
              y="12"
              width="40"
              height="40"
              transform="rotate(45 32 32)"
              fill="#120d05"
              stroke="#e8c77f"
              strokeWidth="2"
            />
            <rect
              x="22"
              y="22"
              width="20"
              height="20"
              transform="rotate(45 32 32)"
              fill="#e8c77f"
            />
          </svg>
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.en,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: "0.8em",
              color: "#e8c77f",
            }}
          >
            {notice.kicker ?? "WORLD FIRST"}
          </p>
          <p style={{ margin: "14px 0 0", fontSize: 15, letterSpacing: "0.1em", color: "#cfc2a2" }}>
            {notice.lead ?? "――この世界で、初めての記録です。"}
          </p>
          <h1
            style={{
              margin: "12px 0 0",
              fontFamily: theme.font.mincho,
              fontWeight: 800,
              fontSize: 46,
              letterSpacing: "0.12em",
              color: "#fff3cf",
              textShadow: "0 0 24px rgba(232,199,127,.55), 0 2px 0 #3a2a0e",
            }}
          >
            {notice.title}
          </h1>
          <p
            style={{
              margin: "14px 0 0",
              fontFamily: theme.font.mincho,
              fontSize: 17,
              color: "#e8dcbf",
            }}
          >
            {notice.sub}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#a99c80" }}>
            {notice.footnote ?? "この名は年代記に刻まれ、次の世界にも語り継がれる。"}
          </p>
          {/* 終幕の通知：その世界の年代記の一頁の予告（紙の端を覗かせる） */}
          {page.length > 0 && (
            <div
              data-testid="notice-ending-page"
              style={{
                margin: "16px 0 0",
                padding: "10px 22px",
                maxWidth: 560,
                background: "linear-gradient(180deg, #e8dcbf, #d9c8a4)",
                color: "#4a3b26",
                boxShadow: "0 3px 12px rgba(0,0,0,.5)",
                transform: "rotate(-0.4deg)",
              }}
            >
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 11,
                  letterSpacing: "0.3em",
                  color: "#7a6844",
                }}
              >
                {narration.crisis.ending.pageHeader}
              </p>
              {page.map((l, i) => (
                <p key={i} style={{ margin: "2px 0", fontSize: 13, lineHeight: 1.6 }}>
                  {l.day}日目 ― {l.text}
                </p>
              ))}
            </div>
          )}
        </section>
      ) : notice.dialogue !== undefined ? (
        /* A（会話）：人物からの持ちかけは会話の窓で届く（W-04、docs/08 §6） */
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: 640,
          }}
        >
          <DialogueBox speaker={notice.dialogue.speaker} testId="notice-dialogue">
            {notice.dialogue.lines.map((line, i) => (
              <p key={i} style={{ margin: 0 }}>
                {line}
              </p>
            ))}
            {notice.dialogue.hint !== undefined && (
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 14,
                  color: theme.colors.world.dim,
                }}
              >
                {notice.dialogue.hint}
              </p>
            )}
          </DialogueBox>
        </div>
      ) : (
        /* A：中央に光る窓 */
        <section
          aria-label="通知"
          className="glow-pulse"
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: "translate(-50%,-50%)",
            width: 620,
            padding: "40px 44px",
            textAlign: "center",
            background: "linear-gradient(180deg, rgba(24,24,38,.96), rgba(11,11,19,.97))",
            boxShadow: theme.frame.world,
            border: `1px solid ${theme.colors.world.edge}`,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: theme.font.en,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: "0.6em",
              color: "#e8c77f",
            }}
          >
            NOTICE
          </p>
          <h1
            style={{
              margin: "14px 0 0",
              fontFamily: theme.font.mincho,
              fontWeight: 800,
              fontSize: 34,
              color: "#fff3cf",
              textShadow: "0 0 18px rgba(232,199,127,.45)",
            }}
          >
            {notice.title}
          </h1>
          <p
            style={{
              margin: "10px 0 0",
              fontFamily: theme.font.mincho,
              fontSize: 15,
              color: "#e8dcbf",
            }}
          >
            {notice.sub}
          </p>
        </section>
      )}
      {/* 報酬の行（.rw）。会話の打診では出さない ―― 人物の言葉がそのまま届く */}
      {notice.dialogue === undefined && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: isS ? 534 : "62%",
            display: "flex",
            justifyContent: "center",
            gap: 16,
          }}
        >
          {notice.rewards.map((r, i) => (
            <div key={i} className="rw">
              <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
                <path
                  d="M14 2l3.5 7.5L26 11l-6 5.8 1.5 8.2L14 21l-7.5 4 1.5-8.2L2 11l8.5-1.5z"
                  fill="#e8c77f"
                />
              </svg>
              <div>
                <div style={{ fontSize: 11, color: "#a99c80", letterSpacing: "0.1em" }}>
                  {r.label}
                </div>
                <div
                  style={{
                    fontFamily: theme.font.mincho,
                    fontSize: 17,
                    color: "#f3dfa8",
                  }}
                >
                  {r.name}
                </div>
                {r.sub !== undefined && (
                  <div style={{ fontSize: 11, color: "#a99c80" }}>{r.sub}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          position: "absolute",
          right: 28,
          bottom: 18,
          fontSize: 13,
          color: "#cfc2a2",
        }}
      >
        <span className="key">Enter</span> {notice.openEnding === true ? "一頁を開く" : "続ける"}
      </div>
    </div>
  );
}
export {};
