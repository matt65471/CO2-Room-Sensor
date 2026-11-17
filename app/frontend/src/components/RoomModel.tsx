// Room-model pieces for the Data Analysis tab: the λ summary, the decay legend and the decay list,
// and the empty / active / asleep labels for G_est
import type { DecayVerdict, Occupancy, OccupancyEventType, OccupancyLabel, RoomModel } from '../api';

// Colours and names for the G_est labels, and the dashed event lines between them
export const OCCUPANCY: Record<OccupancyLabel, { label: string; color: string }> = {
  empty: { label: 'Empty', color: '#8a8f98' },
  active: { label: 'Active', color: '#f59f00' },
  asleep: { label: 'Asleep', color: '#5c7cfa' },
  unknown: { label: 'No data', color: 'transparent' },
};

// Each event's line takes the colour of the state it starts
export const EVENTS: Record<OccupancyEventType, { label: string; to: OccupancyLabel }> = {
  arrived: { label: 'Arrived', to: 'active' },
  left: { label: 'Left', to: 'empty' },
  'fell-asleep': { label: 'Asleep', to: 'asleep' },
  'woke-up': { label: 'Awake', to: 'active' },
};

// Legend for the G_est labels, with the thresholds learned from the past week
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

// How each kind of CO2 fall is shaded on the CO2 chart and described in the list
// (`short` is for the chart legend, `label` for the decay list)
export const VERDICTS: Record<DecayVerdict, { label: string; short: string; color: string }> = {
  empty: { label: 'Empty-room decay (used for λ)', short: 'Empty (used for λ)', color: '#1f8a4c' },
  'settles-above-baseline': {
    label: 'Fall that levelled off (not used for λ due to person in the room)',
    short: 'Fall that levelled off (not used for λ due to person in the room)',
    color: '#8b5cf6',
  },
  ventilation: { label: 'Unusually fast (door/window open)', short: 'Door/window open', color: '#2f7de1' },
  irregular: { label: 'Not a clean decay', short: 'Not used', color: '#8a8f98' },
  inconclusive: { label: 'Too short to judge', short: 'Not used', color: '#8a8f98' },
};

const LEGEND: DecayVerdict[] = ['empty', 'settles-above-baseline', 'ventilation', 'irregular'];

function formatDuration(hours: number): string {
  const mins = Math.round(hours * 60);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const day = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });

export function DecayLegend() {
  return (
    <span className="chart-legend inline legend-line">
      <span className="muted">Shaded falls, used to estimate λ:</span>
      {LEGEND.map((v) => (
        <span key={v}>
          <span className="band-swatch" style={{ background: VERDICTS[v].color }} /> {VERDICTS[v].short}
        </span>
      ))}
    </span>
  );
}

interface SummaryProps {
  model: RoomModel | null;
  showDecays: boolean;
  onShowDecays: (show: boolean) => void;
  showLabels: boolean;
  onShowLabels: (show: boolean) => void;
}

// λ, the baseline and what they were learned from; sits beside the G_est chart, which uses them
export function RoomModelSummary({ model, showDecays, onShowDecays, showLabels, onShowLabels }: SummaryProps) {
  if (!model) return <p className="muted small">Estimating room air-change rate…</p>;
  const { lambdaPerHour: lambda, halfLifeHours, baselinePpm, samples } = model;

  return (
    <div className="room-summary">
      <table className="stats compact">
        <tbody>
          <tr>
            <th scope="row" title="Air changes per hour: room volumes of fresh air through the room each hour">
              λ
            </th>
            <td>{lambda === null ? '—' : `${lambda.toFixed(2)} /h`}</td>
          </tr>
          <tr>
            <th scope="row" title="How long the excess CO₂ over baseline takes to halve once the room is empty">
              Excess halves in
            </th>
            <td>{halfLifeHours === null ? '—' : formatDuration(halfLifeHours)}</td>
          </tr>
          <tr>
            <th scope="row" title="The level the room reaches when fully aired out">
              Baseline C<sub>out</sub>
            </th>
            <td>{baselinePpm === null ? '—' : `${baselinePpm} ppm`}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        {samples > 0
          ? `From ${samples} empty-room decay${samples === 1 ? '' : 's'}, ${day(model.from)} – ${day(model.to)}`
          : `No clean empty-room decays ${day(model.from)} – ${day(model.to)}. Leave the room empty for an hour or more.`}
      </p>
      <div className="toggles">
        <label className="lambda-toggle">
          <input type="checkbox" checked={showDecays} onChange={(e) => onShowDecays(e.target.checked)} />
          <span>Shade CO₂ decays</span>
        </label>
        <label className="lambda-toggle">
          <input type="checkbox" checked={showLabels} onChange={(e) => onShowLabels(e.target.checked)} />
          <span>
            Label G<sub>est</sub>
          </span>
        </label>
      </div>
    </div>
  );
}

// Every CO2 fall considered for λ, with its numbers and verdict (collapsed by default)
export function DecayTable({ model }: { model: RoomModel | null }) {
  if (!model || model.decays.length === 0) return null;
  return (
    <details className="card decay-details">
      <summary className="small">Every CO₂ fall considered for λ ({model.decays.length})</summary>
      <div className="decay-scroll">
        <table className="decays">
          <thead>
            <tr>
              <th>Start</th>
              <th>Length</th>
              <th>CO₂</th>
              <th title="Fitted from ln(C − C_out)">λ /h</th>
              <th title="How close ln(C − C_out) is to a straight line (1 = perfect)">R²</th>
              <th title="The level the fall's curve flattens out at: near baseline means the room was empty">Heading to</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {[...model.decays].reverse().map((d) => (
              <tr key={d.start}>
                <td>{when(d.start)}</td>
                <td>{formatDuration((Date.parse(d.end) - Date.parse(d.start)) / 3_600_000)}</td>
                <td>
                  {d.startPpm} → {d.endPpm}
                </td>
                <td>{d.lambda.toFixed(2)}</td>
                <td>{d.r2.toFixed(3)}</td>
                <td>{d.settlesAt === null ? '—' : `${d.settlesAt} ppm`}</td>
                <td>
                  <span className="band-swatch" style={{ background: VERDICTS[d.verdict].color }} />{' '}
                  {VERDICTS[d.verdict].label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
