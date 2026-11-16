import { useEffect, useState } from 'react';

export interface TimeWindow {
  from: Date;
  to: Date;
}

const HOUR = 3600 * 1000;
const PRESETS: { label: string; ms: number }[] = [
  { label: '1 h', ms: HOUR },
  { label: '6 h', ms: 6 * HOUR },
  { label: '24 h', ms: 24 * HOUR },
  { label: '3 d', ms: 72 * HOUR },
  { label: '7 d', ms: 7 * 24 * HOUR },
  { label: '30 d', ms: 30 * 24 * HOUR },
];

// <input type="datetime-local"> works in local time with no zone: "YYYY-MM-DDTHH:mm"
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): Date | null {
  if (!value) return null;
  const d = new Date(value); // parsed as local time
  return Number.isNaN(d.getTime()) ? null : d;
}

export function lastWindow(ms: number): TimeWindow {
  const to = new Date();
  to.setSeconds(0, 0);
  to.setMinutes(to.getMinutes() + 1); // round up so the latest reading is included
  return { from: new Date(to.getTime() - ms), to };
}

interface Props {
  value: TimeWindow;
  onChange: (window: TimeWindow) => void;
}

// Choose the start and end of the period to analyse, or jump to a recent preset
export default function TimeWindowPicker({ value, onChange }: Props) {
  const [fromText, setFromText] = useState(toLocalInput(value.from));
  const [toText, setToText] = useState(toLocalInput(value.to));

  // Keep the inputs in step when a preset (or anything else) changes the window
  useEffect(() => {
    setFromText(toLocalInput(value.from));
    setToText(toLocalInput(value.to));
  }, [value]);

  const from = fromLocalInput(fromText);
  const to = fromLocalInput(toText);
  const problem = !from || !to ? 'Enter a start and end time' : from >= to ? 'Start must be before end' : null;
  const dirty = fromText !== toLocalInput(value.from) || toText !== toLocalInput(value.to);

  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!problem && from && to) onChange({ from, to });
  }

  return (
    <form className="card window-picker" onSubmit={apply}>
      <label>
        <span>From</span>
        <input type="datetime-local" value={fromText} onChange={(e) => setFromText(e.target.value)} />
      </label>
      <label>
        <span>To</span>
        <input type="datetime-local" value={toText} onChange={(e) => setToText(e.target.value)} />
      </label>
      <button type="submit" className="apply" disabled={!!problem || !dirty}>
        Apply
      </button>
      <div className="tabs" role="group" aria-label="Quick ranges">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="tab" onClick={() => onChange(lastWindow(p.ms))}>
            Last {p.label}
          </button>
        ))}
      </div>
      {problem && <span className="muted small">{problem}</span>}
    </form>
  );
}
