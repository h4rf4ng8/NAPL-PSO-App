import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { EmptyState, TeamPill } from '../../components/Display';
import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { readText } from '../../api/page';
import { Users } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import { teams as teamApi } from '../teams/api';
import type { PositionRequest, AdminPlayer } from '../accounts/models';

import { ALL_POSITIONS, POSITIONS } from '@napl/contracts/league';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';







// Players Manager
export const PlayersManager = ({ currentSeason: _currentSeason = 'S1', onRefresh }: { currentSeason?: string; onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search='+encodeURIComponent(search));
  const allPlayers = playerPage.data?.nodes ?? [];
  const [teamSearch,setTeamSearch] = useState('');
  const cursor = usePageCursor(teamSearch);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: null, search: teamSearch, after: cursor.after } });
  const teamPage = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const allTeams = teamPage.data?.nodes ?? [];
  const pendingPage = useRestPage<PositionRequest & {reasonUrl:string}>('/api/position-requests?status=pending');
  const pendingPosRequests = pendingPage.data?.nodes ?? [];
  const [reasons,setReasons] = useState<Record<string,string>>({});
  const refresh = () => { playerPage.restart(); pendingPage.restart(); onRefresh(); };
  const [teamEditing, setTeamEditing] = useState<AdminPlayer | null>(null); // account whose team is being changed
  const [sidEditing, setSidEditing] = useState<AdminPlayer | null>(null); // account whose Strikers ID is being changed
  const [newSid, setNewSid] = useState('');
  const [posEditing, setPosEditing] = useState<AdminPlayer | null>(null); // account whose position is being changed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [flagging, setFlagging] = useState<string | null>(null);

  // Local date formatter — fmtDate is defined inside other components (not
  // global), so we need our own here.
  const fmtDate = (ms: number | null | undefined) => {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const loadPendingPosRequests = () => pendingPage.restart();

  const approvePosRequest = async (req: PositionRequest) => {
    setBusy(true);
    try {
      await accountApi.approvePositionRequest(req.id);
      setInfo(`✓ Approved: ${req.username} is now ${req.toPos}`);
      await loadPendingPosRequests();
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) { setError('Could not approve: ' + (error_ instanceof Error ? error_.message : String(error_))); }
    setBusy(false);
  };
  const denyPosRequest = async (req: PositionRequest) => {
    setBusy(true);
    try {
      await accountApi.denyPositionRequest(req.id);
      setInfo(`✓ Denied: ${req.username}'s request`);
      await loadPendingPosRequests();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) { setError('Could not deny: ' + (error_ instanceof Error ? error_.message : String(error_))); }
    setBusy(false);
  };

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const teamById = (id: string | null | undefined) => allTeams.find(t => t.id === id);

  const filtered = allPlayers
    .filter(p => !search || p.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase()));

  // Reassign (or remove) a player's team. newTeamId === '' means make them a
  // free agent. Keeps both the old and new teams' member arrays in sync.
  // Flag/unflag a player as a cheater. Just toggles the boolean — the visual
  // CHEATER stamp on their card appears wherever PlayerCard renders.
  const toggleCheater = async (player: AdminPlayer) => {
    const wasCheater = !!player.cheater;
    setError(''); setBusy(true);
    try {
      await accountApi.patchAccount(player.id,{cheater:!wasCheater});
      setFlagging(null);
      refresh();
    } catch (error_) {
      setError('Could not toggle cheater: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const changePosition = async (player: AdminPlayer, newPos: string) => {
    setError('');
    if (!newPos || newPos === player.position) { setPosEditing(null); return; }
    if (!(ALL_POSITIONS as readonly string[]).includes(newPos)) { setError('Invalid position'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(player.id,{position:newPos});
      setInfo(`✓ ${player.username}'s position changed to ${newPos}`);
      setPosEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not change position: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const changeTeam = async (player: AdminPlayer, newTeamId: string) => {
    setError('');
    // No team assignment without a Strikers Club ID linked on the account.
    // Admins can set the ID via the SC ID button on this same row.
    if (newTeamId && !player.strikersId) {
      setError(`${player.username} has no Strikers Club ID linked. Set it via the SC ID button before assigning a team.`);
      return;
    }
    setBusy(true);
    try {
      const oldTeamId = player.teamId || null;
      if (oldTeamId === (newTeamId || null)) { setTeamEditing(null); setBusy(false); return; }

      if(newTeamId) await teamApi.changeMembership(newTeamId,'join',player.id);
      else if(oldTeamId) await teamApi.changeMembership(oldTeamId,'leave',player.id);

      const label = newTeamId ? (teamById(newTeamId)?.name || 'team') : 'Free Agent';
      setInfo(`✓ ${player.username} → ${label}`);
      setTeamEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not change team: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  // Admin override for Strikers Club Player ID. Players can't change theirs
  // once set (see MY CARD); this is the only escape hatch. Empty input clears it.
  const startSidEdit = (player: AdminPlayer) => {
    setSidEditing(player);
    setNewSid(player.strikersId || '');
    setError('');
  };
  const saveSid = async () => {
    if(!sidEditing)return;
    setError('');
    const sid = (newSid || '').trim();
    if (sid && !/^\d{2,15}$/.test(sid)) {
      setError('Strikers Club Player ID must be 2-15 digits, or empty to clear.');
      return;
    }
    setBusy(true);
    try {
      await accountApi.patchAccount(sidEditing.id,{strikersId:sid||null});
      setInfo(`✓ ${sidEditing.username} → Strikers ID ${sid || 'cleared'}`);
      setSidEditing(null);
      refresh();
      setTimeout(() => setInfo(''), 3000);
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return <div className="space-y-5">
    <div className="space-y-2"><h3 className="text-xl font-semibold">Manage players</h3><p className="text-sm text-muted-foreground">Manage teams, positions, and Strikers Club IDs. Player names synchronize from Discord at sign-in.</p></div>
    {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {(playerPage.error || pendingPage.error || teamPage.error) && <Alert variant="destructive"><AlertDescription>{playerPage.error || pendingPage.error || teamPage.error}</AlertDescription></Alert>}
    <Card>
      <CardHeader><CardTitle className="text-lg">Position change requests <Badge variant="secondary">{pendingPage.data?.totalCount ?? 0}</Badge></CardTitle><CardDescription>Review each player’s requested position and reason.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        {pendingPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading position requests…</p>}
        {!pendingPage.loading && pendingPosRequests.length === 0 && <p className="text-sm text-muted-foreground">No pending position requests.</p>}
        {pendingPosRequests.map(req => <div key={req.id} className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{req.username}</p><p className="text-sm text-muted-foreground">{req.fromPos} → {req.toPos} · {fmtDate(req.createdAt)}</p></div><div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => approvePosRequest(req)}>Approve</Button><Button variant="outline" disabled={busy} onClick={() => denyPosRequest(req)}>Deny</Button></div></div>
          <Button variant="ghost" onClick={() => { void readText(req.reasonUrl).then(value => setReasons(previous => ({...previous, [req.id]:value}))).catch(() => setError('Could not load request reason.')); }}>Read reason</Button>
          {reasons[req.id] && <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">{reasons[req.id]}</blockquote>}
        </div>)}
        <PageButtons {...pendingPage} hasNextPage={pendingPage.data?.pageInfo.hasNextPage ?? false} />
      </CardContent>
    </Card>
    <div className="space-y-2"><Label htmlFor="player-search">Search players</Label><Input id="player-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Player name…" /></div>
    {playerPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading players…</p>}
    <div className="space-y-3">
      {!playerPage.loading && filtered.length === 0 && <EmptyState text="No players found." />}
      {filtered.map(player => {
        const playerTeam = player.team ?? (player.teamId ? teamById(player.teamId) : null);
        return <Card key={player.id} className="space-y-4 p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 space-y-2"><h4 className="break-words font-semibold">{player.username}</h4><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">{player.position}</Badge><span>{player.stats?.games || 0} games</span><TeamPill team={playerTeam} fallback={player.teamId ? 'Assigned team' : 'Free agent'} /><span>{player.strikersId ? `SC: ${player.strikersId}` : 'No Strikers Club ID'}</span>{player.cheater && <Badge variant="destructive">Cheater flag</Badge>}</div></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => { setPosEditing(player); setTeamEditing(null); setSidEditing(null); setError(''); }}>Position</Button>
              <Button variant="outline" disabled={busy} onClick={() => { setTeamEditing(player); setSidEditing(null); setPosEditing(null); setError(''); }}><Users />Team</Button>
              <Button variant="outline" disabled={busy} onClick={() => { startSidEdit(player); setTeamEditing(null); setPosEditing(null); }}>SC ID</Button>
              <AlertDialog open={flagging === player.id} onOpenChange={open => { if (busy) {
                return;
              }

              setFlagging(open ? player.id : null); if (open) setError(''); }}>
                <AlertDialogTrigger asChild><Button variant="outline" className="text-destructive" disabled={busy}>{player.cheater ? 'Remove flag' : 'Flag player'}</Button></AlertDialogTrigger>
                <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{player.cheater ? 'Remove cheater flag?' : 'Flag player as a cheater?'}</AlertDialogTitle><AlertDialogDescription>{player.cheater ? `Remove the cheater stamp from ${player.username}’s card.` : `${player.username}’s player card will display a cheater stamp throughout the league.`}</AlertDialogDescription></AlertDialogHeader>
                  {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
                  <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void toggleCheater(player); }}>{busy ? 'Saving…' : 'Confirm'}</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
          {teamEditing?.id === player.id && <div className="space-y-3 border-t pt-4">
            <Label htmlFor={`team-search-${player.id}`}>Change team for {player.username}</Label>
            <Input id={`team-search-${player.id}`} aria-label="Find team" placeholder="Find team…" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} />
            <PageButtons {...teamPage} hasNextPage={teamPage.data?.pageInfo.hasNextPage ?? false} />
            <Select value={player.teamId || 'free-agent'} onValueChange={value => { void changeTeam(player, value === 'free-agent' ? '' : value); }} disabled={busy}>
              <SelectTrigger aria-label={`Team for ${player.username}`}><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="free-agent">Free agent (no team)</SelectItem>{player.teamId && approvedTeams.every(team => team.id !== player.teamId) && <SelectItem value={player.teamId}>{playerTeam?.name || 'Current team'}</SelectItem>}{approvedTeams.map(team => <SelectItem key={team.id} value={team.id}>{team.name} ({team.tag})</SelectItem>)}</SelectContent>
            </Select>
            {!player.strikersId && <p className="text-sm text-muted-foreground">Set a Strikers Club ID before assigning a team.</p>}
            <Button variant="ghost" disabled={busy} onClick={() => { setTeamEditing(null); setError(''); }}>Cancel</Button>
          </div>}
          {posEditing?.id === player.id && <div className="space-y-3 border-t pt-4"><p className="text-sm font-medium">Change position for {player.username}</p><div className="flex flex-wrap gap-2">{POSITIONS.map(position => <Button key={position} variant={position === player.position ? 'default' : 'outline'} aria-pressed={position === player.position} disabled={busy} onClick={() => changePosition(player, position)}>{position}</Button>)}</div><Button variant="ghost" disabled={busy} onClick={() => { setPosEditing(null); setError(''); }}>Cancel</Button></div>}
          {sidEditing?.id === player.id && <form className="space-y-3 border-t pt-4" onSubmit={event => { event.preventDefault(); void saveSid(); }}>
            <Label htmlFor={`player-sid-${player.id}`}>Strikers Club ID for {player.username}</Label><Input id={`player-sid-${player.id}`} inputMode="numeric" value={newSid} disabled={busy} onChange={event => setNewSid(event.target.value.replaceAll(/\D/g, ''))} placeholder="2–15 digits" /><p className="text-xs text-muted-foreground">Leave empty to clear the linked ID.</p><div className="flex gap-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save ID'}</Button><Button variant="ghost" disabled={busy} onClick={() => { setSidEditing(null); setError(''); }}>Cancel</Button></div>
          </form>}
        </Card>;
      })}
    </div>
    <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
  </div>;
};
