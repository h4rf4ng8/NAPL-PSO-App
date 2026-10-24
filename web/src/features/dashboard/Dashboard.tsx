import { mergeSeasonPages } from './season-pages';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectedPlayerCard } from '../accounts/SelectedPlayerCard';
import type { PlayerSelection } from '../accounts/StatsView';
import type { Account } from '../accounts/models';
import { ShareableCardModal } from '../../components/ShareableCardModal';
import { TierPreview } from './TierPreview';
import { useTheme } from '../../theme/use-theme';
import { isAdmin } from '../../utils/league';
import { getStatsForSeason } from '../../utils/rankings';
import { EditPositionModal, OnboardingModal, StatsView, UploadImageModal } from '../accounts';
import { AdminPanel } from '../admin';
import { HallOfFameView, HomeView, NewsHub, RulesView } from '../content';
import { ScheduleView, StandingsView } from '../matches';
import { TeamsView, TransfersView } from '../teams';
import { VotingTab } from '../voting';
import { mapCurrentCard } from '../accounts/api';
import { useQuery } from '@apollo/client/react';
import { LeagueOverviewDocument, SeasonsDocument } from '../../api/generated/graphql';
import { AppShell, AccountMenu, LeagueNavigation, ThemeButton, titleForView } from './AppShell';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Toaster } from '../../components/ui/sonner';
import { MatchLog } from './MatchLog';
import { MyCard, type CardAction } from './MyCard';
import { useView } from './use-view';

