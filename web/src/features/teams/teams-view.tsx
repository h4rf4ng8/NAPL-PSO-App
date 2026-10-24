import { useEffect, useState } from 'react';
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
  const [selected, setSelected] = useState<string | null>(null);
  const [showSubmit, setShowSubmit] = useState(false);
  const [actionError, setActionError] = useState('');
  // Request the server's max page size (50) and auto-load the rest. The
  // old UI had Previous/Next team buttons that hid teams past page 10 from
  // view; now every approved team shows at once as users scroll.
  const { data, loading, error, fetchMore, refetch } = useQuery(TeamSummariesDocument, {
    variables: { scope, search, status: scope ? null : 'approved', first: 50 },
  });
  useEffect(() => {
    if (!data?.teamSummaries.pageInfo.hasNextPage) return;
    void fetchMore({
      variables: { after: data.teamSummaries.pageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => ({
        teamSummaries: {
          ...fetchMoreResult.teamSummaries,
          nodes: [...previous.teamSummaries.nodes, ...fetchMoreResult.teamSummaries.nodes],
        },
      }),
    }).catch((loadError: unknown) => { console.error('team fetchMore failed:', loadError); });
  }, [data?.teamSummaries.pageInfo.endCursor, data?.teamSummaries.pageInfo.hasNextPage, fetchMore]);
  const refreshed = async () => { const me = account ? await auth.getCurrent() : null; if (me) onUpdate?.(me); await refetch(); };
  const invitation = async (id: string, accept: boolean) => {
    setActionError(''); try { await teamApi.respondInvitation(id, accept); await refreshed(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not respond to invitation.'); }
  };
  return <div className="space-y-4">
    <div className="flex gap-3 items-center"><h3 className="font-display text-3xl">TEAMS</h3>
      {account && <><button onClick={() => { setScope(null); }}>League teams</button><button onClick={() => { setScope('mine'); }}>Your teams and invitations</button><button onClick={() => setShowSubmit(true)}>Submit team</button></>}
    </div>
    <input aria-label="Search teams" placeholder="Search teams" value={search} onChange={event => { setSearch(event.target.value); }} />
    {loading && <p role="status">Loading teams…</p>}
    {error && <p role="alert">{error.message}<button onClick={() => { void refetch().catch(() => {}); }}>Restart teams</button></p>}
    {actionError && <p role="alert">{actionError}</p>}
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">{data?.teamSummaries.nodes.map(team => <section key={team.id} className="asl-team-card border rounded-xl p-4">
      {team.logoUrl && <MediaImage src={team.logoUrl} alt={`${team.name} logo`} className="w-20 h-20 object-contain" />}
      <h4 className="font-display text-2xl">{team.name} [{team.tag}]</h4><p>{team.memberCount} players · {team.status}</p><p>Captain: {team.ownerUsername}</p>
      <button onClick={() => setSelected(team.id)}>View roster and team</button>
      {team.viewerInvitation === 'pending' && <div><p>You are invited to this team.</p><button onClick={() => { void invitation(team.id, true); }}>Accept</button><button onClick={() => { void invitation(team.id, false); }}>Decline</button></div>}
    </section>)}</div>
    {data?.teamSummaries.totalCount === 0 && <p>No teams match this view.</p>}
    {data?.teamSummaries.pageInfo.hasNextPage && <p role="status">Loading more teams…</p>}
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
  // Request the server max (50) and auto-fetch the rest so every roster
  // member shows and the captain's edit controls aren't blocked waiting
  // for a manual "Load more" click.
  const roster = useQuery(TeamPlayersDocument, { variables: { teamId: id, first: 50, after: null } });
  useEffect(() => {
    if (!roster.data?.teamPlayers.pageInfo.hasNextPage) return;
    void roster.fetchMore({
      variables: { after: roster.data.teamPlayers.pageInfo.endCursor },
      updateQuery: (previous, { fetchMoreResult }) => ({
        teamPlayers: {
          ...fetchMoreResult.teamPlayers,
          nodes: [...previous.teamPlayers.nodes, ...fetchMoreResult.teamPlayers.nodes],
        },
      }),
    }).catch((loadError: unknown) => { console.error('roster fetchMore failed:', loadError); });
  }, [roster.data?.teamPlayers.pageInfo.endCursor, roster.data?.teamPlayers.pageInfo.hasNextPage, roster.fetchMore]);
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
    {(detail.error || roster.error || error) && <p role="alert">{detail.error || roster.error?.message || error}<button onClick={() => { setError(''); void detail.reload(); void roster.refetch().catch((error: unknown) => { setError(error instanceof Error ? error.message : 'Could not load roster.'); }); }}>Reload team</button></p>}
    {team && <>
      <p>{team.tag} · Captain: {team.ownerUsername} · {team.status}</p>
      <LazyText url={team.descriptionUrl} label="Read team description" />
      {team.status === 'rejected' && team.rejectionReasonUrl && <LazyText url={team.rejectionReasonUrl} label="Read review reason" />}
      {team.status === 'rejected' && account?.username === team.ownerUsername && <button onClick={() => { void dismiss(); }}>Dismiss and resubmit</button>}
      {account?.teamId === id && account.username !== team.ownerUsername && <button onClick={() => { void leave(); }}>Leave team</button>}
      <h4>ROSTER ({roster.data?.teamPlayers.totalCount ?? '…'})</h4>
      {roster.data?.teamPlayers.pageInfo.hasNextPage && <p role="status">Loading more roster cards…</p>}
      {/* isCaptain stays guarded on roster being fully loaded + error-free so
          captains don't edit lineups against a partial roster, but the auto-
          fetch above means that state resolves without any manual click. */}
      <TeamRosterFormation team={team} allPlayers={players} onCardClick={player => setSelected({ id: player.id })} isCaptain={isTeamCaptain(account, team) && !!roster.data && !roster.loading && !roster.error && !error && !roster.data.teamPlayers.pageInfo.hasNextPage} onLineupSaved={() => { void detail.reload(); }} />
    </>}
    {selected && <SelectedPlayerCard selection={selected} teams={team ? [team] : []} onClose={() => setSelected(null)} />}
  </ModalShell>;
}
