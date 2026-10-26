import { S24LauncherChrome } from './S24LauncherChrome';
import { S24WidgetPage } from './S24WidgetPage';
import { S24WorkPage } from './S24WorkPage';

const folders = [
  { name: '', color: '#273453' },
  { name: 'Shopping', color: '#a1c7d6' },
  { name: 'Creative', color: '#a0ccc0' },
  { name: 'Read & Audio', color: '#9cc7b6' },
  { name: 'Outdoors', color: '#93bdb2' },
  { name: 'Finance', color: '#9bbecb' },
  { name: 'Gaming', color: '#a79bbc' },
  { name: 'Tech & AI', color: '#b49ac5' },
  { name: 'Media & Social', color: '#8e80ac' },
  { name: 'Everyday', color: '#9dbdcd' },
];
const tileColors = ['#2876bd', '#35a26c', '#d45562', '#e5ae42', '#7e64b7', '#f1f0e6'];

export function S24HomeOverlay({
  page = 'home',
  agendaRows = 0,
}: {
  page?: 'home' | 'widgets' | 'work';
  agendaRows?: number;
}) {
  // Coordinates are normalized from the owner's 1440×3120 One UI screenshots.
  // Scale the whole overlay together so spacing stays faithful at every preview size.
  return (
    <svg
      className="s24-home-overlay"
      viewBox="0 0 945 2047.5"
      role="img"
      aria-label={`S24 Ultra ${page} layout with five dock icons and three-button navigation`}
      fontFamily="Arial, sans-serif"
    >
      <S24LauncherChrome page={page} />
      {page === 'widgets' && <S24WidgetPage extraRows={agendaRows} />}
      {page === 'work' && <S24WorkPage />}
      {page === 'home' && (
        <g>
          {folders.map((folder, index) => {
            const x = 57 + (index % 5) * 175;
            const y = index < 5 ? 1117 : 1350;
            return (
              <g className="s24-home-app" key={index} transform={`translate(${x} ${y})`}>
                <rect width="132" height="132" rx="43" fill={folder.color} fillOpacity=".78" />
                {index === 0 ? (
                  <g>
                    <path d="M0 75 30 46 58 70 92 30 132 64v35H0" fill="#737cad" />
                    <path d="m74 49 18-19 21 18-14-5-7 7-8-9z" fill="#d4d8ec" />
                    <path d="M0 98q35-29 68 2t64-7v12q-40 30-72 3T0 115" fill="#3c675d" />
                    <path d="M39 90V44" stroke="#5f5146" strokeWidth="7" />
                    <circle cx="39" cy="47" r="23" fill="#927767" />
                  </g>
                ) : (
                  Array.from({ length: index === 1 ? 5 : 9 }, (_, tile) => (
                    <g
                      key={tile}
                      transform={`translate(${17 + (tile % 3) * 34} ${17 + Math.floor(tile / 3) * 34})`}
                    >
                      <rect
                        width="27"
                        height="27"
                        rx="9"
                        fill={tileColors[(index + tile) % tileColors.length]}
                      />
                      <path
                        d="M8 8h11v11H8zM11 5v17"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        opacity=".8"
                      />
                    </g>
                  ))
                )}
                <text
                  x="66"
                  y="165"
                  textAnchor="middle"
                  fill="white"
                  fontSize="27"
                  stroke="#0005"
                  strokeWidth="1"
                  paintOrder="stroke"
                >
                  {folder.name}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}
