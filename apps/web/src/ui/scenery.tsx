/**
 * 情景の部品レンダラ（G-05、docs/10 §8）：空・遠景・中景・前景・灯り・空気の層を
 * 型ごとのレシピ（scenery.json）で組み合わせて描く SVG 背景。
 *
 * - 型と部品・配色はコンテンツ（scenery.json）が持つ —— ここは配置と描画だけ
 * - 配置はレシピの配置項＋系列（世界シード×場所）から決定論的に引く。
 *   Math.random は使わず、同じ系列なら同じ情景になる
 * - 時間帯（tod）・天候・危機の霞（haze）は SceneBackground と同じ語彙で重ねる
 * - ダンジョン（sky:false）は空を描かず地下の闇にする
 *
 * 新しい情景は scenery.json に部品・配色・レシピを足すだけで作れる
 */
import type { ReactNode } from "react";
import { createRng, type Rng, type TimeOfDay } from "@trace/core";
import {
  scenery,
  type SceneryEntry,
  type SceneryFile,
  type SceneryPalette,
  type SceneryRecipe,
  type SceneryShape,
} from "@trace/content";
import { PALS, STARS, VEIL, WeatherLayer } from "./scenes.js";
import type { SceneKind } from "./scenes.js";

/** 解決済みの情景（レシピ＋配置を引く系列）。App 側の sceneryForScreen が作る */
export interface ScenerySpec {
  /** 識別（"town.port#harbor" など。data-scenery 属性に出す） */
  id: string;
  /** 場所の差分を畳み込んだレシピ */
  recipe: SceneryRecipe;
  /** 配置を引く系列（"seed:scenery:<場所>" など） */
  variant: string;
}

/** 1つの部品の置き方（配置項からシードで引いた結果） */
export interface Placement {
  /** 足場の左端の x */
  x: number;
  /** 足場の基線 y */
  y: number;
  /** 拡大縮小 */
  s: number;
  /** 左右反転 */
  mir: boolean;
  /** 形のバリエーション */
  v: number;
}

/**
 * 配置項から実際の置き方を引く（決定論的。rng の消費順は項ごとに同じ —
 * 個数 → 各個の x・y揺れ・拡大縮小・反転・形 の順で、揺れの無い項は系列を進めない）
 */
export function layoutEntry(e: SceneryEntry, rng: Rng, variants: number): Placement[] {
  const n = e.n === undefined ? 1 : typeof e.n === "number" ? e.n : rng.int(e.n[0], e.n[1]);
  const [x0, x1] = Array.isArray(e.x) ? e.x : [e.x, e.x];
  const out: Placement[] = [];
  for (let i = 0; i < n; i++) {
    // n>1 は区間を割って散らす（グリッド位置の中央±30%に揺らぎ）
    const t = n === 1 ? rng.next() : Math.min((i + 0.15 + rng.next() * 0.7) / n, 1);
    const x = x0 + (x1 - x0) * t;
    const y = e.y + (e.j !== undefined ? (rng.next() * 2 - 1) * e.j : 0);
    const s =
      e.s === undefined
        ? 1
        : typeof e.s === "number"
          ? e.s
          : e.s[0] + rng.next() * (e.s[1] - e.s[0]);
    const mir = e.mirror === true ? rng.chance(0.5) : false;
    const v = e.v ?? rng.int(0, variants - 1);
    out.push({ x, y, s, mir, v });
  }
  return out;
}

/** 塗りの役割 → 実際の色（時間帯の色票＋型の配色から解決する） */
interface SceneryColors {
  s0: string;
  s1: string;
  s2: string;
  acc: string;
  ink: string;
  mist: string;
  snow: string;
  sky: readonly [string, string, string, string];
  water: string;
}

function colorsOf(tod: TimeOfDay, pDef: SceneryPalette | undefined): SceneryColors {
  const p = PALS[tod];
  const sil = [0, 1, 2].map((i) => pDef?.sil?.[i] ?? p.sil[i]) as [string, string, string];
  const sky = [0, 1, 2, 3].map((i) => pDef?.sky?.[i] ?? p.sky[i]) as [
    string,
    string,
    string,
    string,
  ];
  return {
    s0: sil[0],
    s1: sil[1],
    s2: sil[2],
    acc: pDef?.acc ?? "#f1c27d",
    ink: "#08070d",
    mist: "#8d95a2",
    snow: pDef?.snow ?? "#d5dfea",
    sky,
    water: pDef?.water ?? sil[0],
  };
}

/** 形の塗りと不透明度を解決する（lamp=灯りの色×時間帯の灯り強度） */
function paintOf(s: SceneryShape, c: SceneryColors, lamp: number): { color: string; op: number } {
  const base = s.o ?? 1;
  switch (s.f) {
    case "s0":
      return { color: c.s0, op: base };
    case "s1":
      return { color: c.s1, op: base };
    case "s2":
      return { color: c.s2, op: base };
    case "acc":
      return { color: c.acc, op: base };
    case "lamp":
      return { color: c.acc, op: base * lamp };
    case "ink":
      return { color: c.ink, op: base };
    case "mist":
      return { color: c.mist, op: base };
    case "snow":
      return { color: c.snow, op: base };
    case "sky0":
      return { color: c.sky[0], op: base };
    case "sky1":
      return { color: c.sky[1], op: base };
    case "sky2":
      return { color: c.sky[2], op: base };
    case "sky3":
      return { color: c.sky[3], op: base };
    case "water":
      return { color: c.water, op: base };
  }
}

