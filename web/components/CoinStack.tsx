export function CoinStack({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 600"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        {/* Pedestal top */}
        <linearGradient id="bpedTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4A7A60" />
          <stop offset="100%" stopColor="#1F3D31" />
        </linearGradient>
        {/* Pedestal sides */}
        <linearGradient id="bpedSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1F3D31" />
          <stop offset="100%" stopColor="#081912" />
        </linearGradient>
        {/* Hole */}
        <radialGradient id="bhole" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#020806" />
          <stop offset="80%" stopColor="#081912" />
          <stop offset="100%" stopColor="#14271F" />
        </radialGradient>
        {/* Coin top — light green disc */}
        <linearGradient id="coinTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#A6C2AE" />
          <stop offset="55%" stopColor="#6E9A7E" />
          <stop offset="100%" stopColor="#3D6650" />
        </linearGradient>
        {/* Coin edge — darker green for the cylindrical side */}
        <linearGradient id="coinEdge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2F5240" />
          <stop offset="100%" stopColor="#14271F" />
        </linearGradient>
      </defs>

      {/* PEDESTAL */}
      <polygon points="300,200 530,300 300,400 70,300" fill="url(#bpedTop)" />
      <polygon points="530,300 530,360 300,460 300,400" fill="#14271F" />
      <polygon points="300,400 300,460 70,360 70,300" fill="url(#bpedSide)" />

      {/* HOLE in pedestal */}
      <ellipse cx="300" cy="300" rx="92" ry="42" fill="url(#bhole)" />
      <ellipse cx="300" cy="298" rx="86" ry="38" fill="#040A07" opacity="0.95" />

      {/* Soft contact shadow under stack */}
      <ellipse cx="300" cy="296" rx="70" ry="12" fill="rgba(0,0,0,0.45)" />

      {/* STACK OF 3 COINS — bottom to top, each lifted slightly */}
      {/* Bottom coin */}
      <g>
        {/* Side */}
        <path
          d="M 200,200 L 200,224 A 100,32 0 0 0 400,224 L 400,200 A 100,32 0 0 1 200,200 Z"
          fill="url(#coinEdge)"
        />
        {/* Top */}
        <ellipse cx="300" cy="200" rx="100" ry="32" fill="url(#coinTop)" />
        {/* Inner ring for depth */}
        <ellipse
          cx="300"
          cy="200"
          rx="100"
          ry="32"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
      </g>

      {/* Middle coin */}
      <g>
        <path
          d="M 205,150 L 205,174 A 95,30 0 0 0 395,174 L 395,150 A 95,30 0 0 1 205,150 Z"
          fill="url(#coinEdge)"
        />
        <ellipse cx="300" cy="150" rx="95" ry="30" fill="url(#coinTop)" />
        <ellipse
          cx="300"
          cy="150"
          rx="95"
          ry="30"
          fill="none"
          stroke="rgba(255,255,255,0.20)"
          strokeWidth="1"
        />
      </g>

      {/* Top coin */}
      <g>
        <path
          d="M 210,100 L 210,122 A 90,28 0 0 0 390,122 L 390,100 A 90,28 0 0 1 210,100 Z"
          fill="url(#coinEdge)"
        />
        <ellipse cx="300" cy="100" rx="90" ry="28" fill="url(#coinTop)" />
        <ellipse
          cx="300"
          cy="100"
          rx="90"
          ry="28"
          fill="none"
          stroke="rgba(255,255,255,0.22)"
          strokeWidth="1"
        />
        {/* Subtle highlight on top */}
        <ellipse cx="280" cy="92" rx="36" ry="8" fill="rgba(255,255,255,0.28)" />
      </g>
    </svg>
  );
}
