import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
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
  const { data, loading, error, refetch } = useQuery(TeamSummariesDocument, { variables: { scope, search, status: scope ? null : 'approved', after } });
  const reset = () => { setAfter(null); setPrevious([]); };
  const refreshed = async () => { const me = account ? await auth.getCurrent() : null; if (me) onUpdate?.(me); reset(); await refetch({ after: null }); };
  const invitation = async (id: string, accept: boolean) => {
    setActionError(''); try { await teamApi.respondInvitation(id, accept); await refreshed(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not respond to invitation.'); }
  };
  return <div className="space-y-4">
    <div className="flex gap-3 items-center"><h3 className="font-display text-3xl">TEAMS</h3>
      {account && <><button onClick={() => { setScope(null); reset(); }}>League teams</button><button onClick={() => { setScope('mine'); reset(); }}>Your teams and invitations</button><button onClick={() => setShowSubmit(true)}>Submit team</button></>}
    </div>
    <input aria-label="Search teams" placeholder="Search teams" value={search} onChange={event => { setSearch(event.target.value); reset(); }} />
    {loading && <p role="status">Loading teams…</p>}
    {error && <p role="alert">{error.message}<button onClick={() => { reset(); void refetch({ after: null }).catch(() => {}); }}>Restart teams</button></p>}
    {actionError && <p role="alert">{actionError}</p>}
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{data?.teamSummaries.nodes.map(team => <section key={team.id} className="asl-team-card border rounded-xl p-4">
      {team.logoUrl && <MediaImage src={team.logoUrl} alt={`${team.name} logo`} className="w-20 h-20 object-contain" />}
      <h4 className="font-display text-2xl">{team.name} [{team.tag}]</h4><p>{team.memberCount} players · {team.status}</p><p>Captain: {team.ownerUsername}</p>
      <button onClick={() => setSelected(team.id)}>View roster and team</button>
      {team.viewerInvitation === 'pending' && <div><p>You are invited to this team.</p><button onClick={() => { void invitation(team.id, true); }}>Accept</button><button onClick={() => { void invitation(team.id, false); }}>Decline</button></div>}
    </section>)}</div>
    {data?.teamSummaries.totalCount === 0 && <p>No teams match this view.</p>}
    <div className="flex gap-3"><button disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous teams</button><button disabled={loading || !data?.teamSummaries.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.teamSummaries.pageInfo.endCursor ?? null); }}>Next teams</button></div>
    {account && <TeamStandings />}
    {showSubmit && account && <SubmitTeamModal account={account} onClose={() => setShowSubmit(false)} onSave={() => { void refreshed(); }} />}
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
  const team = detail.data;
  const leave = async () => {
    if (!confirm(`Leave ${team?.name ?? 'this team'}?`)) return;
    try { await teamApi.changeMembership(id, 'leave'); await onChanged(); onClose(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not leave team.'); }
  };
  const dismiss = async () => {
    try { await teamApi.deleteTeam(id); await onChanged(); onClose(); } catch (error) { setError(error instanceof Error ? error.message : 'Could not dismiss team.'); }
  };
  return <ModalShell title={team?.name ?? 'TEAM'} onClose={onClose} maxWidth="max-w-4xl">
    {(detail.loading || roster.loading) && <p role="status">Loading team and roster…</p>}
    {(detail.error || roster.error || error) && <p role="alert">{detail.error || roster.error?.message || error}<button onClick={() => { setError(''); void detail.reload(); void roster.refetch({ after: null }).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load roster.'); }); }}>Reload team</button></p>}
    {team && <>
      <p>{team.tag} · Captain: {team.ownerUsername} · {team.status}</p>
      <LazyText url={team.descriptionUrl} label="Read team description" />
      {team.status === 'rejected' && team.rejectionReasonUrl && <LazyText url={team.rejectionReasonUrl} label="Read review reason" />}
      {team.status === 'rejected' && account?.username === team.ownerUsername && <button onClick={() => { void dismiss(); }}>Dismiss and resubmit</button>}
      {account?.teamId === id && account.username !== team.ownerUsername && <button onClick={() => { void leave(); }}>Leave team</button>}
      <h4>ROSTER ({roster.data?.teamPlayers.totalCount ?? '…'})</h4>
      {roster.data?.teamPlayers.pageInfo.hasNextPage && <p>More roster cards are available. Load them before editing the complete lineup.</p>}
      <TeamRosterFormation team={team} allPlayers={players} onCardClick={player => setSelected({ id: player.id })} isCaptain={isTeamCaptain(account, team) && !!roster.data && !roster.loading && !roster.error && !error && !roster.data.teamPlayers.pageInfo.hasNextPage} onLineupSaved={() => { void detail.reload(); }} />
      {roster.data?.teamPlayers.pageInfo.hasNextPage && <button disabled={roster.loading} onClick={() => { void roster.fetchMore({ variables: { after: roster.data!.teamPlayers.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ teamPlayers: { ...fetchMoreResult.teamPlayers, nodes: [...before.teamPlayers.nodes, ...fetchMoreResult.teamPlayers.nodes] } }) }).catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load roster.'); }); }}>Load more roster cards</button>}
    </>}
    {selected && <SelectedPlayerCard selection={selected} teams={team ? [team] : []} onClose={() => setSelected(null)} />}
  </ModalShell>;
}
