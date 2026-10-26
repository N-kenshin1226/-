/** 新規開始（タイトル）画面と運命の選択UI（X-2 で App.tsx から分離） */
import {
  loadChronicle,
  originList,
  t,
  tendencyIds,
  tpl,
  vowList,
  type FateChoice,
} from "../game.js";
import { theme } from "../theme.js";
import { Btn, css } from "../ui.js";

/**
 * 運命の傾向（T-45）と誓約（T-46）の選択 UI（06 §3C）。
 * 新規開始画面・転生画面で共通。ルールは core、ここでは選んだ値を渡すだけ
 */
export function FatePickers({
  fate,
  setFate,
}: {
  fate: FateChoice;
  setFate: (f: FateChoice) => void;
}) {
  const tendency = fate.tendency ?? "calm";
  const pickedVows = fate.vows ?? [];
  return (
    <>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.tendencyPick}</div>
      <div data-testid="fate-tendency">
        {tendencyIds.map((id) => (
          <Btn
            key={id}
            testId={`tendency-${id}`}
            primary={tendency === id}
            onClick={() => setFate({ ...fate, tendency: id })}
          >
            {t.display.tendencyNames[id] ?? id}
            <span style={css.dim}> ― {t.display.tendencyDescs[id] ?? ""}</span>
          </Btn>
        ))}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.vowPick}</div>
      <div data-testid="fate-vows">
        {vowList.map((v) => (
          <Btn
            key={v.id}
            testId={`vow-${v.id}`}
            primary={pickedVows.includes(v.id)}
            onClick={() =>
              setFate({
                ...fate,
                vows: pickedVows.includes(v.id)
                  ? pickedVows.filter((x) => x !== v.id)
                  : [...pickedVows, v.id],
              })
            }
          >
            {v.name}
            <span style={css.dim}> ― {v.desc}</span>
          </Btn>
        ))}
      </div>
    </>
  );
}

/** 新規開始画面：年代記の頁数・運命の選択・出自の選択（元 App の !state 分岐） */
export function TitleScreen({
  fate,
  setFate,
  startNew,
}: {
  fate: FateChoice;
  setFate: (f: FateChoice) => void;
  startNew: (originId?: string) => void;
}) {
  // 年代記はセーブとは別領域に残る（T-38。新しい周の始まりでも見える）
  const lives = loadChronicle().lives.length;
  return (
    <main style={css.app} data-testid="app">
      <h1 style={{ color: theme.colors.accent }}>TRACE</h1>
      <p style={css.sys}>{t.text.intro}</p>
      {lives > 0 && <p style={css.sys}>{tpl(t.text.chronicleLives, { count: lives })}</p>}
      <FatePickers fate={fate} setFate={setFate} />
      <p style={css.sys}>{t.text.originPick}</p>
      {originList.map((o) => (
        <Btn
          key={o.id}
          testId={`origin-${o.id.replace("origin.", "")}`}
          onClick={() => startNew(o.id)}
        >
          {o.name}
          <span style={{ color: theme.colors.textDim, fontSize: 12 }}> ― {o.desc}</span>
        </Btn>
      ))}
    </main>
  );
}
