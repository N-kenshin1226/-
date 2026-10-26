/**
 * Stage（UI-01）：1280×720 の固定キャンバス。
 * ウィンドウに合わせて transform: scale() で等倍拡大縮小し、余白は黒の帯にする
 * （README 決まりごと1。スクロールする Web ページにしない）
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { theme } from "../theme.js";

export const STAGE_W = theme.stage.width;
export const STAGE_H = theme.stage.height;

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () =>
      setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const st: CSSProperties = { transform: `translate(-50%,-50%) scale(${scale})` };
  return (
    <div className="stage-viewport" data-testid="stage">
      <div className="stage" style={st}>
        {children}
      </div>
    </div>
  );
}

/** 絶対配置のための小さなユーティリティ（left/top/right/bottom/width/height をまとめる） */
export function pos(p: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}): CSSProperties {
  return {
    position: "absolute",
    ...(p.left !== undefined ? { left: p.left } : {}),
    ...(p.top !== undefined ? { top: p.top } : {}),
    ...(p.right !== undefined ? { right: p.right } : {}),
    ...(p.bottom !== undefined ? { bottom: p.bottom } : {}),
    ...(p.width !== undefined ? { width: p.width } : {}),
    ...(p.height !== undefined ? { height: p.height } : {}),
  };
}
