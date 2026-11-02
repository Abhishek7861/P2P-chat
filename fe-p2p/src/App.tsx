import { useEffect, useState } from 'react';

export default function App() {
  const [status, setStatus] = useState('checking…');
  useEffect(() => {
    fetch('/api/ping')
      .then((r) => r.json())
      .then((d) => setStatus(`API ${d.status} at ${d.time}`))
      .catch(() => setStatus('API unreachable'));
  }, []);
  
  return <main style={{ padding: 24 }}><h1>P2P Messenger</h1><p>{status}</p> </main>;
}