/** 形のひとつ（パス・矩形・楕円・環・折れ線・線） */
function Shape({ s, c, lamp }: { s: SceneryShape; c: SceneryColors; lamp: number }) {
  const { color, op } = paintOf(s, c, lamp);
  switch (s.k) {
    case "path":
      return s.w !== undefined ? (
        <path d={s.d} fill="none" stroke={color} strokeWidth={s.w} opacity={op} />
      ) : (
        <path d={s.d} fill={color} opacity={op} />
      );
    case "rect":
      return <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={color} opacity={op} />;
    case "circle":
      return <circle cx={s.cx} cy={s.cy} r={s.r} fill={color} opacity={op} />;
    case "ellipse":
      return <ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} fill={color} opacity={op} />;
    case "ring":
      return (
        <ellipse
          cx={s.cx}
          cy={s.cy}
          rx={s.rx}
          ry={s.ry}
          fill="none"
          stroke={color}
          strokeWidth={s.w ?? 3}
          opacity={op}
        />
      );
    case "poly":
      return <polygon points={s.pts} fill={color} opacity={op} />;
    case "line":
      return (
        <line
          x1={s.x1}
          y1={s.y1}
          x2={s.x2}
          y2={s.y2}
          stroke={color}
          strokeWidth={s.w ?? 2}
          opacity={op}
        />
      );
  }
}

/** 配置項の描画：部品をシードで引いた置き方で重ねる */
function Entry({
  e,
  rng,
  parts,
  c,
  lamp,
}: {
  e: SceneryEntry;
  rng: Rng;
  parts: SceneryFile["parts"];
  c: SceneryColors;
  lamp: number;
}) {
  const part = parts[e.p];
  if (part === undefined) return null;
  const placements = layoutEntry(e, rng, part.variants.length);
  return (
    <>
      {placements.map((pl, i) => (
        <g
          key={i}
          transform={`translate(${pl.x + (pl.mir ? part.w * pl.s : 0)} ${pl.y}) scale(${pl.mir ? -pl.s : pl.s} ${pl.s})`}
          opacity={e.o ?? 1}
        >
          {part.variants[pl.v % part.variants.length]!.shapes.map((s, j) => (
            <Shape key={j} s={s} c={c} lamp={lamp} />
          ))}
        </g>
      ))}
    </>
  );
}

const LAYERS = ["far", "mid", "front", "light", "atmos"] as const;

/**
 * 情景（G-05）：型のレシピの部品を層ごとに重ね、時間帯・天候・危機の霞を被せる。
 * SceneBackground と同じ 1280×720 の SVG で、最下層に敷く
 */
