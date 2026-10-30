import { cx } from "./ui";

/** Simple 2D tutor face. The mouth opens and closes while `speaking`; eyes blink; idle float. */
export function VidyaAvatar({ speaking, listening, size = 112 }: { speaking: boolean; listening?: boolean; size?: number }) {
  const part = { transformBox: "fill-box", transformOrigin: "center" } as const;
  return (
    <div className={cx("relative inline-block animate-float")} style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={speaking ? "Vidya is speaking" : "Vidya"}>
        {/* halo shows when the mic is on */}
        <circle cx="60" cy="60" r="57" style={{ fill: "var(--card)", stroke: listening ? "var(--accent)" : "var(--line)" }} strokeWidth={listening ? 3 : 2} />
        {/* hair back + bun */}
        <circle cx="60" cy="22" r="11" fill="#2B2130" />
        <path d="M28 58c0-22 14-36 32-36s32 14 32 36v18H28z" fill="#2B2130" />
        {/* shoulders / kurta */}
        <path d="M24 112c4-18 18-26 36-26s32 8 36 26z" fill="#F0A070" />
        <path d="M52 87l8 10 8-10" fill="none" stroke="#1A1009" strokeWidth="2" strokeLinecap="round" />
        {/* neck + face */}
        <rect x="53" y="74" width="14" height="14" rx="5" fill="#C98E6B" />
        <ellipse cx="60" cy="58" rx="24" ry="26" fill="#D9A27E" />
        {/* fringe */}
        <path d="M36 52c4-14 14-20 24-20s20 6 24 20c-8-6-16-9-24-9s-16 3-24 9z" fill="#2B2130" />
        {/* bindi */}
        <circle cx="60" cy="47" r="1.8" fill="#C4473A" />
        {/* eyes */}
        <g className="animate-blink" style={part}>
          <ellipse cx="50" cy="57" rx="3" ry="3.6" fill="#1B1418" />
          <ellipse cx="70" cy="57" rx="3" ry="3.6" fill="#1B1418" />
          <circle cx="51" cy="55.8" r="1" fill="#fff" />
          <circle cx="71" cy="55.8" r="1" fill="#fff" />
        </g>
        {/* cheeks */}
        <circle cx="44" cy="66" r="3.5" fill="#E58C77" opacity="0.45" />
        <circle cx="76" cy="66" r="3.5" fill="#E58C77" opacity="0.45" />
        {/* mouth: closed smile when quiet, animated opening when speaking */}
        {speaking ? (
          <ellipse cx="60" cy="71" rx="5.5" ry="4.5" fill="#6E2A2A" className="animate-mouth" style={part} />
        ) : (
          <path d="M53 69q7 6 14 0" fill="none" stroke="#6E2A2A" strokeWidth="2.4" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}
