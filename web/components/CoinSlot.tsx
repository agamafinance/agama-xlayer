export function CoinSlot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 600"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <defs>
        {/* Pedestal top */}
        <linearGradient id="pedTop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4A7A60" />
          <stop offset="100%" stopColor="#1F3D31" />
        </linearGradient>
        {/* Pedestal sides */}
        <linearGradient id="pedSide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1F3D31" />
          <stop offset="100%" stopColor="#081912" />
        </linearGradient>
        {/* Sphere */}
        <radialGradient id="sphere" cx="0.32" cy="0.28" r="0.85">
          <stop offset="0%" stopColor="#E6EFE3" />
          <stop offset="20%" stopColor="#A6C2AE" />
          <stop offset="55%" stopColor="#4F8266" />
          <stop offset="100%" stopColor="#14271F" />
        </radialGradient>
        {/* Hole */}
        <radialGradient id="hole" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#020806" />
          <stop offset="80%" stopColor="#081912" />
          <stop offset="100%" stopColor="#14271F" />
        </radialGradient>
      </defs>

      {/* PEDESTAL */}
      {/* Top face (rhombus) */}
      <polygon points="300,200 530,300 300,400 70,300" fill="url(#pedTop)" />
      {/* Right side */}
      <polygon points="530,300 530,360 300,460 300,400" fill="#14271F" />
      {/* Front side (left of right) */}
      <polygon points="300,400 300,460 70,360 70,300" fill="url(#pedSide)" />

      {/* HOLE in pedestal */}
      <ellipse cx="300" cy="300" rx="92" ry="42" fill="url(#hole)" />
      <ellipse cx="300" cy="298" rx="86" ry="38" fill="#040A07" opacity="0.95" />

      {/* SPHERE floating well above the hole */}
      <ellipse cx="300" cy="306" rx="60" ry="10" fill="rgba(0,0,0,0.55)" />
      <circle cx="300" cy="170" r="92" fill="url(#sphere)" />
      <circle
        cx="300"
        cy="170"
        r="92"
        fill="none"
        stroke="rgba(255,255,255,0.20)"
        strokeWidth="1.5"
      />
      {/* Highlight on sphere */}
      <ellipse cx="272" cy="142" rx="30" ry="20" fill="rgba(255,255,255,0.32)" />
    </svg>
  );
}
