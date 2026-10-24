import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { request } from '../../api/http';
import type { TeamSummary } from '../teams/models';
import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import type { Champions } from './models';
import { EmptyState } from '../../components/Display';

import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';







// SeasonChampions Manager
export const SeasonChampionsManager = ({ account: _account, currentSeason, onRefresh }: { account: Account; currentSeason: string; onRefresh: () => void }) => {
  const [teamSearch,setTeamSearch] = useState('');
  const cursor = usePageCursor(teamSearch);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: 'approved', search: teamSearch, after: cursor.after } });
  const teamPage = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const [savedTeams,setSavedTeams] = useState<TeamSummary[]>([]);
  const allTeams = [...savedTeams,...(teamPage.data?.nodes ?? []).filter(team=>savedTeams.every(saved=>saved.id!==team.id))];
  const [loaded,setLoaded] = useState(false);
  const [champions, setChampions] = useState<Champions>({});             // { S1: { winnerTeamId, runnerUpTeamId } }
  const [editingSeason, setEditingSeason] = useState(currentSeason);
  const [newSeason, setNewSeason] = useState('');
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [runnerUpTeamId, setRunnerUpTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirming, setConfirming] = useState<'save' | 'clear' | null>(null);          // 'save' | 'clear' | null

  const approvedTeams = useMemo(
    () => allTeams.filter(t => t.status === 'approved').sort((a, b) => a.name.localeCompare(b.name)),
    [allTeams]
  );

  // Load championships once
  useEffect(() => {
    (async () => {
      try { const c = await adminApi.getChampions(); setChampions(c || {}); setLoaded(true); }
      catch { setError('Could not load complete championship settings. Reopen the editor to retry.'); }
    })();
  }, []);

  // Whenever the editing season changes, pre-fill from saved values
  useEffect(() => {
    const existing = champions[editingSeason] || {};
    setWinnerTeamId(existing.winnerTeamId || '');
    setRunnerUpTeamId(existing.runnerUpTeamId || '');
    setError(''); setInfo('');
  }, [editingSeason, champions]);

  const teamById = (id: string | null | undefined) => approvedTeams.find(t => t.id === id) || allTeams.find(t => t.id === id);
  const playerCount = (teamId: string | null | undefined) => teamById(teamId)?.memberCount ?? 0;
  useEffect(()=>{
    let active=true;
    const ids=[winnerTeamId,runnerUpTeamId].filter(Boolean);
    void Promise.all(ids.map(id=>request<TeamSummary>('/api/teams/'+encodeURIComponent(id)))).then(teams=>{if(active)setSavedTeams(teams);}).catch(()=>{if(active)setError('Could not load selected teams.');});
    return ()=>{active=false;};
  },[winnerTeamId,runnerUpTeamId]);

  // Collect every season that currently has championships set, plus the current season
  const knownSeasons = useMemo(() => {
    const set = new Set(Object.keys(champions));
    set.add(currentSeason);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, [champions, currentSeason]);

  const reset = () => {
    setError(''); setInfo(''); setConfirming(null);
  };

  // Save handler — confirms first to make the impact explicit
  const requestSave = () => {
    if(!loaded)return;
    setError(''); setInfo('');
    if (!editingSeason.trim()) { setError('Pick a season'); return; }
    if (!winnerTeamId && !runnerUpTeamId) { setError('Pick at least a winner or runner-up'); return; }
    if (winnerTeamId && winnerTeamId === runnerUpTeamId) {
      setError('Winner and runner-up cannot be the same team');
      return;
    }
    setConfirming('save');
  };

  const doSave = async () => {
    if(!loaded)return;
    setBusy(true);
    setError(''); setInfo('');
    try {
      const now = Date.now();
      const next = { ...champions };
      if (winnerTeamId || runnerUpTeamId) {
        next[editingSeason] = {
          winnerTeamId: winnerTeamId || null,
          runnerUpTeamId: runnerUpTeamId || null,
          setAt: now,
        };
      } else {
        delete next[editingSeason];
      }
      await adminApi.setChampions(next);
      setChampions(next);

      const wTeam = winnerTeamId ? teamById(winnerTeamId) : null;
      const rTeam = runnerUpTeamId ? teamById(runnerUpTeamId) : null;
      const wCount = wTeam ? playerCount(winnerTeamId) : 0;
      const rCount = rTeam ? playerCount(runnerUpTeamId) : 0;
      const parts = [];
      if (wTeam) parts.push(`${wTeam.name} (winner) — ${wCount} player${wCount === 1 ? '' : 's'}`);
      if (rTeam) parts.push(`${rTeam.name} (runner-up) — ${rCount} player${rCount === 1 ? '' : 's'}`);
      setInfo(`Saved ${editingSeason}: ${parts.join(' · ')}`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (error_) {
      setError('Save failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const requestClear = () => {
    if (!champions[editingSeason]) { setError(`No championship set for ${editingSeason}`); return; }
    setError(''); setInfo('');
    setConfirming('clear');
  };

  const doClear = async () => {
    if(!loaded)return;
    setBusy(true);
    try {
      const next = { ...champions };
      delete next[editingSeason];
      await adminApi.setChampions(next);
      setChampions(next);
      setWinnerTeamId(''); setRunnerUpTeamId('');
      setInfo(`Cleared ${editingSeason} championships.`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (error_) {
      setError('Clear failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const confirmation = (kind: 'save' | 'clear') => <AlertDialogContent>
    <AlertDialogHeader><AlertDialogTitle>{kind === 'save' ? `Save ${editingSeason} champions?` : `Clear ${editingSeason} championships?`}</AlertDialogTitle><AlertDialogDescription>
      {kind === 'save' ? `Trophies will be awarded to the selected teams’ current rosters. ${champions[editingSeason] ? `Previous ${editingSeason} trophies will be removed first, including trophies held by players who have since transferred.` : 'Players keep their trophies if they later transfer.'}` : `Every player with a ${editingSeason} championship trophy will lose it. This cannot be undone.`}
    </AlertDialogDescription></AlertDialogHeader>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy || !loaded} onClick={event => { event.preventDefault(); void (kind === 'save' ? doSave() : doClear()); }}>{busy ? 'Working…' : (kind === 'save' ? 'Award trophies' : 'Clear championships')}</AlertDialogAction></AlertDialogFooter>
  </AlertDialogContent>;

  return <div className="space-y-5">
    <div className="space-y-2"><h3 className="flex items-center gap-2 text-xl font-semibold"><Trophy className="size-5" />Season champions</h3><p className="text-sm leading-relaxed text-muted-foreground">Award gold and silver trophies to the selected teams’ current rosters. Players keep their trophy after transferring. Editing a recorded season replaces its previous trophies.</p></div>
    {!loaded && <p role="status" className="text-sm text-muted-foreground">Loading complete championship settings…</p>}
    {teamPage.error && <Alert variant="destructive"><AlertDescription>{teamPage.error}</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    <Card className="space-y-5 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="championship-season">Season</Label><Select value={editingSeason} onValueChange={setEditingSeason} disabled={busy || !loaded}><SelectTrigger id="championship-season"><SelectValue /></SelectTrigger><SelectContent>{knownSeasons.map(season => <SelectItem key={season} value={season}>{season}</SelectItem>)}{!knownSeasons.includes(editingSeason) && <SelectItem value={editingSeason}>{editingSeason}</SelectItem>}</SelectContent></Select></div>
        <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!newSeason.trim()) {
          return;
        }

        setEditingSeason(newSeason.trim().toUpperCase()); setNewSeason(''); }}><Label htmlFor="new-championship-season">Add another season</Label><div className="flex gap-2"><Input id="new-championship-season" value={newSeason} onChange={event => setNewSeason(event.target.value)} placeholder="Season name" disabled={busy || !loaded} /><Button type="submit" variant="outline" disabled={busy || !loaded || !newSeason.trim()}>Add</Button></div></form>
      </div>
      <div className="space-y-3 border-t pt-4"><Label htmlFor="championship-team-search">Search teams</Label><Input id="championship-team-search" aria-label="Find championship team" placeholder="Find team…" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} disabled={busy} /><PageButtons {...teamPage} hasNextPage={teamPage.data?.pageInfo.hasNextPage ?? false} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="championship-winner">Winner · Gold trophy</Label><Select value={winnerTeamId || 'none'} onValueChange={value => setWinnerTeamId(value === 'none' ? '' : value)} disabled={busy || !loaded}><SelectTrigger id="championship-winner"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{winnerTeamId && approvedTeams.every(team => team.id !== winnerTeamId) && <SelectItem value={winnerTeamId}>{teamById(winnerTeamId)?.name || 'Selected winner'}</SelectItem>}{approvedTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name} ({playerCount(team.id)} players)</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="championship-runner-up">Runner-up · Silver trophy</Label><Select value={runnerUpTeamId || 'none'} onValueChange={value => setRunnerUpTeamId(value === 'none' ? '' : value)} disabled={busy || !loaded}><SelectTrigger id="championship-runner-up"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{runnerUpTeamId && approvedTeams.every(team => team.id !== runnerUpTeamId) && <SelectItem value={runnerUpTeamId}>{teamById(runnerUpTeamId)?.name || 'Selected runner-up'}</SelectItem>}{approvedTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name} ({playerCount(team.id)} players)</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="flex flex-wrap gap-2">
        <AlertDialog open={confirming === 'save'} onOpenChange={open => { if (!open && !busy) setConfirming(null); }}><AlertDialogTrigger asChild><Button onClick={requestSave} disabled={busy || !loaded}>Save {editingSeason} champions</Button></AlertDialogTrigger>{confirmation('save')}</AlertDialog>
        {champions[editingSeason] && <AlertDialog open={confirming === 'clear'} onOpenChange={open => { if (!open && !busy) setConfirming(null); }}><AlertDialogTrigger asChild><Button variant="outline" className="text-destructive" onClick={requestClear} disabled={busy || !loaded}>Clear {editingSeason}</Button></AlertDialogTrigger>{confirmation('clear')}</AlertDialog>}
      </div>
      {(winnerTeamId || runnerUpTeamId) && <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        {winnerTeamId && <section className="space-y-2"><h4 className="text-sm font-semibold">Gold trophy roster</h4>{playerCount(winnerTeamId) === 0 ? <p className="text-sm text-muted-foreground">No current players on this team.</p> : <ChampionRoster key={winnerTeamId} teamId={winnerTeamId} />}</section>}
        {runnerUpTeamId && <section className="space-y-2"><h4 className="text-sm font-semibold">Silver trophy roster</h4>{playerCount(runnerUpTeamId) === 0 ? <p className="text-sm text-muted-foreground">No current players on this team.</p> : <ChampionRoster key={runnerUpTeamId} teamId={runnerUpTeamId} />}</section>}
      </div>}
    </Card>
    <section className="space-y-3"><h3 className="text-lg font-semibold">Championship record <Badge variant="secondary">{Object.keys(champions).length} seasons</Badge></h3>
      {loaded && Object.keys(champions).length === 0 && <EmptyState icon={<Trophy className="size-8" />} text="No season champions recorded yet." />}
      {Object.entries(champions).sort(([a], [b]) => a.localeCompare(b)).map(([season, record]) => <Card key={season} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"><h4 className="font-semibold">{season}</h4><div className="min-w-0 flex-1 space-y-1 text-sm"><p><span className="text-muted-foreground">Winner: </span>{record.winnerTeamId ? teamById(record.winnerTeamId)?.name || 'Recorded team' : 'None'}</p><p><span className="text-muted-foreground">Runner-up: </span>{record.runnerUpTeamId ? teamById(record.runnerUpTeamId)?.name || 'Recorded team' : 'None'}</p></div><Button variant="outline" disabled={busy} onClick={() => { setEditingSeason(season); reset(); document.querySelector<HTMLButtonElement>('#championship-season')?.focus(); }}>Edit {season}</Button></Card>)}
    </section>
  </div>;
};

function ChampionRoster({teamId}:{teamId:string}) {
  const page = useRestPage<string>(`/api/teams/${encodeURIComponent(teamId)}/members`);
  return <div className="space-y-2">
    {page.loading && <p role="status" className="text-sm text-muted-foreground">Loading roster…</p>}
    {page.error && <Alert variant="destructive"><AlertDescription>{page.error}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-1">{(page.data?.nodes ?? []).map(username => <Badge key={username} variant="secondary">{username}</Badge>)}</div>
    <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
  </div>;
}
