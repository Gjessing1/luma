// Prepare licensed phone crops on the host; ffmpeg is not needed in the server image.
// LUMA_DATA_DIR=/path node scripts/import-live-videos.mjs [--keys=id1,id2]
// Existing video IDs are immutable. Publish a new ID to change an existing crop.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseLiveVideo } from '../packages/core/dist/live-wallpaper.js';

if (!process.env.LUMA_DATA_DIR) throw new Error('Set LUMA_DATA_DIR explicitly');
const directory = join(resolve(process.env.LUMA_DATA_DIR), 'live-wallpapers');
const cache = process.env.LUMA_VIDEO_CACHE ?? join(tmpdir(), 'luma-live-video-downloads');
const manifest = JSON.parse(
  await readFile(new URL('./curated-live-videos.json', import.meta.url), 'utf8'),
);
const keys = process.argv
  .find((arg) => arg.startsWith('--keys='))
  ?.slice(7)
  .split(',');
if (keys?.some((id) => !manifest.some((video) => video.id === id)))
  throw new Error('Unknown video key');
const selected = keys ? manifest.filter((video) => keys.includes(video.id)) : manifest;
for (const video of selected) {
  // These values are interpolated into an ffmpeg filter, so accept plain numbers only.
  const { zoom = 1, focusX = 0.5, focusY = 0.5, start, seconds } = video;
  if (![zoom, focusX, focusY, start, seconds].every(Number.isFinite)) throw new Error(video.id);
  if (zoom < 1 || zoom > 3 || [focusX, focusY].some((n) => n < 0 || n > 1) || seconds < 3)
    throw new Error(`Invalid framing for ${video.id}`);
}
await mkdir(directory, { recursive: true });
await mkdir(cache, { recursive: true });
let catalog = [];
try {
  catalog = JSON.parse(await readFile(join(directory, 'catalog.json'), 'utf8')).map(parseLiveVideo);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
for (const video of selected) {
  if (catalog.some((entry) => entry.id === video.id)) {
    console.log(`Already present: ${video.name}`);
    continue;
  }
  const original = join(cache, `${video.id}.source`);
  try {
    await stat(original);
  } catch {
    const temporary = `${original}.download`;
    try {
      execFileSync(
        'curl',
        [
          '--fail',
          '--silent',
          '--show-error',
          '--location',
          '--retry',
          '3',
          '--retry-all-errors',
          '--user-agent',
          'LumaVideoImport/1.0 (https://git.gjessing.io/gjessing1/luma)',
          '--max-time',
          '1800',
          '--max-filesize',
          '1073741824',
          '--output',
          temporary,
          video.downloadUrl,
        ],
        { stdio: 'inherit' },
      );
      await rename(temporary, original);
    } finally {
      await rm(temporary, { force: true });
    }
  }
  const staging = await mkdtemp(join(directory, '.prepare-'));
  try {
    const output = join(staging, 'wallpaper.mp4');
    // A short dissolve blends the end back into the beginning without a hard loop cut.
    const duration = video.seconds - 1;
    // Optional framing: zoom > 1 trims every edge (e.g. burned-in captions); focus 0–1 picks
    // which part of the wide source the portrait crop keeps.
    const zoom = video.zoom ?? 1;
    const focusX = video.focusX ?? 0.5;
    const focusY = video.focusY ?? 0.5;
    const crop =
      `crop=w=trunc(ih/${zoom}*6/13/2)*2:h=trunc(ih/${zoom}/2)*2:` +
      `x=(iw-ow)*${focusX}:y=(ih-oh)*${focusY}`;
    const filters =
      `[0:v]${crop},scale=1080:2340,setsar=1,fps=24,split[body][head];` +
      `[head]trim=duration=1,setpts=PTS-STARTPTS[fade];` +
      `[body]trim=start=1,setpts=PTS-STARTPTS[main];` +
      `[main][fade]xfade=transition=fade:duration=1:offset=${duration - 1},format=yuv420p[v]`;
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-threads',
        '2',
        '-ss',
        String(video.start),
        '-t',
        String(video.seconds),
        '-i',
        original,
        '-filter_complex_threads',
        '1',
        '-filter_complex',
        filters,
        '-map',
        '[v]',
        '-an',
        '-t',
        String(duration),
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        // Dense motion (ocean currents, star fields) would otherwise exceed the 40 MB limit.
        '-maxrate',
        '10M',
        '-bufsize',
        '20M',
        '-threads',
        '2',
        '-movflags',
        '+faststart',
        output,
      ],
      { stdio: 'inherit' },
    );
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-ss',
        '2',
        '-i',
        output,
        '-frames:v',
        '1',
        '-vf',
        'scale=432:936',
        join(staging, 'poster.jpg'),
      ],
      { stdio: 'inherit' },
    );
    const probe = JSON.parse(
      execFileSync(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration:stream=width,height',
          '-of',
          'json',
          output,
        ],
        { encoding: 'utf8' },
      ),
    );
    const bytes = await readFile(output);
    const entry = parseLiveVideo({
      id: video.id,
      name: video.name,
      description: video.description,
      source: video.source,
      licenseUrl: video.licenseUrl,
      changes:
        'Luma adaptation: trimmed, portrait cropped, resized, muted and crossfaded into a loop. Adaptation and poster retain the source license.',
      width: probe.streams[0].width,
      height: probe.streams[0].height,
      duration: Number(probe.format.duration),
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    await writeFile(join(staging, 'credits.json'), JSON.stringify(entry, null, 2) + '\n');
    await rename(staging, join(directory, video.id));
    catalog.push(entry);
    // Publish metadata only after the complete playable files are in place.
    await writeFile(join(directory, '.catalog.tmp'), JSON.stringify(catalog, null, 2) + '\n');
    await rename(join(directory, '.catalog.tmp'), join(directory, 'catalog.json'));
    console.log(
      `Added ${entry.name}: ${entry.width}×${entry.height}, ${entry.duration}s, ${(entry.bytes / 1048576).toFixed(1)} MB`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
