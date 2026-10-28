/**
 * SceneBackground（UI-01、README 決まりごと2）：場所ごとの情景を最下層に描く。
 * 見本の SVG（夜明けの街・朝の部屋・夜の鐘楼・机）をそのまま使い、
 * 見本に無い場所は同じ筆致で足す（深層＝地下の闇、など）。
 *
 * P-01（場所と移動）：場所の情景は時間帯（tod）と天候（weather）で変わる。
 * 屋外の場所には空・星・灯り・天候の層が乗り、室内の場所には窓の空と
 * 差し込みの色だけが時間帯に連れる。読みもの用の固定背景（机・夜の窓など）
 * は時間帯に連れない —— 見本の情景そのままを保つ
 */
import type { ReactNode } from "react";
import type { TimeOfDay } from "@trace/core";

export type SceneKind =
  | "town"
  | "dawn"
  | "night"
  | "desk"
  | "plain"
  | "abyss"
  | "forge"
  | "market"
  | "tavern"
  | "guild"
  | "church"
  | "inn"
  | "gate"
  | "home"
  | "forest"
  | "highway"
  | "lake";

/**
 * 時間帯ごとの色票（P-01）。空・遠景〜近景の影・星と灯りの強さ・
 * 室内の壁と窓からの差し込みの色を1枚にまとめる
 */
/** 時間帯の色票（P-01。情景の部品レンダラ（G-05）もここから色を引く） */
export interface Pal {
  /** 空のグラデーション（上→地平） */
  sky: [string, string, string, string];
  /** 遠景・中景・近景の影色 */
  sil: [string, string, string];
  /** 星の強さ（0〜1） */
  stars: number;
  /** 灯り・窓の強さ（0〜1） */
  lamp: number;
  /** 室内の壁のグラデーション（上・下） */
  room: [string, string];
  /** 窓からの差し込みの色 */
  shaft: string;
}

/** 朝（夜明け）：星の残る藍から橙色へ */
const MORNING: Pal = {
  sky: ["#131a35", "#3a3354", "#a5634a", "#e3a466"],
  sil: ["#2b2742", "#1b1829", "#100e18"],
  stars: 0.9,
  lamp: 0.85,
  room: ["#241f30", "#0e0c16"],
  shaft: "#e8b070",
};
/** 昼：青い空と白い地平。灯りは沈む */
const NOON: Pal = {
  sky: ["#223553", "#46608a", "#88a3bd", "#c8d6e0"],
  sil: ["#33405e", "#202a42", "#131a2c"],
  stars: 0,
  lamp: 0.3,
  room: ["#2b2838", "#121019"],
  shaft: "#cfe0e8",
};
/** 夕：茜の空と長い影。灯りが点り始める */
const EVENING: Pal = {
  sky: ["#1a1430", "#47284d", "#a84e3e", "#e2804f"],
  sil: ["#2e2440", "#1c1730", "#100d1c"],
  stars: 0.35,
  lamp: 1,
  room: ["#2a1f2e", "#100c16"],
  shaft: "#e89a5a",
};
/** 夜：月と星。灯りだけが残る */
const NIGHT: Pal = {
  sky: ["#070a18", "#141a30", "#1f2040", "#2b2742"],
  sil: ["#1a1d33", "#10121f", "#0a0c16"],
  stars: 1,
  lamp: 1,
  room: ["#181422", "#0a0810"],
  shaft: "#8fa8d8",
};

/** 時間帯→色票（情景の部品レンダラ（G-05）もここから引く） */
export const PALS: Record<TimeOfDay, Pal> = {
  morning: MORNING,
  noon: NOON,
  evening: EVENING,
  night: NIGHT,
};

/** 天候の霞：空の上に掛かる薄い層（P-01。晴れは掛からない） */
export const VEIL: Record<string, { color: string; op: number }> = {
  cloud: { color: "#6b7480", op: 0.26 },
  rain: { color: "#3a4a5c", op: 0.3 },
  snow: { color: "#9fb2c4", op: 0.28 },
};

/** 星の固定配置（種を持たない飾り。情景の部品レンダラ（G-05）も同じ空を使う） */
export const STARS: readonly [number, number, number][] = [
  [210, 70, 1.4],
  [420, 40, 1],
  [640, 95, 1.2],
  [1010, 55, 1.4],
  [1180, 120, 1],
  [80, 160, 0.9],
  [330, 130, 0.8],
  [760, 60, 1.1],
  [900, 110, 0.9],
  [560, 170, 0.7],
  [1240, 200, 0.8],
  [150, 240, 0.7],
];

