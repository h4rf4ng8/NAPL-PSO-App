import { useQuery } from '@apollo/client/react';
import { PlayerCardDocument } from '../../api/generated/graphql';
import { FullRecord } from '../../components/FullRecord';
import { ModalShell } from '../../components/Dialog';
import { ShareableCardContent } from '../../components/ShareableCardModal';
import type { TeamSummary as Team } from '../teams/models';
import type { PlayerSelection } from './StatsView';
import { TrophyHistory } from './TrophyHistory';
import { mapCardAccount } from './api';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';


export function SelectedPlayerCard({ selection, teams, onClose }: { selection: PlayerSelection; teams: Team[]; onClose: () => void }) {
  const { data, loading, error, refetch } = useQuery(PlayerCardDocument, { variables: { id: selection.id, season: selection.season ?? 'all' } });
  const account = data?.accountCard ? mapCardAccount(data.accountCard) : null;
  return <ModalShell title={account ? `${account.username}'s player card` : 'Player card'} onClose={onClose} maxWidth="max-w-xl" closeOnOutside>
    {account ? <ShareableCardContent key={account.id} account={account} team={account._team ?? teams.find(team => team.id === account.teamId)} onClose={onClose}>
      <TrophyHistory accountId={account.id} /><FullRecord key={account.id} url={`/api/accounts/${encodeURIComponent(account.id)}/stats`} label="Read full original stats" />
    </ShareableCardContent> : (loading ? <div role="status" className="space-y-3"><Skeleton className="mx-auto h-96 w-full max-w-xs" /><p className="text-center text-sm text-muted-foreground">Loading player card…</p></div> : <Alert variant="destructive"><AlertDescription className="space-y-3"><p>{error?.message ?? 'Player unavailable.'}</p><Button variant="outline" onClick={() => { void refetch().catch(() => {}); }}>Retry</Button></AlertDescription></Alert>)}
  </ModalShell>;
}
