/**
 * 地方の地図（G-02、docs/10 §7「地方マップ」）
 *   左：地方の見取り図 —— 町の印と道を描く。霧の中の町は「？」の輪郭だけ、
 *       閉ざされた道は破線＋✕、荒れた地域は ⚔ の印
 *   右：旅の列 —— この町から出る道の行き先（→通い方）と、この町の外の地域。
 *       旅立ちは core の journey、地域への移動は core の travel に投げる
 */
import { useMemo, useState } from "react";
import { canAct, describe, type GameState } from "@trace/core";
import {
  cfg,
  journeyWayName,
  journeyWayOptions,
  mapRoadOther,
  mapRoadsFrom,
  regionMapOf,
  t,
  townName,
  townOf,
  tpl,
  travelOutCost,
  type MapRoad,
} from "../game.js";
import {
  CommandMenu,
  HintBar,
  Kicker,
  WorldFrame,
  pos,
  type Act,
  type MenuEntry,
  type Screen,
} from "../ui.js";
import { theme } from "../theme.js";

const W = theme.colors.world;

/** 道の種別ごとの線の色（街道＝土、山道＝鼠、海路＝藍） */
const ROAD_COLOR: Record<string, string> = {
  highway: "#6a5a44",
  mountain: "#5a4a6a",
  sea: "#3a5a74",
};

/** 道の種別の凡例名 */
const ROAD_KIND_NAME: Record<string, string> = {
  highway: "街道",
  mountain: "山道",
  sea: "海路",
};

/** 地図座標（%）を 800×460 の SVG 座標へ */
const svgX = (p: readonly [number, number]) => (p[0] / 100) * 800;
const svgY = (p: readonly [number, number]) => (p[1] / 100) * 460;

