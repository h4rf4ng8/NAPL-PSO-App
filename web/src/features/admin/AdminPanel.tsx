import { BookOpen, Calendar, CheckCircle, Crown, MessageSquare, Sparkles, TrendingUp, Trophy, User, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { teams as teamApi } from '../teams/api';
import { accounts as accountApi } from '../accounts/api';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import type { Team } from '../teams/models';
import { EmptyState } from '../../components/Ui';
import { C } from '../../theme/theme';
import { isSuperAdmin } from '../../utils/league';

import { RulesManager } from '../content';
import { ImportMatchManager } from '../matches';
import { EditTeamModal } from '../teams';
import { TotwManager } from '../voting';
import { SeasonManager } from './SeasonManager';
import { AwardsManager } from './AwardsManager';
import { SeasonChampionsManager } from './SeasonChampionsManager';
import { PlayersManager } from './PlayersManager';
import { PicturesManager } from './PicturesManager';
import { WeightingsManager } from './WeightingsManager';
import { IntegrationsManager } from './IntegrationsManager';
import { AdminsManager } from './AdminsManager';
import { partitionReviewTeams } from './team-review';
// AdminPanel
export const AdminPanel = ({ account }: { account: Account }) => {
  const [section, setSection] = useState('teams');
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadError, setLoadError] = useState('');
  const requestId = useRef(0);
  const [allPlayers, setAllPlayers] = useState<Account[]>([]);
  const [tab, setTab] = useState('pending');
  const [currentSeason, setCurrentSeason] = useState('S1');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const allTeams = teams; // alias for clarity

  const refresh = async () => {
    const currentRequest = ++requestId.current;
    try {
      const [teamRows, playerRows, season] = await Promise.all([
        teamApi.listTeams(),
        accountApi.listAccounts(),
        adminApi.getSeason(),
      ]);
      if (currentRequest !== requestId.current) return;
      setTeams(teamRows.sort((a, b) => b.createdAt - a.createdAt));
      setAllPlayers(playerRows);
      setCurrentSeason(season);
      setLoadError('');
    } catch {
      if (currentRequest === requestId.current) setLoadError('Could not load admin data.');
    }
  };
  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, []);

  const review = async (team: Team, status: 'approved' | 'rejected', reason = '') => {
    setLoadError('');
    try {
      await teamApi.reviewTeam(team.id, status, reason);
      await refresh();
    } catch {
      setLoadError(`Could not ${status === 'approved' ? 'approve' : 'reject'} ${team.name}.`);
    }
  };
  const approve = (team: Team) => review(team, 'approved');
  const reject = (team: Team) => {
    const reason = prompt('Reason for rejection?') || '';
    return review(team, 'rejected', reason);
  };
  const removeTeam = async (team: Team) => {
    if (!confirm(`Delete ${team.name}?`)) return;
    setLoadError('');
    try {
      await teamApi.deleteTeam(team.id);
      await refresh();
    } catch {
      setLoadError(`Could not delete ${team.name}.`);
    }
  };

  const { pending, approved, rejected } = partitionReviewTeams(teams);
  const visible = tab === 'pending' ? pending : (tab === 'approved' ? approved : rejected);

  

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Crown size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>ADMIN PANEL</h3>
      </div>

      {loadError && <p role="alert" className="mb-3 font-mono text-xs" style={{ color: C.redLight }}>{loadError}</p>}

      {/* TOP-LEVEL ADMIN SECTION TABS */}
      <div className="flex gap-1 mb-5 p-1 rounded flex-wrap" style={{ background: `${C.navyDeep}88` }}>
        {[
          { id: 'teams',   label: 'TEAMS',   icon: Users },
          { id: 'totw',    label: 'TOTW',    icon: Trophy },
          { id: 'players', label: 'PLAYERS', icon: User },
          { id: 'import',  label: 'IMPORT',  icon: TrendingUp },
          { id: 'rules',   label: 'RULES',   icon: BookOpen },
          { id: 'pictures',label: 'PICTURES',icon: User },
          { id: 'awards',  label: 'AWARDS',  icon: Trophy },
          { id: 'season',  label: 'SEASON',  icon: Calendar },
          ...(isSuperAdmin(account) ? [
            { id: 'admins', label: 'ADMINS', icon: Crown },
            { id: 'weights', label: 'WEIGHTS', icon: Sparkles },
            { id: 'integrations', label: 'DISCORD', icon: MessageSquare },
          ] : []),
        ].map(s => {
          const active = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className="flex-1 px-3 py-2 font-heading tracking-wider text-[11px] rounded transition-all flex items-center justify-center gap-1.5"
              style={{
                background: active ? `${C.goldLight}22` : 'transparent',
                color: active ? C.goldLight : `${C.cream}88`,
                border: `1px solid ${active ? C.goldLight : 'transparent'}66`,
              }}
            ><s.icon size={12} /> {s.label}</button>
          );
        })}
      </div>

      {section === 'admins' && isSuperAdmin(account) && (
        <AdminsManager allPlayers={allPlayers} />
      )}

      {section === 'weights' && isSuperAdmin(account) && (
        <WeightingsManager onRefresh={refresh} />
      )}

      {section === 'integrations' && isSuperAdmin(account) && (
        <IntegrationsManager />
      )}

      {section === 'import' && (
        <ImportMatchManager account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
      )}

      {section === 'rules' && (
        <RulesManager onRefresh={refresh} />
      )}

      {section === 'pictures' && (
        <PicturesManager allPlayers={allPlayers} onRefresh={refresh} />
      )}

      {section === 'players' && (
        <PlayersManager allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
      )}

      {section === 'totw' && (
        <TotwManager allPlayers={allPlayers} onRefresh={refresh} />
      )}

      {section === 'season' && (
        <SeasonManager
          account={account}
          allPlayers={allPlayers}
          currentSeason={currentSeason}
          onRefresh={refresh}
        />
      )}

      {section === 'awards' && (
        <div className="space-y-8">
          <AwardsManager allPlayers={allPlayers} onRefresh={refresh} currentSeason={currentSeason} />
          <SeasonChampionsManager account={account} allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason} onRefresh={refresh} />
        </div>
      )}

      {section === 'teams' && (
        <>
          <div className="flex gap-1 mb-4 p-1 rounded" style={{ background: `${C.navyDeep}88` }}>
            {[
              { id: 'pending', label: `PENDING (${pending.length})`, color: C.goldLight },
              { id: 'approved', label: `APPROVED (${approved.length})`, color: C.greenLight },
              { id: 'rejected', label: `REJECTED (${rejected.length})`, color: C.redLight },
            ].map(t => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 px-3 py-2 font-heading tracking-wider text-[10px] rounded transition-all"
                  style={{
                    background: active ? `${t.color}22` : 'transparent',
                    color: active ? t.color : `${C.cream}55`,
                    border: `1px solid ${active ? t.color : 'transparent'}66`,
                  }}
                >{t.label}</button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <EmptyState icon={<CheckCircle size={40} />} text="Nothing here." />
          ) : (
            <div className="space-y-2">
              {visible.map(t => (
                <div key={t.id} className="rounded-lg p-4" style={{
                  background: `${C.navyDeep}aa`,
                  border: `1px solid ${C.navyLight}44`,
                  borderLeft: `3px solid ${t.color || C.green}`,
                }}>
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>{t.name.toUpperCase()}</span>
                        <span className="font-heading text-xs px-2 py-0.5 rounded tracking-widest" style={{
                          background: t.color || C.green, color: C.onColor,
                        }}>{t.tag}</span>
                      </div>
                      <div className="font-mono text-[10px] tracking-wider mt-1" style={{ color: `${C.cream}66` }}>
                        BY <span style={{ color: C.cream }}>{t.ownerUsername.toUpperCase()}</span> • {new Date(t.createdAt).toLocaleString()}
                      </div>
                      {t.description && <p className="font-body text-sm mt-2" style={{ color: `${C.cream}cc` }}>{t.description}</p>}
                      {t.rejectionReason && (
                        <p className="font-mono text-xs mt-1" style={{ color: C.redLight }}>REJECTION: {t.rejectionReason}</p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      {tab === 'pending' && (
                        <>
                          <button onClick={() => approve(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1" style={{
                            background: C.green, color: C.onColor,
                          }}><CheckCircle size={12} /> APPROVE</button>
                          <button onClick={() => reject(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded flex items-center gap-1" style={{
                            background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                          }}><XCircle size={12} /> REJECT</button>
                        </>
                      )}
                      {tab === 'approved' && (
                        <>
                          <button onClick={() => setEditingTeam(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                            background: `${C.navyLight}88`, color: C.cream, border: `1px solid ${C.navyLight}`,
                          }}>EDIT</button>
                          <button onClick={() => removeTeam(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                            background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                          }}>DELETE</button>
                        </>
                      )}
                      {tab === 'rejected' && (
                        <button onClick={() => approve(t)} className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded" style={{
                          background: C.green, color: C.onColor,
                        }}>RE-APPROVE</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editingTeam && (
        <EditTeamModal
          team={editingTeam}
          onClose={() => setEditingTeam(null)}
          onSaved={() => { setEditingTeam(null); refresh(); }}
        />
      )}
    </div>
  );
};
