/**
 * Векторные иллюстрации-заглушки вместо фотографий.
 * Заменяются на реальные фото: положите файлы в /public и подставьте <Image />.
 */

export function CowHeadIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 600 400"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Корова голштинской породы"
    >
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fc4e8" />
          <stop offset="70%" stopColor="#cfeaf7" />
        </linearGradient>
        <linearGradient id="field" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8dbf5a" />
          <stop offset="100%" stopColor="#5e9636" />
        </linearGradient>
      </defs>

      <rect width="600" height="400" fill="url(#sky)" />
      <ellipse cx="110" cy="70" rx="70" ry="26" fill="#fff" opacity=".85" />
      <ellipse cx="160" cy="62" rx="46" ry="20" fill="#fff" opacity=".85" />
      <ellipse cx="470" cy="95" rx="80" ry="24" fill="#fff" opacity=".7" />
      <rect y="250" width="600" height="150" fill="url(#field)" />

      {/* уши */}
      <ellipse cx="128" cy="176" rx="66" ry="34" fill="#1b1b1b" transform="rotate(-18 128 176)" />
      <ellipse cx="472" cy="176" rx="66" ry="34" fill="#1b1b1b" transform="rotate(18 472 176)" />
      {/* бирки */}
      <g transform="rotate(-14 150 214)">
        <rect x="118" y="196" width="58" height="42" rx="8" fill="#f2c231" />
        <rect x="126" y="206" width="42" height="5" rx="2.5" fill="#6b5410" opacity=".55" />
        <rect x="126" y="217" width="34" height="5" rx="2.5" fill="#6b5410" opacity=".55" />
      </g>
      <g transform="rotate(14 450 214)">
        <rect x="424" y="196" width="58" height="42" rx="8" fill="#f2c231" />
        <rect x="432" y="206" width="42" height="5" rx="2.5" fill="#6b5410" opacity=".55" />
        <rect x="432" y="217" width="34" height="5" rx="2.5" fill="#6b5410" opacity=".55" />
      </g>

      {/* голова */}
      <path
        d="M300 88c78 0 128 42 134 108 5 56-14 108-42 140-24 27-56 44-92 44s-68-17-92-44c-28-32-47-84-42-140 6-66 56-108 134-108Z"
        fill="#1b1b1b"
      />
      {/* белая проточина */}
      <path
        d="M300 100c34 0 56 22 60 58 3 26-6 46-18 60-14 16-26 22-42 22s-28-6-42-22c-12-14-21-34-18-60 4-36 26-58 60-58Z"
        fill="#fdfdfd"
      />
      <path d="M196 214c22-6 40 6 44 26 4 22-10 36-30 32-22-4-36-22-32-40 2-10 8-16 18-18Z" fill="#fdfdfd" />
      {/* глаза */}
      <ellipse cx="238" cy="212" rx="19" ry="22" fill="#17181a" />
      <ellipse cx="362" cy="212" rx="19" ry="22" fill="#17181a" />
      <circle cx="245" cy="204" r="6" fill="#fff" opacity=".8" />
      <circle cx="369" cy="204" r="6" fill="#fff" opacity=".8" />
      {/* морда */}
      <ellipse cx="300" cy="318" rx="86" ry="62" fill="#f0b8b6" />
      <ellipse cx="300" cy="318" rx="86" ry="62" fill="#000" opacity=".05" />
      <ellipse cx="266" cy="304" rx="16" ry="12" fill="#c98a88" transform="rotate(-12 266 304)" />
      <ellipse cx="334" cy="304" rx="16" ry="12" fill="#c98a88" transform="rotate(12 334 304)" />
      <path
        d="M262 348c14 12 62 12 76 0"
        stroke="#c98a88"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export function CowFullIllustration({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 520 520"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Корова на пастбище"
    >
      <defs>
        <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#79bfe6" />
          <stop offset="100%" stopColor="#d7edf8" />
        </linearGradient>
        <linearGradient id="field2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93c65f" />
          <stop offset="100%" stopColor="#4f8a2f" />
        </linearGradient>
      </defs>

      <rect width="520" height="520" fill="url(#sky2)" />
      <ellipse cx="100" cy="70" rx="64" ry="22" fill="#fff" opacity=".9" />
      <ellipse cx="145" cy="62" rx="42" ry="18" fill="#fff" opacity=".9" />
      <ellipse cx="410" cy="96" rx="72" ry="22" fill="#fff" opacity=".75" />

      {/* дальний лес */}
      <path
        d="M0 250c40-24 70-6 96-22s52-18 84-2 56 4 88-6 62 4 92 18 60 6 88-8 72-6 72-6v40H0v-14Z"
        fill="#4d7a3b"
        opacity=".65"
      />
      <rect y="256" width="520" height="264" fill="url(#field2)" />

      {/* тело */}
      <ellipse cx="262" cy="300" rx="150" ry="92" fill="#1b1b1b" />
      <ellipse cx="300" cy="290" rx="70" ry="60" fill="#fdfdfd" />
      <ellipse cx="200" cy="330" rx="46" ry="38" fill="#fdfdfd" />
      <ellipse cx="336" cy="352" rx="34" ry="26" fill="#fdfdfd" />

      {/* ноги */}
      <rect x="150" y="368" width="26" height="120" rx="10" fill="#1b1b1b" />
      <rect x="200" y="374" width="26" height="114" rx="10" fill="#fdfdfd" stroke="#d8d8d8" />
      <rect x="316" y="372" width="26" height="116" rx="10" fill="#1b1b1b" />
      <rect x="366" y="366" width="26" height="122" rx="10" fill="#fdfdfd" stroke="#d8d8d8" />
      <rect x="148" y="476" width="30" height="18" rx="6" fill="#2b2b2b" />
      <rect x="198" y="476" width="30" height="18" rx="6" fill="#2b2b2b" />
      <rect x="314" y="476" width="30" height="18" rx="6" fill="#2b2b2b" />
      <rect x="364" y="476" width="30" height="18" rx="6" fill="#2b2b2b" />

      {/* вымя */}
      <ellipse cx="330" cy="392" rx="46" ry="30" fill="#f0b8b6" />

      {/* хвост */}
      <path
        d="M404 268c26 14 34 60 22 106"
        stroke="#1b1b1b"
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />

      {/* шея */}
      <path d="M120 196 L206 244 L188 348 L104 288 Z" fill="#1b1b1b" />
      {/* голова */}
      <ellipse cx="42" cy="150" rx="26" ry="13" fill="#1b1b1b" transform="rotate(-22 42 150)" />
      <ellipse cx="152" cy="150" rx="26" ry="13" fill="#1b1b1b" transform="rotate(22 152 150)" />
      <rect x="26" y="154" width="24" height="19" rx="5" fill="#f2c231" transform="rotate(-16 26 154)" />
      <rect x="142" y="154" width="24" height="19" rx="5" fill="#f2c231" transform="rotate(16 142 154)" />
      <ellipse cx="97" cy="166" rx="56" ry="50" fill="#1b1b1b" />
      <ellipse cx="93" cy="158" rx="33" ry="33" fill="#fdfdfd" />
      <ellipse cx="79" cy="158" rx="7.5" ry="9.5" fill="#17181a" />
      <ellipse cx="113" cy="158" rx="7.5" ry="9.5" fill="#17181a" />
      <ellipse cx="97" cy="204" rx="33" ry="23" fill="#f0b8b6" />
      <ellipse cx="85" cy="199" rx="6" ry="5" fill="#c98a88" />
      <ellipse cx="110" cy="199" rx="6" ry="5" fill="#c98a88" />
    </svg>
  )
}
