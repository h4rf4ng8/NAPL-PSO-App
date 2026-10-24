import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { Plus, Search, Shield, Users } from 'lucide-react';
import { TeamSummariesDocument, TeamPlayersDocument } from '../../api/generated/graphql';
import { request, segment } from '../../api/http';
import { readFields } from '../../api/page';
import { useResource } from '../../hooks/use-resource';
import { z } from 'zod';
import type { Account } from '../accounts/models';
import type { Team, TeamSummary } from './models';
import { auth } from '../../auth/session';
import { teams as teamApi } from './api';
import { SubmitTeamModal } from './team-forms';
import { TeamRosterFormation } from './roster';
import { TeamStandings } from '../matches';
import { ModalShell } from '../../components/Dialog';
import { MediaImage } from '../../components/MediaImage';
import { ShareableCardModal } from '../../components/ShareableCardModal';
import { SelectedPlayerCard } from '../accounts/SelectedPlayerCard';
import { TrophyHistory } from '../accounts/TrophyHistory';
import { mapCardAccount } from '../accounts/api';
import type { PlayerSelection } from '../accounts/StatsView';
import { LazyText } from '../content/LazyText';
import { isTeamCaptain } from '../../utils/league';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

export const PlayerCardModal = ({ player, team, onClose }: { player: Account; team?: TeamSummary | null; onClose: () => void }) =>
  <ShareableCardModal account={player} team={team} onClose={onClose}><TrophyHistory accountId={player.id} /></ShareableCardModal>;

type TeamDetail = TeamSummary & Pick<Team, 'formation'> & { lineupUrl: string; descriptionUrl: string; rejectionReasonUrl?: string; viewerInvitation: string | null };

export function TeamsView({ account, onUpdate }: { account: Account | null; onUpdate?: (account: Account) => void; currentSeason?: string }) {
  const [scope, setScope] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [actionError, setActionError] = useState('');
  const [responding, setResponding] = useState<string | null>(null);
  const { data, loading, error, refetch } = useQuery(TeamSummariesDocument, { variables: { scope, search, status: scope ? null : 'approved', after } });
  const reset = () => { setAfter(null); setPrevious([]); };
  const refreshed = async () => { const me = account ? await auth.getCurrent() : null; if (me) onUpdate?.(me); reset(); await refetch({ after: null }); };
  const invitation = async (id: string, accept: boolean) => {
    setActionError(''); setResponding(id);
    try { await teamApi.respondInvitation(id, accept); await refreshed(); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Could not respond to invitation.'); }
    finally { setResponding(null); }
  };
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Teams</h1><p className="mt-1 text-sm text-muted-foreground">Meet the league’s squads, explore their lineups, and find your place.</p></div>{account && <Button onClick={() => setShowSubmit(true)}><Plus className="mr-2 size-4" />Submit team</Button>}</header>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      {account && <div className="flex flex-wrap gap-1" role="group" aria-label="Team directory"><Button variant={scope === null ? 'secondary' : 'ghost'} aria-pressed={scope === null} onClick={() => { setScope(null); reset(); }}>League teams</Button><Button variant={scope === 'mine' ? 'secondary' : 'ghost'} aria-pressed={scope === 'mine'} onClick={() => { setScope('mine'); reset(); }}>Your teams and invitations</Button></div>}
      <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input aria-label="Search teams" placeholder="Search teams…" value={search} onChange={event => { setSearch(event.target.value); reset(); }} className="pl-9" /></div>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error.message}<Button variant="link" onClick={() => { reset(); void refetch({ after: null }).catch(() => {}); }}>Restart teams</Button></AlertDescription></Alert>}
    {actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}
    {loading && <div role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><span className="sr-only">Loading teams…</span>{[0, 1, 2].map(index => <Skeleton key={index} className="h-64 rounded-xl" />)}</div>}
    {!loading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{data?.teamSummaries.nodes.map(team => <Card key={team.id} className="flex min-w-0 flex-col overflow-hidden">
      <CardHeader className="gap-4"><div className="flex items-center justify-between gap-3"><div className="flex size-16 shrink-0 items-center justify-center rounded-xl border bg-muted">{team.logoUrl ? <MediaImage src={team.logoUrl} alt={`${team.name} logo`} className="size-14 object-contain" /> : <Shield className="size-7 text-muted-foreground" />}</div><Badge variant={team.status === 'approved' ? 'secondary' : 'outline'} className="capitalize">{team.status}</Badge></div><div><CardTitle className="break-words text-xl">{team.name}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{team.tag}</p></div></CardHeader>
      <CardContent className="flex-1 space-y-2 text-sm"><p className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" />{team.memberCount} players</p><p className="break-words text-muted-foreground">Captain: <span className="text-foreground">{team.ownerUsername}</span></p>
        {team.viewerInvitation === 'pending' && <div className="mt-4 space-y-3 rounded-lg border bg-muted/50 p-3"><p>You are invited to this team.</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={responding !== null} onClick={() => { void invitation(team.id, true); }}>Accept</Button><Button variant="outline" size="sm" disabled={responding !== null} onClick={() => { void invitation(team.id, false); }}>Decline</Button></div>{responding === team.id && <p role="status">Saving your response…</p>}</div>}
      </CardContent><CardFooter><Button variant="outline" className="w-full" onClick={() => setSelected(team.id)}>View roster and team</Button></CardFooter>
    </Card>)}</div>}
    {!loading && data?.teamSummaries.totalCount === 0 && <Card><CardContent className="space-y-2 py-12 text-center"><Users className="mx-auto size-8 text-muted-foreground" /><p className="font-medium">No teams match this view.</p><p className="text-sm text-muted-foreground">Try another search or browse the league directory.</p></CardContent></Card>}
    <div className="flex justify-between gap-3"><Button variant="outline" disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous teams</Button><Button variant="outline" disabled={loading || !data?.teamSummaries.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.teamSummaries.pageInfo.endCursor ?? null); }}>Next teams</Button></div>
    {account && <section className="border-t pt-6" aria-label="League standings"><TeamStandings /></section>}
    {showSubmit && account && <SubmitTeamModal account={account} onClose={() => setShowSubmit(false)} onSave={() => { void refreshed().catch((error: unknown) => { setActionError(error instanceof Error ? error.message : 'Team submitted, but refreshing failed.'); }); }} />}
    {selected && <TeamDetails key={selected} id={selected} account={account} onClose={() => setSelected(null)} onChanged={refreshed} />}
  </div>;
}

