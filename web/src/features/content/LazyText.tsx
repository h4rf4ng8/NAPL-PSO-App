import { useState } from 'react';
import { readText } from '../../api/page';
export function LazyText({ url, label = 'Read more' }: { url: string; label?: string }) {
  const [text, setText] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div>
    {text === undefined ? <button disabled={busy} onClick={() => {
      setBusy(true); setError(''); void readText(url).then(setText).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load text.'); }).finally(() => setBusy(false));
    }}>{busy ? 'Loading…' : label}</button> : <p className="whitespace-pre-wrap">{text}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
