import { describe, type GameState, type StepConfig, type WakeReport } from "@trace/core";
import type { CliText } from "@trace/content";

/** テンプレート {key} を値で置換する */
export function tpl(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`));
}

/**
 * 難度入力の解釈：空・2=推奨、1=抑えめ、3=高み、それ以外の非負整数は直接指定。
 * 不正な入力は null（呼び出し側が invalidInput を出してやり直す）
 */
export function parseDifficulty(input: string, recommended: number): number | null {
  const s = input.trim();
  if (s === "" || s === "2") return recommended;
  if (s === "1") return Math.max(0, recommended - 10);
  if (s === "3") return recommended + 10;
  return /^\d+$/.test(s) ? Number.parseInt(s, 10) : null;
}

function fmt(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** 睡眠の質の数値 → 表示語（text/cli.json の qualityBands。q <= upTo の最初の帯） */
export function qualityLabel(q: number, t: CliText): string {
  const bands = [...t.display.qualityBands].sort((a, b) => a.upTo - b.upTo);
  return (bands.find((b) => q <= b.upTo) ?? bands[bands.length - 1]!).label;
}

function windLabel(w: { label: string }): string {
  return w.label;
}

/**
 * メニュー上部の状態行。
 * 日付・時刻帯・疲労・所持金（M0は固定値）・今日の追い風を1画面に出す。
 */
export function statusLines(state: GameState, cfg: StepConfig, t: CliText): string[] {
  const d = describe(state.time, cfg.time);
  const lines: string[] = [];
  lines.push(
    tpl(t.text.menuHeader, {
      year: d.year + 1,
      season: t.display.seasonNames[d.season] ?? "?",
      day: d.dayOfSeason + 1,
      weekday: t.display.weekdayNames[d.weekday] ?? "?",
      timeOfDay: t.display.timeOfDayNames[d.timeOfDay] ?? "?",
      age: d.age,
      fatigue: Math.round(state.player.fatigue),
      money: state.player.money,
    }),
  );
  const winds = state.today.winds.map(windLabel).join(" ／ ");
  lines.push(winds ? tpl(t.text.menuWinds, { winds }) : t.text.menuNoWind);
  const left = Math.max(0, cfg.time.actionsPerDay - state.time.action);
  lines.push(tpl(t.text.menuActionsLeft, { left, max: cfg.time.actionsPerDay }));
  return lines;
}

/** スキル選択の一覧行 */
export function skillPickLines(
  state: GameState,
  t: CliText,
  skills: { id: string; name: string }[],
): string[] {
  return [
    t.text.skillPick,
    ...skills.map((s, i) => {
      const st = state.player.skills[s.id]!;
      return tpl(t.text.skillLine, {
        index: i + 1,
        name: s.name,
        value: fmt(st.value),
        pending: fmt(st.pending),
        potential: Math.round(st.potential),
      });
    }),
  ];
}

/** 宿の選択肢（質・値段のプレビューつき。払えない宿は出さない） */
export function innPickLines(
  t: CliText,
  qualityOf: (inn: "cheap" | "normal" | "good") => number,
  money: number,
  costOf: (inn: "cheap" | "normal" | "good") => number,
): { lines: string[]; affordable: ("cheap" | "normal" | "good")[] } {
  const inns = (["cheap", "normal", "good"] as const).filter((i) => costOf(i) <= money);
  const lines = [
    inns.length > 0 ? t.text.innPick : t.text.innTooPoor,
    ...inns.map((inn, i) =>
      tpl(t.text.innLine, {
        index: i + 1,
        name: t.display.innNames[inn],
        quality: qualityLabel(qualityOf(inn), t),
        cost: costOf(inn),
      }),
    ),
  ];
  return { lines, affordable: [...inns] };
}

/**
 * 起床ログ（docs/02 §3 の例の見た目）。
 * 変化は伸びの小さい順（report.lines は整列済み）、末尾に追い風と称号。
 */
export function wakeBlock(
  report: WakeReport,
  titleMessages: string[],
  t: CliText,
  skillNames: Map<string, string>,
  opts?: { atHome?: boolean },
): string[] {
  const w = t.text.wake;
  const lines: string[] = [w.header];
  lines.push(
    tpl(w.qualityLine, {
      quality: qualityLabel(report.quality, t),
      inn: opts?.atHome ? t.display.homeName : t.display.innNames[report.inn],
      dinner:
        !opts?.atHome && report.dinner ? t.display.dinnerNames.with : t.display.dinnerNames.without,
    }),
  );

  const skillLines = report.lines.filter((l) => l.kind === "skill");
  const statLines = report.lines.filter((l) => l.kind === "stat");
  for (const l of skillLines) {
    lines.push(
      tpl(w.skillLine, {
        name: skillNames.get(l.id) ?? l.id,
        from: fmt(l.from),
        to: fmt(l.to),
        delta: fmt(l.delta),
      }),
    );
  }
  if (statLines.length > 0) {
    lines.push(
      statLines
        .map((l) => `${t.display.statNames[l.id] ?? l.id} +${fmt(l.delta)}`)
        .join(w.statJoiner),
    );
  }
  if (report.lines.length === 0) lines.push(w.noChange);
  if (report.restDay) lines.push(w.restDayLine);

  const winds = report.tailwinds.map(windLabel).join(" ／ ");
  lines.push(winds ? tpl(w.windsLine, { winds }) : w.windsNone);
  for (const s of report.surprises) lines.push(s);
  for (const m of titleMessages) lines.push(m);
  lines.push(w.footer);
  return lines;
}
