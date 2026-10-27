import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import {
  cropRectangle,
  devices,
  maxZoom,
  type Rotation,
  type Wallpaper,
  type WallpaperStyle,
} from '@luma/core/wallpaper';
import { imageUrl, sourceUrl } from './wallpaper-client';
import { S24HomeOverlay } from './S24HomeOverlay';

type Surface = 'home' | 'widgets' | 'work' | 'lock' | 'wallpaper';
type Frame = Pick<WallpaperStyle, 'focalX' | 'focalY' | 'zoom'>;
interface Gesture {
  start: Frame;
  points: Map<number, { x: number; y: number }>;
  origin: Map<number, { x: number; y: number }>;
}
interface Props {
  wallpaper: Wallpaper;
  config: Rotation;
  onFrame?: (frame: Frame) => void;
  children?: ReactNode;
}
export function PhonePreview({ wallpaper, config, onFrame, children }: Props) {
  const [surface, setSurface] = useState<Surface>('home');
  const [agendaRows, setAgendaRows] = useState(0);
  const phone = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const target = imageUrl(wallpaper.id, config);
  // Full renders are large, so request one only once a drag or slider pauses.
  const [exactSrc, setExactSrc] = useState(target);
  const [loadedSrc, setLoadedSrc] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setExactSrc(target), 250);
    return () => clearTimeout(timer);
  }, [target]);
  const profile = devices[config.device];
  const zoom = config.zoom ?? 100;
  const samsungPage =
    config.device === 's24-ultra' &&
    (surface === 'home' || surface === 'widgets' || surface === 'work');
  const surfaces: [Surface, string][] = [
    ['home', 'Home'],
    ['widgets', 'Widgets'],
  ];
  if (config.device === 's24-ultra') surfaces.push(['work', 'Work']);
  surfaces.push(['lock', 'Lock'], ['wallpaper', 'Image']);
  const crop = cropRectangle(
    wallpaper.width,
    wallpaper.height,
    config.device,
    config.focalX,
    config.focalY,
    zoom,
  );
  const now = new Date();
  let caption = 'Example layout · your launcher may differ';
  if (surface === 'wallpaper') {
    caption = 'Wallpaper only';
  } else if (samsungPage) {
    caption = 'Your S24 Ultra layout · measured from your screenshots; content approximated';
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!onFrame || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    const points = new Map(gesture.current?.points);
    points.set(event.pointerId, point);
    // Restart from the current framing whenever a finger joins, so pinch and drag never jump.
    gesture.current = {
      start: { focalX: config.focalX, focalY: config.focalY, zoom },
      points,
      origin: new Map(points),
    };
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!onFrame || !active?.points.has(event.pointerId) || !phone.current) return;
    active.points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const width = phone.current.clientWidth;
    const [first, second] = [...active.points.keys()];
    if (second !== undefined) {
      const ratio =
        distance(active.points.get(first!)!, active.points.get(second)!) /
        Math.max(1, distance(active.origin.get(first!)!, active.origin.get(second)!));
      onFrame({
        ...active.start,
        zoom: clamp(Math.round((active.start.zoom ?? 100) * ratio), 100, maxZoom),
      });
      return;
    }
    const from = active.origin.get(event.pointerId)!;
    const startCrop = cropRectangle(
      wallpaper.width,
      wallpaper.height,
      config.device,
      active.start.focalX,
      active.start.focalY,
      active.start.zoom,
    );
    // Dragging the picture right reveals more of its left side, like moving a photo by hand.
    const sourcePerPixel = startCrop.width / width;
    onFrame({
      ...active.start,
      focalX: pan(
        active.start.focalX,
        event.clientX - from.x,
        sourcePerPixel,
        wallpaper.width - startCrop.width,
      ),
      focalY: pan(
        active.start.focalY,
        event.clientY - from.y,
        sourcePerPixel,
        wallpaper.height - startCrop.height,
      ),
    });
  }
  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const active = gesture.current;
    if (!active) return;
    active.points.delete(event.pointerId);
    if (active.points.size === 0) gesture.current = null;
    else
      gesture.current = {
        start: { focalX: config.focalX, focalY: config.focalY, zoom },
        points: active.points,
        origin: new Map(active.points),
      };
  }
  const blurPixels = ((config.effects.blur / 5) * (phone.current?.clientWidth ?? 210)) / 1440;
  const filters = [`brightness(${1 - config.effects.dim / 100})`];
  if (config.effects.grayscale) filters.push('grayscale(1)');
  if (config.effects.warmth > 0) filters.push(`sepia(${config.effects.warmth / 250})`);
  if (blurPixels > 0) filters.push(`blur(${blurPixels}px)`);
  return (
    <div className="preview-stage">
      <div className="preview-surfaces" role="group" aria-label="Preview screen">
        {surfaces.map(([value, label]) => (
          <button key={value} aria-pressed={surface === value} onClick={() => setSurface(value)}>
            {label}
          </button>
        ))}
      </div>
      {samsungPage && surface === 'widgets' && (
        <label className="preview-agenda-size">
          Extra agenda rows · {agendaRows}
          <input
            type="range"
            min="0"
            max="5"
            value={agendaRows}
            onChange={(event) => setAgendaRows(Number(event.target.value))}
          />
          <span>Approximate growth downward · top and sides stay fixed</span>
        </label>
      )}
      <div
        ref={phone}
        className={`phone-preview ${config.device} ${onFrame ? 'movable' : ''}`}
        aria-label={`${surface} screen preview`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerEnd}
        onPointerCancel={pointerEnd}
      >
        <img
          className="exact-render"
          src={exactSrc}
          alt={wallpaper.name}
          draggable={false}
          onLoad={() => setLoadedSrc(exactSrc)}
        />
        {/* The whole photo, positioned like the crop, answers drags instantly; the exact
            render replaces it once it has loaded. */}
        <img
          className="source-layer"
          src={sourceUrl(wallpaper.id)}
          alt=""
          draggable={false}
          hidden={loadedSrc === target}
          style={{
            width: `${(wallpaper.width / crop.width) * 100}%`,
            height: `${(wallpaper.height / crop.height) * 100}%`,
            left: `${(-crop.left / crop.width) * 100}%`,
            top: `${(-crop.top / crop.height) * 100}%`,
            filter: filters.join(' '),
          }}
        />
        {samsungPage && <S24HomeOverlay page={surface} agendaRows={agendaRows} />}
        {surface !== 'wallpaper' && !samsungPage && (
          <>
            <div className="camera-hole" />
            <div className="preview-status">
              <span>9:41</span>
              <span>▴ ▰</span>
            </div>
            {surface === 'lock' ? (
              <>
                <div className="clock">
                  <span>
                    {now.toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })}
                  </span>
                  <strong>09:41</strong>
                </div>
                <div className="phone-dock">
                  <span>⌕</span>
                  <span>◉</span>
                </div>
              </>
            ) : (
              <>
                <div className="preview-widget">
                  {surface === 'home' ? (
                    <>
                      <strong>☀ 18°</strong>
                      <span>Monday · Clear</span>
                    </>
                  ) : (
                    <>
                      <strong>Today</strong>
                      <span>10:00 · Morning plans</span>
                      <span>14:30 · Coffee</span>
                    </>
                  )}
                </div>
                {surface === 'widgets' && (
                  <div className="preview-music">
                    <span>♫</span>
                    <div>
                      <strong>Now playing</strong>
                      <span>Music widget</span>
                    </div>
                    <span>▶</span>
                  </div>
                )}
                <div
                  className="preview-apps"
                  aria-label="Example apps and folders in the bottom third"
                >
                  {[
                    'Photos',
                    'Tools',
                    'Calendar',
                    'Notes',
                    'Camera',
                    'Social',
                    'Maps',
                    'Settings',
                  ].map((name, index) => (
                    <div className="preview-app" key={name}>
                      <span className={`preview-icon icon-${index}`}>
                        {name === 'Tools' || name === 'Social' ? (
                          <span className="preview-folder">
                            ▪ ▪<br />▪ ▪
                          </span>
                        ) : (
                          ['▧', '', '26', '≡', '◉', '', '↗', '⚙'][index]
                        )}
                      </span>
                      <span>{name}</span>
                    </div>
                  ))}
                  <div className="preview-page-dots">{surface === 'home' ? '● ○' : '○ ●'}</div>
                  <div className="preview-app-dock">
                    {['☎', '✉', '◎', '▧'].map((icon) => (
                      <span key={icon}>{icon}</span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {children}
      <p>
        {profile.width} × {profile.height} · {profile.name}
      </p>
      <p className="preview-caption">{caption}</p>
      <p>
        Source crop: {crop.width} × {crop.height}
      </p>
      {crop.width < profile.width || crop.height < profile.height ? (
        <p className="resolution-note">
          This crop needs enlarging and may look soft on your phone.
        </p>
      ) : null}
    </div>
  );
}
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
function pan(start: number, pixels: number, sourcePerPixel: number, slack: number): number {
  if (slack <= 0) return start;
  return clamp(Math.round((start - ((pixels * sourcePerPixel) / slack) * 100) * 10) / 10, 0, 100);
}
