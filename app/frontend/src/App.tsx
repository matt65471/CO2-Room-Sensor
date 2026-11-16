import { useEffect, useState } from 'react';
import { fetchDevices, type Device } from './api';
import AnalysisDashboard from './AnalysisDashboard';
import ConsumerDashboard from './ConsumerDashboard';
import { isTempUnit, type TempUnit } from './metrics';
import { load, save } from './storage';

const REFRESH_MS = 60_000;
const DEVICE_KEY = 'co2.device';
const TEMP_UNIT_KEY = 'co2.tempUnit';

type View = 'consumer' | 'analysis';
const VIEWS: { value: View; label: string; hash: string }[] = [
  { value: 'consumer', label: 'Consumer Dashboard', hash: '' },
  { value: 'analysis', label: 'Data Analysis', hash: '#analysis' },
];

// The open tab lives in the URL (#analysis), so it survives reloads and can be bookmarked
function viewFromHash(): View {
  return window.location.hash === '#analysis' ? 'analysis' : 'consumer';
}

function loadSavedTempUnit(): TempUnit {
  const saved = load(TEMP_UNIT_KEY);
  return isTempUnit(saved) ? saved : 'C';
}

function deviceLabel(d: Device): string {
  const lastSeen = new Date(d.lastSeen).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return `${d.deviceId.slice(0, 8)}… (last seen ${lastSeen})`;
}

export default function App() {
  const [view, setView] = useState<View>(viewFromHash);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [tempUnit, setTempUnit] = useState<TempUnit>(loadSavedTempUnit);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-fetch live data every minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Follow back/forward navigation between tabs
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Device list; keep the current choice, else the saved one, else the most recently seen device
  useEffect(() => {
    fetchDevices()
      .then((list) => {
        setDevices(list);
        setDevice((current) => {
          const ids = list.map((d) => d.deviceId);
          if (current && ids.includes(current)) return current;
          const saved = load(DEVICE_KEY);
          if (saved && ids.includes(saved)) return saved;
          return ids[0] ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [tick]);

  function chooseView(next: View) {
    setView(next);
    setError(null);
    const hash = VIEWS.find((v) => v.value === next)!.hash;
    history.pushState(null, '', hash || window.location.pathname + window.location.search);
  }

  function chooseTempUnit(unit: TempUnit) {
    setTempUnit(unit);
    save(TEMP_UNIT_KEY, unit);
  }

  function chooseDevice(id: string) {
    setDevice(id);
    save(DEVICE_KEY, id);
  }

  return (
    <div className={view === 'analysis' ? 'page wide' : 'page'}>
      <header className="header">
        <h1>CO₂ Room Monitor</h1>
        <div className="header-controls">
          <div className="tabs" role="radiogroup" aria-label="Temperature unit">
            {(['C', 'F'] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={tempUnit === u}
                className={tempUnit === u ? 'tab active' : 'tab'}
                onClick={() => chooseTempUnit(u)}
              >
                °{u}
              </button>
            ))}
          </div>
          {devices && devices.length > 0 && (
            <label className="device-picker">
              <span>Sensor</span>
              <select value={device ?? ''} onChange={(e) => chooseDevice(e.target.value)}>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {deviceLabel(d)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </header>

      <nav className="view-tabs" role="tablist" aria-label="Dashboard">
        {VIEWS.map((v) => (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={view === v.value}
            className={view === v.value ? 'view-tab active' : 'view-tab'}
            onClick={() => chooseView(v.value)}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {error && <div className="error">Couldn't load data: {error}</div>}

      {devices && devices.length === 0 && <div className="card empty">No sensors have sent readings yet.</div>}

      {device &&
        (view === 'consumer' ? (
          <ConsumerDashboard device={device} tempUnit={tempUnit} tick={tick} onError={setError} />
        ) : (
          <AnalysisDashboard device={device} tempUnit={tempUnit} />
        ))}
    </div>
  );
}
