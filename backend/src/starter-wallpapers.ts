// Original vector compositions, rasterized on import at the S24 Ultra's full resolution.
const palettes = [
  {
    name: 'Emerald tide',
    sky: '#091f25',
    glow: '#84bd9c',
    ridge: '#234e49',
    foreground: '#102e32',
  },
  {
    name: 'After the sun',
    sky: '#38283e',
    glow: '#ffb985',
    ridge: '#9c6b82',
    foreground: '#4c3659',
  },
  { name: 'Blue hour', sky: '#101a3c', glow: '#93b9e5', ridge: '#385a99', foreground: '#1a315e' },
  { name: 'Desert silk', sky: '#6c4537', glow: '#f1d2a6', ridge: '#c5956d', foreground: '#855a45' },
  { name: 'Moon garden', sky: '#08191b', glow: '#a9c9ab', ridge: '#31554b', foreground: '#132d29' },
  {
    name: 'Lavender drift',
    sky: '#262138',
    glow: '#c9b0dc',
    ridge: '#746287',
    foreground: '#44394f',
  },
];
export function starterWallpapers() {
  return palettes.map((p, i) => ({
    name: p.name,
    data: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="3120" viewBox="0 0 1440 3120"><defs><linearGradient id="sky" x2=".25" y2="1"><stop stop-color="${p.sky}"/><stop offset=".65" stop-color="${p.glow}"/><stop offset="1" stop-color="${p.ridge}"/></linearGradient><linearGradient id="land" x2=".7" y2="1"><stop stop-color="${p.ridge}"/><stop offset="1" stop-color="${p.foreground}"/></linearGradient><radialGradient id="sun"><stop stop-color="${p.glow}" stop-opacity=".8"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient></defs><rect width="1440" height="3120" fill="url(#sky)"/><circle cx="${420 + i * 100}" cy="1250" r="760" fill="url(#sun)"/><circle cx="${920 - i * 50}" cy="${950 + i * 60}" r="${110 + i * 12}" fill="${p.glow}" opacity=".75"/><path d="M-100 2350 Q300 ${1200 + i * 90} 850 1840 T1550 1460 V3200 H-100Z" fill="url(#land)"/><path d="M-100 2380 Q600 ${1650 + i * 65} 1550 2450 V3200 H-100Z" fill="${p.foreground}" opacity=".6"/><path d="M-100 2820 Q700 ${2150 + i * 50} 1550 2680 V3200 H-100Z" fill="${p.sky}" opacity=".7"/></svg>`,
    ),
  }));
}