export function Scenery({
  spec,
  tod = "morning",
  weather = "clear",
  haze = 0,
  kind = "town",
  /** グラデーション id の接頭辞（同じ画面に複数出す一覧モードで衝突しないため） */
  uid = "a",
}: {
  spec: ScenerySpec;
  kind?: SceneKind;
  tod?: TimeOfDay;
  weather?: string;
  haze?: number;
  uid?: string;
}) {
  const pal = PALS[tod];
  const pDef =
    spec.recipe.palette !== undefined ? scenery.palettes[spec.recipe.palette] : undefined;
  const c = colorsOf(tod, pDef);
  const veil = VEIL[weather];
  const rng = createRng(spec.variant);
  const gid = `scn-${uid}`;
  return (
    <svg
      className="scene"
      width="1280"
      height="720"
      viewBox="0 0 1280 720"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      data-scene={kind}
      data-scenery={spec.id}
      data-tod={tod}
      data-weather={weather}
      data-haze={haze}
    >
      {spec.recipe.sky === false ? (
        <>
          {/* 地下の闇（sky:false）：空は描かず、奥へ沈む闇と底の光の気配 */}
          <defs>
            <linearGradient id={`${gid}-dark`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.s0} />
              <stop offset="0.5" stopColor="#0a0c16" />
              <stop offset="1" stopColor="#04050a" />
            </linearGradient>
            <radialGradient id={`${gid}-depth`} cx="0.5" cy="0.42" r="0.75">
              <stop offset="0" stopColor={c.acc} stopOpacity={0.1} />
              <stop offset="0.55" stopColor={c.acc} stopOpacity={0.03} />
              <stop offset="1" stopColor={c.acc} stopOpacity={0} />
            </radialGradient>
          </defs>
          <rect width="1280" height="720" fill={`url(#${gid}-dark)`} />
          <ellipse cx="640" cy="380" rx="520" ry="330" fill={`url(#${gid}-depth)`} />
        </>
      ) : (
        <>
          {/* 空（時間帯のグラデーション＋星・月。配色は型の差分で変わる） */}
          <defs>
            <linearGradient id={`${gid}-sky`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={c.sky[0]} />
              <stop offset="0.5" stopColor={c.sky[1]} />
              <stop offset="0.78" stopColor={c.sky[2]} />
              <stop offset="1" stopColor={c.sky[3]} />
            </linearGradient>
            {tod === "night" && (
              <radialGradient id={`${gid}-moon`} cx="0.5" cy="0.5" r="0.5">
                <stop offset="0" stopColor="#f6e7c2" stopOpacity="0.45" />
                <stop offset="1" stopColor="#f6e7c2" stopOpacity="0" />
              </radialGradient>
            )}
          </defs>
          <rect width="1280" height="720" fill={`url(#${gid}-sky)`} />
          {pal.stars > 0 && (
            <g opacity={pal.stars}>
              {STARS.map(([x, y, r], i) => (
                <circle key={i} cx={x} cy={y} r={r} fill="#f5ead0" />
              ))}
            </g>
          )}
          {tod === "night" && (
            <>
              <circle cx="1050" cy="130" r="150" fill={`url(#${gid}-moon)`} />
              <circle cx="1050" cy="130" r="34" fill="#e8ddb8" opacity="0.8" />
            </>
          )}
          {veil !== undefined && (
            <rect width="1280" height="720" fill={veil.color} opacity={veil.op} />
          )}
        </>
      )}
      {/* 遠景 → 中景 → 前景 → 灯り → 空気 の層。項ごとに独立した系列から配置を引く */}
      {LAYERS.map((layer) =>
        (spec.recipe[layer] ?? []).map((e, i) => (
          <Entry
            key={`${layer}.${i}`}
            e={e}
            rng={rng.fork(`${layer}.${i}`)}
            parts={scenery.parts}
            c={c}
            lamp={pal.lamp}
          />
        )),
      )}
      {/* 型の空気感（霞・瘴気・雪明り。灯りの上・天候の下） */}
      {pDef?.veil !== undefined && (
        <rect width="1280" height="720" fill={pDef.veil.color} opacity={pDef.veil.op} />
      )}
      {/* 天候の動き（雨・雪・雲）は SceneBackground と同じ層で重ねる */}
      {spec.recipe.sky !== false && <WeatherLayer weather={weather} />}
      {/* 世界の危機の霞（W-04）：段階が進むほど景色が白く滲む */}
      {haze > 0 && (
        <>
          <rect width="1280" height="720" fill="#aebdc2" opacity={haze * 0.45} />
          <rect width="1280" height="720" fill="#04060b" opacity={haze * 0.22} />
        </>
      )}
    </svg>
  );
}

/**
 * 情景の一覧（e2e・確認用の裏口。`?scn=all` で全レシピ、
 * `?scn=town.port` などで1枚だけ、?tod=・?weather=・?seed= で条件を変えられる）
 */
export function SceneryGallery({
  scn,
  tod,
  weather,
  seed,
}: {
  scn: string;
  tod: TimeOfDay;
  weather: string;
  seed: string;
}) {
  const item = (label: string, recipe: SceneryRecipe, id: string): ReactNode => (
    <div key={id} style={{ width: 320, height: 200, position: "relative", overflow: "hidden" }}>
      <div style={{ transform: "scale(0.25)", transformOrigin: "top left" }}>
        <Scenery
          spec={{ id, recipe, variant: `${seed}:lab:${id}` }}
          kind="town"
          tod={tod}
          weather={weather}
          uid={`g-${id}`}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 6,
          bottom: 4,
          fontSize: 11,
          color: "#c9c0a8",
          fontFamily: "monospace",
          textShadow: "0 1px 2px #000",
        }}
      >
        {label}
      </div>
    </div>
  );
  if (scn !== "all") {
    const [group, key] = scn.split(".");
    const table =
      group === "town"
        ? scenery.town
        : group === "region"
          ? scenery.region
          : group === "dungeon"
            ? scenery.dungeon
            : undefined;
    const recipe = key !== undefined ? table?.[key] : undefined;
    if (recipe === undefined) {
      return (
        <div style={{ color: "#eee", padding: 40, fontFamily: "monospace" }}>
          未知の情景: {scn}（town.&lt;型&gt; / region.&lt;型&gt; / dungeon.&lt;型&gt; / all）
        </div>
      );
    }
    return (
      <Scenery
        spec={{ id: scn, recipe, variant: `${seed}:lab:${scn}` }}
        kind="town"
        tod={tod}
        weather={weather}
        uid="lab"
      />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        padding: 8,
        background: "#0a0a10",
        minHeight: "100vh",
      }}
    >
      {Object.entries(scenery.town).map(([id, r]) => item(`町・${id}`, r, `town.${id}`))}
      {Object.entries(scenery.region).map(([id, r]) => item(`地域・${id}`, r, `region.${id}`))}
      {Object.entries(scenery.dungeon).map(([id, r]) => item(`深層・${id}`, r, `dungeon.${id}`))}
    </div>
  );
}
