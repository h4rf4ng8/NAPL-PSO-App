import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ApolloProvider } from '@apollo/client/react';
import { client } from '../../src/api/client';
import { mapCurrentCard } from '../../src/features/accounts/api';
import { currentCard } from './league-data';
import { EditTeamModal } from '../../src/features/teams/team-forms';
import { loadTeamForEdit } from '../../src/features/teams/api';
import { TeamSelect } from '../../src/features/teams/TeamSelect';
import { TeamsView } from '../../src/features/teams/teams-view';
import { GenerateScheduleModal } from '../../src/features/matches/schedule-setup';
import { ScheduleView } from '../../src/features/matches/schedule-view';
import { ImportMatchManager } from '../../src/features/matches/match-import';
import { PlayersManager } from '../../src/features/admin/PlayersManager';
import { PicturesManager } from '../../src/features/admin/PicturesManager';
import { SeasonChampionsManager } from '../../src/features/admin/SeasonChampionsManager';
import { AdminPanel } from '../../src/features/admin/AdminPanel';
import { AdminsManager } from '../../src/features/admin/AdminsManager';
import { ArticleDetailView } from '../../src/features/content/Articles';
import type { Team } from '../../src/features/teams/models';
import '../../src/index.css';

function TeamEditor() {
  const [team, setTeam] = useState<Team>();
  const [saved, setSaved] = useState(false);
  useEffect(() => { void loadTeamForEdit('fixture-team').then(setTeam); }, []);
  return saved ? <output>Team saved</output> : (team ? <EditTeamModal team={team} onClose={() => {}} onSaved={() => setSaved(true)} /> : <p>Loading editor</p>);
}
function Regression() {
  const [value, setValue] = useState('');
  const [publicSchedule, setPublicSchedule] = useState(false);
  const account = mapCurrentCard(currentCard('captain'));
  const admin = { ...account, roles: ['super_admin' as const] };
  const kind = new URLSearchParams(location.search).get('case');
  switch (kind) {
    case 'team-editor': { return <TeamEditor />;
    }
    case 'team-select': { return <><TeamSelect value={value} onChange={setValue} label="Selected team" /><output aria-label="Selected team ID">{value}</output></>;
    }
    case 'teams': { return <TeamsView account={account} />;
    }
    case 'generation': { return <GenerateScheduleModal onClose={() => {}} onGenerated={() => {}} />;
    }
    case 'players': { return <PlayersManager onRefresh={() => {}} />;
    }
    case 'pictures': { return <PicturesManager onRefresh={() => {}} />;
    }
    case 'public-schedule': { return <><button onClick={() => setPublicSchedule(true)}>Become a visitor</button><ScheduleView account={publicSchedule ? null : account} /></>;
    }
    case 'schedule': { return <ScheduleView account={admin} />;
    }
    case 'champions': { return <SeasonChampionsManager account={admin} currentSeason="S1" onRefresh={() => {}} />;
    }
    case 'admin': { return <AdminPanel account={admin} />;
    }
    case 'admins': { return <AdminsManager />;
    }
    case 'import': { return <ImportMatchManager account={admin} currentSeason="S1" onRefresh={() => {}} />;
    }
    case 'article': { return <ArticleDetailView slug="league-update" account={admin} onBack={() => {}} />;
    }
    default: { return <p>Choose a production component regression.</p>;
    }
  }
}
createRoot(document.querySelector('#root')!).render(<ApolloProvider client={client}><main className="mx-auto max-w-6xl p-4"><Regression /></main></ApolloProvider>);
