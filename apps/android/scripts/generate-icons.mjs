// Renders every Luma icon from one drawing, so the icon is edited in one place: the Android
// launcher, themed and splash bitmaps and the web favicon. Run with `npm run icons` in apps/android,
// then commit the PNGs. A new icon needs a new APK (docs/ANDROID.md release rules).
//
// The style matches the sibling apps (nodecal, maily, atlas, torrential, iris): one flat white
// object on a #2563eb rounded tile, with #1e40af for the dark detail. The mark below is the
// template's placeholder: replace mark() and silhouette() with the app's own drawing.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const res = join(here, '../android/app/src/main/res');
const webPublic = join(here, '../../web/public');

const blue = '#2563eb';
const deep = '#1e40af';

// The mark on a 512 canvas, centred on (256, 256), no wider than markWidth: a white rounded card
// with a deep-blue header bar, a generic "app".
const markWidth = 320;

function mark() {
  return `
    <rect x="96" y="96" width="320" height="320" rx="56" fill="#ffffff"/>
    <rect x="144" y="152" width="224" height="48" rx="16" fill="${deep}"/>
    <rect x="144" y="232" width="144" height="32" rx="12" fill="${blue}"/>
    <rect x="144" y="296" width="184" height="32" rx="12" fill="${blue}"/>`;
}

// Themed icons (Android 13+) are painted in wallpaper colours from alpha alone, so this is one
// silhouette: the card with the bars cut out.
function silhouette() {
  return `
    <mask id="cut">
      <rect x="96" y="96" width="320" height="320" rx="56" fill="#ffffff"/>
      <rect x="144" y="152" width="224" height="48" rx="16" fill="#000000"/>
      <rect x="144" y="232" width="144" height="32" rx="12" fill="#000000"/>
      <rect x="144" y="296" width="184" height="32" rx="12" fill="#000000"/>
    </mask>
    <rect width="512" height="512" fill="#000000" mask="url(#cut)"/>`;
}

function tile(radius) {
  return `<rect width="512" height="512" rx="${radius}" fill="${blue}"/>`;
}

function svg512(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${body}\n</svg>\n`;
}

// The adaptive-icon canvas is 108 units and launchers only promise the central 66-unit circle, so
// the mark is scaled to 56 units wide there (a square's corners reach further than a circle's).
function adaptive(body) {
  const scale = 56 / markWidth;
  const offset = 54 - 256 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><g transform="translate(${offset.toFixed(3)} ${offset.toFixed(3)}) scale(${scale.toFixed(5)})">${body}</g></svg>`;
}

async function png(file, size, source) {
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(file);
}

const favicon = svg512(`\n  ${tile(112)}${mark()}`);
const foreground = adaptive(mark());
const monochrome = adaptive(silhouette());
// Pre-API-26 launchers show the legacy bitmaps as they are, so those carry their own tile.
const legacySquare = svg512(`${tile(112)}${mark()}`);
const legacyRound = svg512(`<circle cx="256" cy="256" r="256" fill="${blue}"/>${mark()}`);

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, scale] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${density}`);
  await png(join(dir, 'ic_launcher_foreground.png'), 108 * scale, foreground);
  await png(join(dir, 'ic_launcher_monochrome.png'), 108 * scale, monochrome);
  await png(join(dir, 'ic_launcher.png'), 48 * scale, legacySquare);
  await png(join(dir, 'ic_launcher_round.png'), 48 * scale, legacyRound);
  await png(join(res, `drawable-${density}`, 'splash_mark.png'), 108 * scale, foreground);
}
await mkdir(webPublic, { recursive: true });
await writeFile(join(webPublic, 'favicon.svg'), favicon);
await png(join(webPublic, 'apple-touch-icon.png'), 180, svg512(`${tile(0)}${mark()}`));
console.log(`Icons written under ${res} and ${webPublic}`);