export function Dashboard({ account, onLogout, onUpdate }: { account: Account; onLogout: () => void; onUpdate: (account: Account) => void }) {
  const [view, setView] = useView();
  const [modal, setModal] = useState<CardAction | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerSelection | null>(null);
  const [seasonPageError, setSeasonPageError] = useState('');
  const [season, setSeason] = useState('all');
  const { theme, toggleTheme } = useTheme();
  const { data: result, loading, error, refetch } = useQuery(LeagueOverviewDocument, { variables: { season }, fetchPolicy: 'cache-and-network' });
  // Mutation-driven cache resets must not unmount an editor or discard its receipt.
  // Retain only this account/season's last completed overview while it refreshes.
  const [overview, setOverview] = useState({ accountId: account.id, season, result });
  const sameScope = overview.accountId === account.id && overview.season === season;
  if (!sameScope || (result && result !== overview.result)) setOverview({ accountId: account.id, season, result });
  const currentResult = result ?? (sameScope ? overview.result : undefined);
  const previousView = useRef(view);
  useEffect(() => {
    if (view === 'me' && previousView.current !== view) void refetch().catch(() => { /* Apollo renders refetch errors below. */ });
    previousView.current = view;
  }, [view, refetch]);
  const data = useMemo(() => currentResult?.leagueOverview.me?.id === account.id ? { me: mapCurrentCard(currentResult.leagueOverview.me), currentSeason: currentResult.leagueOverview.season, tickerNews: currentResult.leagueOverview.tickerNews, period: currentResult.leagueOverview.activeVotingPeriod } : undefined, [currentResult, account.id]);
  const { data: seasonData, loading: seasonsLoading, error: seasonsError, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  useEffect(() => { if (data?.me.id === account.id) updateRef.current(data.me); }, [data, account.id]);

  const teams = data?.me._team ? [data.me._team] : [];
  const currentSeason = data?.currentSeason ?? 'S1';
  const allSeasons = seasonData?.seasons.nodes ?? [currentSeason];
  const myTeam = teams.find(team => team.id === account.teamId && team.status === 'approved');
  const period = data?.period ?? null;
  const cardAccount = { ...(data?.me ?? account), stats: getStatsForSeason(data?.me ?? account, season), _cardSeason: season };
  const seasonScoped = view === 'me' || view === 'matches';
  const closeModal = () => setModal(null);
  const savedAccount = (updated: Account) => {
    onUpdate({
      ...updated,
      ranking: updated.ranking ?? data?.me.ranking ?? account.ranking,
      cardStats: updated.cardStats ?? data?.me.cardStats ?? account.cardStats,
    });
  };

  return (
    <>
      {!account.strikersId && <OnboardingModal account={account} onComplete={savedAccount} />}
      <AppShell title={titleForView(view)} navigation={<LeagueNavigation account={account} view={view} onNavigate={setView} votingOpen={!!period} />} toolbar={<>
        {view === 'matches' && <Select value={season} onValueChange={setSeason}><SelectTrigger className="w-32" aria-label="Dashboard season"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All time</SelectItem>{allSeasons.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select>}
        <ThemeButton theme={theme} onToggle={toggleTheme} /><AccountMenu account={account} onLogout={onLogout} />
      </>}>
        {seasonScoped && (seasonPageError || seasonsError) && <Alert variant="destructive"><AlertDescription>{seasonPageError || seasonsError?.message}<Button variant="outline" onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></AlertDescription></Alert>}
        {seasonScoped && seasonData?.seasons.pageInfo.hasNextPage && <Button variant="outline" disabled={seasonsLoading} onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}
        {data?.tickerNews[0] && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-4 py-2 text-sm"><span className="min-w-0 break-words">{data.tickerNews[0].title}</span><Button variant="link" onClick={() => setView('news')}>Latest news</Button></div>}
        {loading && !data && <div role="status" className="space-y-3"><span className="sr-only">Loading league…</span><Skeleton className="h-6 w-48" /><Skeleton className="h-20 w-full" /></div>}
        {error && <Alert variant="destructive"><AlertDescription>{error.message} <Button variant="outline" onClick={() => { void refetch().catch(() => {}); }}>Try again</Button></AlertDescription></Alert>}
        {view === 'home' && <HomeView account={data?.me ?? account} allTeams={teams} currentSeason={data?.currentSeason} onJump={setView} onUpdate={savedAccount} />}
        {data && view === 'me' && <MyCard account={data.me} season={season} currentSeason={currentSeason} allSeasons={allSeasons} setSeason={setSeason} myTeam={myTeam} onEdit={setModal} />}
        {view === 'matches' && <MatchLog account={account} season={season} />}
        {data && view === 'teams' && <TeamsView account={data.me} onUpdate={savedAccount} currentSeason={currentSeason} />}
        {data && view === 'leaderboard' && <StatsView allTeams={teams} onPlayerClick={setSelectedPlayer} />}
        {view === 'hof' && <HallOfFameView allTeams={teams} onPlayerClick={setSelectedPlayer} />}
        {view === 'tiers' && <TierPreview />}
        {view === 'standings' && <StandingsView />}
        {view === 'schedule' && <ScheduleView account={account} />}
        {view === 'transfers' && <TransfersView account={account} />}
        {view === 'rules' && <RulesView onJump={setView} />}
        {view === 'news' && <NewsHub account={account} allTeams={teams} />}
        {data && view === 'vote' && (period ? <VotingTab account={data.me} period={period} /> : <Alert><AlertDescription>No voting period is open.</AlertDescription></Alert>)}
        {view === 'admin' && (isAdmin(account) ? <AdminPanel account={account} /> : <Alert variant="destructive"><AlertDescription>Administrator access is required.</AlertDescription></Alert>)}
      </AppShell>
      {modal === 'pos' && <EditPositionModal account={account} onClose={closeModal} />}
      {modal === 'image' && <UploadImageModal account={account} onClose={closeModal} onSave={savedAccount} />}
      {data && modal === 'share' && <ShareableCardModal account={cardAccount} team={myTeam} onClose={closeModal} />}
      {selectedPlayer && <SelectedPlayerCard selection={selectedPlayer} teams={teams} onClose={() => setSelectedPlayer(null)} />}
      <Toaster theme={theme} />
    </>
  );
}
