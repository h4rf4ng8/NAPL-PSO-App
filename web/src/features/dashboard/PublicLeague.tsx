import { useState } from 'react';
import { SelectedPlayerCard } from '../accounts/SelectedPlayerCard';
import type { PlayerSelection } from '../accounts/StatsView';
import { ASLLogoFull } from '../../components/Branding';
import { C } from '../../theme/theme';
import { StatsView } from '../accounts';
import { NewsHub, RulesView } from '../content';
import { ScheduleView } from '../matches';
import { TeamsView, TransfersView } from '../teams';

export const PublicLeague = ({onLogin}: { onLogin: () => void }) => {
  const teams: import('../teams/models').TeamSummary[] = [];
  const [view,setView]=useState('teams');
  const [selectedPlayer,setSelectedPlayer]=useState<PlayerSelection | null>(null);

  return <div className="min-h-screen pitch-bg" style={{color:C.cream}}>
    <header className="asl-header p-4 flex justify-between items-center"><ASLLogoFull color={C.onColor}/><button onClick={onLogin} className="asl-user-chip px-3 py-2">SIGN IN WITH DISCORD</button></header>
    <nav className="asl-nav-bar flex flex-wrap justify-center p-2">{['teams','stats','schedule','news','transfers','rules'].map(tab=><button key={tab} onClick={()=>setView(tab)} className={`asl-nav-tab px-3 py-2 ${view===tab?'active':''}`}>{tab}</button>)}</nav>
    <main className="max-w-6xl mx-auto p-4">
      {view==='stats'&&<StatsView allTeams={teams} onPlayerClick={setSelectedPlayer}/>}
      {view==='schedule'&&<ScheduleView account={null}/>}
      {view==='news'&&<NewsHub account={null} allTeams={teams}/>}
      {view==='transfers'&&<TransfersView account={null}/>}
      {view==='rules'&&<RulesView onJump={setView}/>}
      {view==='teams'&&<TeamsView account={null}/>}
    </main>
    {selectedPlayer&&<SelectedPlayerCard selection={selectedPlayer} teams={teams} onClose={()=>setSelectedPlayer(null)}/>}
  </div>;
};
