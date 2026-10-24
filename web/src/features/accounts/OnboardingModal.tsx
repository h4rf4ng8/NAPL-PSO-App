import { auth } from '../../auth/session';
import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Dialog';


import { POSITIONS } from '../../utils/league';
import { POS } from '@napl/contracts/league';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Button } from '../../components/ui/button';


// Onboarding Modal
export const OnboardingModal = ({ account, onComplete }: { account: Account; onComplete: (account:Account) => void }) => {
  const [strikersId, setStrikersId] = useState('');
  const [position, setPosition] = useState(account.position || POS.CM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    const sid = strikersId.trim();
    if (!sid) { setErr('Strikers Club Player ID is required.'); return; }
    if (!/^\d{2,15}$/.test(sid)) { setErr('Strikers Club Player ID must be 2-15 digits.'); return; }
    if (!position) { setErr('Please choose your primary position.'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(account.id,{strikersId: sid, position});
      const updated = await auth.getCurrent();
      if (updated) onComplete?.(updated);
    } catch (error) {
      setErr('Could not save: ' + (error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  };

  return <ModalShell title="Welcome to ASL" maxWidth="max-w-md">
    <p className="text-sm text-muted-foreground">Complete your profile before joining a team.</p>
    <form className="space-y-5" onSubmit={event => { event.preventDefault(); if (!busy) void handleSave(); }}>
      <div className="space-y-2">
        <Label htmlFor="onboarding-strikers-id">Strikers Club player ID</Label>
        <Input id="onboarding-strikers-id" type="text" inputMode="numeric" autoComplete="off" value={strikersId}
          onChange={event => setStrikersId(event.target.value.replaceAll(/\D/g, ''))}
          placeholder="e.g. 365702" aria-describedby="strikers-id-help" required autoFocus disabled={busy} />
        <p id="strikers-id-help" className="text-xs leading-relaxed text-muted-foreground">Find this numeric ID on your in-game profile. Once set, only an administrator can change it.</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Primary position</legend>
        <RadioGroup value={position} onValueChange={setPosition} disabled={busy} className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Primary position" aria-describedby="position-help">
          {POSITIONS.map(pos => <Label key={pos} htmlFor={`position-${pos}`} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem id={`position-${pos}`} value={pos} />{pos}
          </Label>)}
        </RadioGroup>
        <p id="position-help" className="text-xs leading-relaxed text-muted-foreground">Choose FLEX if you regularly play both forward and defense.</p>
      </fieldset>
      {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Complete profile'}</Button>
    </form>
  </ModalShell>;
};
