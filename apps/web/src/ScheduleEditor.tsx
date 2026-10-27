import { useState } from 'react';
import type { Playlist } from '@luma/core/playlist';
import { setMode, suggestStartTime, timeSlots } from '@luma/core/playlist-edit';
import { maxTimedWallpapers, type Target } from '@luma/core/wallpaper';
import { DayTimeline } from './DayTimeline';
import { intervalLabel, intervals } from './playlist-text';

interface Props {
  playlist: Playlist;
  save: (next: Playlist) => string | null;
  thumbnail: (id: string) => string;
  name: (id: string) => string;
}
const modes: [Playlist['mode'], string, string][] = [
  ['interval', 'Every…', 'Changes on a timer.'],
  ['daily', 'Set times', 'Moves to the next wallpaper at the same times every day.'],
  [
    'timed',
    'Time of day',
    'Each wallpaper has its own start time and shows until the next one starts. Set the times in the list above.',
  ],
];
const targets: [Target, string][] = [
  ['both', 'Home & lock'],
  ['home', 'Home'],
  ['lock', 'Lock'],
];
export function ScheduleEditor({ playlist, save, thumbnail, name }: Props) {
  const [error, setError] = useState('');
  function saveShown(next: Playlist) {
    setError(save(next) ?? '');
  }
  const description = modes.find(([mode]) => mode === playlist.mode)![2];
  let choices = intervals;
  if (!intervals.some(([n]) => n === playlist.intervalMinutes))
    choices = [...intervals, [playlist.intervalMinutes, intervalLabel(playlist.intervalMinutes)]];
  return (
    <div className="schedule-editor">
      <h3>Show on</h3>
      <Segmented
        label="Show on"
        options={targets}
        value={playlist.target}
        choose={(target) => saveShown({ ...playlist, target })}
      />
      {playlist.target === 'both' && <p className="muted small">The same image on both screens.</p>}
      <h3>Change wallpaper</h3>
      <Segmented
        label="Change wallpaper"
        options={modes.map(([mode, label]) => [mode, label] as [Playlist['mode'], string])}
        value={playlist.mode}
        choose={(mode) => saveShown(setMode(playlist, mode))}
      />
      <p className="muted small">{description}</p>
      {error && <p className="error small">{error}</p>}
      {playlist.mode === 'interval' && (
        <div className="choice-chips" role="radiogroup" aria-label="Interval">
          {choices.map(([minutes, label]) => (
            <button
              key={minutes}
              role="radio"
              aria-checked={playlist.intervalMinutes === minutes}
              className={playlist.intervalMinutes === minutes ? 'chip-on' : ''}
              onClick={() => saveShown({ ...playlist, intervalMinutes: minutes })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {playlist.mode === 'daily' && (
        <DailyTimes
          times={playlist.dailyTimes}
          change={(dailyTimes) => saveShown({ ...playlist, dailyTimes })}
        />
      )}
      {playlist.mode === 'timed' && playlist.ids.length > 0 && (
        <DayTimeline slots={timeSlots(playlist)} thumbnail={thumbnail} name={name} />
      )}
      {playlist.mode === 'timed' && playlist.ids.length > maxTimedWallpapers && (
        <p className="error small">
          Time of day works with up to {maxTimedWallpapers} wallpapers. Remove some or choose
          another schedule.
        </p>
      )}
      {playlist.mode !== 'timed' && (
        <>
          <h3>Order</h3>
          <Segmented
            label="Order"
            options={[
              ['order', 'In order'],
              ['shuffle', 'Shuffle'],
            ]}
            value={playlist.shuffle ? 'shuffle' : 'order'}
            choose={(order) => saveShown({ ...playlist, shuffle: order === 'shuffle' })}
          />
          {playlist.shuffle && (
            <p className="muted small">Never the same wallpaper twice in a row.</p>
          )}
        </>
      )}
    </div>
  );
}
function DailyTimes({ times, change }: { times: string[]; change: (times: string[]) => void }) {
  // Kept unsorted while editing so the input being changed doesn't jump; the phone runs them in
  // clock order regardless.
  function replace(index: number, value: string) {
    if (!value || times.includes(value)) return;
    change(times.map((time, i) => (i === index ? value : time)));
  }
  return (
    <div className="time-chips">
      {times.map((time, index) => (
        <span className="time-chip" key={index}>
          <input
            type="time"
            aria-label={`Change time ${index + 1}`}
            value={time}
            onChange={(event) => replace(index, event.target.value)}
          />
          <button
            aria-label={`Remove ${time}`}
            disabled={times.length < 2}
            onClick={() => change(times.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </span>
      ))}
      <button
        className="add-time"
        disabled={times.length >= 24}
        onClick={() => change([...times, suggestStartTime(times)].sort())}
      >
        + Add time
      </button>
    </div>
  );
}
interface SegmentedProps<T extends string> {
  label: string;
  options: [T, string][];
  value: T;
  choose: (value: T) => void;
}
function Segmented<T extends string>({ label, options, value, choose }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          role="radio"
          aria-checked={value === option}
          className={value === option ? 'segment-on' : ''}
          onClick={() => choose(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
