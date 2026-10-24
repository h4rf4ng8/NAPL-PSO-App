import { useState } from 'react';
import { SelectedPlayerCard } from '../accounts/SelectedPlayerCard';
import type { PlayerSelection } from '../accounts/StatsView';
import { AppShell, isPublicView, LeagueNavigation, ThemeButton, titleForView } from './AppShell';
import { useTheme } from '../../theme/use-theme';
import { useView } from './use-view';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { Toaster } from '../../components/ui/sonner';
import { StatsView } from '../accounts';
import { NewsHub, RulesView } from '../content';
import { ScheduleView } from '../matches';
import { TeamsView, TransfersView } from '../teams';

export const PublicLeague = ({onLogin}: { onLogin: () => void }) => {
  const teams: import('../teams/models').TeamSummary[] = [];
  const [view,setView]=useView('teams');
  const { theme, toggleTheme } = useTheme();
  const [selectedPlayer,setSelectedPlayer]=useState<PlayerSelection | null>(null);

  return <>
    <AppShell title={titleForView(view)} navigation={<LeagueNavigation account={null} view={view} onNavigate={setView} />} toolbar={<><ThemeButton theme={theme} onToggle={toggleTheme} /><Button onClick={onLogin}>Sign in with Discord</Button></>}>
      {!isPublicView(view) && <Card><CardHeader><CardTitle>Join the league</CardTitle><CardDescription>Sign in to access {titleForView(view).toLowerCase()}.</CardDescription></CardHeader><CardContent><Button onClick={onLogin}>Sign in with Discord</Button></CardContent></Card>}
      {view==='leaderboard'&&<StatsView allTeams={teams} onPlayerClick={setSelectedPlayer}/>}
      {view==='schedule'&&<ScheduleView account={null}/>}
      {view==='news'&&<NewsHub account={null} allTeams={teams}/>}
      {view==='transfers'&&<TransfersView account={null}/>}
      {view==='rules'&&<RulesView onJump={setView}/>}
      {view==='teams'&&<TeamsView account={null}/>}
    </AppShell>
    {selectedPlayer&&<SelectedPlayerCard selection={selectedPlayer} teams={teams} onClose={()=>setSelectedPlayer(null)}/>}
    <Toaster theme={theme} />
  </>;
};
