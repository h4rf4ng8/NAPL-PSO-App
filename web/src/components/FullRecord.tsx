import { useEffect, useRef, useState } from 'react';
import { readFields } from '../api/page';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Card } from './ui/card';

export function FullRecord({ url, label }: { url: string; label: string }) {
  const [fields, setFields] = useState<{ url: string; value: Record<string, unknown> }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => { setBusy(false); setError(''); return () => active.current?.abort(); }, [url]);
  const value = fields?.url === url ? fields.value : undefined;
  return <div className="space-y-3">
    {!value && <Button variant="outline" className="max-w-full whitespace-normal" disabled={busy} onClick={() => {
      active.current?.abort(); const controller = new AbortController(); active.current = controller;
      setBusy(true); setError('');
      void readFields(url, controller.signal).then(value => { if (!controller.signal.aborted) setFields({ url, value }); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load complete record.'); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }}>{busy ? 'Loading complete record…' : label}</Button>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {value && <Card className="p-4 shadow-sm"><dl className="divide-y text-sm">{Object.entries(value).map(([key, value]) => <div key={key} className="grid min-w-0 gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-4"><dt className="break-words font-medium">{key}</dt><dd className="min-w-0 whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</dd></div>)}</dl></Card>}
  </div>;
}
