import { useEffect, useRef, useState } from 'react';
import { readFields } from '../api/page';
export function FullRecord({ url, label }: { url: string; label: string }) {
  const [fields, setFields] = useState<{ url: string; value: Record<string, unknown> }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => { setBusy(false); setError(''); return () => active.current?.abort(); }, [url]);
  const value = fields?.url === url ? fields.value : undefined;
  return <div>
    {!value && <button disabled={busy} onClick={() => {
      active.current?.abort(); const controller = new AbortController(); active.current = controller;
      setBusy(true); setError('');
      void readFields(url, controller.signal).then(value => { if (!controller.signal.aborted) setFields({ url, value }); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load complete record.'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }}>{busy ? 'Loading complete record…' : label}</button>}
    {error && <p role="alert">{error}</p>}
    {value && <dl>{Object.entries(value).map(([key, value]) => <div key={key}><dt className="font-bold">{key}</dt><dd className="whitespace-pre-wrap break-words">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</dd></div>)}</dl>}
  </div>;
}
