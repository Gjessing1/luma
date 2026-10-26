// Imports the explicitly curated photo list into this household's shared library.
// Run after npm run build and deployment; --download-only prepares previews without touching data.
// --keys=key1,key2 imports only that selection, without restoring previously deleted photos.
import { execFileSync } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const photos = JSON.parse(
  await readFile(new URL('./curated-photos.json', import.meta.url), 'utf8'),
);
const origin = process.env.LUMA_IMPORT_ORIGIN ?? 'http://127.0.0.1:3048';
const cache = join(tmpdir(), 'luma-curated-photos');
const downloadOnly = process.argv.includes('--download-only');
await mkdir(cache, { recursive: true });
async function library() {
  const response = await fetch(`${origin}/api/wallpapers`);
  if (!response.ok) throw new Error(`Library returned ${response.status}`);
  return response.json();
}
const keysArgument = process.argv.find((argument) => argument.startsWith('--keys='));
const keys = keysArgument?.slice('--keys='.length).split(',');
if (keys && keys.some((key) => !photos.some((photo) => photo.key === key)))
  throw new Error('Unknown photo key');
const selected = keys ? photos.filter((photo) => keys.includes(photo.key)) : photos;
const existing = downloadOnly ? [] : await library();
let imported = 0;
for (const photo of selected) {
  if (existing.some((row) => row.source?.url === photo.source.url)) {
    console.log(`Already present: ${photo.name}`);
    continue;
  }
  const file = join(cache, `${photo.key}.image`);
  let image;
  try {
    image = await readFile(file);
  } catch {
    execFileSync(
      'curl',
      [
        '--fail',
        '--silent',
        '--show-error',
        '--location',
        // Wikimedia's robot policy asks automated clients to identify themselves.
        '--user-agent',
        'LumaPhotoImport/1.0 (https://git.gjessing.io/gjessing1/luma)',
        '--max-time',
        '60',
        '--max-filesize',
        '26214400',
        '--output',
        file,
        photo.imageUrl,
      ],
      { stdio: ['ignore', 'inherit', 'inherit'] },
    );
    image = await readFile(file);
  }
  const metadata = await sharp(image, { limitInputPixels: 50_000_000 }).metadata();
  console.log(
    `${photo.name}: ${metadata.width}×${metadata.height}, ${(image.length / 1048576).toFixed(1)} MB`,
  );
  if (downloadOnly) continue;
  const response = await fetch(`${origin}/api/wallpapers`, {
    method: 'POST',
    headers: {
      'Content-Type': `image/${metadata.format}`,
      'X-File-Name': encodeURIComponent(photo.name),
      'X-Wallpaper-Source': encodeURIComponent(JSON.stringify(photo.source)),
    },
    body: image,
  });
  if (!response.ok) throw new Error(`Import failed for ${photo.name}: ${await response.text()}`);
  existing.push(await response.json());
  imported++;
}
if (!downloadOnly)
  console.log(
    `Imported ${imported} photos. Library now contains ${(await library()).length} wallpapers.`,
  );
