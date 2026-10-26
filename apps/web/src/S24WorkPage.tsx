const apps = [
  { name: 'Edge', color: '#ebebe8', mark: 'e', ink: '#128fc0' },
  { name: 'CO', color: '#dedbd8', mark: 'CO', ink: '#38224b' },
  { name: 'Zipp | Sticos', color: '#e4e4e0', mark: 'Z', ink: '#737dc3' },
  { name: 'OneDrive', color: '#e8e8e5', mark: '☁', ink: '#147bc6' },
  { name: 'Copilot', color: '#e5e5e1', mark: '◈', ink: '#7f54cc' },
  { name: 'Awaio', color: '#0b9277', mark: 'W', ink: '#e5e5e0' },
  { name: 'Outlook', color: '#e9e9e5', mark: '✉', ink: '#138fd0' },
  { name: 'Teams', color: '#e8e8e4', mark: 'T', ink: '#7a70dd' },
  { name: 'Xledger', color: '#343f96', mark: 'X', ink: '#e9e9e5' },
  { name: 'Izy', color: '#070908', mark: '▥', ink: '#22ab90' },
];

export function S24WorkPage() {
  return (
    <g>
      {/* Keep personal photos out of the bundle while matching the widgets' coverage. */}
      {[
        { x: 57, width: 307 },
        { x: 406, width: 482 },
      ].map(({ x, width }, index) => (
        <g className="s24-photo-widget" key={x} transform={`translate(${x} 640)`}>
          <defs>
            <clipPath id={`s24-photo-${index}`}>
              <rect width={width} height="424" rx="47" />
            </clipPath>
          </defs>
          <rect width={width} height="424" rx="47" fill={index === 0 ? '#9a9689' : '#a0ada0'} />
          <svg
            width={width}
            height="424"
            viewBox="0 0 307 424"
            preserveAspectRatio="none"
            clipPath={`url(#s24-photo-${index})`}
          >
            <path d="m0 290 89-85 78 71 60-45 80 82v73H0z" fill="#526957" />
            <path d="m0 344 77-47 102 52 75-60 53 55v80H0z" fill="#314d43" />
            <circle cx="224" cy="99" r="37" fill="#e1d5b6" />
          </svg>
          <rect x="20" y="321" width="200" height="78" rx="19" fill="#15181999" />
          <text x="36" y="372" fill="white" fontSize="30">
            {index === 0 ? 'Photos' : 'Memories'}
          </text>
        </g>
      ))}
      {apps.map((app, index) => (
        <g
          className="s24-work-app"
          key={app.name}
          transform={`translate(${57 + (index % 5) * 175} ${index < 5 ? 1117 : 1350})`}
        >
          <rect width="132" height="132" rx="43" fill={app.color} />
          <text
            x="66"
            y="91"
            fill={app.ink}
            textAnchor="middle"
            fontSize={app.mark.length > 1 ? 55 : 86}
            fontWeight="700"
          >
            {app.mark}
          </text>
          {index !== 9 && (
            <g fill="#1674de" stroke="white" strokeWidth="6">
              <circle cx="105" cy="105" r="26" fill="white" stroke="none" />
              <rect x="90" y="96" width="30" height="23" rx="4" stroke="none" />
              <path d="M100 96v-7h10v7" fill="none" stroke="#1674de" strokeWidth="4" />
            </g>
          )}
          <text
            x="66"
            y="165"
            fill="white"
            textAnchor="middle"
            fontSize="27"
            stroke="#0005"
            strokeWidth="1"
            paintOrder="stroke"
          >
            {app.name}
          </text>
        </g>
      ))}
    </g>
  );
}
