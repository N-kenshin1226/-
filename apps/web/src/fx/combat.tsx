/**
 * 戦闘の演出（F-04）。core の CombatState は1手ぶんの出来事を一括で返すので、
 * ここで「出来事を1拍ずつ見せる」層を挟む：
 *
 *   useCombatPlayback … log の新着を拍に分けてめくる。種別ごとに間が違う
 *                       （命中は軽く、予兆・大技・決着は重く）。skip() で全部出す
 *   EnemyFigure       … 敵のシルエット（SVG。種ごとの形＋強個体は金）
 *   CbtHpGauge        … 体力ゲージ（数値は CountUp で滑らかに）
 *   Floaters          … 傷・躱し・会心などの浮き文字
 *
 * 演出時間は theme.fx.combat*。「演出を短く」と prefers-reduced-motion に従う
 * （motionOff では待たずに全部出る＝スキップされたのと同じ速さ）。
 * ここにはルールを置かない ―― core の結果を絵と音に写すだけ。
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CombatEvent } from "@trace/core";
import { theme } from "../theme.js";
import { fxMs, motionOff, useFxSettings } from "./settings.js";
import { playSfx, type SoundId } from "./sound.js";
import { CountUp } from "./fx.js";

/* ── 出来事 → 一拍の長さ ── */

/** その出来事を見せる間（ms）。重い出来事ほど長く取る */
export function beatMs(ev: CombatEvent, short: boolean): number {
  const big =
    (ev.type === "enemyHit" && ev.big === true) ||
    ev.type === "telegraph" ||
    ev.type === "counter" ||
    ev.type === "interrupted" ||
    ev.type === "partBroken" ||
    ev.type === "won" ||
    ev.type === "lost";
  return big
    ? fxMs(theme.fx.combatBigMs, theme.fx.combatBigShortMs)
    : short
      ? theme.fx.combatBeatShortMs
      : theme.fx.combatBeatMs;
}

/* ── 出来事 → 効果音 ── */

export function sfxOf(ev: CombatEvent): SoundId | null {
  switch (ev.type) {
    case "playerAttack":
      return ev.crit === true || ev.counter === true ? "crit" : "slash";
    case "playerMiss":
      return "miss";
    case "playerDefend":
      return "guard";
    case "playerObserve":
      return "dodge";
    case "playerFlee":
      return "miss";
    case "playerSwitch":
      // 武器の持ち替え（K-01）：小さな決め音だけ立てる
      return "tag";
    case "enemyHit":
      return ev.guarded === true ? "guard" : ev.big === true || ev.crit === true ? "heavy" : "hit";
    case "enemyMiss":
      return "dodge";
    case "telegraph":
      return "omen";
    case "counter":
      return "counter";
    /* ── K-02：武技・状態異常・部位 ── */
    case "playerArt":
      return ev.crit === true || ev.counter === true ? "crit" : "slash";
    case "playerArtMiss":
      return "miss";
    case "playerArtFail":
      return "tag";
    case "statusApplied":
      return "omen";
    case "statusTick":
      return null; // 継続ダメージは畳み込みの1行だけ流す
    case "partBroken":
    case "interrupted":
      return "counter";
    case "stunned":
      return "guard";
    case "parried":
      return "dodge";
    case "won":
      return "fanfare";
    case "lost":
      return "world";
    case "fled":
      return "tag";
    default:
      return null;
  }
}

/* ── 出来事 → 浮き文字 ── */

export interface Floater {
  key: number;
  /** 浮き文字の出る側（enemy=敵の頭上 / player=こちら側） */
  side: "enemy" | "player";
  text: string;
  tone: "hit" | "crit" | "miss" | "hurt" | "big" | "guard" | "dodge" | "omen" | "counter";
}

let floaterSeq = 0;

