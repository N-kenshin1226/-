/** メインメニュー画面（X-2 で App.tsx から分離） */
import { canAct, type GameState } from "@trace/core";
import { cfg, resetSave, t } from "../game.js";
import { Btn, css, type Act, type Screen } from "../ui.js";

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
  const items: { label: string; s: Screen; needAct: boolean; id: string }[] = [
    { label: "鍛錬", s: { name: "train" }, needAct: true, id: "train" },
    { label: "仕事", s: { name: "work" }, needAct: true, id: "work" },
    { label: "狩りに出る", s: { name: "hunt" }, needAct: true, id: "hunt" },
    // 深層に潜る（T-43、06 §3B）：行動1つでランを開始する
    { label: "深層に潜る", s: { name: "abyss" }, needAct: true, id: "abyss" },
    { label: "見聞録", s: { name: "lore" }, needAct: false, id: "lore" },
    { label: "書店", s: { name: "book" }, needAct: false, id: "book" },
    { label: "街の記録", s: { name: "records" }, needAct: false, id: "records" },
    { label: "立場・目標", s: { name: "society" }, needAct: false, id: "society" },
    { label: "師匠", s: { name: "mentor" }, needAct: false, id: "mentor" },
    { label: "能力", s: { name: "status" }, needAct: false, id: "status" },
    // 引退（T-40）：いつでも選べて行動は消費しない
    { label: "引退する", s: { name: "retire" }, needAct: false, id: "retire" },
  ];
  return (
    <section style={css.panel} data-testid="menu">
      {items.map((i) => (
        <Btn
          key={i.id}
          testId={`menu-${i.id}`}
          disabled={i.needAct && !canActNow}
          onClick={() => setScreen(i.s)}
        >
          {i.label}
        </Btn>
      ))}
      <Btn
        testId="menu-rest"
        disabled={!canActNow}
        onClick={() => act({ type: "rest" }, { atHome: true })}
      >
        家で休む
      </Btn>
      <Btn primary testId="menu-sleep" onClick={() => setScreen({ name: "sleep" })}>
        寝る
      </Btn>
      <Btn
        testId="menu-quit"
        onClick={() => {
          resetSave();
          reset();
        }}
      >
        記録を消す
      </Btn>
      {!canActNow && <div style={css.sys}>{t.text.mustSleep}</div>}
    </section>
  );
}
