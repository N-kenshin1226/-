/**
 * 場所の移動・戦闘・眠りの幕（P-01）：画面全体を覆って切り替えを見せる。
 *   travel … 場所の移動の幕（速い暗転）
 *   combat … 戦闘開始の暗転（App 側が舞台を揺らすクラスも付ける）
 *   sleep  … 眠りの暗転（ゆっくり落ちて、朝の明るさへ開く）
 * 幕はクリック・Enter・Esc・Space で飛ばせる（飛ばしても行動の結果は同じ）。
 * prefers-reduced-motion（motionOff）では App 側が幕を掛けず直接切り替える
 */
import type { CSSProperties } from "react";
import { useHotkeys } from "../ui/keys.js";

export type TravelFxKind = "travel" | "combat" | "sleep";
export interface TravelFx {
  kind: TravelFxKind;
  /** in=幕が閉じる途中 / out=差し替え済みで幕が開く途中 */
  phase: "in" | "out";
}

/** 幕の層（時間は App が --trv-in / --trv-out に書き込む） */
export function TravelVeil({
  fx,
  inMs,
  outMs,
  onSkip,
}: {
  fx: TravelFx;
  inMs: number;
  outMs: number;
  onSkip: () => void;
}) {
  // キーで飛ばす（capture=true：幕の間は背面のコマンドへキーを漏らさない）
  useHotkeys({ enter: onSkip, escape: onSkip, " ": onSkip }, true, true);
  return (
    <div
      data-testid={`trv-${fx.kind}`}
      className={`trv ${fx.kind} ${fx.phase}`}
      role="presentation"
      onClick={onSkip}
      style={{ "--trv-in": `${inMs}ms`, "--trv-out": `${outMs}ms` } as CSSProperties}
    />
  );
}
