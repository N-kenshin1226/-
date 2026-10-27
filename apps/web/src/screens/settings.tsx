/**
 * 環境設定の窓（F-02）：効果音の有無・音量・演出の長さ。
 * システムの都合なので加護の層（銀青）の窓で開く。
 * 値は localStorage（trace.fx.v1）に永続化され、保存はここだけが握る
 */
import { setFxSettings, useFxSettings } from "../fx/settings.js";
import { playSfx } from "../fx/sound.js";
import { BlessingWindow, CommandMenu, HintBar, Kicker, pos, useHotkeys } from "../ui.js";
import { theme } from "../theme.js";

const B = theme.colors.bless;

export function SettingsScreen({ back }: { back: () => void }) {
  const s = useFxSettings();
  useHotkeys({ escape: back });

  const pct = Math.round(s.volume * 100);
  return (
    <div data-testid="screen-settings" className="scene">
      <BlessingWindow
        style={pos({ left: 400, top: 140, width: 480, height: 440 })}
        corners={["tl", "br"]}
        label="環境設定"
      >
        <div style={{ padding: "26px 30px" }}>
          <Kicker text="SETTINGS" bless style={{ textAlign: "center" }} />
          <h1
            style={{
              margin: "10px 0 0",
              textAlign: "center",
              fontFamily: theme.font.mincho,
              fontWeight: 800,
              fontSize: 24,
              letterSpacing: "0.3em",
              color: B.hi,
            }}
          >
            環境設定
          </h1>
          <p
            style={{
              margin: "10px 0 18px",
              textAlign: "center",
              fontSize: 13,
              color: B.dim,
            }}
          >
            ――音と演出の具合を整えます。設定はこの端末に記録されます。
          </p>
          <CommandMenu
            bless
            testId="settings-menu"
            entries={[
              {
                id: "set-sound",
                label: "効果音",
                sub: s.sound ? "鳴らす" : "鳴らさない",
                onPick: () => {
                  const next = setFxSettings({ sound: !s.sound });
                  if (next.sound) playSfx("notice");
                },
              },
              {
                id: "set-vol-down",
                label: "音量を小さく",
                sub: `${pct}%`,
                disabled: !s.sound || s.volume <= 0,
                onPick: () => {
                  setFxSettings({ volume: Math.max(0, s.volume - 0.1) });
                  playSfx("tag");
                },
              },
              {
                id: "set-vol-up",
                label: "音量を大きく",
                sub: `${pct}%`,
                disabled: !s.sound || s.volume >= 1,
                onPick: () => {
                  setFxSettings({ volume: Math.min(1, s.volume + 0.1) });
                  playSfx("tag");
                },
              },
              { kind: "divider" },
              {
                id: "set-short",
                label: "演出を短く",
                sub: s.shortFx ? "短い" : "ふつう",
                onPick: () => setFxSettings({ shortFx: !s.shortFx }),
              },
              { kind: "divider" },
              {
                id: "set-back",
                label: "もどる",
                sub: "Esc",
                primary: true,
                onPick: back,
              },
            ]}
            onBack={back}
          />
        </div>
      </BlessingWindow>
      <HintBar bless items={[["Esc", "もどる"]]} />
    </div>
  );
}
