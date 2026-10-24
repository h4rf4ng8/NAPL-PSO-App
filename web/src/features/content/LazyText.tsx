import { useEffect, useState } from 'react';
import { readText } from '../../api/page';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';

export function LazyText({ url, label = 'Read more' }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<{ url: string; text?: string; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const current = result?.url === url ? result : undefined;
  useEffect(() => {
    if (!open) return;
    let active = true;
    void readText(url).then(text => { if (active) setResult({ url, text }); }).catch((error: unknown) => { if (active) setResult({ url, error: error instanceof Error ? error.message : 'Could not load text.' }); });
    return () => { active = false; };
  }, [url, open, attempt]);
  return <Collapsible open={open} onOpenChange={setOpen}>
    <CollapsibleTrigger asChild><Button variant="ghost" className="max-w-full justify-start whitespace-normal px-0 text-primary">{open ? 'Hide text' : label}</Button></CollapsibleTrigger>
    <CollapsibleContent className="space-y-2">
      {!current && <p role="status" className="text-sm text-muted-foreground">Loading…</p>}
      {current?.text !== undefined && <p className="whitespace-pre-wrap break-words">{current.text || 'No additional text.'}</p>}
      {current?.error && <Alert variant="destructive"><AlertDescription>{current.error} <Button variant="outline" onClick={() => { setResult(undefined); setAttempt(value => value + 1); }}>Try again</Button></AlertDescription></Alert>}
    </CollapsibleContent>
  </Collapsible>;
}
