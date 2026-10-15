import { useMemo, useState } from 'react';
import type { Account } from '../accounts/models';
import { ASLLogoFull } from '../../components/Icons';
import { C } from '../../theme/theme';
import { calcRankings } from '../../utils/rankings';
import { StatsView } from '../accounts';
import { NewsHub, RulesView } from '../content';
import { ScheduleView, TeamStandings } from '../matches';
import { PlayerCardModal, TeamRosterFormation, TransfersView } from '../teams';
import { loadPublicLeague } from './api';
import { useResource } from '../../hooks/use-resource';

export const PublicLeague = ({onLogin}: { onLogin: () => void }) => {
  const {data,loading,error,reload}=useResource(loadPublicLeague, []);
  const players=data?.players ?? [];
  const teams=data?.teams ?? [];
  const teamRecords=data?.teamRecords ?? [];
  const [view,setView]=useState('standings');
  const [selectedPlayer,setSelectedPlayer]=useState<Account | null>(null);
  const rankings=useMemo(()=>calcRankings(players),[players]);

  return <div className="min-h-screen pitch-bg" style={{color:C.cream}}>
    <header className="asl-header p-4 flex justify-between items-center"><ASLLogoFull color={C.onColor}/><button onClick={onLogin} className="asl-user-chip px-3 py-2">SIGN IN WITH DISCORD</button></header>
    <nav className="asl-nav-bar flex flex-wrap justify-center p-2">{['standings','teams','stats','schedule','news','transfers','rules'].map(tab=><button key={tab} onClick={()=>setView(tab)} className={`asl-nav-tab px-3 py-2 ${view===tab?'active':''}`}>{tab}</button>)}</nav>
    <main className="max-w-6xl mx-auto p-4">
      {loading&&<p role="status">Loading league…</p>}
      {error&&<p role="alert">{error} <button onClick={()=>void reload()}>Try again</button></p>}
      {view==='standings'&&<TeamStandings allTeams={teams} allPlayers={players} records={teamRecords}/>}
      {view==='stats'&&<StatsView allTeams={teams} allPlayers={players} rankings={rankings} onPlayerClick={setSelectedPlayer}/>}
      {view==='schedule'&&<ScheduleView account={null}/>}
      {view==='news'&&<NewsHub account={null} allTeams={teams}/>}
      {view==='transfers'&&<TransfersView account={null}/>}
      {view==='rules'&&<RulesView onJump={setView}/>}
      {view==='teams'&&<div className="space-y-6">{teams.filter(team=>team.status==='approved').map(team=><section key={team.id}><h2 className="font-display text-3xl">{team.name}</h2><TeamRosterFormation team={team} allPlayers={players} rankings={rankings} onCardClick={setSelectedPlayer}/></section>)}</div>}
    </main>
    {selectedPlayer&&<PlayerCardModal player={selectedPlayer} team={teams.find(team=>team.id===selectedPlayer.teamId)} rankings={rankings} onClose={()=>setSelectedPlayer(null)}/>}
  </div>;
};