/** その出来事が画面に浮かべる数値・合図（なければ null） */
export function floaterOf(ev: CombatEvent): Omit<Floater, "key"> | null {
  switch (ev.type) {
    case "playerAttack":
      return {
        side: "enemy",
        text:
          ev.counter === true
            ? `反撃 ${ev.damage ?? ""}`
            : ev.crit === true
              ? `会心 ${ev.damage ?? ""}`
              : `${ev.damage ?? ""}`,
        tone: ev.counter === true || ev.crit === true ? "crit" : "hit",
      };
    case "playerMiss":
      return { side: "enemy", text: "躱された", tone: "miss" };
    case "enemyHit":
      return ev.guarded === true
        ? { side: "player", text: `受け止め ${ev.damage ?? ""}`, tone: "guard" }
        : {
            side: "player",
            text: ev.crit === true ? `痛恨 ${ev.damage ?? ""}` : `${ev.damage ?? ""}`,
            tone: ev.big === true || ev.crit === true ? "big" : "hurt",
          };
    case "enemyMiss":
      return { side: "player", text: "躱した", tone: "dodge" };
    case "telegraph":
      return { side: "enemy", text: "！", tone: "omen" };
    case "counter":
      return { side: "enemy", text: "体勢が崩れた", tone: "counter" };
    /* ── K-02：武技・状態異常・部位 ── */
    case "playerArt":
      return {
        side: "enemy",
        text:
          ev.counter === true
            ? `反撃 ${ev.damage ?? ""}`
            : ev.crit === true
              ? `会心 ${ev.damage ?? ""}`
              : `${ev.damage ?? ""}`,
        tone: ev.counter === true || ev.crit === true ? "crit" : "hit",
      };
    case "playerArtMiss":
      return { side: "enemy", text: "躱された", tone: "miss" };
    case "statusApplied":
      return { side: "enemy", text: "状態", tone: "omen" };
    case "statusTick":
      return { side: "enemy", text: `${ev.damage ?? ""}`, tone: "hit" };
    case "partBroken":
      return { side: "enemy", text: "部位破壊", tone: "counter" };
    case "interrupted":
      return { side: "enemy", text: "潰した", tone: "counter" };
    case "stunned":
      return { side: "enemy", text: "気絶", tone: "big" };
    case "parried":
      return { side: "player", text: `受け流し ${ev.damage ?? ""}`, tone: "guard" };
    default:
      return null;
  }
}

/* ── 再生フック ── */

export interface Playback {
  /** いま見せてよい出来事の数（queue の頭から） */
  shown: number;
  /** まだ見せていない出来事がある＝再生中 */
  busy: boolean;
  /** まだ見せていない出来事（体力の先行表示などに使う） */
  pending: CombatEvent[];
  /** 最後に見せた出来事（被弾の揺れ・見出し行に使う） */
  last: CombatEvent | null;
  /** 残りを全部出す（Enter連打＝早送りとしても効く） */
  skip: () => void;
  /** 再生中に新しい1手の出来事を積む */
  queue: (evts: CombatEvent[]) => void;
  /** 現在浮いている文字 */
  floaters: Floater[];
}

/**
 * log の新着出来事を拍に分けてめくる。
 * 1手ごとに queue(fresh) を呼ぶ。出来事は拍ごとに1つずつ現れ、
 * 現れた拍に効果音と浮き文字が付く。
 */
