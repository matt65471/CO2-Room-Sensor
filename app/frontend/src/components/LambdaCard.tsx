import type { DecayVerdict, LambdaResponse } from '../api';

// How each kind of CO2 fall is shaded on the CO2 chart and described in the list
export const VERDICTS: Record<DecayVerdict, { label: string; color: string }> = {
  empty: { label: 'Empty-room decay (used for λ)', color: '#1f8a4c' },
  'settles-above-baseline': { label: 'Levels off above baseline (still occupied)', color: '#8b5cf6' },
  ventilation: { label: 'Unusually fast (door/window open)', color: '#2f7de1' },
  irregular: { label: 'Not a clean decay', color: '#8a8f98' },
  inconclusive: { label: 'Too short to judge', color: '#8a8f98' },
};

const LEGEND: DecayVerdict[] = ['empty', 'settles-above-baseline', 'ventilation', 'irregular'];

function formatDuration(hours: number): string {
  const mins = Math.round(hours * 60);
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, '0')} min`;
}

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

interface Props {
  data: LambdaResponse | null;
  showDecays: boolean;
  onShowDecays: (show: boolean) => void;
}

// The room's air-change rate λ, plus the CO2 falls it was learned from (Data Analysis tab)
export default function LambdaCard({ data, showDecays, onShowDecays }: Props) {
  if (!data) {
    return <section className="card lambda muted small">Estimating room air-change rate…</section>;
  }

  const { lambdaPerHour: lambda, halfLifeHours, baselinePpm, samples, decays } = data;
  const span = `${new Date(data.from).toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${new Date(
    data.to,
  ).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;

  return (
    <section className="card lambda">
      <div className="lambda-summary">
        <span className="lambda-value" title="Air changes per hour: how many room volumes of fresh air pass through each hour">
          λ = {lambda === null ? '—' : lambda.toFixed(2)}
          <span className="muted"> /h</span>
        </span>
        {halfLifeHours !== null && (
          <span>
            Excess CO₂ halves every <strong>{formatDuration(halfLifeHours)}</strong> when empty
          </span>
        )}
        {baselinePpm !== null && (
          <span>
            Baseline C<sub>out</sub> <strong>{baselinePpm} ppm</strong>
          </span>
        )}
        <span className="muted small">
          {samples > 0
            ? `From ${samples} empty-room decay${samples === 1 ? '' : 's'}, ${span}`
            : `No clean empty-room decays found, ${span}. The room needs to be left empty for an hour or more.`}
        </span>
        <label className="lambda-toggle small">
          <input type="checkbox" checked={showDecays} onChange={(e) => onShowDecays(e.target.checked)} />
          Shade decays on CO₂ chart
        </label>
      </div>

      {showDecays && (
        <div className="chart-legend inline">
          {LEGEND.map((v) => (
            <span key={v}>
              <span className="band-swatch" style={{ background: VERDICTS[v].color }} /> {VERDICTS[v].label}
            </span>
          ))}
        </div>
      )}

      {decays.length > 0 && (
        <details className="decay-details">
          <summary className="small">Every CO₂ fall considered ({decays.length})</summary>
          <div className="decay-scroll">
            <table className="decays">
              <thead>
                <tr>
                  <th>Start</th>
                  <th>Length</th>
                  <th>CO₂</th>
                  <th title="Fitted from ln(C − C_out)">λ /h</th>
                  <th title="How close ln(C − C_out) is to a straight line (1 = perfect)">R²</th>
                  <th title="Where the free fit says CO2 is levelling off">Heading to</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {[...decays].reverse().map((d) => (
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
      )}
    </section>
  );
}
