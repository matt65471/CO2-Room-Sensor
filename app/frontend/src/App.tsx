import { useEffect, useState } from 'react';
import {
  fetchDevices,
  fetchReadings,
  fetchSummary,
  type Device,
  type Range,
  type ReadingsResponse,
  type Summary,
} from './api';
import Co2Chart from './components/Co2Chart';
import RangeTabs from './components/RangeTabs';
import StatsTable from './components/StatsTable';
import TrendCard from './components/TrendCard';

const REFRESH_MS = 60_000;
const DEVICE_KEY = 'co2.device';

function loadSavedDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

function saveDevice(id: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, id);
  } catch {
    // Storage blocked (e.g. private mode); the choice just won't be remembered
  }
}

function deviceLabel(d: Device): string {
  const lastSeen = new Date(d.lastSeen).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  return `${d.deviceId.slice(0, 8)}… (last seen ${lastSeen})`;
}

export default function App() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('24h');
  const [readings, setReadings] = useState<ReadingsResponse | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Re-fetch everything every minute
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Device list; keep the current choice, else the saved one, else the most recently seen device
  useEffect(() => {
    fetchDevices()
      .then((list) => {
        setDevices(list);
        setDevice((current) => {
          const ids = list.map((d) => d.deviceId);
          if (current && ids.includes(current)) return current;
          const saved = loadSavedDevice();
          if (saved && ids.includes(saved)) return saved;
          return ids[0] ?? null;
        });
      })
      .catch((e: Error) => setError(e.message));
  }, [tick]);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    fetchReadings(device, range)
      .then((r) => !cancelled && (setReadings(r), setError(null)))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device, range, tick]);

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    fetchSummary(device)
      .then((s) => !cancelled && setSummary(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [device, tick]);

  function chooseDevice(id: string) {
    setDevice(id);
    saveDevice(id);
    setReadings(null);
    setSummary(null);
  }

  return (
    <div className="page">
      <header className="header">
        <h1>CO₂ Room Monitor</h1>
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
      </header>

      {error && <div className="error">Couldn't load data: {error}</div>}

      {devices && devices.length === 0 && (
        <div className="card empty">No sensors have sent readings yet.</div>
      )}

      {device && (
        <>
          <TrendCard summary={summary} />

          <section className="card">
            <div className="card-header">
              <h2>CO₂ level</h2>
              <RangeTabs value={range} onChange={setRange} />
            </div>
            <Co2Chart data={readings && readings.range === range ? readings : null} />
          </section>

          <StatsTable summary={summary} />
        </>
      )}
    </div>
  );
}
