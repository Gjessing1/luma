import { useState } from 'react';
import { cropRectangle, devices, type Rotation, type Wallpaper } from '@luma/core/wallpaper';
import { imageUrl } from './wallpaper-client';
import { S24HomeOverlay } from './S24HomeOverlay';

type Surface = 'home' | 'widgets' | 'lock' | 'wallpaper';
export function PhonePreview({ wallpaper, config }: { wallpaper: Wallpaper; config: Rotation }) {
  const [surface, setSurface] = useState<Surface>('home');
  const profile = devices[config.device];
  const samsungHome = config.device === 's24-ultra' && surface === 'home';
  const crop = cropRectangle(
    wallpaper.width,
    wallpaper.height,
    config.device,
    config.focalX,
    config.focalY,
  );
  const now = new Date();
  let caption = 'Example layout · your launcher may differ';
  if (surface === 'wallpaper') {
    caption = 'Wallpaper only';
  } else if (samsungHome) {
    caption = 'Your S24 Ultra layout · measured from your screenshot; icons approximated';
  }
  return (
    <div className="preview-stage">
      <div className="preview-surfaces" role="group" aria-label="Preview screen">
        {(
          [
            ['home', 'Home'],
            ['widgets', 'Widgets'],
            ['lock', 'Lock'],
            ['wallpaper', 'Image'],
          ] as const
        ).map(([value, label]) => (
          <button key={value} aria-pressed={surface === value} onClick={() => setSurface(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className={`phone-preview ${config.device}`} aria-label={`${surface} screen preview`}>
        <img src={imageUrl(wallpaper.id, config)} alt={wallpaper.name} />
        {samsungHome && <S24HomeOverlay />}
        {surface !== 'wallpaper' && !samsungHome && (
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
