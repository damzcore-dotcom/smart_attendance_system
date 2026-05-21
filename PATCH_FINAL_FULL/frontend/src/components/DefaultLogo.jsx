export const DefaultLogo = ({ className = "w-full h-full", color, name }) => {
  const themeColor = color || "#1e3a8a";
  
  // Use first letter of company name, or generic 'C' if undefined
  const initial = name ? name.charAt(0).toUpperCase() : "C";
  // Display name with max length
  const displayName = name || "COMPANY";
  const truncatedName = displayName.length > 12 ? displayName.substring(0, 11) + '...' : displayName;
  
  return (
    <svg viewBox="0 0 145 65" xmlns="http://www.w3.org/2000/svg" className={className}>
      <defs>
        <linearGradient id="defGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={themeColor} /> 
          <stop offset="100%" stopColor="#0f172a" /> 
        </linearGradient>
        <filter id="defGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.15" />
        </filter>
      </defs>

      <g filter="url(#defGlow)">
        {/* Modern App Icon Base */}
        <rect x="5" y="12.5" width="40" height="40" rx="10" fill="url(#defGradient)" />
        {/* Initial Letter */}
        <text x="25" y="40" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="24" fill="#ffffff" textAnchor="middle">{initial}</text>
        
        {/* Company Name */}
        <text x="55" y="32" fontFamily="system-ui, sans-serif" fontWeight="900" fontSize="16" fill={themeColor} letterSpacing="0.5">
          {truncatedName}
        </text>
        <text x="55" y="46" fontFamily="system-ui, sans-serif" fontWeight="600" fontSize="8" fill="#64748b" letterSpacing="1.5">
          WORKSPACE
        </text>
      </g>
    </svg>
  );
};
