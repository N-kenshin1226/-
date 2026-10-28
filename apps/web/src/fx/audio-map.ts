/**
 * 場面 → 音の解決（S-01）：audio.json の assign 表を引く純粋関数。
 * DOM・AudioContext には触れない —— vitest で決定的に検証できる。
 *
 *   曲（BGM）  … 画面名 > 場所（個別曲を持つ場所）> 街の時間帯 > 既定
 *   環境音     … 場所（昼夜替え可）> 情景 > 既定。屋外の場所だけ天候で上書き
 */
import { audio, places } from "@trace/content";
import type { TimeOfDay } from "@trace/core";

const placeById = new Map(places.places.map((p) => [p.id, p]));
const ambientById = new Map(audio.ambient.map((a) => [a.id, a]));

/**
 * BGM を引く。screen=画面名（ui.tsx の Screen["name"]）、place=その画面が
 * 属する場所 id（place プロパティか、場所に縛られない画面は最後に居た場所）。
 * placeKind=解決済みの場所の種別（G-01：生成地方の場所は places.json に
 * 載らないので、呼び出し側が解決した kind を渡す。省略時は固定表から引く）
 */
export function resolveTrack(
  screen: string,
  place: string | undefined,
  tod: TimeOfDay,
  placeKind?: "town" | "region",
): string {
  const { bgm } = audio.assign;
  // 画面名が最優先（戦闘・起床・終幕・机まわりの画面など）
  const byScreen = bgm.screens[screen];
  if (byScreen !== undefined) return byScreen;
  if (place !== undefined) {
    // 個別の曲を持つ場所（酒場・鍛冶場・森・旧街道・湖畔・深層）
    const byPlace = bgm.places[place];
    if (byPlace !== undefined) return byPlace;
    // 街の外の場所で個別指定が無いなら街の時間帯曲には倒さない
    if ((placeKind ?? placeById.get(place)?.kind) === "region") return bgm.default;
  }
  // 街の場所・見取り図・場所の分からない画面は街の時間帯曲
  return bgm.townTod[tod] ?? bgm.default;
}

/**
 * 環境音を引く。place=居る場所 id、scene=情景キー（場所に縛られない画面用）、
 * tod=時間帯（夜は夜の音に替わる場所がある）、weather=天候 id
 * （屋外の場所では環境音ごと天候の音になる）
 */
export function resolveAmbient(
  place: string | undefined,
  scene: string,
  tod: TimeOfDay,
  weather: string,
): string {
  const { ambient } = audio.assign;
  const entry = place !== undefined ? ambient.places[place] : undefined;
  const base =
    typeof entry === "string"
      ? entry
      : entry !== undefined
        ? tod === "night"
          ? entry.night
          : entry.day
        : (ambient.scenes[scene] ?? ambient.default);
  // 屋外の場所では雨・雪がそのまま環境音になる（屋内には降り込まない）
  const w = ambient.weather[weather];
  if (w !== undefined && ambientById.get(base)?.outdoor === true) return w;
  return base;
}
