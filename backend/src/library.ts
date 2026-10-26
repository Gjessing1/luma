import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { Wallpaper, WallpaperSource } from '@luma/core/wallpaper';

export class Library {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(readonly directory: string) {}
  file(id: string) {
    return join(this.directory, `${id}.jpg`);
  }
  async list(): Promise<Wallpaper[]> {
    try {
      return JSON.parse(
        await readFile(join(this.directory, 'library.json'), 'utf8'),
      ) as Wallpaper[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => {});
    return result;
  }
  private async save(rows: Wallpaper[]) {
    const temporary = join(this.directory, '.library.tmp');
    await writeFile(temporary, JSON.stringify(rows));
    await rename(temporary, join(this.directory, 'library.json'));
  }
  async add(data: Buffer, name: string, source?: WallpaperSource): Promise<Wallpaper> {
    // Decode, orient and re-encode on ingestion: no executable uploads or EXIF location metadata.
    const image = await sharp(data, { limitInputPixels: 50_000_000, animated: false })
      .rotate()
      .resize({ width: 6000, height: 6000, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 94 })
      .toBuffer({ resolveWithObject: true });
    return this.mutate(async () => {
      await mkdir(this.directory, { recursive: true });
      const row: Wallpaper = {
        id: randomUUID(),
        name: name.slice(0, 120) || 'Untitled wallpaper',
        width: image.info.width,
        height: image.info.height,
        bytes: image.data.length,
        favorite: false,
        createdAt: new Date().toISOString(),
        ...(source ? { source } : {}),
      };
      await writeFile(this.file(row.id), image.data);
      await this.save([row, ...(await this.list())]);
      return row;
    });
  }
  async update(id: string, changes: { name?: string; favorite?: boolean }) {
    return this.mutate(async () => {
      const rows = await this.list();
      const row = rows.find((item) => item.id === id);
      if (!row) return null;
      Object.assign(row, changes);
      await this.save(rows);
      return row;
    });
  }
  async remove(id: string) {
    return this.mutate(async () => {
      const rows = await this.list();
      if (!rows.some((row) => row.id === id)) return false;
      await this.save(rows.filter((row) => row.id !== id));
      await unlink(this.file(id)).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
      });
      return true;
    });
  }
}