export function useCombatPlayback(onShow?: (ev: CombatEvent) => void): Playback {
  const [evts, setEvts] = useState<CombatEvent[]>([]);
  const [shown, setShown] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const short = useFxSettings().shortFx;
  const floaterMs = fxMs(theme.fx.combatFloaterMs, theme.fx.combatFloaterShortMs);
  const onShowRef = useRef(onShow);
  useEffect(() => {
    onShowRef.current = onShow;
  }, [onShow]);

  // 再生：shown < evts.length のあいだ、次の拍を予約する
  useEffect(() => {
    if (shown >= evts.length) return;
    if (motionOff()) {
      // reduced-motion：待たずに全部出す（=スキップ相当）
      setFloaters((fs) => [
        ...fs,
        ...evts.slice(shown).flatMap((e) => {
          const f = floaterOf(e);
          return f === null ? [] : [{ ...f, key: ++floaterSeq }];
        }),
      ]);
      for (const e of evts.slice(shown)) onShowRef.current?.(e);
      setShown(evts.length);
      return;
    }
    const id = window.setTimeout(
      () => {
        const ev = evts[shown]!;
        const sfx = sfxOf(ev);
        if (sfx !== null) playSfx(sfx);
        const f = floaterOf(ev);
        if (f !== null) setFloaters((fs) => [...fs, { ...f, key: ++floaterSeq }]);
        onShowRef.current?.(ev);
        setShown(shown + 1);
      },
      shown === 0 ? 60 : beatMs(evts[shown - 1]!, short),
    );
    return () => window.clearTimeout(id);
  }, [evts, shown, short]);

  // 浮き文字の掃除
  useEffect(() => {
    if (floaters.length === 0) return;
    const id = window.setTimeout(
      () => setFloaters((fs) => fs.slice(1)),
      motionOff() ? 200 : floaterMs,
    );
    return () => window.clearTimeout(id);
  }, [floaters, floaterMs]);

  return useMemo<Playback>(
    () => ({
      shown,
      busy: shown < evts.length,
      pending: evts.slice(shown),
      last: shown > 0 ? (evts[shown - 1] ?? null) : null,
      skip: () => {
        // 残りを即座に出す（音は最後の1件だけ鳴らす）
        const rest = evts.slice(shown);
        if (rest.length === 0) return;
        const last = rest[rest.length - 1]!;
        const sfx = sfxOf(last);
        if (sfx !== null) playSfx(sfx);
        setFloaters((fs) => [
          ...fs,
          ...rest.flatMap((e) => {
            const f = floaterOf(e);
            return f === null ? [] : [{ ...f, key: ++floaterSeq }];
          }),
        ]);
        for (const e of rest) onShowRef.current?.(e);
        setShown(evts.length);
      },
      queue: (fresh: CombatEvent[]) => {
        setEvts(fresh);
        setShown(0);
      },
      floaters,
    }),
    // skip が evts を掴むので配列自体に依存させる（同長の別ターンで古い出来事を出さない）
    [shown, evts, floaters],
  );
}

/* ── 敵のシルエット ── */

/**
 * 敵の姿（F-04）：種ごとの簡素なシルエット SVG。
 * 正確な絵ではなく「何と向き合っているか」の記号 —— 闇の中の影絵。
 * enemy.id で形を選ぶ（深層の強化個体も id は同じ）。強個体は金の縁。
 */
export function EnemyFigure({
  id,
  unique = false,
  omen = false,
  dead = false,
  hit = false,
  size = 150,
}: {
  /** 敵の id（stray_dog / wolf / boar / bandit / deserter …） */
  id: string;
  /** 強個体（金色の気配） */
  unique?: boolean;
  /** 予兆が出ている（赤く滲む） */
  omen?: boolean;
  dead?: boolean;
  /** 直近の被弾で小さく揺れる */
  hit?: boolean;
  size?: number;
}) {
  const cls = [
    "cbt-foe-img",
    omen ? "omen" : "",
    dead ? "dead" : "",
    hit ? "struck" : "",
    unique ? "unique" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size / 200) * 160}
      className={cls}
      data-testid="combat-foe"
      aria-hidden
    >
      {/* 地面の影 */}
      <ellipse cx="100" cy="140" rx="64" ry="10" className="foe-shadow" />
      <g className="foe-body">{SHAPE[shapeOf(id)] ?? SHAPE.beast}</g>
    </svg>
  );
}

function shapeOf(id: string): keyof typeof SHAPE {
  if (id === "stray_dog" || id === "wolf") return "canine";
  if (id === "boar") return "boar";
  if (id === "bandit" || id === "deserter") return "human";
  return "beast";
}

