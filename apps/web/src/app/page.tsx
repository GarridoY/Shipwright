'use client';

import { useEffect, useState } from 'react';
import type { HealthResponse } from '@shipwright/contracts';

type HealthState =
  { kind: 'loading' } | { kind: 'ready'; health: HealthResponse } | { kind: 'failed' };

export default function Home() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';
    fetch(`${apiUrl}/health`)
      .then(async (response) => {
        const body: HealthResponse = await response.json();
        if (!response.ok) throw new Error('API health check failed');
        setHealth({ kind: 'ready', health: body });
      })
      .catch(() => setHealth({ kind: 'failed' }));
  }, []);

  return (
    <main>
      <h1>Shipwright</h1>
      <p>Local-first software factory</p>
      <h2>Service status</h2>
      {health.kind === 'loading' && <p>Connecting to the API…</p>}
      {health.kind === 'failed' && (
        <p role="status">API unavailable. Start the local services and refresh.</p>
      )}
      {health.kind === 'ready' && (
        <p role="status">
          API {health.health.status}; database {health.health.database}.
        </p>
      )}
    </main>
  );
}
