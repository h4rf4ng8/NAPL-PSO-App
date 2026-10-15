import { useEffect, useMemo, useRef, useState } from 'react';
import type { Account } from '../accounts/models';
import { ShareableCardModal, TierPreview } from '../../components/PlayerCard';
import { C } from '../../theme/theme';
import { useTheme } from '../../theme/use-theme';
import { isAdmin } from '../../utils/league';
import { calcRankings, getStatsForSeason } from '../../utils/rankings';
import { EditNameModal, EditPositionModal, OnboardingModal, StatsView, UploadImageModal } from '../accounts';
import { AdminPanel } from '../admin';
import { HallOfFameView, HomeView, NewsHub, RulesView } from '../content';
import { ScheduleView, StandingsView } from '../matches';
import { TeamsView, TransfersView } from '../teams';
import { VotingTab } from '../voting';
import { loadMemberLeague } from './data';
import { useResource } from '../../hooks/use-resource';
import { Header } from './Header';
import { MatchLog } from './MatchLog';
import { MyCard, type CardAction } from './MyCard';
import { activePeriod, collectSeasons } from './selectors';
import { useView } from './use-view';

export function Dashboard({ account, onLogout, onUpdate }: { account: Account; onLogout: () => void; onUpdate: (account: Account) => void }) {
  const [view, setView] = useView();
  const [modal, setModal] = useState<CardAction | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Account | null>(null);
  const [season, setSeason] = useState('all');
  const { theme, toggleTheme } = useTheme();
  const { data, loading, error, reload } = useResource(loadMemberLeague, [account.id]);
  const updateRef = useRef(onUpdate);
  updateRef.current = onUpdate;
  useEffect(() => { if (data?.me.id === account.id) updateRef.current(data.me); }, [data, account.id]);

  const players = data?.players ?? [];
  const teams = data?.teams ?? [];
  const currentSeason = data?.currentSeason ?? 'S1';
  const rankings = useMemo(() => calcRankings(players, data?.weightings), [players, data?.weightings]);
  const allSeasons = useMemo(() => collectSeasons(players, currentSeason), [players, currentSeason]);
  const myTeam = teams.find(team => team.id === account.teamId && team.status === 'approved');
  const period = activePeriod(data?.periods ?? []);
  const cardAccount = { ...account, stats: getStatsForSeason(account, season) };
  const closeModal = () => setModal(null);
  const savedAccount = (updated: Account) => { onUpdate(updated); void reload(); };

  return (
    <div className="min-h-screen pitch-bg" style={{ color: C.cream }}>
      <div className="absolute inset-0 pitch-lines opacity-20 pointer-events-none" />
      {!account.strikersId && <OnboardingModal account={account} onComplete={savedAccount} />}
      <Header account={account} season={season} setSeason={setSeason}
        allSeasons={allSeasons} tickerNews={data?.tickerNews ?? []} view={view} setView={setView}
        currentVotingPeriod={period} onLogout={onLogout} theme={theme} toggleTheme={toggleTheme} />
      <main className="relative max-w-6xl mx-auto px-4 py-6 fade-in">
        {loading && !data && <p role="status">Loading league…</p>}
        {error && <p role="alert">{error} <button onClick={() => void reload()}>Try again</button></p>}
        {view === 'home' && <HomeView account={account} allPlayers={players} allTeams={teams} news={data?.news ?? []} rankings={rankings} currentSeason={currentSeason} onJump={setView} onUpdate={savedAccount} />}
        {view === 'me' && <MyCard account={account} season={season} currentSeason={currentSeason} allSeasons={allSeasons} setSeason={setSeason} myTeam={myTeam} rankings={rankings} onEdit={setModal} />}
        {view === 'matches' && <MatchLog account={account} season={season} />}
        {view === 'teams' && <TeamsView account={account} onUpdate={savedAccount} rankings={rankings} currentSeason={currentSeason} />}
        {view === 'leaderboard' && <StatsView allPlayers={players} allTeams={teams} rankings={rankings} onPlayerClick={setSelectedPlayer} />}
        {view === 'hof' && <HallOfFameView allPlayers={players} allTeams={teams} onPlayerClick={setSelectedPlayer} />}
        {view === 'tiers' && <TierPreview />}
        {view === 'standings' && <StandingsView />}
        {view === 'schedule' && <ScheduleView account={account} />}
        {view === 'transfers' && <TransfersView account={account} />}
        {view === 'rules' && <RulesView onJump={setView} />}
        {view === 'news' && <NewsHub account={account} allTeams={teams} />}
        {view === 'vote' && (period ? <VotingTab account={account} period={period} allPlayers={players} rankings={rankings} onRefresh={reload} /> : <p>No voting period is open.</p>)}
        {view === 'admin' && (isAdmin(account) ? <AdminPanel account={account} onLeagueChanged={reload} /> : <p role="alert">Administrator access is required.</p>)}
      </main>
      {modal === 'pos' && <EditPositionModal account={account} onClose={closeModal} />}
      {modal === 'name' && <EditNameModal account={account} onClose={closeModal} onSave={savedAccount} />}
      {modal === 'image' && <UploadImageModal account={account} onClose={closeModal} onSave={savedAccount} />}
      {modal === 'share' && <ShareableCardModal account={cardAccount} team={myTeam} rankings={rankings} onClose={closeModal} />}
      {selectedPlayer && <ShareableCardModal account={selectedPlayer} team={teams.find(team => team.id === selectedPlayer.teamId)} rankings={rankings} onClose={() => setSelectedPlayer(null)} />}
    </div>
  );
}
