/** 終了・継承系の画面：引退・生の継ぎ方・次代・転生（X-2 で App.tsx から分離） */
import { useMemo, useState } from "react";
import { heirGenerationOf, heirKindOf, type GameState } from "@trace/core";
import { balance, titles } from "@trace/content";
import {
  bioLines,
  legacyDefaults,
  loadChronicle,
  originList,
  t,
  tpl,
  vowList,
  workName,
  type FateChoice,
} from "../game.js";
import { Btn, css } from "../ui.js";
import { FatePickers } from "./title.js";

// ---- 引退（T-40。06 §1：いつでも選べる。確認は1回） ----
export function RetireScreen({ onRetire }: { onRetire: (confirmed: boolean) => void }) {
  return (
    <section style={css.panel} data-testid="screen-retire">
      <div style={{ marginBottom: 8 }}>{t.text.retireConfirm}</div>
      <Btn primary testId="retire-yes" onClick={() => onRetire(true)}>
        引退する
      </Btn>
      <Btn testId="retire-no" onClick={() => onRetire(false)}>
        思いとどまる
      </Btn>
    </section>
  );
}

// ---- 生の継ぎ方（T-48。06 §1：転生＝新しい世界へ / 次代＝同じ世界で継ぐ） ----
/**
 * 終わった生をどう継ぐかの選択画面。伝記はログに開かれている。
 * 転生を選ぶとその時点で年代記に1頁刻まれ（recordLifeEnd・冪等）転生画面へ、
 * 次代を選ぶと刻まずに次代画面へ
 */
export function SuccessionScreen({
  prev,
  cause,
  onChoose,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onChoose: (prev: GameState, cause: "retire" | "oldAge", way: "rebirth" | "heir") => void;
}) {
  return (
    <section style={css.panel} data-testid="screen-succession">
      <div style={{ marginBottom: 8 }}>{t.text.heirWayPick}</div>
      <Btn primary testId="succession-rebirth" onClick={() => onChoose(prev, cause, "rebirth")}>
        新しい世界に転生する
        <span style={css.dim}> ― 年代記に刻まれ、継承は大きい</span>
      </Btn>
      <Btn testId="succession-heir" onClick={() => onChoose(prev, cause, "heir")}>
        この世界で次代を継ぐ
        <span style={css.dim}> ― 年代記には刻まず、継承は小さい</span>
      </Btn>
    </section>
  );
}

// ---- 次代を継ぐ（T-48。06 §1「子や弟子に継承して延長」） ----
/**
 * 同じ世界 seed で新キャラを始める画面。前代の記録はその場の伝記が担い、
 * 年代記には刻まない。継承は legacy より弱い引継ぎ（素質補正の小さい版のみ）。
 * 世界が同じなので運命の傾向は前世のものを継ぎ、誓約は生ごとの選択として選び直す（D-38）
 */
