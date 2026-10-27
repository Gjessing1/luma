import { useRef, useState } from 'react';
import { originalStyle, type Target, type Rotation, type Wallpaper } from '@luma/core/wallpaper';
import { PhonePreview } from './PhonePreview';
import { FramePanel, StylePanel } from './AdjustmentPanels';
import { imageUrl, wallpaperBridge } from './wallpaper-client';
import { useModal } from './useModal';

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
  supportsZoom: boolean;
}
type Tool = 'frame' | 'style' | null;
function savedTool(): Tool {
  try {
    const saved = localStorage.getItem('luma.detailTool');
    return saved === 'frame' || saved === 'style' ? saved : null;
  } catch {
    return null;
  }
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
  supportsZoom,
}: Props) {
  const [undo, setUndo] = useState<Rotation | null>(null);
  const [tool, setTool] = useState<Tool>(savedTool);
  const gesture = useRef<Rotation | null>(null);
  const [target, setTarget] = useState<Target>(() => {
    const saved = localStorage.getItem('luma.applyTarget');
    return saved === 'home' || saved === 'lock' || saved === 'both' ? saved : config.target;
  });
  function change(next: Rotation) {
    setUndo(gesture.current ?? config);
    setConfig(next);
  }
  const dialogRef = useModal(close);
  const bridge = wallpaperBridge();
  function toggle(next: Tool) {
    const value = tool === next ? null : next;
    setTool(value);
    try {
      localStorage.setItem('luma.detailTool', value ?? '');
    } catch {
      // Remembering the open panel is only a convenience.
    }
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
        // One drag of a slider or the preview is one undo step.
        onPointerDownCapture={() => {
          gesture.current ??= config;
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
        <button className="modal-close" onClick={close} aria-label="Close preview">
          ×
        </button>
        <PhonePreview
          wallpaper={w}
          config={config}
          onFrame={(frame) => change({ ...config, ...frame })}
        >
          <div className="tool-bar" role="toolbar" aria-label="Adjust wallpaper">
            <button
              aria-expanded={tool === 'frame'}
              aria-controls="tool-panel"
              onClick={() => toggle('frame')}
            >
              ⤢ Frame
            </button>
            <button
              aria-expanded={tool === 'style'}
              aria-controls="tool-panel"
              onClick={() => toggle('style')}
            >
              ◐ Style
            </button>
            <button
              aria-label="Undo adjustment"
              disabled={!undo}
              onClick={() => {
                if (undo) {
                  setConfig(undo);
                  setUndo(null);
                }
              }}
            >
              ↶ Undo
            </button>
            <button
              aria-label="Reset all adjustments"
              onClick={() => change({ ...config, ...structuredClone(originalStyle) })}
            >
              Reset
            </button>
          </div>
          {tool === 'frame' && (
            <FramePanel wallpaper={w} config={config} change={change} supportsZoom={supportsZoom} />
          )}
          {tool === 'style' && <StylePanel config={config} change={change} />}
          {tool && (
            <p className="tool-hint">
              Saved for this wallpaper on this phone, also when it rotates. Save the playlist again
              to update the phone’s downloaded copies.
            </p>
          )}
        </PhonePreview>
        <div className="detail-controls">
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
          <h3>Set as wallpaper</h3>
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
          {(config.zoom ?? 100) > 100 && !supportsZoom && (
            <p className="resolution-note">
              Update the Android app first: this version applies the photo unzoomed.
            </p>
          )}
          <p className="muted small">
            Apply sets this photo immediately, without Android’s preview. For a moving wallpaper,
            choose one under Library → Live. For Samsung’s photo preview and effects, export to
            Gallery and open the One UI picker below.
          </p>
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
