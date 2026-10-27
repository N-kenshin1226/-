/**
 * 環境設定の窓（F-02・S-01）：音と演出の具合。
 * 音は3系統（効果音・BGM・環境音）に分かれ、それぞれ鳴らすかと音量を持つ。
 * 「音」は全系統の親スイッチ —— 切れば全部無音になる。
 * システムの都合なので加護の層（銀青）の窓で開く。
 * 値は localStorage（trace.fx.v1）に永続化され、保存はここだけが握る
 */
import { setFxSettings, useFxSettings } from "../fx/settings.js";
import { playSfx } from "../fx/sound.js";
import { BlessingWindow, CommandMenu, HintBar, Kicker, pos, useHotkeys } from "../ui.js";
import { theme } from "../theme.js";

const B = theme.colors.bless;

/** 系統の音量を1段（0.1）動かす */
const step = (v: number, dir: 1 | -1) =>
  Math.min(1, Math.max(0, Math.round((v + dir * 0.1) * 10) / 10));

export function SettingsScreen({ back }: { back: () => void }) {
  const s = useFxSettings();
  useHotkeys({ escape: back });

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const onOff = (b: boolean) => (b ? "鳴らす" : "鳴らさない");
  return (
    <div data-testid="screen-settings" className="scene">
      <BlessingWindow
        style={pos({ left: 400, top: 56, width: 480, height: 616 })}
        corners={["tl", "br"]}
        label="環境設定"
      >
        <div style={{ padding: "22px 30px" }}>
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
              margin: "10px 0 14px",
              textAlign: "center",
              fontSize: 13,
              color: B.dim,
            }}
          >
            ――音と演出の具合を整えます。設定はこの端末に記録されます。
          </p>
          <div className="scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
            <CommandMenu
              bless
              testId="settings-menu"
              entries={[
                {
                  id: "set-sound",
                  label: "音",
                  sub: onOff(s.sound),
                  onPick: () => {
                    const next = setFxSettings({ sound: !s.sound });
                    if (next.sound) playSfx("notice");
                  },
                },
                {
                  id: "set-vol-down",
                  label: "全体の音量を小さく",
                  sub: pct(s.volume),
                  disabled: !s.sound || s.volume <= 0,
                  onPick: () => {
                    setFxSettings({ volume: step(s.volume, -1) });
                    playSfx("tag");
                  },
                },
                {
                  id: "set-vol-up",
                  label: "全体の音量を大きく",
                  sub: pct(s.volume),
                  disabled: !s.sound || s.volume >= 1,
                  onPick: () => {
                    setFxSettings({ volume: step(s.volume, 1) });
                    playSfx("tag");
                  },
                },
                { kind: "header", text: "SOUND" },
                {
                  id: "set-sfx",
                  label: "効果音",
                  sub: onOff(s.sfx),
                  disabled: !s.sound,
                  onPick: () => {
                    const next = setFxSettings({ sfx: !s.sfx });
                    if (next.sfx) playSfx("confirm");
                  },
                },
                {
                  id: "set-sfx-down",
                  label: "効果音の音量を小さく",
                  sub: pct(s.sfxVolume),
                  disabled: !s.sound || !s.sfx || s.sfxVolume <= 0,
                  onPick: () => {
                    setFxSettings({ sfxVolume: step(s.sfxVolume, -1) });
                    playSfx("tag");
                  },
                },
                {
                  id: "set-sfx-up",
                  label: "効果音の音量を大きく",
                  sub: pct(s.sfxVolume),
                  disabled: !s.sound || !s.sfx || s.sfxVolume >= 1,
                  onPick: () => {
                    setFxSettings({ sfxVolume: step(s.sfxVolume, 1) });
                    playSfx("tag");
                  },
                },
                { kind: "header", text: "MUSIC" },
                {
                  id: "set-music",
                  label: "BGM",
                  sub: onOff(s.music),
                  disabled: !s.sound,
                  onPick: () => setFxSettings({ music: !s.music }),
                },
                {
                  id: "set-music-vol-down",
                  label: "BGMの音量を小さく",
                  sub: pct(s.musicVolume),
                  disabled: !s.sound || !s.music || s.musicVolume <= 0,
                  onPick: () => {
                    setFxSettings({ musicVolume: step(s.musicVolume, -1) });
                    playSfx("tag");
                  },
                },
                {
                  id: "set-music-vol-up",
                  label: "BGMの音量を大きく",
                  sub: pct(s.musicVolume),
                  disabled: !s.sound || !s.music || s.musicVolume >= 1,
                  onPick: () => {
                    setFxSettings({ musicVolume: step(s.musicVolume, 1) });
                    playSfx("tag");
                  },
                },
                { kind: "header", text: "AMBIENT" },
                {
                  id: "set-ambient",
                  label: "環境音",
                  sub: onOff(s.ambient),
                  disabled: !s.sound,
                  onPick: () => setFxSettings({ ambient: !s.ambient }),
                },
                {
                  id: "set-ambient-vol-down",
                  label: "環境音の音量を小さく",
                  sub: pct(s.ambientVolume),
                  disabled: !s.sound || !s.ambient || s.ambientVolume <= 0,
                  onPick: () => {
                    setFxSettings({ ambientVolume: step(s.ambientVolume, -1) });
                    playSfx("tag");
                  },
                },
                {
                  id: "set-ambient-vol-up",
                  label: "環境音の音量を大きく",
                  sub: pct(s.ambientVolume),
                  disabled: !s.sound || !s.ambient || s.ambientVolume >= 1,
                  onPick: () => {
                    setFxSettings({ ambientVolume: step(s.ambientVolume, 1) });
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
        </div>
      </BlessingWindow>
      <HintBar bless items={[["Esc", "もどる"]]} />
    </div>
  );
}
