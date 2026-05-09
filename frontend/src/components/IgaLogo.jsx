export const IgaLogo = ({ className = "w-full h-full" }) => (
  <svg viewBox="0 0 145 65" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="igaGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e3a8a" /> {/* blue-900 */}
        <stop offset="50%" stopColor="#312e81" /> {/* indigo-900 */}
        <stop offset="100%" stopColor="#0f172a" /> {/* slate-900 */}
      </linearGradient>
      
      <filter id="igaGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.15" />
      </filter>
    </defs>

    <g fill="url(#igaGradient)" stroke="url(#igaGradient)" filter="url(#igaGlow)">
      {/* I - Hollow geometric rectangle */}
      <rect x="5" y="5" width="14" height="45" strokeWidth="4" fill="none" strokeLinejoin="miter" />
      
      {/* G - Geometric circle with inner line */}
      <path 
        d="M 67.5 27.5 L 45 27.5 M 67.5 27.5 A 22.5 22.5 0 1 1 60 10" 
        strokeWidth="4" 
        fill="none" 
        strokeLinecap="square" 
      />
      
      {/* A - Outer triangle and inner solid triangle */}
      <polygon 
        points="95,5 72.5,50 117.5,50" 
        strokeWidth="4" 
        fill="none" 
        strokeLinejoin="miter" 
      />
      <polygon 
        points="95,30 85,50 105,50" 
        fill="url(#igaGradient)" 
        stroke="none"
      />
      
      {/* Dot */}
      <circle cx="132" cy="43" r="4.5" strokeWidth="4" fill="none" />
      
      {/* Bottom Line Tapered */}
      <path d="M 0 58 Q 72.5 55 145 58 Q 72.5 61 0 58 Z" fill="url(#igaGradient)" stroke="none" />
    </g>
  </svg>
);
