import { useEffect, useRef, useState } from 'react';
import { originalStyle, type Target, type Rotation, type Wallpaper } from '@luma/core/wallpaper';
import { PhonePreview } from './PhonePreview';
import { imageUrl, wallpaperBridge } from './wallpaper-client';

interface Props {
  wallpaper: Wallpaper;
  config: Rotation;
  setConfig: (config: Rotation) => void;
  close: () => void;
  busy: boolean;
  run: (action: () => Promise<void>) => void;
  apply: (target: Target) => Promise<void>;
  remove: () => Promise<void>;
  rename: (name: string) => Promise<void>;
}
export function WallpaperDetail({
  wallpaper: w,
  config,
  setConfig,
  close,
  busy,
  run,
  apply,
  remove,
  rename,
}: Props) {
  const [undo, setUndo] = useState<Rotation | null>(null);
  const gesture = useRef<Rotation | null>(null);
  const [target, setTarget] = useState<Target>(() => {
    const saved = localStorage.getItem('luma.applyTarget');
    return saved === 'home' || saved === 'lock' || saved === 'both' ? saved : config.target;
  });
  function change(next: Rotation) {
    setUndo(gesture.current ?? config);
    setConfig(next);
  }
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
      if (event.key !== 'Tab') return;
      const elements = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, select, a[href], summary',
        ) ?? []),
      ];
      const first = elements[0],
        last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener('keydown', keyboard);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  const bridge = wallpaperBridge();
  function effect(key: 'dim' | 'blur' | 'warmth', value: number) {
    change({ ...config, effects: { ...config.effects, [key]: value } });
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={dialogRef}
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Wallpaper preview"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={close} aria-label="Close preview">
          ×
        </button>
        <PhonePreview wallpaper={w} config={config} />
        <div
          className="detail-controls"
          onPointerDownCapture={() => {
            gesture.current = config;
          }}
          onPointerUpCapture={() => {
            gesture.current = null;
          }}
          onPointerCancelCapture={() => {
            gesture.current = null;
          }}
          onKeyDownCapture={() => {
            gesture.current = null;
          }}
        >
          <span className="eyebrow">PREVIEW</span>
          <h2>{w.name}</h2>
          <p className="muted">
            Original {w.width} × {w.height} · {(w.bytes / 1048576).toFixed(1)} MB
          </p>
          {w.source && (
            <p className="photo-credit">
              <a href={w.source.url} target="_blank" rel="noreferrer">
                Photo: {w.source.author} ↗
              </a>
              <span>{w.source.license}</span>
            </p>
          )}
          <label>
            Wallpaper name
            <input
              defaultValue={w.name}
              key={w.id}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== w.name)
                  run(() => rename(e.target.value));
              }}
            />
          </label>
          <p className="muted small">Adjustments are saved for this wallpaper on this phone.</p>
          <div className="button-row adjustment-actions">
            <button
              disabled={!undo}
              onClick={() => {
                if (undo) {
                  setConfig(undo);
                  setUndo(null);
                }
              }}
            >
              Undo adjustment
            </button>
            <button onClick={() => change({ ...config, ...structuredClone(originalStyle) })}>
              Reset all adjustments
            </button>
          </div>
          <h3>Framing</h3>
          <label>
            Horizontal position · {config.focalX}%
            <input
              type="range"
              min="0"
              max="100"
              value={config.focalX}
              onChange={(e) => change({ ...config, focalX: Number(e.target.value) })}
            />
          </label>
          <label>
            Vertical position · {config.focalY}%
            <input
              type="range"
              min="0"
              max="100"
              value={config.focalY}
              onChange={(e) => change({ ...config, focalY: Number(e.target.value) })}
            />
          </label>
          <button
            className="reset-control"
            onClick={() => change({ ...config, focalX: 50, focalY: 50 })}
          >
            Reset position
          </button>
          <h3>Galaxy styling</h3>
          <div className="effect-presets">
            <button
              onClick={() =>
                change({ ...config, effects: { dim: 0, blur: 0, grayscale: false, warmth: 0 } })
              }
            >
              Original
            </button>
            <button
              onClick={() =>
                change({ ...config, effects: { dim: 35, blur: 0, grayscale: false, warmth: 0 } })
              }
            >
              AMOLED night
            </button>
            <button
              onClick={() =>
                change({
                  ...config,
                  effects: { dim: 15, blur: 45, grayscale: false, warmth: 15 },
                })
              }
            >
              Soft glass
            </button>
          </div>
          <label>
            Dim · {config.effects.dim}%
            <input
              type="range"
              value={config.effects.dim}
              onChange={(e) => effect('dim', Number(e.target.value))}
            />
          </label>
          <button
            className="reset-control"
            disabled={config.effects.dim === 0}
            onClick={() => effect('dim', 0)}
          >
            Reset dim
          </button>
          <label>
            Background blur · {config.effects.blur}%
            <input
              type="range"
              value={config.effects.blur}
              onChange={(e) => effect('blur', Number(e.target.value))}
            />
          </label>
          <button
            className="reset-control"
            disabled={config.effects.blur === 0}
            onClick={() => effect('blur', 0)}
          >
            Reset background blur
          </button>
          <label>
            Warmth · {config.effects.warmth}%
            <input
              type="range"
              value={config.effects.warmth}
              onChange={(e) => effect('warmth', Number(e.target.value))}
            />
          </label>
          <button
            className="reset-control"
            disabled={config.effects.warmth === 0}
            onClick={() => effect('warmth', 0)}
          >
            Reset warmth
          </button>
          <label className="check-row">
            <input
              type="checkbox"
              checked={config.effects.grayscale}
              onChange={(e) =>
                change({
                  ...config,
                  effects: { ...config.effects, grayscale: e.target.checked },
                })
              }
            />
            Grayscale
          </label>
          <p className="muted small">
            These adjustments also apply when this wallpaper rotates. Save the playlist again to
            update the phone’s downloaded copies.
          </p>
          <label>
            Apply wallpaper to
            <select
              value={target}
              onChange={(event) => {
                const next = event.target.value as Target;
                setTarget(next);
                localStorage.setItem('luma.applyTarget', next);
              }}
            >
              <option value="home">Home screen</option>
              <option value="lock">Lock screen</option>
              <option value="both">Home & lock screen</option>
            </select>
          </label>
          <button
            className="primary full apply-wallpaper"
            disabled={busy || !bridge}
            onClick={() => run(() => apply(target))}
          >
            Apply to {target === 'both' ? 'home & lock screen' : `${target} screen`}
          </button>
          <details>
            <summary>Samsung Photo ambient & One UI effects</summary>
            <p className="muted small">
              For Samsung weather, motion or frame effects, export the image to Gallery, then choose
              it in Wallpaper and style → Change wallpapers. Photo ambient availability depends on
              your One UI version. Pause Luma’s rotation for that screen to keep Samsung’s effect.
            </p>
            <div className="button-row">
              <button
                disabled={!bridge || busy}
                onClick={() =>
                  run(async () => {
                    await bridge!.exportImage({ id: w.id, config });
                  })
                }
              >
                Export to Gallery
              </button>
              <button
                disabled={!bridge || busy}
                onClick={() =>
                  run(async () => {
                    await bridge!.openWallpaperSettings();
                  })
                }
              >
                Open One UI picker
              </button>
            </div>
          </details>
          <div className="button-row">
            <a href={imageUrl(w.id, config)} download={`${w.name}.jpg`}>
              Download image ↗
            </a>
            <button
              className="danger"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    `Delete “${w.name}” from the shared library? Downloaded phone copies stay until the playlist is saved again.`,
                  )
                )
                  run(remove);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
