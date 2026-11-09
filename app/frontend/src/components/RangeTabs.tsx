import type { Range } from '../api';

const OPTIONS: { value: Range; label: string }[] = [
  { value: '1h', label: 'Past hour' },
  { value: '24h', label: '24 hours' },
  { value: '3d', label: '3 days' },
];

interface Props {
  value: Range;
  onChange: (range: Range) => void;
}

export default function RangeTabs({ value, onChange }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Time range">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'tab active' : 'tab'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
