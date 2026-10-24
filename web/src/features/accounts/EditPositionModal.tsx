import { useEffect, useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account, PositionRequest } from './models';
import { ModalShell } from '../../components/Dialog';
import { request } from '../../api/http';
import type { Page } from '../../api/page';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Textarea } from '../../components/ui/textarea';

import { POSITIONS } from '../../utils/league';

// EditPosition Modal
export const EditPositionModal = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const [pos, setPos] = useState(account.position);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Pick<PositionRequest, 'id' | 'toPos' | 'fromPos'> | null>(null);   // {toPos} if request is already pending
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Every self-service position change requires admin approval, no exceptions.
  // (Previously 0-game players could switch freely, but that let people
  // slip through — simpler and safer to route everyone through the queue.)
  // Admins can still change any player's position directly via ADMIN → PLAYERS.
  const games = account.stats?.games || 0;

  // Check if a pending request already exists for this account
  useEffect(() => {
    const controller = new AbortController();
    void request<Page<Pick<PositionRequest, 'id' | 'toPos' | 'fromPos'>>>('/api/position-requests?status=pending&scope=mine', 'GET', undefined, controller.signal).then(page => { setPending(page.nodes[0] ?? null); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load current request.'); });
    return () => controller.abort();
  }, [account.id]);

  const handleSubmit = async () => {
    if (busy || submitted || pending) return;
    setError(''); setInfo('');
    if (pos === account.position) { onClose(); return; }
    setBusy(true);
    try {
      await accountApi.createPositionRequest({ toPos: pos, reason: reason.trim() });
      setSubmitted(true);
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const withdrawRequest = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await accountApi.deletePositionRequest(pending.id);
      setPending(null);
      setInfo('Request withdrawn.');
    } catch (error_) {
      setError('Could not withdraw: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  if (submitted) return <ModalShell onClose={onClose} title="Change position" maxWidth="max-w-md">
    <Alert role="status"><AlertTitle>Request submitted</AlertTitle><AlertDescription>An administrator will review your request to change to {pos}. Your current position stays unchanged until it is approved.</AlertDescription></Alert>
    <Button onClick={onClose}>Done</Button>
  </ModalShell>;

  return <ModalShell onClose={onClose} title="Change position" maxWidth="max-w-md">
    <div className="space-y-5">
      <Alert>
        <AlertTitle>{pending ? 'Pending admin review' : 'Admin approval required'}</AlertTitle>
        <AlertDescription>
          {pending ? <>Your request from <strong>{pending.fromPos}</strong> to <strong>{pending.toPos}</strong> is awaiting approval.</> :
            <>Your current position is <strong>{account.position}</strong>{games > 0 ? ` with ${games} games played` : ''}. Every position change is reviewed to keep player statistics consistent.</>}
        </AlertDescription>
        {pending && <Button className="mt-3" variant="outline" disabled={busy} onClick={withdrawRequest}>{busy ? 'Withdrawing…' : 'Withdraw request'}</Button>}
      </Alert>
      <fieldset className="space-y-3" disabled={!!pending || busy}>
        <legend className="mb-3 text-sm font-medium">Requested position</legend>
        <RadioGroup aria-label="Requested position" value={pos} onValueChange={setPos} disabled={!!pending || busy} className="grid grid-cols-2 gap-2">
          {POSITIONS.map(position => <Label key={position} htmlFor={`position-${position}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
            <RadioGroupItem id={`position-${position}`} value={position} />{position}
          </Label>)}
        </RadioGroup>
        <p className="text-sm text-muted-foreground">Choose FLEX if you regularly play both forward and defense.</p>
      </fieldset>
      {!pending && pos !== account.position && <div className="space-y-2">
        <Label htmlFor="position-reason">Reason <span className="font-normal text-muted-foreground">(optional)</span></Label>
        <Textarea id="position-reason" value={reason} maxLength={200} disabled={busy} onChange={event => setReason(event.target.value.slice(0, 200))} placeholder="Why would you like to change position?" />
        <p className="text-xs text-muted-foreground">{reason.length}/200 characters</p>
      </div>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
      {!pending && <Button className="w-full" onClick={handleSubmit} disabled={busy || pos === account.position}>{busy ? 'Submitting…' : 'Submit request'}</Button>}
    </div>
  </ModalShell>;
};