/** 天候の動き（P-01）：雨の筋・雪の点・雲の霞。背景SVGの中で動く層（G-05 の情景にも重ねる） */
export function WeatherLayer({ weather }: { weather: string }) {
  if (weather === "rain") {
    // 斜めの雨筋：x32・y80 の格子に配置し (-16,+80) だけ流す（継ぎ目が出ない）
    const lines: ReactNode[] = [];
    for (let c = -2; c <= 43; c++) {
      for (let r = -1; r <= 10; r++) {
        const x = c * 32 + ((r % 3) - 1) * 9;
        const y = r * 80 + ((c * 7) % 37);
        lines.push(
          <line
            key={`${c}:${r}`}
            x1={x}
            y1={y}
            x2={x - 6}
            y2={y + 30}
            stroke="#9fb4cc"
            strokeWidth={1}
            opacity={0.5}
          />,
        );
      }
    }
    return (
      <g className="wx-rain" data-testid="wx-rain">
        {lines}
      </g>
    );
  }
  if (weather === "snow") {
    const dots: ReactNode[] = [];
    for (let c = -2; c <= 16; c++) {
      for (let r = -1; r <= 8; r++) {
        const x = c * 96 + ((r * 31) % 47);
        const y = r * 96 + ((c * 13) % 29);
        dots.push(
          <circle
            key={`${c}:${r}`}
            cx={x}
            cy={y}
            r={(c + r) % 3 === 0 ? 1.8 : 1.1}
            fill="#dfe8f0"
            opacity={0.75}
          />,
        );
      }
    }
    return (
      <g className="wx-snow" data-testid="wx-snow">
        {dots}
      </g>
    );
  }
  if (weather === "cloud") {
    // 曇りは地平に漂う霞の帯（霧の気配）
    return (
      <g className="wx-mist" data-testid="wx-cloud" opacity={0.55}>
        <ellipse cx="240" cy="430" rx="380" ry="60" fill="#7b8492" opacity={0.28} />
        <ellipse cx="760" cy="460" rx="480" ry="70" fill="#7b8492" opacity={0.24} />
        <ellipse cx="1160" cy="420" rx="380" ry="55" fill="#7b8492" opacity={0.26} />
        <ellipse cx="640" cy="500" rx="700" ry="80" fill="#8d95a2" opacity={0.18} />
      </g>
    );
  }
  return null;
}

/** 屋外の場所の空（時間帯のグラデーション＋星・月・天候の層） */
function Sky({ tod, weather }: { tod: TimeOfDay; weather: string }) {
  const p = PALS[tod];
  const veil = VEIL[weather];
  return (
    <>
      <defs>
        <linearGradient id={`sky-${tod}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="0.5" stopColor={p.sky[1]} />
          <stop offset="0.78" stopColor={p.sky[2]} />
          <stop offset="1" stopColor={p.sky[3]} />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill={`url(#sky-${tod})`} />
      {p.stars > 0 && (
        <g opacity={p.stars}>
          {STARS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#f5ead0" />
          ))}
        </g>
      )}
      {tod === "night" && (
        <>
          <defs>
            <radialGradient id="moon-n" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#f6e7c2" stopOpacity="0.45" />
              <stop offset="1" stopColor="#f6e7c2" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="1050" cy="130" r="150" fill="url(#moon-n)" />
          <circle cx="1050" cy="130" r="34" fill="#e8ddb8" opacity="0.8" />
        </>
      )}
      {veil !== undefined && <rect width="1280" height="720" fill={veil.color} opacity={veil.op} />}
      <WeatherLayer weather={weather} />
    </>
  );
}

