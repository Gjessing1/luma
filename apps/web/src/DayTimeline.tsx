import { useEffect, useState } from 'react';
import { toMinutes, type TimeSlot } from '@luma/core/playlist-edit';

interface Props {
  slots: TimeSlot[];
  thumbnail: (id: string) => string;
  name: (id: string) => string;
}
const day = 24 * 60;
// The day as one bar, so it is visible at a glance which wallpaper shows when. The last
// wallpaper runs past midnight until the first start, so its slot is drawn in two parts.
export function DayTimeline({ slots, thumbnail, name }: Props) {
  const now = useMinuteOfDay();
  const parts: { id: string; from: number; to: number }[] = [];
  for (const slot of slots) {
    const from = toMinutes(slot.start);
    const to = from + slot.minutes;
    if (to <= day) parts.push({ id: slot.id, from, to });
    else {
      parts.push({ id: slot.id, from, to: day });
      parts.push({ id: slot.id, from: 0, to: to - day });
    }
  }
  return (
    <figure className="day-timeline" aria-label="Wallpapers through the day">
      <div className="day-bar">
        {parts.map((part) => (
          <span
            key={`${part.id}-${part.from}`}
            className="day-segment"
            title={`${name(part.id)}`}
            style={{
              left: `${(part.from / day) * 100}%`,
              width: `${((part.to - part.from) / day) * 100}%`,
              backgroundImage: `url("${thumbnail(part.id)}")`,
            }}
          />
        ))}
        <span className="day-now" style={{ left: `${(now / day) * 100}%` }} title="Now" />
      </div>
      <div className="day-ticks" aria-hidden="true">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>24</span>
      </div>
    </figure>
  );
}
function useMinuteOfDay(): number {
  const [now, setNow] = useState(minuteOfDay);
  useEffect(() => {
    const timer = setInterval(() => setNow(minuteOfDay()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function minuteOfDay(): number {
  const date = new Date();
  return date.getHours() * 60 + date.getMinutes();
}
