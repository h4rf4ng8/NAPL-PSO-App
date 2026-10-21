import { mergeSeasonPages } from './season-pages';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectedPlayerCard } from '../accounts/SelectedPlayerCard';
import type { PlayerSelection } from '../accounts/StatsView';
import type { Account } from '../accounts/models';
import { ShareableCardModal } from '../../components/ShareableCardModal';
import { TierPreview } from './TierPreview';
import { C } from '../../theme/theme';
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
import { Header } from './Header';
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
  const { data: result, loading, error, refetch } = useQuery(LeagueOverviewDocument, { variables: { season } });
  const data = useMemo(() => result?.leagueOverview.me ? { me: mapCurrentCard(result.leagueOverview.me), currentSeason: result.leagueOverview.season, tickerNews: result.leagueOverview.tickerNews, period: result.leagueOverview.activeVotingPeriod } : undefined, [result]);
  const { data: seasonData, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  useEffect(() => { if (data?.me.id === account.id) updateRef.current(data.me); }, [data, account.id]);

  const teams = data?.me._team ? [data.me._team] : [];
  const currentSeason = data?.currentSeason ?? 'S1';
  const allSeasons = seasonData?.seasons.nodes ?? [currentSeason];
  const myTeam = teams.find(team => team.id === account.teamId && team.status === 'approved');
  const period = data?.period ?? null;
  const cardAccount = { ...(data?.me ?? account), stats: getStatsForSeason(data?.me ?? account, season), _cardSeason: season };
  const closeModal = () => setModal(null);
  const savedAccount = (updated: Account) => {
    onUpdate({
      ...updated,
      ranking: updated.ranking ?? data?.me.ranking ?? account.ranking,
      cardStats: updated.cardStats ?? data?.me.cardStats ?? account.cardStats,
    });
  };

  return (
    <div className="min-h-screen pitch-bg" style={{ color: C.cream }}>
      <div className="absolute inset-0 pitch-lines opacity-20 pointer-events-none" />
      {!account.strikersId && <OnboardingModal account={account} onComplete={savedAccount} />}
      <Header account={account} season={season} setSeason={setSeason}
        allSeasons={allSeasons} tickerNews={data?.tickerNews ?? []} view={view} setView={setView}
        currentVotingPeriod={period} onLogout={onLogout} theme={theme} toggleTheme={toggleTheme} />
{seasonPageError && <p role="alert">{seasonPageError}<button onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</button></p>}
      {seasonData?.seasons.pageInfo.hasNextPage && <button onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</button>}
      <main className="relative max-w-6xl mx-auto px-4 py-6 fade-in">
        {loading && !data && <p role="status">Loading league…</p>}
        {error && <p role="alert">{error.message} <button onClick={() => { void refetch().catch(() => {}); }}>Try again</button></p>}
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
        {data && view === 'vote' && (period ? <VotingTab account={data.me} period={period} /> : <p>No voting period is open.</p>)}
        {view === 'admin' && (isAdmin(account) ? <AdminPanel account={account} /> : <p role="alert">Administrator access is required.</p>)}
      </main>
      {modal === 'pos' && <EditPositionModal account={account} onClose={closeModal} />}
      {modal === 'image' && <UploadImageModal account={account} onClose={closeModal} onSave={savedAccount} />}
      {data && modal === 'share' && <ShareableCardModal account={cardAccount} team={myTeam} onClose={closeModal} />}
      {selectedPlayer && <SelectedPlayerCard selection={selectedPlayer} teams={teams} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}
