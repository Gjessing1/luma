import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from 'react';
import type { Playlist } from '@luma/core/playlist';
import {
  moveInPlaylist,
  playlistOrder,
  removeFromPlaylist,
  setStartTime,
  timeSlots,
} from '@luma/core/playlist-edit';
import type { Wallpaper } from '@luma/core/wallpaper';
import { durationLabel } from './playlist-text';

interface Props {
  playlist: Playlist;
  wallpapers: Wallpaper[];
  thumbnail: (id: string) => string;
  save: (next: Playlist) => string | null;
  open: (id: string) => void;
}
interface Drag {
  from: number;
  to: number;
  offset: number;
}
interface Gesture {
  pointerId: number;
  from: number;
  startY: number;
  startScroll: number;
  lastY: number;
  step: number;
  frame: number;
}
// Space kept clear of the bottom navigation bar when dragging near the bottom of the screen.
const edge = 90;
const bottomEdge = 150;

// The playlist's wallpapers in the order they show. Rows are dragged by their handle (touch and
// mouse) or moved with the arrow keys on a focused handle.
export function PlaylistLineup({ playlist, wallpapers, thumbnail, save, open }: Props) {
  const order = playlistOrder(playlist);
  const timed = playlist.mode === 'timed';
  const slots = timed ? timeSlots(playlist) : [];
  const [drag, setDrag] = useState<Drag | null>(null);
  const [timeError, setTimeError] = useState<{ id: string; message: string } | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    if (!refocus.current) return;
    list.current?.querySelector<HTMLElement>(`[data-handle="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });
  useEffect(() => () => cancelAnimationFrame(gesture.current?.frame ?? 0), []);

  // While dragging, times stay in their places and show what each wallpaper will get.
  let preview = order;
  if (drag && drag.to !== drag.from) {
    preview = [...order];
    const [moved] = preview.splice(drag.from, 1);
    preview.splice(drag.to, 0, moved!);
  }
  function slotFor(id: string) {
    return slots[preview.indexOf(id)];
  }
  function nameOf(id: string): string {
    return wallpapers.find((w) => w.id === id)?.name ?? 'Removed from library';
  }

  function update(state: Gesture) {
    const offset = state.lastY - state.startY + (window.scrollY - state.startScroll);
    const to = Math.max(
      0,
      Math.min(order.length - 1, state.from + Math.round(offset / state.step)),
    );
    setDrag({ from: state.from, to, offset });
  }
  function autoScroll() {
    const state = gesture.current;
    if (!state) return;
    // Scrolls only while the list continues past that edge of the screen.
    const bounds = list.current?.getBoundingClientRect();
    let speed = 0;
    if (state.lastY < edge && bounds && bounds.top < edge)
      speed = -Math.ceil((edge - state.lastY) / 6);
    else if (
      state.lastY > window.innerHeight - bottomEdge &&
      bounds &&
      bounds.bottom > window.innerHeight - bottomEdge
    )
      speed = Math.ceil((state.lastY - (window.innerHeight - bottomEdge)) / 6);
    if (speed !== 0) {
      window.scrollBy(0, speed);
      update(state);
    }
    state.frame = requestAnimationFrame(autoScroll);
  }
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, index: number) {
    if (event.button !== 0 || order.length < 2) return;
    const rows = list.current?.children;
    const first = rows?.[0]?.getBoundingClientRect();
    const second = rows?.[1]?.getBoundingClientRect();
    if (!first || !second) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      from: index,
      startY: event.clientY,
      startScroll: window.scrollY,
      lastY: event.clientY,
      step: second.top - first.top,
      frame: 0,
    };
    gesture.current.frame = requestAnimationFrame(autoScroll);
    setDrag({ from: index, to: index, offset: 0 });
  }
  function moveDrag(event: ReactPointerEvent) {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    state.lastY = event.clientY;
    update(state);
  }
  function endDrag(event: ReactPointerEvent, commit: boolean) {
    const state = gesture.current;
    if (!state || state.pointerId !== event.pointerId) return;
    cancelAnimationFrame(state.frame);
    gesture.current = null;
    if (commit && drag && drag.to !== drag.from) save(moveInPlaylist(playlist, drag.from, drag.to));
    setDrag(null);
  }
  function keyboardMove(event: KeyboardEvent, index: number, id: string) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const to = event.key === 'ArrowUp' ? index - 1 : index + 1;
    event.preventDefault();
    if (to < 0 || to >= order.length) return;
    refocus.current = id;
    save(moveInPlaylist(playlist, index, to));
  }
  function changeTime(id: string, value: string) {
    if (!value) return;
    const taken = order.find((other) => other !== id && playlist.startTimes[other] === value);
    if (taken) {
      setTimeError({ id, message: `“${nameOf(taken)}” already starts at ${value}.` });
      return;
    }
    const error = save(setStartTime(playlist, id, value));
    setTimeError(error ? { id, message: error } : null);
  }
  function rowStyle(index: number) {
    if (!drag) return undefined;
    if (index === drag.from) return { transform: `translateY(${drag.offset}px)` };
    const step = gesture.current?.step ?? 0;
    if (drag.from < drag.to && index > drag.from && index <= drag.to)
      return { transform: `translateY(${-step}px)` };
    if (drag.from > drag.to && index >= drag.to && index < drag.from)
      return { transform: `translateY(${step}px)` };
    return undefined;
  }

  return (
    <ol className={`lineup ${drag ? 'is-dragging' : ''}`} ref={list}>
      {order.map((id, index) => {
        const wallpaper = wallpapers.find((w) => w.id === id);
        const name = nameOf(id);
        const slot = slotFor(id);
        let detail = wallpaper ? `${wallpaper.width} × ${wallpaper.height}` : 'Remove it here';
        if (timed && slot)
          detail = `Until ${slot.end}${slot.end <= slot.start ? ' next day' : ''} · ${durationLabel(slot.minutes)}`;
        return (
          <li
            key={id}
            className={`lineup-row ${drag?.from === index ? 'is-lifted' : ''}`}
            style={rowStyle(index)}
          >
            <button
              className="drag-handle"
              data-handle={id}
              aria-label={`Reorder ${name}, ${index + 1} of ${order.length}. Drag, or use the arrow keys.`}
              disabled={order.length < 2}
              onPointerDown={(event) => startDrag(event, index)}
              onPointerMove={moveDrag}
              onPointerUp={(event) => endDrag(event, true)}
              onPointerCancel={(event) => endDrag(event, false)}
              onKeyDown={(event) => keyboardMove(event, index, id)}
            >
              <svg viewBox="0 0 10 16" aria-hidden="true">
                {[3, 8, 13].map((y) => (
                  <g key={y}>
                    <circle cx="2.5" cy={y} r="1.4" />
                    <circle cx="7.5" cy={y} r="1.4" />
                  </g>
                ))}
              </svg>
            </button>
            {timed ? (
              <input
                type="time"
                className="start-time"
                aria-label={`${name} starts at`}
                value={drag ? (slot?.start ?? '') : (playlist.startTimes[id] ?? '')}
                onChange={(event) => changeTime(id, event.target.value)}
              />
            ) : (
              <span className="lineup-number">{index + 1}</span>
            )}
            <button
              className="lineup-thumb"
              aria-label={`Preview ${name}`}
              disabled={!wallpaper}
              onClick={() => open(id)}
            >
              {wallpaper && <img src={thumbnail(id)} alt="" loading="lazy" />}
            </button>
            <div className="lineup-info">
              <strong className={wallpaper ? '' : 'error'}>{name}</strong>
              <small>{detail}</small>
              {timeError?.id === id && <small className="error">{timeError.message}</small>}
            </div>
            <button
              className="lineup-remove"
              aria-label={`Remove ${name} from ${playlist.name}`}
              onClick={() => save(removeFromPlaylist(playlist, [id]))}
            >
              ×
            </button>
          </li>
        );
      })}
    </ol>
  );
}
