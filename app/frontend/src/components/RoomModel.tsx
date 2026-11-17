// Room-model pieces for the Data Analysis tab: the λ summary, the decay legend and the decay list
import type { DecayVerdict, RoomModel } from '../api';

// How each kind of CO2 fall is shaded on the CO2 chart and described in the list
// (`short` is for the chart legend, `label` for the decay list)
export const VERDICTS: Record<DecayVerdict, { label: string; short: string; color: string }> = {
  empty: { label: 'Empty-room decay (used for λ)', short: 'Empty (used for λ)', color: '#1f8a4c' },
  'settles-above-baseline': {
    label: 'Levels off above baseline (still occupied)',
    short: 'Still occupied',
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
    <span className="chart-legend inline">
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
}

// λ, the baseline and what they were learned from; sits beside the G_est chart, which uses them
export function RoomModelSummary({ model, showDecays, onShowDecays }: SummaryProps) {
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
      <label className="lambda-toggle">
        <input type="checkbox" checked={showDecays} onChange={(e) => onShowDecays(e.target.checked)} />
        Shade decays on CO₂ chart
      </label>
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
