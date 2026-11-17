// Every CO2 fall considered for λ, with its numbers and verdict (collapsed by default)
import type { RoomModel } from '../../../api';
import { VERDICTS } from './colors';
import { formatDuration, formatWhen } from './format';

export default function DecayTable({ model }: { model: RoomModel | null }) {
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
                <td>{formatWhen(d.start)}</td>
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
