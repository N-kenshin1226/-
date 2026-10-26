/**
 * SceneBackground（UI-01、README 決まりごと2）：場所ごとの情景を最下層に描く。
 * まずは見本の SVG（夜明けの街・朝の部屋・夜の鐘楼・机）をそのまま使い、
 * 見本に無い場所は同じ筆致で足す（深層＝地下の闇、など）
 */
export type SceneKind = "town" | "dawn" | "night" | "desk" | "plain" | "abyss";

export function SceneBackground({
  kind,
  haze = 0,
}: {
  kind: SceneKind;
  /**
   * 危機の段階による景色の霞（W-04、docs/08 §3「景色の差分」）。
   * 0=晴れ 〜 1=強く翳る。派生値は core の crisisSceneHaze が決める
   */
  haze?: number;
}) {
  return (
    <svg
      className="scene"
      width="1280"
      height="720"
      viewBox="0 0 1280 720"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      {kind === "town" && <Town />}
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

/** 夜明けの街（Main.html）：星の残る空・シルエットの街並み・灯りの窓・鐘楼 */
function Town() {
  return (
    <>
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#131a35" />
          <stop offset="0.5" stopColor="#3a3354" />
          <stop offset="0.78" stopColor="#a5634a" />
          <stop offset="1" stopColor="#e3a466" />
        </linearGradient>
        <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e3a466" stopOpacity="0" />
          <stop offset="1" stopColor="#e3a466" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#sky)" />
      <circle cx="210" cy="70" r="1.4" fill="#f5ead0" />
      <circle cx="420" cy="40" r="1" fill="#f5ead0" />
      <circle cx="640" cy="95" r="1.2" fill="#f5ead0" />
      <circle cx="1010" cy="55" r="1.4" fill="#f5ead0" />
      <circle cx="1180" cy="120" r="1" fill="#f5ead0" />
      <path
        d="M0 455 L110 410 L230 440 L350 380 L470 430 L600 392 L720 436 L860 384 L990 430 L1120 398 L1280 440 V720 H0 Z"
        fill="#2b2742"
      />
      <path
        d="M0 500 H60 V470 L90 445 L120 470 V500 H170 V455 H230 V500 H300 V440 L340 410 L380 440 V500 H460 V465 H520 V500 H600 V450 L640 425 L680 450 V500 H760 V470 H830 V500 H880 V300 L895 280 V230 L930 170 L965 230 V280 L980 300 V500 H1040 V460 L1080 430 L1120 460 V500 H1200 V470 H1280 V720 H0 Z"
        fill="#1b1829"
      />
      <rect x="918" y="250" width="24" height="30" fill="#f1c27d" opacity="0.85" />
      <rect x="0" y="470" width="1280" height="110" fill="url(#mist)" />
      <path
        d="M0 560 H40 V520 L95 478 L150 520 V560 H210 V530 H250 V505 L300 470 L350 505 V560 H420 V540 H470 V512 L520 480 L570 512 V560 H1280 V720 H0 Z"
        fill="#100e18"
      />
      <path
        d="M700 720 V540 L760 500 L820 540 V560 H900 V520 L960 478 L1020 520 V560 H1100 V530 L1160 492 L1220 530 V560 H1280 V720 Z"
        fill="#100e18"
      />
      <rect x="72" y="530" width="10" height="14" fill="#f1c27d" />
      <rect x="118" y="530" width="10" height="14" fill="#f1c27d" opacity="0.7" />
      <rect x="286" y="512" width="10" height="14" fill="#f1c27d" />
      <rect x="510" y="520" width="10" height="14" fill="#f1c27d" opacity="0.8" />
      <rect x="950" y="528" width="10" height="14" fill="#f1c27d" />
      <rect x="1150" y="540" width="10" height="14" fill="#f1c27d" opacity="0.6" />
      <rect x="0" y="640" width="1280" height="80" fill="#08070d" />
    </>
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
      <g stroke="#000" strokeOpacity="0.18" strokeWidth="2" fill="none">
        <path d="M0 140 C300 130 600 155 1280 135" />
        <path d="M0 290 C400 300 800 270 1280 295" />
        <path d="M0 440 C350 430 900 460 1280 438" />
        <path d="M0 590 C500 600 800 575 1280 598" />
      </g>
      <g stroke="#000" strokeOpacity="0.35" strokeWidth="3">
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
      <g fill="none" stroke="#1c2438" strokeWidth="2" opacity="0.8">
        <ellipse cx="640" cy="300" rx="520" ry="200" />
        <ellipse cx="640" cy="310" rx="380" ry="140" />
        <ellipse cx="640" cy="318" rx="250" ry="88" />
        <ellipse cx="640" cy="324" rx="140" ry="46" />
      </g>
      {/* 縄梯子のような垂れ線 */}
      <path d="M640 0 V260" stroke="#1c2438" strokeWidth="3" />
      <path
        d="M628 40 H652 M628 90 H652 M628 140 H652 M628 190 H652 M628 240 H652"
        stroke="#1c2438"
        strokeWidth="2"
      />
      <rect x="0" y="520" width="1280" height="200" fill="url(#drip)" />
    </>
  );
}
