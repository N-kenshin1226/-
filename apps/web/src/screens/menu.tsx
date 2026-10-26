/** メインメニュー画面（X-2 で App.tsx から分離） */
import { canAct, type GameState } from "@trace/core";
import { cfg, resetSave, t } from "../game.js";
import { Btn, CardTitle, css, type Act, type Screen } from "../ui.js";

export function MenuScreen({
  state,
  setScreen,
  act,
  reset,
}: {
  state: GameState;
  setScreen: (s: Screen) => void;
  act: Act;
  reset: () => void;
}) {
  const canActNow = canAct(state.time, cfg.time);
  const actions: { label: string; s: Screen; id: string }[] = [
    { label: "鍛錬", s: { name: "train" }, id: "train" },
    { label: "仕事", s: { name: "work" }, id: "work" },
    { label: "狩りに出る", s: { name: "hunt" }, id: "hunt" },
    // 深層に潜る（T-43、06 §3B）：行動1つでランを開始する
    { label: "深層に潜る", s: { name: "abyss" }, id: "abyss" },
    { label: "家で休む", s: { name: "menu" }, id: "rest" },
  ];
  const visits: { label: string; s: Screen; id: string }[] = [
    { label: "見聞録", s: { name: "lore" }, id: "lore" },
    { label: "書店", s: { name: "book" }, id: "book" },
    { label: "街の記録", s: { name: "records" }, id: "records" },
    { label: "立場・目標", s: { name: "society" }, id: "society" },
    { label: "師匠", s: { name: "mentor" }, id: "mentor" },
    { label: "能力", s: { name: "status" }, id: "status" },
  ];
  return (
    <section style={css.panel} data-testid="menu">
      <CardTitle>今日の行動</CardTitle>
      <div>
        {actions.map((i) =>
          i.id === "rest" ? (
            <Btn
              key={i.id}
              testId="menu-rest"
              disabled={!canActNow}
              onClick={() => act({ type: "rest" }, { atHome: true })}
            >
              {i.label}
            </Btn>
          ) : (
            <Btn
              key={i.id}
              testId={`menu-${i.id}`}
              disabled={!canActNow}
              onClick={() => setScreen(i.s)}
            >
              {i.label}
            </Btn>
          ),
        )}
        {/* 主役は「寝る」だけ：1日を締める主行動なので黄で大きく */}
        <Btn primary big testId="menu-sleep" onClick={() => setScreen({ name: "sleep" })}>
          寝る
        </Btn>
      </div>
      {!canActNow && <div style={css.sys}>{t.text.mustSleep}</div>}
      <CardTitle>街を歩く</CardTitle>
      <div>
        {visits.map((i) => (
          <Btn key={i.id} testId={`menu-${i.id}`} onClick={() => setScreen(i.s)}>
            {i.label}
          </Btn>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {/* 引退（T-40）：いつでも選べて行動は消費しない。一生の転換点なので金枠 */}
        <Btn gold testId="menu-retire" onClick={() => setScreen({ name: "retire" })}>
          引退する
        </Btn>
        <Btn
          danger
          testId="menu-quit"
          onClick={() => {
            resetSave();
            reset();
          }}
        >
          記録を消す
        </Btn>
      </div>
    </section>
  );
}