function TeamDetails({ id, account, onClose, onChanged }: { id: string; account: Account | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const detail = useResource(async () => {
    const team = await request<TeamDetail>(`/api/teams/${segment(id)}`);
    const lineup = z.record(z.string(), z.string()).parse(await readFields(team.lineupUrl));
    return { ...team, lineup };
  }, [id]);
  const roster = useQuery(TeamPlayersDocument, { variables: { teamId: id, after: null } });
  const players = (roster.data?.teamPlayers.nodes ?? []).map(mapCardAccount);
  const [selected, setSelected] = useState<PlayerSelection | null>(null);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<'leave' | 'dismiss' | null>(null);
  const [busy, setBusy] = useState(false);
  const team = detail.data;
  const changeMembership = async () => {
    setBusy(true); setError('');
    try {
      if (confirmation === 'leave') await teamApi.changeMembership(id, 'leave');
      else await teamApi.deleteTeam(id);
      await onChanged(); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update team membership.'); }
    finally { setBusy(false); }
  };
  return <ModalShell title={team?.name ?? 'Team'} onClose={onClose} maxWidth="max-w-4xl">
    <div className="space-y-5">
      {(detail.loading || roster.loading) && <p role="status" className="text-sm text-muted-foreground">Loading team and roster…</p>}
      {(detail.error || roster.error || error) && <Alert variant="destructive"><AlertDescription>{detail.error || roster.error?.message || error}<Button variant="link" onClick={() => { setError(''); void detail.reload(); void roster.refetch({ after: null }).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load roster.'); }); }}>Reload team</Button></AlertDescription></Alert>}
      {team && <>
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{team.tag}</Badge><Badge variant="secondary" className="capitalize">{team.status}</Badge><span className="text-sm text-muted-foreground">Captain: {team.ownerUsername}</span></div>
        <LazyText url={team.descriptionUrl} label="Read team description" />
        {team.status === 'rejected' && team.rejectionReasonUrl && <LazyText url={team.rejectionReasonUrl} label="Read review reason" />}
        <div className="flex flex-wrap gap-2">{team.status === 'rejected' && account?.username === team.ownerUsername && <Button variant="outline" onClick={() => setConfirmation('dismiss')}>Dismiss and resubmit</Button>}{account?.teamId === id && account.username !== team.ownerUsername && <Button variant="outline" onClick={() => setConfirmation('leave')}>Leave team</Button>}</div>
        <div className="flex items-center gap-2"><h3 className="text-lg font-semibold">Roster</h3><Badge variant="secondary">{roster.data?.teamPlayers.totalCount ?? '…'}</Badge></div>
        {roster.data?.teamPlayers.pageInfo.hasNextPage && <Alert><AlertDescription>More roster cards are available. Load them before editing the complete lineup.</AlertDescription></Alert>}
        <TeamRosterFormation team={team} allPlayers={players} onCardClick={player => setSelected({ id: player.id })} isCaptain={isTeamCaptain(account, team) && !!roster.data && !roster.loading && !roster.error && !error && !roster.data.teamPlayers.pageInfo.hasNextPage} onLineupSaved={() => { void detail.reload(); }} />
        {roster.data?.teamPlayers.pageInfo.hasNextPage && <Button variant="outline" disabled={roster.loading} onClick={() => { void roster.fetchMore({ variables: { after: roster.data!.teamPlayers.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ teamPlayers: { ...fetchMoreResult.teamPlayers, nodes: [...before.teamPlayers.nodes, ...fetchMoreResult.teamPlayers.nodes] } }) }).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load roster.'); }); }}>Load more roster cards</Button>}
      </>}
    </div>
    <AlertDialog open={confirmation !== null} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmation === 'leave' ? `Leave ${team?.name ?? 'this team'}?` : 'Dismiss this submission?'}</AlertDialogTitle><AlertDialogDescription>{confirmation === 'leave' ? 'You will leave the roster and become a free agent.' : 'This removes the rejected team so you can submit it again.'}</AlertDialogDescription></AlertDialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void changeMembership(); }}>{busy ? 'Saving…' : 'Confirm'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {selected && <SelectedPlayerCard selection={selected} teams={team ? [team] : []} onClose={() => setSelected(null)} />}
  </ModalShell>;
}
