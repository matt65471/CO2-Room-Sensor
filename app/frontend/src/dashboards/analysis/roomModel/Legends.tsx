// Legend lines under the CO2 and G_est chart headings
import type { DecayVerdict, Occupancy } from '../../../api';
import { OCCUPANCY, VERDICTS } from './colors';

const DECAY_LEGEND: DecayVerdict[] = ['empty', 'settles-above-baseline', 'ventilation', 'irregular'];

// The CO2 falls shaded for estimating λ
export function DecayLegend() {
  return (
    <span className="chart-legend inline legend-line">
      <span className="muted">Shaded falls, used to estimate λ:</span>
      {DECAY_LEGEND.map((v) => (
        <span key={v}>
          <span className="band-swatch" style={{ background: VERDICTS[v].color }} /> {VERDICTS[v].short}
        </span>
      ))}
    </span>
  );
}

// The G_est labels, with the thresholds learned from the data
export function OccupancyLegend({ model }: { model: Occupancy['model'] | null }) {
  const learned: Record<'empty' | 'active' | 'asleep', string> = {
    empty: model ? ` (below ${model.emptyBelow})` : '',
    active: model?.active ? ` (≈ ${model.active.level})` : '',
    asleep: model?.asleep ? ` (≈ ${model.asleep.level})` : '',
  };
  const shown = model && !model.asleep ? (['empty', 'active'] as const) : (['empty', 'active', 'asleep'] as const);
  return (
    <span className="chart-legend inline legend-line">
      <span className="muted" title="Thresholds are learned from the past week, so they adapt to the room and the people in it">
        Labels learned from the data (ppm/h):
      </span>
      {shown.map((l) => (
        <span key={l}>
          <span className="band-swatch" style={{ background: OCCUPANCY[l].color }} /> {OCCUPANCY[l].label}
          {learned[l]}
        </span>
      ))}
      <span>
        <span className="dash-swatch" /> Change of state
      </span>
      {model?.notes.map((n) => (
        <span key={n} className="muted">
          {n}
        </span>
      ))}
    </span>
  );
}
