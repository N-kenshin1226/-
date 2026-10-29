/**
 * 潜りから情景への合図（X-24、docs/10 の残項「迷宮内の部屋の情景差分」）。
 * 部屋の通し番号で構図を変え、灯りの減りで霞を深くする —— 画面ローカルの
 * 潜り状態を GameState に入れず、背景だけに届ける小さな伝達口。
 */
import { useSyncExternalStore } from "react";

export interface SceneryHint {
  /** 情景の variant に畳む尾（部屋番号など） */
  variant?: string;
  /** 霞に足す深さ（0〜1 程度。灯りが減るほど大きく） */
  haze?: number;
}

let current: SceneryHint | undefined;
const listeners = new Set<() => void>();

export function setSceneryHint(h: SceneryHint | undefined): void {
  if (h === current) return;
  current = h;
  for (const f of listeners) f();
}

export function useSceneryHint(): SceneryHint | undefined {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => current,
  );
}
