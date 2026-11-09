import { METRICS, METRIC_ORDER, type Metric } from '../metrics';

interface Props {
  selected: Metric[];
  onChange: (selected: Metric[]) => void;
}

// Pick any combination of CO2 / temperature / humidity to plot (at least one stays on)
export default function MetricToggle({ selected, onChange }: Props) {
  function toggle(metric: Metric) {
    const next = selected.includes(metric)
      ? selected.filter((m) => m !== metric)
      : METRIC_ORDER.filter((m) => m === metric || selected.includes(m));
    if (next.length > 0) onChange(next);
  }

  return (
    <div className="metric-toggle" role="group" aria-label="Show on graph">
      {METRIC_ORDER.map((m) => {
        const on = selected.includes(m);
        const isLast = on && selected.length === 1;
        return (
          <button
            key={m}
            type="button"
            className={on ? 'chip on' : 'chip'}
            aria-pressed={on}
            disabled={isLast}
            title={isLast ? 'At least one measurement must be shown' : undefined}
            onClick={() => toggle(m)}
            style={{ '--chip-color': METRICS[m].color } as React.CSSProperties}
          >
            <span className="chip-dot" aria-hidden />
            {METRICS[m].label}
          </button>
        );
      })}
    </div>
  );
}
