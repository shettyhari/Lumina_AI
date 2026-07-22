/**
 * LinaLogo — SVG wordmark built from scratch to match the LINA ASSISTANT brand.
 * Colors: purple #8B2FC9, magenta #E91E8C, teal #1BBFD4, orange #FF8C00
 * All strokes use round linecaps so letters have the rounded-pill aesthetic.
 */
export function LinaLogo({
  className,
  showSubtitle = true,
}: {
  className?: string;
  showSubtitle?: boolean;
}) {
  const vbH = showSubtitle ? 450 : 380;

  return (
    <svg
      viewBox={`0 0 960 ${vbH}`}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Lina Assistant"
    >
      <defs>
        {/*
          L vertical stroke is purely vertical (x1=x2=80), so objectBoundingBox
          gives a degenerate zero-width box. Use userSpaceOnUse instead so the
          gradient spans the physical stroke width (x 45–115).
        */}
        <linearGradient
          id="lina-ll-grad"
          x1="45" y1="0" x2="115" y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#8B2FC9" />
          <stop offset="100%" stopColor="#E91E8C" />
        </linearGradient>
        {/* L horizontal: pink → deeper pink (left → right) */}
        <linearGradient
          id="lina-lh-grad"
          x1="80" y1="0" x2="228" y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#E91E8C" />
          <stop offset="100%" stopColor="#C0268A" />
        </linearGradient>
      </defs>

      {/* ── L ── */}
      <line
        x1="80" y1="36" x2="80" y2="298"
        stroke="url(#lina-ll-grad)" strokeWidth="70" strokeLinecap="round"
      />
      <line
        x1="80" y1="334" x2="228" y2="334"
        stroke="url(#lina-lh-grad)" strokeWidth="70" strokeLinecap="round"
      />

      {/* ── I ── */}
      <line
        x1="296" y1="36" x2="296" y2="334"
        stroke="#E91E8C" strokeWidth="70" strokeLinecap="round"
      />

      {/* ── N ── */}
      <line
        x1="364" y1="36" x2="364" y2="334"
        stroke="#1BBFD4" strokeWidth="70" strokeLinecap="round"
      />
      <line
        x1="364" y1="36" x2="506" y2="334"
        stroke="#1BBFD4" strokeWidth="70" strokeLinecap="round"
      />
      <line
        x1="506" y1="36" x2="506" y2="334"
        stroke="#1BBFD4" strokeWidth="70" strokeLinecap="round"
      />

      {/* ── A ── */}
      {/* left leg: purple */}
      <line
        x1="614" y1="334" x2="752" y2="36"
        stroke="#8B2FC9" strokeWidth="70" strokeLinecap="round"
      />
      {/* right leg: teal */}
      <line
        x1="752" y1="36" x2="890" y2="334"
        stroke="#1BBFD4" strokeWidth="70" strokeLinecap="round"
      />
      {/* crossbar at ~62% down from peak — orange, drawn last so it sits on top */}
      <line
        x1="648" y1="222" x2="856" y2="222"
        stroke="#FF8C00" strokeWidth="70" strokeLinecap="round"
      />

      {/* ── ASSISTANT subtitle ── */}
      {showSubtitle && (
        <>
          {/* left decorative line + dot */}
          <line x1="48" y1="412" x2="294" y2="412" stroke="#E91E8C" strokeWidth="2" />
          <circle cx="298" cy="412" r="5" fill="#E91E8C" />

          {/* text */}
          <text
            x="480"
            y="418"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
            fontSize="30"
            fontWeight="500"
            letterSpacing="9"
            fill="#5A5A5A"
          >
            ASSISTANT
          </text>

          {/* right dot + decorative line */}
          <circle cx="662" cy="412" r="5" fill="#1BBFD4" />
          <line x1="666" y1="412" x2="912" y2="412" stroke="#1BBFD4" strokeWidth="2" />
        </>
      )}
    </svg>
  );
}