export function HeirScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (prev: GameState, originId: string, vows: readonly string[]) => void;
}) {
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  const kind = useMemo(() => heirKindOf(prev), [prev]);
  const [originId, setOriginId] = useState<string | null>(null);
  const [pickedVows, setPickedVows] = useState<string[]>([]);
  const toggleVow = (id: string) =>
    setPickedVows((vs) => (vs.includes(id) ? vs.filter((x) => x !== id) : [...vs, id]));
  return (
    <section style={css.panel} data-testid="screen-heir">
      <div data-testid="heir-bio">
        {bio.map((l, i) => (
          <div key={i} style={l.startsWith("――") || l.startsWith("━") ? css.sys : {}}>
            {l}
          </div>
        ))}
      </div>
      <div style={css.sys} data-testid="heir-kind">
        {tpl(t.text.heirKindLine, {
          kind: t.display.heirKindNames[kind] ?? kind,
          gen: heirGenerationOf(prev) + 1,
        })}
      </div>
      <div style={css.dim} data-testid="heir-nochronicle">
        {t.text.heirNoChronicle}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.rebirthOriginPrompt}</div>
      <div>
        {originList.map((o) => (
          <Btn
            key={o.id}
            testId={`heir-origin-${o.id.replace("origin.", "")}`}
            primary={originId === o.id}
            onClick={() => setOriginId(o.id)}
          >
            {o.name}
            <span style={css.dim}> ― {o.desc}</span>
          </Btn>
        ))}
      </div>
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.vowPick}</div>
      <div data-testid="heir-vows">
        {vowList.map((v) => (
          <Btn
            key={v.id}
            testId={`heir-vow-${v.id}`}
            primary={pickedVows.includes(v.id)}
            onClick={() => toggleVow(v.id)}
          >
            {v.name}
            <span style={css.dim}> ― {v.desc}</span>
          </Btn>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Btn
          primary
          testId="heir-born"
          disabled={originId === null}
          onClick={() => {
            if (originId !== null) onBorn(prev, originId, pickedVows);
          }}
        >
          {t.text.rebirthBorn}
        </Btn>
      </div>
    </section>
  );
}

// ---- 転生（T-40。06 §1「伝記→年代記→継承→転生」） ----
/**
 * 一生の終わり画面：伝記・二つ名（年代記から）・継承の選択・新しい生の出自。
 * 記憶の称号は rememberedMax まで、遺物は台帳の上位から1個。初期値は自動選択と同じ
 */
export function RebirthScreen({
  prev,
  cause,
  onBorn,
}: {
  prev: GameState;
  cause: "retire" | "oldAge";
  onBorn: (
    prev: GameState,
    originId: string,
    rememberedTitles: string[],
    artifactId: string | undefined,
    fate: FateChoice,
  ) => void;
}) {
  const { auto, topWorks } = useMemo(() => legacyDefaults(prev), [prev]);
  const bio = useMemo(() => bioLines(prev, cause === "retire" ? "retire" : "death"), [prev, cause]);
  // 二つ名は年代記に刻まれた頁から読む（recordLife が自動で選んでいる）。
  // この一生の頁を探す（末尾とは限らない：別の生が後に刻まれている場合もある）
  const epithet = useMemo(
    () =>
      [...loadChronicle().lives]
        .reverse()
        .find((l) => l.worldSeed === prev.seed && l.cause === cause)?.epithet,
    [prev, cause],
  );
  const [pickedTitles, setPickedTitles] = useState<string[]>(auto.rememberedTitles);
  // 自動選択の遺物は品質最高の1件＝topWorks[0]（legacyOf と同じ順位付け）
  const [artifactId, setArtifactId] = useState<string | undefined>(topWorks[0]?.id);
  const [originId, setOriginId] = useState<string | null>(null);
  // 生まれ変わる世の運命（T-45/T-46）：傾向は穏やか・誓約はなしが既定
  const [fate, setFate] = useState<FateChoice>({ tendency: "calm", vows: [] });
  const toggleTitle = (id: string) =>
    setPickedTitles((ts) =>
      ts.includes(id)
        ? ts.filter((x) => x !== id)
        : [...ts, id].slice(-balance.legacy.rememberedMax),
    );
  return (
    <section style={css.panel} data-testid="screen-rebirth">
      <div data-testid="rebirth-bio">
        {bio.map((l, i) => (
          <div key={i} style={l.startsWith("――") || l.startsWith("━") ? css.sys : {}}>
            {l}
          </div>
        ))}
      </div>
      {epithet !== undefined && (
        <div style={css.sys} data-testid="rebirth-epithet">
          {tpl(t.text.rebirthEpithet, {
            name: titles.titles.find((x) => x.id === epithet)?.name ?? epithet,
          })}
        </div>
      )}
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.legacyHeader}</div>
      {prev.titles.length > 0 ? (
        <div data-testid="rebirth-titles">
          <div style={css.dim}>
            {tpl(t.text.legacyTitlesPrompt, { max: balance.legacy.rememberedMax })}
          </div>
          {prev.titles.map((id) => (
            <Btn
              key={id}
              testId={`rebirth-title-${id}`}
              primary={pickedTitles.includes(id)}
              onClick={() => toggleTitle(id)}
            >
              {titles.titles.find((x) => x.id === id)?.name ?? id}
            </Btn>
          ))}
        </div>
      ) : (
        <div style={css.dim}>{t.text.legacyNoTitles}</div>
      )}
      {topWorks.length > 0 ? (
        <div data-testid="rebirth-artifacts">
          <div style={css.dim}>{t.text.legacyArtifactPrompt}</div>
          {topWorks.map((w) => (
            <Btn
              key={w.id}
              testId={`rebirth-artifact-${w.id}`}
              primary={artifactId === w.id}
              onClick={() => setArtifactId((a) => (a === w.id ? undefined : w.id))}
            >
              {workName(w)}
              <span style={css.dim}>
                {" "}
                （質{w.quality}・{w.day + 1}日目）
              </span>
            </Btn>
          ))}
        </div>
      ) : (
        <div style={css.dim}>{t.text.legacyNoArtifact}</div>
      )}
      <div style={{ ...css.accent, marginTop: 8 }}>{t.text.rebirthOriginPrompt}</div>
      <div>
        {originList.map((o) => (
          <Btn
            key={o.id}
            testId={`rebirth-origin-${o.id.replace("origin.", "")}`}
            primary={originId === o.id}
            onClick={() => setOriginId(o.id)}
          >
            {o.name}
            <span style={css.dim}> ― {o.desc}</span>
          </Btn>
        ))}
      </div>
      <FatePickers fate={fate} setFate={setFate} />
      <div style={{ marginTop: 12 }}>
        <Btn
          primary
          testId="rebirth-born"
          disabled={originId === null}
          onClick={() => {
            if (originId !== null) onBorn(prev, originId, pickedTitles, artifactId, fate);
          }}
        >
          {t.text.rebirthBorn}
        </Btn>
      </div>
    </section>
  );
}
