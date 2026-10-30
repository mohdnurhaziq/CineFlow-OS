"use client";

interface SofaMockupProps {
  widthPx: number;
}

export function SofaMockup({ widthPx }: SofaMockupProps) {
  // Real 84" sofa height is ~32 inches => aspect ratio: 32 / 84 ≈ 0.38
  const heightPx = Math.round((32 / 84) * widthPx);

  return (
    <div
      className="relative flex flex-col items-center select-none"
      style={{ width: `${widthPx}px` }}
    >
      {/* Floor Ambient Contact Shadow */}
      <div
        className="absolute -bottom-3 inset-x-6 h-6 bg-black/60 blur-md rounded-full pointer-events-none"
      />

      {/* SVG Modern 3-Seater Living Room Sofa */}
      <svg
        viewBox="0 0 504 192"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-2xl"
        style={{ maxHeight: `${heightPx}px` }}
      >
        <defs>
          {/* Main Fabric Gradient: Warm Charcoal Bouclé */}
          <linearGradient id="sofaBodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2c2c31" />
            <stop offset="60%" stopColor="#212124" />
            <stop offset="100%" stopColor="#171719" />
          </linearGradient>

          {/* Cushion Highlight Gradient */}
          <linearGradient id="cushionGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38383f" />
            <stop offset="50%" stopColor="#2b2b30" />
            <stop offset="100%" stopColor="#1e1e21" />
          </linearGradient>

          {/* Low Track Armrests */}
          <linearGradient id="armGradLeft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3a3a42" />
            <stop offset="60%" stopColor="#29292e" />
            <stop offset="100%" stopColor="#1c1c1f" />
          </linearGradient>

          <linearGradient id="armGradRight" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#3a3a42" />
            <stop offset="60%" stopColor="#29292e" />
            <stop offset="100%" stopColor="#1c1c1f" />
          </linearGradient>

          {/* Tapered Wood/Black Legs */}
          <linearGradient id="legGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1a1a1c" />
            <stop offset="100%" stopColor="#0b0b0c" />
          </linearGradient>
        </defs>

        {/* 4 Tapered Modern Legs */}
        <polygon points="36,170 30,190 38,190 42,170" fill="url(#legGrad)" />
        <polygon points="170,170 166,190 174,190 176,170" fill="url(#legGrad)" />
        <polygon points="328,170 330,190 338,190 334,170" fill="url(#legGrad)" />
        <polygon points="462,170 466,190 474,190 468,170" fill="url(#legGrad)" />

        {/* Sofa Main Backrest Frame */}
        <rect
          x="20"
          y="28"
          width="464"
          height="120"
          rx="12"
          fill="url(#sofaBodyGrad)"
          stroke="#18181b"
          strokeWidth="1.5"
        />

        {/* 3 Upper Back Cushions with Vertical Tailored Seams */}
        <rect
          x="42"
          y="32"
          width="134"
          height="80"
          rx="10"
          fill="url(#cushionGrad)"
          stroke="#1e1e24"
          strokeWidth="1.5"
        />
        <rect
          x="184"
          y="32"
          width="136"
          height="80"
          rx="10"
          fill="url(#cushionGrad)"
          stroke="#1e1e24"
          strokeWidth="1.5"
        />
        <rect
          x="328"
          y="32"
          width="134"
          height="80"
          rx="10"
          fill="url(#cushionGrad)"
          stroke="#1e1e24"
          strokeWidth="1.5"
        />

        {/* Cushion Seam Accents */}
        <path d="M 109 42 L 109 104" stroke="#1f1f23" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
        <path d="M 252 42 L 252 104" stroke="#1f1f23" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
        <path d="M 395 42 L 395 104" stroke="#1f1f23" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />

        {/* Lower Seat Base Frame */}
        <rect
          x="24"
          y="108"
          width="456"
          height="62"
          rx="8"
          fill="url(#sofaBodyGrad)"
        />

        {/* 3 Deep Seat Cushions */}
        <rect
          x="42"
          y="104"
          width="134"
          height="54"
          rx="8"
          fill="url(#cushionGrad)"
          stroke="#27272e"
          strokeWidth="1.2"
        />
        <rect
          x="184"
          y="104"
          width="136"
          height="54"
          rx="8"
          fill="url(#cushionGrad)"
          stroke="#27272e"
          strokeWidth="1.2"
        />
        <rect
          x="328"
          y="104"
          width="134"
          height="54"
          rx="8"
          fill="url(#cushionGrad)"
          stroke="#27272e"
          strokeWidth="1.2"
        />

        {/* Left Track Armrest */}
        <rect
          x="16"
          y="72"
          width="28"
          height="88"
          rx="8"
          fill="url(#armGradLeft)"
          stroke="#1c1c1f"
          strokeWidth="1.5"
        />

        {/* Right Track Armrest */}
        <rect
          x="460"
          y="72"
          width="28"
          height="88"
          rx="8"
          fill="url(#armGradRight)"
          stroke="#1c1c1f"
          strokeWidth="1.5"
        />
      </svg>

      {/* Architectural Scale Anchor Label */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[10px] sm:text-[11px] font-mono text-zinc-400 font-semibold tracking-wider uppercase">
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-500">←</span>
        <span className="px-1 text-zinc-300">84" (213 cm) Living Room Scale Anchor</span>
        <span className="text-zinc-500">→</span>
        <span className="text-zinc-600">|</span>
      </div>
    </div>
  );
}