/** 室内の場所の壁と窓（窓の外だけ時間帯の空が見える） */
function Room({ tod, children }: { tod: TimeOfDay; children?: ReactNode }) {
  const p = PALS[tod];
  return (
    <>
      <defs>
        <linearGradient id={`room-${tod}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.room[0]} />
          <stop offset="1" stopColor={p.room[1]} />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill={`url(#room-${tod})`} />
      {children}
    </>
  );
}

/** 窓：外の空が見える矩形＋差し込みの楔（室内の場所の時間帯表現） */
function Window({
  tod,
  x,
  y,
  w = 220,
  h = 150,
}: {
  tod: TimeOfDay;
  x: number;
  y: number;
  w?: number;
  h?: number;
}) {
  const p = PALS[tod];
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={`url(#sky-${tod})`} opacity={0.85} />
      {/* 窓枠 */}
      <path
        d={`M${x + w / 2} ${y} V${y + h} M${x} ${y + h / 2} H${x + w}`}
        stroke="#0a0c14"
        strokeWidth={8}
      />
      <rect
        x={x - 4}
        y={y - 4}
        width={w + 8}
        height={h + 8}
        fill="none"
        stroke="#0a0c14"
        strokeWidth={8}
      />
      {/* 差し込みの楔：窓の下端から床へ広がる薄い光 */}
      <polygon
        points={`${x},${y + h} ${x + w},${y + h} ${x + w + 120},720 ${x - 120},720`}
        fill={p.shaft}
        opacity={tod === "night" ? 0.05 : 0.09}
      />
    </>
  );
}

export function SceneBackground({
  kind,
  haze = 0,
  tod = "morning",
  weather = "clear",
}: {
  kind: SceneKind;
  /**
   * 危機の段階による景色の霞（W-04、docs/08 §3「景色の差分」）。
   * 0=晴れ 〜 1=強く翳る。派生値は core の crisisSceneHaze が決める
   */
  haze?: number;
  /** 時間帯（P-01）：朝・昼・夕・夜で空と灯りが変わる */
  tod?: TimeOfDay;
  /** 天候（P-01）：weather.json の天候id。晴れ・曇り・雨・雪で空が変わる */
  weather?: string;
}) {
  const p = PALS[tod];
  return (
    <svg
      className="scene"
      width="1280"
      height="720"
      viewBox="0 0 1280 720"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
      data-scene={kind}
      data-tod={tod}
      data-weather={weather}
    >
      {kind === "town" && <Town p={p} tod={tod} weather={weather} />}
      {kind === "gate" && <Gate p={p} tod={tod} weather={weather} />}
      {kind === "market" && <Market p={p} tod={tod} weather={weather} />}
      {kind === "forest" && <Forest p={p} tod={tod} weather={weather} />}
      {kind === "highway" && <Highway p={p} tod={tod} weather={weather} />}
      {kind === "lake" && <Lake p={p} tod={tod} weather={weather} />}
      {kind === "forge" && <Forge p={p} tod={tod} />}
      {kind === "tavern" && <Tavern p={p} tod={tod} />}
      {kind === "guild" && <Guild p={p} tod={tod} />}
      {kind === "church" && <Church p={p} tod={tod} />}
      {kind === "inn" && <Inn p={p} tod={tod} />}
      {kind === "home" && <Home p={p} tod={tod} />}
      {kind === "dawn" && <Dawn />}
      {kind === "night" && <Night />}
      {kind === "desk" && <Desk />}
      {kind === "plain" && <Plain />}
      {kind === "abyss" && <Abyss />}
      {/* 世界の危機の霞：段階が進むほど景色が白く滲み、滅びた世は強く翳る */}
      {haze > 0 && (
        <>
          <rect width="1280" height="720" fill="#aebdc2" opacity={haze * 0.45} />
          <rect width="1280" height="720" fill="#04060b" opacity={haze * 0.22} />
        </>
      )}
    </svg>
  );
}

/** 夜明けの街（Main.html）：星の残る空・シルエットの街並み・灯りの窓・鐘楼。
 *  P-01：色は時間帯の色票（pal）から引く —— 朝の街は夜明け、夜の街は星の下 */
function Town({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      <path
        d="M0 455 L110 410 L230 440 L350 380 L470 430 L600 392 L720 436 L860 384 L990 430 L1120 398 L1280 440 V720 H0 Z"
        fill={p.sil[0]}
      />
      <path
        d="M0 500 H60 V470 L90 445 L120 470 V500 H170 V455 H230 V500 H300 V440 L340 410 L380 440 V500 H460 V465 H520 V500 H600 V450 L640 425 L680 450 V500 H760 V470 H830 V500 H880 V300 L895 280 V230 L930 170 L965 230 V280 L980 300 V500 H1040 V460 L1080 430 L1120 460 V500 H1200 V470 H1280 V720 H0 Z"
        fill={p.sil[1]}
      />
      <rect x="918" y="250" width="24" height="30" fill="#f1c27d" opacity={p.lamp * 0.9} />
      <path
        d="M0 560 H40 V520 L95 478 L150 520 V560 H210 V530 H250 V505 L300 470 L350 505 V560 H420 V540 H470 V512 L520 480 L570 512 V560 H1280 V720 H0 Z"
        fill={p.sil[2]}
      />
      <path
        d="M700 720 V540 L760 500 L820 540 V560 H900 V520 L960 478 L1020 520 V560 H1100 V530 L1160 492 L1220 530 V560 H1280 V720 Z"
        fill={p.sil[2]}
      />
      <rect x="72" y="530" width="10" height="14" fill="#f1c27d" opacity={p.lamp} />
      <rect x="118" y="530" width="10" height="14" fill="#f1c27d" opacity={p.lamp * 0.8} />
      <rect x="286" y="512" width="10" height="14" fill="#f1c27d" opacity={p.lamp} />
      <rect x="510" y="520" width="10" height="14" fill="#f1c27d" opacity={p.lamp * 0.9} />
      <rect x="950" y="528" width="10" height="14" fill="#f1c27d" opacity={p.lamp} />
      <rect x="1150" y="540" width="10" height="14" fill="#f1c27d" opacity={p.lamp * 0.7} />
      <rect x="0" y="640" width="1280" height="80" fill="#08070d" />
    </>
  );
}

/** 街の門（P-01）：石の壁と門のアーチ、外へ抜ける道 */
function Gate({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      {/* 遠景：外の野原と丘 */}
      <path
        d="M0 470 L200 420 L420 460 L640 405 L880 455 L1080 415 L1280 450 V720 H0 Z"
        fill={p.sil[0]}
      />
      {/* 城壁：門の両側に伸びる壁と見張り塔 */}
      <path d="M0 720 V300 H60 V280 H140 V300 H220 V280 H300 V300 H330 V720 Z" fill={p.sil[1]} />
      <path
        d="M950 720 V300 H1000 V280 H1080 V300 H1160 V280 H1240 V300 H1280 V720 Z"
        fill={p.sil[1]}
      />
      {/* 門の塔とアーチ */}
      <path
        d="M330 720 V240 H370 V215 H450 V240 H490 V720 Z M330 340 H490"
        fill={p.sil[1]}
        stroke={p.sil[1]}
      />
      <path d="M790 720 V240 H830 V215 H910 V240 H950 V720 Z M790 340 H950" fill={p.sil[1]} />
      {/* 門の開口（アーチ）と外へ続く道 */}
      <path d="M490 720 V430 Q640 350 790 430 V720 Z" fill={p.sky[1]} opacity={0.9} />
      <path d="M540 720 L610 470 H670 L740 720 Z" fill="#0a0812" opacity={0.55} />
      {/* 塔の窓の灯り */}
      <rect x="400" y="260" width="20" height="28" fill="#f1c27d" opacity={p.lamp} />
      <rect x="860" y="260" width="20" height="28" fill="#f1c27d" opacity={p.lamp} />
      {/* 門脇の松明 */}
      <circle cx="505" cy="480" r="6" fill="#f1c27d" opacity={p.lamp} />
      <circle cx="775" cy="480" r="6" fill="#f1c27d" opacity={p.lamp} />
      <rect x="0" y="640" width="1280" height="80" fill="#08070d" opacity={0.6} />
    </>
  );
}

/** 市場（P-01）：露店の屋根が並ぶ広場 */
function Market({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      <path
        d="M0 460 L160 420 L340 455 L520 415 L720 450 L920 418 L1120 452 L1280 430 V720 H0 Z"
        fill={p.sil[0]}
      />
      {/* 露店の列：支柱＋三角の幌（近景の影色） */}
      <g fill={p.sil[2]}>
        <path d="M60 720 V560 H80 L90 500 H260 L270 560 H290 V720 Z M80 560 L90 500 L260 500 L270 560 Z" />
        <path d="M340 720 V580 H360 L370 520 H540 L550 580 H570 V720 Z" />
        <path d="M640 720 V555 H660 L670 495 H840 L850 555 H870 V720 Z" />
        <path d="M920 720 V575 H940 L950 515 H1120 L1130 575 H1150 V720 Z" />
      </g>
      {/* 幌の縞（空色を僅かに混ぜる） */}
      <g fill={p.sky[2]} opacity={0.55}>
        <path d="M90 500 H120 V530 H92 Z M170 500 H200 V530 H172 Z" />
        <path d="M370 520 H400 V548 H372 Z M450 520 H480 V548 H452 Z" />
        <path d="M670 495 H700 V523 H672 Z M750 495 H780 V523 H752 Z" />
        <path d="M950 515 H980 V543 H952 Z M1030 515 H1060 V543 H1032 Z" />
      </g>
      {/* 店の灯り（夕・夜に点る） */}
      <rect x="130" y="575" width="14" height="18" fill="#f1c27d" opacity={p.lamp} />
      <rect x="420" y="595" width="14" height="18" fill="#f1c27d" opacity={p.lamp * 0.9} />
      <rect x="720" y="570" width="14" height="18" fill="#f1c27d" opacity={p.lamp} />
      <rect x="1000" y="590" width="14" height="18" fill="#f1c27d" opacity={p.lamp * 0.8} />
      <rect x="0" y="650" width="1280" height="70" fill="#08070d" />
    </>
  );
}

/** 近郊の森（P-01）：木々が幾重にも重なる闇 */
function Forest({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      {/* 遠景の稜線 */}
      <path d="M0 500 L240 440 L480 490 L720 445 L980 485 L1280 450 V720 H0 Z" fill={p.sil[0]} />
      {/* 中景の木々（幹＋傘の連なり） */}
      <g fill={p.sil[1]}>
        <path d="M0 720 V430 L60 350 L120 430 V720 Z" />
        <path d="M140 720 V470 L210 380 L280 470 V720 Z" />
        <path d="M320 720 V420 L390 330 L460 420 V720 Z" />
        <path d="M500 720 V460 L570 370 L640 460 V720 Z" />
        <path d="M700 720 V430 L770 340 L840 430 V720 Z" />
        <path d="M880 720 V470 L950 380 L1020 470 V720 Z" />
        <path d="M1060 720 V420 L1130 330 L1200 420 V720 Z" />
      </g>
      {/* 近景の大木（左右に聳える） */}
      <g fill={p.sil[2]}>
        <path d="M-40 720 V380 L80 240 L200 380 V720 Z" />
        <path d="M180 720 V500 L270 390 L360 500 V720 Z" />
        <path d="M980 720 V500 L1070 390 L1160 500 V720 Z" />
        <path d="M1120 720 V360 L1230 230 L1340 360 V720 Z" />
      </g>
      {/* 木の間の灯り（蛍・篝の気配。夜にだけ点く） */}
      {p.lamp > 0.8 && (
        <g fill="#f1c27d" opacity={0.55}>
          <circle cx="450" cy="600" r="3" />
          <circle cx="760" cy="640" r="2.5" />
          <circle cx="920" cy="590" r="3" />
        </g>
      )}
      <rect x="0" y="660" width="1280" height="60" fill="#08070d" />
    </>
  );
}

/** 旧街道（P-01）：石畳の残る道が丘の先へ消える */
function Highway({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      <path d="M0 480 L220 430 L450 470 L700 425 L950 465 L1280 435 V720 H0 Z" fill={p.sil[0]} />
      {/* 疎らな木 */}
      <g fill={p.sil[1]}>
        <path d="M120 720 V480 L190 395 L260 480 V720 Z" />
        <path d="M980 720 V460 L1050 375 L1120 460 V720 Z" />
        <path d="M1140 720 V520 L1190 455 L1240 520 V720 Z" />
      </g>
      {/* 道：地平の一点へ向かう石畳 */}
      <path d="M560 720 L640 470 H700 L860 720 Z" fill={p.sil[2]} />
      <g stroke="#3a3450" strokeWidth={2} opacity={0.5}>
        <path d="M600 660 L780 660 M625 610 L745 610 M648 570 L712 570 M662 535 L695 535" />
      </g>
      {/* 道標の石柱 */}
      <path d="M500 720 V560 H520 V545 H545 V560 H560 V720 Z" fill={p.sil[1]} />
      <rect x="512" y="575" width="12" height="16" fill="#f1c27d" opacity={p.lamp * 0.9} />
      <rect x="0" y="660" width="1280" height="60" fill="#08070d" opacity={0.7} />
    </>
  );
}

/** 湖畔（P-01）：空と対岸と静かな水面 */
function Lake({ p, tod, weather }: { p: Pal; tod: TimeOfDay; weather: string }) {
  return (
    <>
      <Sky tod={tod} weather={weather} />
      {/* 対岸の山影 */}
      <path
        d="M0 470 L200 420 L430 460 L680 415 L920 455 L1150 425 L1280 450 V480 H0 Z"
        fill={p.sil[0]}
      />
      {/* 水面：空の色を弱めて映す */}
      <rect x="0" y="480" width="1280" height="240" fill={p.sky[1]} opacity={0.5} />
      <rect x="0" y="480" width="1280" height="240" fill="#0a0c18" opacity={0.55} />
      {/* 水際の線と揺れる光 */}
      <rect x="0" y="478" width="1280" height="3" fill={p.sky[3]} opacity={0.35} />
      <g fill="#f1c27d" opacity={p.lamp * 0.5}>
        <ellipse cx="640" cy="560" rx="90" ry="4" />
        <ellipse cx="640" cy="600" rx="140" ry="5" />
        <ellipse cx="640" cy="650" rx="200" ry="6" />
      </g>
      {tod === "night" && (
        <ellipse cx="1050" cy="560" rx="60" ry="5" fill="#e8ddb8" opacity={0.35} />
      )}
      {/* 手前の岸と葦 */}
      <path d="M0 720 V670 L160 650 L320 665 L480 655 L640 672 L1280 660 V720 Z" fill={p.sil[2]} />
      <g stroke={p.sil[2]} strokeWidth={4}>
        <path d="M120 660 L116 600 M140 662 L146 590 M180 664 L172 606" />
        <path d="M1100 662 L1096 605 M1130 664 L1136 596 M1170 666 L1162 608" />
      </g>
    </>
  );
}

/** 鍛冶場（P-01）：炉の赤と槌の影 */
function Forge({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      {/* 炉：床の左半分に赤い光を投げる */}
      <defs>
        <radialGradient id="forge-glow" cx="0.32" cy="0.72" r="0.6">
          <stop offset="0" stopColor="#d4692c" stopOpacity="0.5" />
          <stop offset="0.5" stopColor="#8a3a1c" stopOpacity="0.24" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="410" cy="520" rx="420" ry="300" fill="url(#forge-glow)" />
      {/* 炉本体：石の囲いと火口 */}
      <path d="M120 720 V480 L180 420 H420 L480 480 V720 Z" fill="#161020" />
      <path d="M190 720 V540 Q300 490 410 540 V720 Z" fill="#0a070e" />
      <ellipse cx="300" cy="660" rx="80" ry="26" fill="#e8823a" opacity={0.9} />
      <ellipse cx="300" cy="655" rx="46" ry="14" fill="#f6c06a" opacity={0.9} />
      {/* 金床とハンマーの影 */}
      <path d="M620 720 V610 L650 590 H740 L770 610 V720 Z" fill="#0e0b16" />
      <path d="M640 590 H755 L745 575 H650 Z" fill="#0e0b16" />
      <path d="M820 720 V560 H835 V540 L880 500 L895 515 L860 545 V720 Z" fill="#0c0a12" />
      {/* 吊り下げた工具の列 */}
      <g stroke="#241e30" strokeWidth={7}>
        <path d="M560 0 V180 M620 0 V150 M680 0 V190 M740 0 V160" />
      </g>
      <g fill="#241e30">
        <rect x="548" y="180" width="24" height="40" />
        <path d="M608 150 h24 l-6 46 h-12 Z" />
        <rect x="668" y="190" width="24" height="14" />
        <rect x="728" y="160" width="24" height="34" />
      </g>
      {/* 窓：外の空が僅かに見える小窓 */}
      <Window tod={tod} x={980} y={160} w={200} h={130} />
      {/* 壁の燭台 */}
      <circle cx="1060" cy="380" r="7" fill="#f1c27d" opacity={p.lamp} />
      <rect width="1280" height="720" fill="#000" opacity={0.22} />
    </Room>
  );
}

/** 酒場（P-01）： lamp の下のカウンターと樽 */
function Tavern({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      <defs>
        <radialGradient id="tavern-lamp" cx="0.5" cy="0.28" r="0.75">
          <stop offset="0" stopColor="#d8944c" stopOpacity={0.16 + p.lamp * 0.3} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#tavern-lamp)" />
      {/* 吊り lamp の列 */}
      {[300, 640, 980].map((x) => (
        <g key={x}>
          <path d={`M${x} 0 V130`} stroke="#1c1724" strokeWidth={6} />
          <path d={`M${x - 26} 130 h52 l-8 34 h-36 Z`} fill="#1c1724" />
          <ellipse cx={x} cy={164} rx={30} ry={10} fill="#f1c27d" opacity={0.35 + p.lamp * 0.55} />
        </g>
      ))}
      {/* カウンターと棚のボトル */}
      <path d="M0 720 V560 H1280 V720 Z" fill="#120d1a" />
      <path d="M0 560 H1280" stroke="#241c30" strokeWidth={10} />
      <path
        d="M60 200 V420 H560 V200 Z M60 260 H560 M60 340 H560"
        fill="#100c18"
        stroke="#1a1424"
        strokeWidth={6}
      />
      <g fill="#2a2136">
        {[110, 180, 250, 330, 410, 480].map((x, i) => (
          <rect key={i} x={x} y={210 + (i % 2) * 80} width={18} height={46} rx={4} />
        ))}
      </g>
      {/* 樽 */}
      <path d="M760 720 V590 a60 46 0 0 1 120 0 V720 Z" fill="#181020" />
      <path d="M900 720 V610 a52 40 0 0 1 104 0 V720 Z" fill="#140e1c" />
      <path
        d="M770 630 h100 M770 690 h100 M910 650 h84 M910 700 h84"
        stroke="#241c30"
        strokeWidth={5}
      />
      {/* 窓 */}
      <Window tod={tod} x={1060} y={200} w={180} h={130} />
      <rect width="1280" height="720" fill="#000" opacity={0.18} />
    </Room>
  );
}

/** ギルド（P-01）：掲示板と長いテーブルのある広間 */
function Guild({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      {/* 掲示板：壁一面の板と貼り紙 */}
      <path d="M340 120 H940 V470 H340 Z" fill="#161122" />
      <path d="M340 120 H940 V470 H340 Z" fill="none" stroke="#241c30" strokeWidth={10} />
      <g fill="#c9b896" opacity={0.8}>
        {[370, 460, 560, 660, 760, 850].map((x, i) => (
          <rect
            key={i}
            x={x}
            y={150 + ((i * 37) % 160)}
            width={64}
            height={84}
            transform={`rotate(${((i * 13) % 7) - 3} ${x + 32} 200)`}
            opacity={0.5 + (i % 3) * 0.15}
          />
        ))}
      </g>
      {/* 長いテーブルと人影の気配 */}
      <path d="M160 720 V560 H1120 V720 Z" fill="#120d1a" />
      <path d="M160 560 H1120" stroke="#2a2138" strokeWidth={12} />
      <g fill="#0c0914">
        <path d="M240 560 V470 a34 34 0 0 1 68 0 V560 Z" />
        <path d="M530 560 V450 a38 38 0 0 1 76 0 V560 Z" />
        <path d="M880 560 V480 a30 30 0 0 1 60 0 V560 Z" />
      </g>
      {/* 窓と燭台 */}
      <Window tod={tod} x={60} y={150} w={200} h={140} />
      <Window tod={tod} x={1020} y={150} w={200} h={140} />
      <circle cx="170" cy="360" r="7" fill="#f1c27d" opacity={p.lamp} />
      <circle cx="1110" cy="360" r="7" fill="#f1c27d" opacity={p.lamp} />
      <rect width="1280" height="720" fill="#000" opacity={0.2} />
    </Room>
  );
}

/** 教会（P-01）：尖った窓から落ちる光の柱と蝋燭 */
function Church({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      {/* 尖塔窓の列（外の空が見える） */}
      {[160, 460, 760, 1060].map((x) => (
        <g key={x}>
          <path
            d={`M${x} 400 V160 Q${x + 55} 90 ${x + 110} 160 V400 Z`}
            fill={`url(#sky-${tod})`}
            opacity={0.8}
          />
          <path
            d={`M${x} 400 V160 Q${x + 55} 90 ${x + 110} 160 V400 Z M${x + 55} 140 V400 M${x} 280 H${x + 110}`}
            fill="none"
            stroke="#0a0c14"
            strokeWidth={7}
          />
          {/* 床へ落ちる光の楔 */}
          <polygon
            points={`${x},400 ${x + 110},400 ${x + 240},720 ${x - 60},720`}
            fill={p.shaft}
            opacity={tod === "night" ? 0.04 : 0.07}
          />
        </g>
      ))}
      {/* 祭壇と蝋燭 */}
      <path d="M560 720 V500 H720 V720 Z" fill="#100c18" />
      <path d="M540 500 H740" stroke="#241c30" strokeWidth={10} />
      <g fill="#f1c27d" opacity={0.4 + p.lamp * 0.55}>
        {[580, 615, 650, 685].map((x, i) => (
          <g key={i}>
            <rect x={x} y={460 - (i % 2) * 12} width={6} height={26} />
            <circle cx={x + 3} cy={455 - (i % 2) * 12} r={4} />
          </g>
        ))}
      </g>
      {/* 背の高い影の柱 */}
      <path d="M40 720 V120 H110 V720 Z M1170 720 V120 H1240 V720 Z" fill="#0c0914" />
      <rect width="1280" height="720" fill="#000" opacity={0.3} />
    </Room>
  );
}

/** 宿屋（P-01）：窓辺の lamp と床の間 */
function Inn({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      <defs>
        <radialGradient id="inn-lamp" cx="0.7" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#d8944c" stopOpacity={0.14 + p.lamp * 0.26} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#inn-lamp)" />
      {/* 大きな窓（外の街の空） */}
      <Window tod={tod} x={200} y={140} w={260} h={180} />
      {/* 床の間：寝台の影 */}
      <path d="M760 720 V560 Q860 520 1040 560 V720 Z" fill="#100c18" />
      <path d="M780 560 Q860 530 1020 560 L1020 585 Q860 560 780 585 Z" fill="#1c1424" />
      {/* 枕元の灯り */}
      <rect x="700" y="520" width="22" height="34" fill="#1c1724" />
      <ellipse cx="711" cy="520" rx={16} ry={7} fill="#f1c27d" opacity={0.3 + p.lamp * 0.6} />
      {/* 壁の額と鍵 */}
      <rect x="560" y="180" width="110" height="140" fill="none" stroke="#241c30" strokeWidth={6} />
      <path d="M600 720 V470 a26 26 0 0 1 52 0 V720 Z" fill="#0c0914" />
      <rect width="1280" height="720" fill="#000" opacity={0.24} />
    </Room>
  );
}

/** 自宅（P-01）：小さな窓と机と寝床 —— 素朴な一室 */
function Home({ p, tod }: { p: Pal; tod: TimeOfDay }) {
  return (
    <Room tod={tod}>
      <defs>
        <radialGradient id="home-lamp" cx="0.34" cy="0.5" r="0.75">
          <stop offset="0" stopColor="#d8944c" stopOpacity={0.12 + p.lamp * 0.24} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#home-lamp)" />
      {/* 窓 */}
      <Window tod={tod} x={180} y={150} w={230} h={160} />
      {/* 机と椅子 */}
      <path d="M520 720 V540 H840 V720 Z" fill="#100c18" />
      <path d="M520 540 H840" stroke="#2a2138" strokeWidth={10} />
      <path d="M900 720 V600 a40 30 0 0 1 80 0 V720 Z" fill="#0c0914" />
      {/* 机の上の灯りと紙 */}
      <ellipse cx="680" cy="520" rx={70} ry={12} fill="#f1c27d" opacity={0.12 + p.lamp * 0.3} />
      <rect
        x="600"
        y="500"
        width="52"
        height="34"
        fill="#c9b896"
        opacity={0.6}
        transform="rotate(-4 626 517)"
      />
      {/* 奥の寝床 */}
      <path d="M960 720 V580 Q1040 550 1140 580 V720 Z" fill="#0e0b16" />
      {/* 梁と干し草の気配 */}
      <g stroke="#1a1424" strokeWidth={10}>
        <path d="M0 120 H1280 M0 60 H1280" />
      </g>
      <rect width="1280" height="720" fill="#000" opacity={0.24} />
    </Room>
  );
}

/** 朝の部屋（Wake.html）：夜明けの空と窓、奥の柔らかい光 */
function Dawn() {
  return (
    <>
      <defs>
        <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d1426" />
          <stop offset="0.6" stopColor="#2a2a45" />
          <stop offset="1" stopColor="#7c5a52" />
        </linearGradient>
        <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6fd0e3" stopOpacity="0.22" />
          <stop offset="1" stopColor="#6fd0e3" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#dawn)" />
      <path d="M0 720 V430 H180 V250 H460 V430 H1280 V720 Z" fill="#0a0c14" opacity="0.6" />
      <rect x="210" y="280" width="220" height="150" fill="#3b3a5a" opacity="0.55" />
      <path d="M320 280 V430 M210 355 H430" stroke="#0a0c14" strokeWidth="8" />
      <ellipse cx="640" cy="360" rx="520" ry="320" fill="url(#glow)" />
      <rect width="1280" height="720" fill="#03060a" opacity="0.45" />
    </>
  );
}

/** 夜の鐘楼（Notice.html）：月の光と鐘楼のシルエット */
function Night() {
  return (
    <>
      <defs>
        <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#070a18" />
          <stop offset="1" stopColor="#1c1830" />
        </linearGradient>
        <radialGradient id="moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f6e7c2" stopOpacity="0.5" />
          <stop offset="1" stopColor="#f6e7c2" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#night)" />
      <circle cx="640" cy="170" r="260" fill="url(#moon)" />
      <g fill="#f6e7c2" opacity="0.07">
        <polygon points="640,170 560,720 600,720" />
        <polygon points="640,170 660,720 700,720" />
        <polygon points="640,170 760,720 820,720" />
        <polygon points="640,170 420,720 480,720" />
      </g>
      <path d="M560 720 V330 L585 300 V230 L640 120 L695 230 V300 L720 330 V720 Z" fill="#0b0a14" />
      <rect x="618" y="250" width="44" height="54" fill="#1a1828" />
      <path
        d="M0 720 V590 L80 560 L160 590 V560 H260 V600 L340 570 L420 600 V720 Z M860 720 V600 L940 570 L1020 600 V560 H1120 V590 L1200 560 L1280 590 V720 Z"
        fill="#08070e"
      />
      <rect width="1280" height="720" fill="#000" opacity="0.35" />
    </>
  );
}

/** 机（News.html）：ランプの下の木の机 */
function Desk() {
  return (
    <>
      <defs>
        <radialGradient id="lamp" cx="0.5" cy="0.45" r="0.65">
          <stop offset="0" stopColor="#5a3a1e" />
          <stop offset="1" stopColor="#140c06" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#lamp)" />
      <g stroke="#000" strokeOpacity="0.18" strokeWidth={2} fill="none">
        <path d="M0 140 C300 130 600 155 1280 135" />
        <path d="M0 290 C400 300 800 270 1280 295" />
        <path d="M0 440 C350 430 900 460 1280 438" />
        <path d="M0 590 C500 600 800 575 1280 598" />
      </g>
      <g stroke="#000" strokeOpacity="0.35" strokeWidth={3}>
        <path d="M0 215 H1280 M0 365 H1280 M0 515 H1280" />
      </g>
    </>
  );
}

/** 装飾の無い背景（Status.html body の放射グラデ。読みもの中心の画面用） */
function Plain() {
  return (
    <>
      <defs>
        <radialGradient id="plainbg" cx="0.3" cy="0.2" r="0.9">
          <stop offset="0" stopColor="#10222e" />
          <stop offset="0.7" stopColor="#05080d" />
        </radialGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#plainbg)" />
    </>
  );
}

/** 深層（見本に無い場所・同じ筆致で）：闇の中に下りる螺旋の気配 */
function Abyss() {
  return (
    <>
      <defs>
        <radialGradient id="depth" cx="0.5" cy="0.42" r="0.75">
          <stop offset="0" stopColor="#141b2e" />
          <stop offset="0.55" stopColor="#0a0c16" />
          <stop offset="1" stopColor="#04050a" />
        </radialGradient>
        <linearGradient id="drip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a0c16" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#depth)" />
      {/* 層の輪郭：中央に吸い込まれるような同心の環 */}
      <g fill="none" stroke="#1c2438" strokeWidth={2} opacity={0.8}>
        <ellipse cx="640" cy="300" rx="520" ry="200" />
        <ellipse cx="640" cy="310" rx="380" ry="140" />
        <ellipse cx="640" cy="318" rx="250" ry="88" />
        <ellipse cx="640" cy="324" rx="140" ry="46" />
      </g>
      {/* 縄梯子のような垂れ線 */}
      <path d="M640 0 V260" stroke="#1c2438" strokeWidth={3} />
      <path
        d="M628 40 H652 M628 90 H652 M628 140 H652 M628 190 H652 M628 240 H652"
        stroke="#1c2438"
        strokeWidth={2}
      />
      <rect x="0" y="520" width="1280" height="200" fill="url(#drip)" />
    </>
  );
}
