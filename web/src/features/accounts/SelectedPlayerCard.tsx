import { useQuery } from '@apollo/client/react';
import { PlayerCardDocument } from '../../api/generated/graphql';
import { FullRecord } from '../../components/FullRecord';
import { ModalShell } from '../../components/Dialog';
import { ShareableCardModal } from '../../components/ShareableCardModal';
import type { TeamSummary as Team } from '../teams/models';
import type { PlayerSelection } from './StatsView';
import { TrophyHistory } from './TrophyHistory';
import { mapCardAccount } from './api';

export function SelectedPlayerCard({ selection, teams, onClose }: { selection: PlayerSelection; teams: Team[]; onClose: () => void }) {
  const { data, loading, error, refetch } = useQuery(PlayerCardDocument, { variables: { id: selection.id, season: selection.season ?? 'all' } });
  if (data?.accountCard) {
    const account = mapCardAccount(data.accountCard);
    return <ShareableCardModal account={account} team={account._team ?? teams.find(team => team.id === account.teamId)} onClose={onClose}><TrophyHistory accountId={account.id} /><FullRecord key={account.id} url={`/api/accounts/${encodeURIComponent(account.id)}/stats`} label="Read full original stats" /></ShareableCardModal>;
  }
  return <ModalShell title="PLAYER CARD" onClose={onClose}>
    {loading ? <p role="status">Loading player card…</p> : <p role="alert">{error?.message ?? 'Player unavailable.'} <button onClick={() => { void refetch().catch(() => {}); }}>Retry</button></p>}
  </ModalShell>;
}
