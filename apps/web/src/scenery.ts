/**
 * 情景の解決層（G-05、docs/10 §8）：画面・場所から「どのレシピで・
 * どの系列の配置で」情景を描くかを決める。
 *
 * - 生成地方（state.world="gen"）：町の場所は町の型、地域は地域の型、
 *   深層はダンジョンの型のレシピで描く。配置は世界シード×場所から引く
 * - 固定マップ（legacy）：scenery.legacy の当て方で型のレシピに写す
 *   （アルディ＝宿場街・ベルン＝港町 など、既存の町は型の1例として扱う）
 * - 室内の場所（鍛冶場・酒場・ギルド・教会・宿屋・自宅）は従来どおり
 *   部屋の情景（SceneKind）へ —— 型のレシピは屋外の情景だけを担う
 * - 時間帯・天候・危機の霞はレンダラ（ui/scenery.tsx）側で重ねる
 */
import type { GameState } from "@trace/core";
import { scenery, type SceneryRecipe, type ScenerySubRecipe } from "@trace/content";
import { genWorld, placeOfState, type PlaceLike } from "./world.js";
import type { Screen } from "./ui.js";
import type { ScenerySpec } from "./ui/scenery.js";

/** 部屋の情景のまま残す場面（町の屋内。型のレシピを被せない） */
const INTERIOR_SCENES = new Set(["forge", "tavern", "guild", "church", "inn", "home"]);

/** 基のレシピに場所の差分を畳み込む（各層の配置項は基の後ろに追記される） */
function mergeRecipe(base: SceneryRecipe, sub: ScenerySubRecipe | undefined): SceneryRecipe {
  if (sub === undefined) return base;
  const out: SceneryRecipe = {
    ...(sub.palette !== undefined || base.palette !== undefined
      ? { palette: sub.palette ?? base.palette }
      : {}),
    ...(base.sky !== undefined ? { sky: base.sky } : {}),
    far: [...(base.far ?? []), ...(sub.far ?? [])],
    mid: [...(base.mid ?? []), ...(sub.mid ?? [])],
    front: [...(base.front ?? []), ...(sub.front ?? [])],
    light: [...(base.light ?? []), ...(sub.light ?? [])],
    atmos: [...(base.atmos ?? []), ...(sub.atmos ?? [])],
  };
  return out;
}

/** その町の型のレシピ（見取り図・町の情景の基盤） */
function townSpec(state: GameState, town: string): ScenerySpec | null {
  const w = genWorld(state);
  const type = w !== null ? w.towns.find((t) => t.id === town)?.typeId : scenery.legacy.towns[town];
  const base = type !== undefined ? scenery.town[type] : undefined;
  if (base === undefined) return null;
  return { id: `town.${type}`, recipe: base, variant: `${state.seed}:scenery:${town}` };
}

/** 町の中の場所の情景（型のレシピ＋場所ごとの差分。屋内は部屋の情景へ残す） */
function townPlaceSpec(state: GameState, p: PlaceLike): ScenerySpec | null {
  const w = genWorld(state);
  const town = p.town ?? (w !== null ? w.startTown : "ardi");
  // 場所の key（"t0.gate" → "gate"。生成地方の町の場所は <町>.<key> の形）
  const key = p.id.split(".").pop() ?? p.id;
  const type = w !== null ? w.life.places[p.id]?.type : scenery.legacy.towns[town];
  const base = type !== undefined ? scenery.town[type] : undefined;
  if (base === undefined) return null;
  const sub = base.places?.[key];
  // 差分の無い屋内の場所は部屋の情景（SceneKind）へ残す
  if (sub === undefined && INTERIOR_SCENES.has(p.scene)) return null;
  return {
    id: `town.${type}${sub !== undefined ? `#${key}` : ""}`,
    recipe: mergeRecipe(base, sub),
    variant: `${state.seed}:scenery:${town}/${key}`,
  };
}

/** 地域の情景（型のレシピ。地域は場所 id＝地域 id） */
function regionSpec(state: GameState, id: string): ScenerySpec | null {
  const w = genWorld(state);
  const type = w !== null ? w.life.places[id]?.type : scenery.legacy.regions[id];
  // 迷宮の場所（G-03）：life.places の型は "dg.<迷宮の型>" —— ダンジョンのレシピを引く
  if (type !== undefined && type.startsWith("dg.")) {
    const dgType = type.slice(3);
    const base = scenery.dungeon[dgType];
    if (base === undefined) return null;
    return { id: `dungeon.${dgType}`, recipe: base, variant: `${state.seed}:scenery:${id}` };
  }
  const base = type !== undefined ? scenery.region[type] : undefined;
  if (base === undefined) return null;
  return { id: `region.${type}`, recipe: base, variant: `${state.seed}:scenery:${id}` };
}

/** 場所の情景（町の場所＝町の型、地域＝地域の型）。屋内は null（部屋の情景へ） */
function placeSpec(state: GameState, id: string | null | undefined): ScenerySpec | null {
  const p = placeOfState(state, id ?? "");
  if (p === undefined) return null;
  if (p.kind === "region") return regionSpec(state, p.id);
  return townPlaceSpec(state, p);
}

/**
 * 画面 → 情景。sceneOf（SceneKind）と同じ規則で引く —— null を返した画面は
 * 従来の固定背景（SceneBackground）にそのまま倒れる
 */
export function sceneryForScreen(
  state: GameState,
  s: Screen,
  lastPlace: string | null,
): ScenerySpec | null {
  switch (s.name) {
    // 読みもの用の固定背景（机・夜の窓など）は情景レシピの対象外
    case "wake":
    case "heir":
    case "status":
    case "settings":
    case "news":
    case "lore":
    case "book":
    case "records":
    case "crisis":
    case "ending":
    case "sleep":
    case "retire":
    case "reset":
    case "succession":
    case "rebirth":
      return null;
    // 深層の中（降りている画面）はダンジョンの型の情景
    case "abyss":
      return {
        id: "dungeon.abyss",
        recipe: scenery.dungeon.abyss!,
        variant: `${state.seed}:scenery:abyss`,
      };
    // 有限迷宮の中（G-03）：その迷宮の型のレシピ（洞窟・坑道・地下墓所…）
    case "dungeon": {
      const dgType = genWorld(state)?.dungeons.find((d) => d.id === s.place)?.type;
      const recipe = dgType !== undefined ? scenery.dungeon[dgType] : undefined;
      if (recipe === undefined) return null;
      return {
        id: `dungeon.${dgType}`,
        recipe,
        variant: `${state.seed}:scenery:${s.place}`,
      };
    }
    // 旅の途中（P-02）：町と町の間は街道の情景
    case "journey":
      return {
        id: "region.road",
        recipe: scenery.region.road!,
        variant: `${state.seed}:scenery:journey`,
      };
    // 狩り場の景色のまま戦う（P-01。地域の情景があればそれを使う）
    case "combat":
      return placeSpec(state, s.place);
    case "menu":
      return placeSpec(state, lastPlace) ?? townSpec(state, state.life.town);
    case "place":
      return placeSpec(state, s.place);
    default:
      // 場所に縛られた画面（仕事・狩り・師匠など）はその場所の情景のまま
      return placeSpec(state, ("place" in s ? s.place : undefined) ?? lastPlace);
  }
}