export function MapScreen({
  state,
  act,
  setScreen,
  back,
}: {
  state: GameState;
  act: Act;
  setScreen: (s: Screen) => void;
  back: () => void;
}) {
  const model = regionMapOf(state);
  const here = townOf(state);
  const canActNow = canAct(state.time, cfg.time);
  const season = describe(state.time, cfg.time).season;
  const seasonName = t.display.seasonNames[season] ?? String(season);
  // 行き先を選ぶ → 通い方を選ぶ の二段（人と過ごす窓と同じ潜り方）
  const [drill, setDrill] = useState<string | null>(null);

  const roads = useMemo(() => (model !== null ? mapRoadsFrom(state, model) : []), [state, model]);
  const townById = useMemo(() => new Map((model?.towns ?? []).map((x) => [x.id, x])), [model]);
  const regions = useMemo(
    () => (model?.regions ?? []).filter((r) => r.town === here),
    [model, here],
  );
  const drillRoad = drill !== null ? roads.find((r) => mapRoadOther(r, here) === drill) : undefined;

  const roadSub = (r: MapRoad): string => {
    const parts = [tpl(t.text.journeyDays, { days: r.days }), ROAD_KIND_NAME[r.kind] ?? r.kind];
    if (r.danger > 0) parts.push(tpl(t.text.journeyDanger, { danger: r.danger }));
    if (r.checkpointFee !== undefined)
      parts.push(tpl(t.text.journeyCheckpoint, { fee: r.checkpointFee }));
    if (r.closed === "season") parts.push(tpl(t.text.regionClosedSeason, { season: seasonName }));
    if (r.closed === "crisis") parts.push(t.text.regionClosedCrisis);
    return parts.join("・");
  };

  const entries: MenuEntry[] =
    drillRoad === undefined
      ? [
          { kind: "header", text: t.text.regionJourneyHead },
          ...(roads.length === 0
            ? [{ kind: "header" as const, text: "  ――知れている行き先はない。" }]
            : roads.map((r): MenuEntry => {
                const to = mapRoadOther(r, here);
                const name = townName(state, to);
                return {
                  id: `map-go-${to}`,
                  label: tpl(t.text.journeyDepart, { town: name }),
                  sub: roadSub(r),
                  disabled: !canActNow || r.closed !== null,
                  onPick: () => setDrill(to),
                };
              })),
          { kind: "divider" },
          { kind: "header", text: t.text.regionRegionHead },
          ...(regions.length === 0
            ? [{ kind: "header" as const, text: "  ――この町の外はまだ知れていない。" }]
            : regions.map((r): MenuEntry => {
                const cost = travelOutCost();
                const cant = state.time.action + cost > cfg.time.actionsPerDay;
                return {
                  id: `map-travel-${r.id}`,
                  label: `${r.known ? r.name : "？"}へ`,
                  sub: `${r.ravaged ? `${t.text.regionRavaged}・` : ""}行動${cost}回`,
                  disabled: !r.known || r.ravaged || cant,
                  onPick: () => {
                    act({ type: "travel", to: r.id });
                    setScreen({ name: "place", place: r.id });
                  },
                };
              })),
        ]
      : [
          {
            kind: "header",
            text: `――${townName(state, drillRoad.a === here ? drillRoad.b : drillRoad.a)}への道`,
          },
          ...journeyWayOptions(state, drillRoad.id).map(({ way, days, fee }): MenuEntry => ({
            id: `map-way-${way}`,
            label: tpl(t.text.journeyDepartWay, {
              town: townName(state, drillRoad.a === here ? drillRoad.b : drillRoad.a),
              way: journeyWayName(way),
            }),
            sub: `${tpl(t.text.journeyDays, { days })}${fee > 0 ? `・${tpl(t.text.journeyFee, { fee })}` : ""}`,
            disabled: !canActNow || state.player.money < fee,
            primary: way === "foot",
            onPick: () => {
              act({ type: "journey", to: mapRoadOther(drillRoad, here), way });
              setScreen({ name: "journey" });
            },
          })),
        ];

  return (
    <div data-testid="screen-map" className="scene">
      {/* 地方の見取り図（左の大窓）：町の印と道。霧の町は「？」の輪郭だけ */}
      <WorldFrame
        style={{ ...pos({ left: 28, top: 104, width: 780, bottom: 210 }), padding: "12px 16px" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 6 }}>
          <div>
            <Kicker text="REGION" />
            <div
              style={{ fontFamily: theme.font.mincho, fontSize: 22, fontWeight: 800, color: W.hi }}
            >
              {t.text.regionTitle}
            </div>
          </div>
          <div style={{ fontSize: 13, color: W.dim }}>
            {t.text.regionHere}：{townName(state, here)}
          </div>
        </div>
        <div style={{ position: "relative", height: "calc(100% - 86px)" }}>
          <svg
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
            viewBox="0 0 800 460"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect x="0" y="0" width="800" height="460" fill="#0b0a14" />
            {/* 道：知れた端を持つ道だけ描く。閉ざされた道は破線＋✕ */}
            {(model?.roads ?? [])
              .filter((r) => r.known)
              .map((r) => {
                const a = townById.get(r.a);
                const b = townById.get(r.b);
                if (a === undefined || b === undefined) return null;
                const [x1, y1, x2, y2] = [svgX(a.pos), svgY(a.pos), svgX(b.pos), svgY(b.pos)];
                const closed = r.closed !== null;
                const color = closed ? "#7a3a3a" : (ROAD_COLOR[r.kind] ?? "#4a4258");
                return (
                  <g key={r.id}>
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={color}
                      strokeWidth={r.kind === "sea" ? 2 : 3}
                      strokeDasharray={
                        closed
                          ? "6 6"
                          : r.kind === "mountain"
                            ? "9 4"
                            : r.kind === "sea"
                              ? "4 7"
                              : ""
                      }
                      opacity={a.known && b.known ? 0.9 : 0.45}
                    />
                    {closed && (
                      <text
                        x={(x1 + x2) / 2}
                        y={(y1 + y2) / 2 - 6}
                        textAnchor="middle"
                        fontSize="15"
                        fill="#c86a5a"
                      >
                        ✕
                      </text>
                    )}
                  </g>
                );
              })}
            {/* 地域の小印（町の周りに散らした菱形。荒れた地域は ⚔） */}
            {(model?.regions ?? [])
              .filter((r) => r.known)
              .map((r) => {
                const p = r.pos;
                return (
                  <g key={r.id} opacity={r.visited ? 0.95 : 0.55}>
                    <rect
                      x={svgX(p) - 4}
                      y={svgY(p) - 4}
                      width="8"
                      height="8"
                      fill={r.ravaged ? "#4a2626" : "#241f38"}
                      stroke={r.ravaged ? "#c86a5a" : "#3a3450"}
                      strokeWidth="1.5"
                      transform={`rotate(45 ${svgX(p)} ${svgY(p)})`}
                    />
                    {r.ravaged && (
                      <text
                        x={svgX(p)}
                        y={svgY(p) - 9}
                        textAnchor="middle"
                        fontSize="11"
                        fill="#c86a5a"
                      >
                        ⚔
                      </text>
                    )}
                  </g>
                );
              })}
            {/* 町の印：知れた町は名、霧の町は「？」だけ */}
            {(model?.towns ?? []).map((tw) => {
              const x = svgX(tw.pos);
              const y = svgY(tw.pos);
              if (!tw.known) {
                return (
                  <g key={tw.id} opacity="0.5">
                    <circle cx={x} cy={y} r="5" fill="#1a1626" stroke="#3a3450" strokeWidth="1.5" />
                    <text x={x} y={y - 11} textAnchor="middle" fontSize="11" fill="#4a4258">
                      ？
                    </text>
                  </g>
                );
              }
              return (
                <g key={tw.id}>
                  {tw.here && (
                    <circle
                      cx={x}
                      cy={y}
                      r="12"
                      fill="none"
                      stroke="#d8b45a"
                      strokeWidth="1.5"
                      opacity="0.7"
                    />
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r={tw.here ? 7 : 5.5}
                    fill={tw.visited ? "#d8b45a" : "#0b0a14"}
                    stroke={tw.visited ? "#f3dfa8" : "#8a7a5a"}
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={y - 13}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight={tw.here ? 700 : 400}
                    fill={tw.visited ? "#e8d8b0" : "#9a8d7a"}
                  >
                    {tw.name}
                    {tw.here ? `（${t.text.regionHere}）` : ""}
                  </text>
                </g>
              );
            })}
          </svg>
          {/* 知れた隣町の印は押せる —— 通い方の選択に潜る */}
          {roads.map((r) => {
            const to = mapRoadOther(r, here);
            const tw = townById.get(to);
            if (tw === undefined) return null;
            return (
              <button
                key={r.id}
                type="button"
                data-testid={`map-town-${to}`}
                className="map-mark"
                style={{ left: `${tw.pos[0]}%`, top: `${tw.pos[1]}%` }}
                onClick={() => setDrill(to)}
              >
                <span className="diamond" />
                <span className="tag">{tw.name}</span>
              </button>
            );
          })}
        </div>
        {/* 凡例 */}
        <div style={{ marginTop: 8, fontSize: 11, color: W.faint, lineHeight: 1.5 }}>
          {t.text.regionLegend}
        </div>
      </WorldFrame>

      {/* 右：旅とこの町の外（コマンド列） */}
      <WorldFrame
        style={{ ...pos({ right: 28, top: 104, width: 400, bottom: 210 }), padding: "14px 4px" }}
      >
        <div style={{ margin: "2px 14px 10px" }}>
          <Kicker text="TRAVEL" />
          <div
            style={{
              fontFamily: theme.font.mincho,
              fontSize: 20,
              fontWeight: 800,
              color: W.hi,
              marginTop: 2,
            }}
          >
            {drillRoad === undefined ? t.text.regionPick : t.text.regionJourneyHead}
          </div>
        </div>
        <div className="scroll" style={{ maxHeight: "78%", overflowY: "auto" }}>
          <CommandMenu
            testId="screen-map-commands"
            entries={[
              ...entries,
              { kind: "divider" },
              {
                id: "back",
                label: "戻る",
                onPick: () => (drill !== null ? setDrill(null) : back()),
              },
            ]}
            onBack={() => (drill !== null ? setDrill(null) : back())}
          />
        </div>
      </WorldFrame>
      <HintBar
        items={[
          ["↑↓", "選択"],
          ["Enter", "決定"],
          ["Esc", "戻る"],
        ]}
      />
    </div>
  );
}
