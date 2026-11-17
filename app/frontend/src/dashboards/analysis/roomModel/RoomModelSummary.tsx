// λ, the baseline and what they were learned from, plus the shading/label toggles.
// Sits beside the G_est chart, which uses them.
import type { RoomModel } from '../../../api';
import { formatDay, formatDuration } from './format';

interface Props {
  model: RoomModel | null;
  showDecays: boolean;
  onShowDecays: (show: boolean) => void;
  showLabels: boolean;
  onShowLabels: (show: boolean) => void;
}

export default function RoomModelSummary({ model, showDecays, onShowDecays, showLabels, onShowLabels }: Props) {
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
          ? `From ${samples} empty-room decay${samples === 1 ? '' : 's'}, ${formatDay(model.from)} – ${formatDay(model.to)}`
          : `No clean empty-room decays ${formatDay(model.from)} – ${formatDay(model.to)}. Leave the room empty for an hour or more.`}
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
