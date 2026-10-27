import {
  cropRectangle,
  maxZoom,
  type Effects,
  type Rotation,
  type Wallpaper,
} from '@luma/core/wallpaper';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
  resetLabel: string;
  resetDisabled: boolean;
}
function Slider({
  label,
  value,
  min = 0,
  max = 100,
  disabled = false,
  onChange,
  onReset,
  resetLabel,
  resetDisabled,
}: SliderProps) {
  return (
    <div className="tool-slider">
      <label>
        <span>
          {label} · {Math.round(value)}%
        </span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <button
        className="reset-control"
        aria-label={resetLabel}
        title={resetLabel}
        disabled={resetDisabled}
        onClick={onReset}
      >
        ↺
      </button>
    </div>
  );
}

interface FrameProps {
  wallpaper: Wallpaper;
  config: Rotation;
  change: (next: Rotation) => void;
  supportsZoom: boolean;
}
export function FramePanel({ wallpaper, config, change, supportsZoom }: FrameProps) {
  const zoom = config.zoom ?? 100;
  const crop = cropRectangle(
    wallpaper.width,
    wallpaper.height,
    config.device,
    config.focalX,
    config.focalY,
    zoom,
  );
  const movesX = crop.width < wallpaper.width;
  const movesY = crop.height < wallpaper.height;
  let hint = '';
  if (!movesX && !movesY) hint = 'This photo already fits the screen exactly. Zoom in to move it.';
  else if (!movesX) hint = 'The photo fills the screen width. Zoom in to move it sideways.';
  else if (!movesY) hint = 'The photo fills the screen height. Zoom in to move it up or down.';
  return (
    <div className="tool-panel" id="tool-panel" aria-label="Framing">
      <p className="tool-hint">Drag the preview to move · pinch or use Zoom to enlarge</p>
      <Slider
        label="Zoom"
        value={zoom}
        min={100}
        max={maxZoom}
        onChange={(value) => change({ ...config, zoom: value })}
        onReset={() => change({ ...config, zoom: 100 })}
        resetLabel="Reset zoom"
        resetDisabled={zoom === 100}
      />
      <Slider
        label="Horizontal position"
        value={config.focalX}
        disabled={!movesX}
        onChange={(value) => change({ ...config, focalX: value })}
        onReset={() => change({ ...config, focalX: 50 })}
        resetLabel="Center horizontally"
        resetDisabled={!movesX || config.focalX === 50}
      />
      <Slider
        label="Vertical position"
        value={config.focalY}
        disabled={!movesY}
        onChange={(value) => change({ ...config, focalY: value })}
        onReset={() => change({ ...config, focalY: 50 })}
        resetLabel="Center vertically"
        resetDisabled={!movesY || config.focalY === 50}
      />
      {hint && <p className="tool-hint">{hint}</p>}
      {zoom > 100 && !supportsZoom && (
        <p className="resolution-note">
          Update the Android app to apply zoom. This version applies the photo unzoomed.
        </p>
      )}
      <button
        className="reset-control"
        onClick={() => change({ ...config, focalX: 50, focalY: 50, zoom: 100 })}
      >
        Reset framing
      </button>
    </div>
  );
}

const presets: [string, Effects][] = [
  ['Original', { dim: 0, blur: 0, grayscale: false, warmth: 0 }],
  ['AMOLED night', { dim: 35, blur: 0, grayscale: false, warmth: 0 }],
  ['Soft glass', { dim: 15, blur: 45, grayscale: false, warmth: 15 }],
];
interface StyleProps {
  config: Rotation;
  change: (next: Rotation) => void;
}
export function StylePanel({ config, change }: StyleProps) {
  function effect(key: 'dim' | 'blur' | 'warmth', value: number) {
    change({ ...config, effects: { ...config.effects, [key]: value } });
  }
  const sliders: ['dim' | 'blur' | 'warmth', string][] = [
    ['dim', 'Dim'],
    ['blur', 'Background blur'],
    ['warmth', 'Warmth'],
  ];
  return (
    <div className="tool-panel" id="tool-panel" aria-label="Galaxy styling">
      <div className="effect-presets">
        {presets.map(([name, effects]) => (
          <button key={name} onClick={() => change({ ...config, effects: { ...effects } })}>
            {name}
          </button>
        ))}
      </div>
      {sliders.map(([key, label]) => (
        <Slider
          key={key}
          label={label}
          value={config.effects[key]}
          onChange={(value) => effect(key, value)}
          onReset={() => effect(key, 0)}
          resetLabel={`Reset ${label.toLowerCase()}`}
          resetDisabled={config.effects[key] === 0}
        />
      ))}
      <label className="check-row">
        <input
          type="checkbox"
          checked={config.effects.grayscale}
          onChange={(event) =>
            change({ ...config, effects: { ...config.effects, grayscale: event.target.checked } })
          }
        />
        Grayscale
      </label>
    </div>
  );
}