/** シルエット一式（fill は CSS の .foe-body が決める） */
const SHAPE: Record<string, ReactNode> = {
  // 犬科（狼・野犬）：低い胴・尖った耳・上がった尾
  canine: (
    <>
      <path d="M38 96 Q30 60 62 58 L120 52 Q150 50 158 74 L166 96 Q170 118 152 122 L70 126 Q44 124 38 96 Z" />
      <path d="M150 62 L168 30 L176 34 L166 62 Z" />
      <path d="M132 54 L142 26 L150 30 L144 56 Z" />
      <path d="M30 100 Q8 96 14 70 Q22 50 34 60 Q28 84 38 96 Z" />
      <rect x="60" y="118" width="9" height="24" rx="3" />
      <rect x="86" y="120" width="9" height="24" rx="3" />
      <rect x="128" y="118" width="9" height="24" rx="3" />
      <rect x="148" y="114" width="9" height="28" rx="3" />
      <circle cx="150" cy="72" r="3.2" className="foe-eye" />
    </>
  ),
  // 猪：ずんぐりした胴・突き出た口吻・牙
  boar: (
    <>
      <path d="M30 108 Q22 66 70 58 L140 54 Q172 56 174 92 Q176 118 150 124 L66 126 Q38 124 30 108 Z" />
      <path d="M168 84 Q190 84 194 98 Q186 108 172 104 Z" />
      <path d="M182 100 L196 112 L184 112 Z" />
      <rect x="58" y="120" width="11" height="24" rx="3" />
      <rect x="96" y="122" width="11" height="24" rx="3" />
      <rect x="138" y="118" width="11" height="26" rx="3" />
      <circle cx="160" cy="76" r="3.2" className="foe-eye" />
    </>
  ),
  // 人型（追い剥ぎ・脱走兵）：外套のような影と抜いた刃
  human: (
    <>
      <path d="M86 30 Q70 34 68 52 L62 128 Q60 142 74 144 L128 144 Q140 142 138 126 L130 54 Q128 34 110 30 Z" />
      <circle cx="98" cy="20" r="14" />
      <path d="M126 60 L168 96 L162 104 L122 74 Z" />
      <path d="M160 90 L196 56 L188 50 L156 82 Z" />
      <rect x="76" y="142" width="12" height="10" rx="2" />
      <rect x="112" y="142" width="12" height="10" rx="2" />
      <circle cx="102" cy="18" r="3" className="foe-eye" />
    </>
  ),
  // 汎用の獣（未知の敵・深層の新顔用）
  beast: (
    <>
      <path d="M40 104 Q30 60 78 54 L140 52 Q168 56 166 90 Q166 116 140 122 L72 124 Q48 122 40 104 Z" />
      <path d="M140 56 L156 28 L164 34 L152 60 Z" />
      <path d="M118 52 L126 24 L134 30 L130 56 Z" />
      <rect x="66" y="118" width="10" height="24" rx="3" />
      <rect x="128" y="116" width="10" height="26" rx="3" />
      <circle cx="146" cy="70" r="3.4" className="foe-eye" />
    </>
  ),
};

/* ── 体力ゲージ ── */

/** 体力ゲージ（プレイヤーは金・敵は珊瑚。数値は Cinzel で滑らかに数え上げる） */
export function CbtHpGauge({
  value,
  max,
  side,
  testId,
}: {
  value: number;
  max: number;
  side: "player" | "enemy";
  testId?: string;
}) {
  const shown = Math.max(0, value);
  const pct = max > 0 ? Math.max(0, Math.min(1, shown / max)) : 0;
  return (
    <div className={`cbt-hp cbt-hp-${side}`} data-testid={testId}>
      <div className="cbt-hp-bar">
        <div className="cbt-hp-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <span className="cbt-hp-num">
        <CountUp from={shown} to={shown} digits={0} />
        <span className="cbt-hp-max">/{Math.round(max)}</span>
      </span>
    </div>
  );
}

/* ── 浮き文字の層 ── */

/** 舞台の上に浮かぶ数値・合図（enemy 側＝右寄り、player 側＝左寄り） */
export function FloaterLayer({ items }: { items: Floater[] }) {
  return (
    <div className="cbt-floaters" aria-hidden>
      {items.map((f, i) => (
        <span
          key={f.key}
          className={`cbt-floater cbt-f-${f.tone} ${f.side}`}
          style={{ top: 8 + (i % 4) * 20 }}
        >
          {f.text}
        </span>
      ))}
    </div>
  );
}
