import { useEffect, useState } from 'react';
import { describeVersion, type HealthReport } from '@luma/core';
import { AppUpdateNotice } from './AppUpdateNotice';

export function App() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState('');

  useEffect(function loadHealth() {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return res.json() as Promise<HealthReport>;
      })
      .then(setHealth)
      .catch((err: unknown) => setError(String(err)));
  }, []);

  let status = 'Connecting…';
  if (error !== '') {
    status = `Backend unreachable: ${error}`;
  } else if (health) {
    status = describeVersion(health);
  }

  return (
    <main className="page">
      <h1>Luma</h1>
      <p>{status}</p>
      <AppUpdateNotice />
    </main>
  );
}
