export function S24LauncherChrome({ page }: { page: 'home' | 'widgets' | 'work' }) {
  return (
    <g>
      <g fill="#333" fontSize="35" fontWeight="600">
        <text x="27" y="58">
          23:12
        </text>
        <text x="750" y="53" fontSize="22">
          5G
        </text>
        <path d="M799 46h7v13h-7zm11-9h7v22h-7zm11-9h7v31h-7z" />
        <rect x="858" y="28" width="55" height="34" rx="17" opacity=".65" />
        <text x="885" y="54" fill="white" textAnchor="middle" fontSize="26">
          49
        </text>
      </g>
      <circle cx="472.5" cy="45" r="10" fill="#080e0a" />
      <g fill="white">
        <path d="m419 1648 9-7 9 7v11h-18z" opacity={page === 'home' ? 1 : 0.5} />
        <circle cx="472" cy="1651" r="9" opacity={page === 'widgets' ? 1 : 0.5} />
        <circle cx="516" cy="1651" r="9" opacity={page === 'work' ? 1 : 0.5} />
      </g>
      {['#14bd4d', '#eeeeea', '#eeeef3', '#100e13', '#c92e36'].map((color, index) => (
        <g className="s24-dock-icon" key={color} transform={`translate(${57 + index * 175} 1744)`}>
          <rect width="132" height="132" rx="43" fill={color} />
          {index === 0 && (
            <path d="M53 30q-22 43 5 75l19-8-7-23-15 2q-4-12 3-24l13 2 8-26z" fill="#d9f4dc" />
          )}
          {index === 1 && <path d="M32 33h68v57H68l-15 19V90H32z" fill="#1671d7" />}
          {index === 2 && (
            <>
              <circle cx="66" cy="66" r="46" fill="#0864db" />
              <path d="m31 81 28-36 21 17 22-14-27 36-21-17z" fill="white" />
            </>
          )}
          {index === 3 && <path d="m68 14 29 43-17 54-39-10-8-40z" fill="#9465d4" />}
          {index === 4 && (
            <>
              <circle cx="66" cy="66" r="49" fill="#eee" />
              <path
                d="m39 49 24 42q4 7 9-1l22-42"
                fill="none"
                stroke="#c92e36"
                strokeWidth="17"
                strokeLinecap="round"
              />
            </>
          )}
        </g>
      ))}
      <g fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M193 1973v33m15-33v33m15-33v33" />
        <rect x="455" y="1972" width="35" height="35" rx="13" />
        <path d="m747 1972-20 18 20 18" />
      </g>
    </g>
  );
}
