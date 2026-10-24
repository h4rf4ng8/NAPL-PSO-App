import { useState } from 'react';
import { Trophy } from 'lucide-react';
import { z } from 'zod';
import { VOTE_FIELDS, VOTE_POSITIONS } from '@napl/contracts/league';
import { useRestPage } from '../../hooks/use-rest-page';
import { useResource } from '../../hooks/use-resource';
import { PageButtons } from '../../components/PageButtons';
import { ModalShell } from '../../components/Dialog';
import { request } from '../../api/http';
import type { AdminPlayer } from '../accounts/models';
import { voting as votingApi } from './api';
import type { VotingPeriod } from './models';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

type PeriodSummary = Omit<VotingPeriod, 'eligiblePlayers' | 'winners'> & { eligiblePlayerCount: number; winnerCount: number };
const tallySchema = z.object({ totalVotes: z.number().nonnegative(), positions: z.object({ GK: z.array(z.tuple([z.string(), z.number()])), DEF: z.array(z.tuple([z.string(), z.number()])), CM: z.array(z.tuple([z.string(), z.number()])), ST: z.array(z.tuple([z.string(), z.number()])) }) });

export const TotwManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const periodPage = useRestPage<PeriodSummary>('/api/voting/periods');
  const openPage = useRestPage<PeriodSummary>('/api/voting/periods?status=open');
  const periods = periodPage.data?.nodes ?? [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirmation, setConfirmation] = useState<{ action: 'close' | 'delete'; period: PeriodSummary } | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedPositions, setSelectedPositions] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const playerPage = useRestPage<AdminPlayer>(creating ? '/api/accounts?search=' + encodeURIComponent(filter) : null);
  const allPlayers = playerPage.data?.nodes ?? [];
  const minimumEligible = VOTE_FIELDS.reduce((total, field) => total + field.needed, 0);
  const minimumEligibleSummary = VOTE_FIELDS.map(({ needed, pos }) => `${needed} ${pos}`).join(' + ');
  const votePositionSummary = VOTE_FIELDS.map(({ pos }) => `1 ${pos}`).join(' + ');
  const selectedCounts = VOTE_FIELDS.map(field => ({ ...field, count: selectedPlayers.filter(name => selectedPositions[name] === field.pos).length }));
  const eligibleComplete = selectedCounts.every(field => field.count >= field.needed);

  const currentPeriod = openPage.data?.nodes.find(period => period.status === 'open');
  const pastPeriods = periods.filter(period => period.status !== 'open');
  const tallyResource = useResource(async () => currentPeriod
    ? tallySchema.parse(await request(`/api/voting/periods/${encodeURIComponent(currentPeriod.id)}/tally`))
    : { totalVotes: 0, positions: { GK: [], DEF: [], CM: [], ST: [] } }, [currentPeriod?.id]);
  const tally = tallyResource.data?.positions ?? { GK: [], DEF: [], CM: [], ST: [] };
  const refresh = async () => { await Promise.all([periodPage.reload(), openPage.reload(), tallyResource.reload()]); };
  const refreshAfterSave = async () => {
    await refresh();
    try { await onRefresh(); }
    catch (error_) { setError('Saved, but the view could not refresh: ' + (error_ instanceof Error ? error_.message : String(error_))); }
  };

  // Preserve the existing close time: the end of tomorrow in the admin's local time.
  const computeCloseTime = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
  };

  const togglePlayer = (username: string) => {
    const player = allPlayers.find(candidate => candidate.username === username);
    if (player) {
      // The API groups legacy defender positions under DEF. This is display guidance;
      // the server still validates the selected candidates when opening the period.
      const position = ['CB', 'LB', 'RB'].includes(player.position) ? 'DEF' : player.position;
      setSelectedPositions(previous => ({ ...previous, [username]: position }));
    }
    setSelectedPlayers(previous => previous.includes(username) ? previous.filter(name => name !== username) : [...previous, username]);
  };

  const handleCreate = async () => {
    setError('');
    if (!eligibleComplete) {
      setError(`Pick at least ${minimumEligible} eligible players with ${minimumEligibleSummary}.`);
      return;
    }
    setBusy(true);
    try {
      await votingApi.createTotwPeriod({ closesAt: computeCloseTime(), eligiblePlayers: selectedPlayers });
      setInfo('Voting period opened.');
      setCreating(false);
      setSelectedPlayers([]);
      setSelectedPositions({});
    } catch (error_) {
      setError('Could not create period: ' + (error_ instanceof Error ? error_.message : String(error_)));
      setBusy(false);
      return;
    }
    await refreshAfterSave();
    setBusy(false);
  };

  const confirmAction = async () => {
    if (!confirmation) return;
    const { action, period } = confirmation;
    setConfirmation(null);
    setError('');
    setBusy(true);
    try {
      if (action === 'close') await votingApi.updateTotwPeriod(period.id, { status: 'closed' });
      else await votingApi.deleteTotwPeriod(period.id);
      setInfo(action === 'close' ? 'Voting period closed. No more ballots can be submitted.' : 'Voting period deleted.');
    } catch (error_) {
      setError(`Could not ${action} period: ` + (error_ instanceof Error ? error_.message : String(error_)));
      setBusy(false);
      return;
    }
    await refreshAfterSave();
    setBusy(false);
  };

  const cancelCreate = () => { setCreating(false); setSelectedPlayers([]); setSelectedPositions({}); setError(''); };
  const approvedPlayers = allPlayers
    .filter(player => !filter || player.username.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.username.localeCompare(b.username));
  const loadError = periodPage.error || openPage.error || tallyResource.error;

  return <div className="space-y-5">
    <div>
      <h2 className="flex items-center gap-2 text-xl font-semibold"><Trophy className="size-5" aria-hidden="true" /> Team of the Week voting</h2>
      <p className="mt-1 text-sm text-muted-foreground">Select eligible players and open a period. Each ballot contains {votePositionSummary}. Voting ends at the end of the following day.</p>
    </div>
    {(periodPage.loading || openPage.loading || tallyResource.loading) && <p role="status" className="text-sm text-muted-foreground">Loading voting data…</p>}
    {loadError && <Alert variant="destructive"><AlertDescription>{loadError}<Button className="mt-2" variant="outline" onClick={() => { void refresh(); }}>Retry voting data</Button></AlertDescription></Alert>}
    {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    {error && !creating && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

    <Card>
      <CardHeader><CardTitle>Current voting period</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {currentPeriod ? <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="secondary">{Date.now() >= currentPeriod.closesAt ? 'Voting window ended' : 'Open'}</Badge>
              <p className="text-sm">Closes {new Date(currentPeriod.closesAt).toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">{currentPeriod.eligiblePlayerCount} eligible players · {tallyResource.data?.totalVotes ?? '…'} votes cast</p>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmation({ action: 'close', period: currentPeriod })}>Close voting</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{VOTE_POSITIONS.map(position => <div key={position} className="rounded-lg border p-3">
            <h3 className="mb-2 text-sm font-semibold">{position}</h3>
            {tally[position].length === 0 ? <p className="text-sm text-muted-foreground">No votes yet.</p> : <ol className="space-y-2">{tally[position].slice(0, 5).map(([username, count]) => <li key={username} className="flex items-start justify-between gap-3 text-sm"><span className="min-w-0 break-words">{username}</span><Badge variant="secondary">{count}</Badge></li>)}</ol>}
          </div>)}</div>
        </> : <div className="space-y-3"><p className="text-sm text-muted-foreground">No active voting period.</p><Button disabled={busy || openPage.loading || !!openPage.error} onClick={() => { setCreating(true); setSelectedPlayers([]); setSelectedPositions({}); setFilter(''); setError(''); }}>Open new voting period</Button></div>}
      </CardContent>
    </Card>

    <Card className="overflow-hidden">
      <CardHeader><CardTitle>Past periods</CardTitle><CardDescription>Closed periods and recorded winner counts.</CardDescription></CardHeader>
      {pastPeriods.length > 0 ? <Table>
        <TableHeader><TableRow><TableHead>Opened</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Eligible</TableHead><TableHead className="text-right">Winners</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
        <TableBody>{pastPeriods.map(period => <TableRow key={period.id}>
          <TableCell className="whitespace-nowrap">{new Date(period.opensAt).toLocaleDateString()}</TableCell>
          <TableCell><Badge variant="secondary">{period.status}</Badge></TableCell>
          <TableCell className="text-right tabular-nums">{period.eligiblePlayerCount}</TableCell>
          <TableCell className="text-right tabular-nums">{period.winnerCount}</TableCell>
          <TableCell className="text-right"><Button variant="ghost" disabled={busy} aria-label={`Delete voting period from ${new Date(period.opensAt).toLocaleDateString()}`} onClick={() => setConfirmation({ action: 'delete', period })}>Delete</Button></TableCell>
        </TableRow>)}</TableBody>
      </Table> : <CardContent><p className="text-sm text-muted-foreground">No past periods on this page.</p></CardContent>}
      <div className="p-4"><PageButtons {...periodPage} hasNextPage={periodPage.data?.pageInfo.hasNextPage ?? false} /></div>
    </Card>

    {creating && <ModalShell title="Open voting period" onClose={busy ? undefined : cancelCreate} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">Select players who played this week. Minimum: {minimumEligibleSummary}. Selections stay selected as you search or change pages.</p>
        <div className="flex flex-wrap gap-2">{selectedCounts.map(({ pos, count, needed }) => <Badge key={pos} variant={count >= needed ? 'default' : 'outline'}>{pos}: {count} / {needed} minimum</Badge>)}</div>
        <p className="text-sm font-medium">{selectedPlayers.length} selected · closes {new Date(computeCloseTime()).toLocaleString()}</p>
        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">{selectedPlayers.map(name => <Button key={name} size="sm" variant="secondary" disabled={busy} className="max-w-full" onClick={() => togglePlayer(name)}><span className="truncate">Remove {name}</span></Button>)}</div>
        <div className="space-y-2"><Label htmlFor="eligible-search">Search eligible players</Label><Input id="eligible-search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Search players…" disabled={busy} /></div>
        {playerPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading players…</p>}
        {playerPage.error && <Alert variant="destructive"><AlertDescription>{playerPage.error}<Button variant="outline" onClick={playerPage.restart}>Restart players</Button></AlertDescription></Alert>}
        <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">{approvedPlayers.map(player => <label key={player.id} className="flex min-h-11 cursor-pointer items-center gap-3 p-3 hover:bg-muted">
          <Checkbox checked={selectedPlayers.includes(player.username)} onCheckedChange={() => togglePlayer(player.username)} disabled={busy || playerPage.loading} />
          <span className="min-w-0 flex-1 break-words text-sm">{player.username}</span><Badge variant="outline">{player.position}</Badge>
        </label>)}{!playerPage.loading && !playerPage.error && approvedPlayers.length === 0 && <p className="p-4 text-sm text-muted-foreground">No players found.</p>}</div>
        <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2"><Button onClick={handleCreate} disabled={busy || !eligibleComplete}>{busy ? 'Opening…' : `Open period (${selectedPlayers.length} players)`}</Button><Button variant="outline" onClick={cancelCreate} disabled={busy}>Cancel</Button></div>
      </div>
    </ModalShell>}
    <AlertDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{confirmation?.action === 'close' ? 'Close voting now?' : 'Delete this voting period?'}</AlertDialogTitle><AlertDialogDescription>{confirmation?.action === 'close' ? 'Voters will no longer be able to submit or change their ballots.' : 'This permanently removes the period and all of its votes. This cannot be undone.'}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { void confirmAction(); }}>{confirmation?.action === 'close' ? 'Close voting' : 'Delete period'}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
};
