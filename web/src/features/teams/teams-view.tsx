import { Clock, Crown, Plus, Users, X, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { teams as teamApi } from './api';
import { accounts as accountApi } from '../accounts/api';
import type { Account, Rankings } from '../accounts/models';
import type { Team } from './models';
import { auth } from '../../auth/session';
import { useResource } from '../../hooks/use-resource';

import { PlayerCard } from '../../components/PlayerCard';
import { Dialog, EmptyState, useDialog } from '../../components/Ui';
import { C } from '../../theme/theme';

import { isTeamCaptain } from '../../utils/league';
import { TeamStandings } from '../matches';
import { SubmitTeamModal } from './team-forms';
import { TeamRosterFormation } from './roster';

// ============ PLAYER CARD MODAL ============
// Opens a full-size player card on top of the page with front/back both visible.
// Click either card face to flip that face inline, or the X to close.
export const PlayerCardModal = ({ player, team, rankings, onClose }: { player: Account; team?: Team | null | undefined; rankings?: Rankings | null; onClose: () => void }) => {
  const dialogRef = useDialog(onClose);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${player.username} player card`} tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full transition-transform hover:scale-110"
        style={{ background: `${C.white}22`, color: '#fff' }}
        aria-label="Close"
      >
        <X size={22} />
      </button>

      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full max-h-full overflow-y-auto py-8 px-2"
      >
        <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-10">
          <div className="text-center">
            <div className="font-mono text-[10px] tracking-[0.3em] mb-2" style={{ color: `${C.white}88` }}>FRONT · TAP TO FLIP</div>
            <PlayerCard account={player} size="lg" team={team} rankings={rankings} />
          </div>
        </div>
        <div className="text-center mt-4 font-mono text-[10px] tracking-widest" style={{ color: `${C.white}66` }}>
          TAP OUTSIDE OR ✕ TO CLOSE
        </div>
      </div>
    </div>
  );
};

// ============ TEAMS VIEW ============
export const TeamsView = ({ account, onUpdate, rankings, currentSeason: _currentSeason = 'S1' }: { account: Account; onUpdate: (account:Account) => void; rankings?: Rankings | null; currentSeason?: string }) => {
  const { data, error: loadError, reload } = useResource(async () => {
    const [teams, allPlayers] = await Promise.all([teamApi.listTeams(), accountApi.listAccounts()]);
    return { teams, allPlayers };
  }, []);
  const teams = data?.teams ?? [];
  const allPlayers = data?.allPlayers ?? [];
  const [actionError,setActionError]=useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const selected = teams.find(team => team.id === selectedTeamId);
  const [viewingPlayerCard, setViewingPlayerCard] = useState<Account | null>(null);

  const approved = teams.filter(t => t.status === 'approved');
  const myTeam = teams.find(t => t.id === account.teamId && t.status === 'approved');
  const myPending = teams.find(t => t.ownerUsername === account.username && t.status === 'pending');
  const myRejected = teams.find(t => t.ownerUsername === account.username && t.status === 'rejected');

  
  const respondInvitation=async(team:Team,accept:boolean)=>{
    setActionError('');
    try{await teamApi.respondInvitation(team.id,accept);const current=await auth.getCurrent();if(current)onUpdate(current);await reload();}
    catch(error){setActionError(error instanceof Error?error.message:'Could not respond to invitation.');}
  };
  const invitations=teams.filter(team=>team.invitations.some(invite=>invite.username.toLowerCase()===account.username.toLowerCase()&&invite.status==='pending'));
  const leaveTeam = async (team: Team) => {
    if(!confirm(`Leave ${team.name}?`)) return;
    try {
      await teamApi.changeMembership(team.id,'leave');
      const current=await auth.getCurrent();
      if(current) onUpdate(current);
      await reload();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not leave team.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Users size={22} style={{ color: C.greenLight }} />
          <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>TEAMS</h3>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded tracking-wider" style={{
            background: `${C.navyLight}33`, color: `${C.cream}88`,
          }}>{approved.length}</span>
        </div>
        {!myPending && !myTeam && (
          <button
            onClick={() => setShowSubmit(true)}
            className="px-4 py-2 font-heading tracking-wider text-xs flex items-center gap-2 rounded transition-all hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><Plus size={14} /> SUBMIT TEAM</button>
        )}
      </div>

      {(actionError || loadError) && <p role="alert">{actionError || loadError}</p>}
      {invitations.map(team=><div key={team.id} className="rounded p-4 mb-3" style={{background:C.white,border:`1px solid ${C.navyLight}`}}>
        <p>You are invited to join {team.name}.</p>
        <button onClick={()=>{void respondInvitation(team,true);}} className="px-3 py-2">Accept</button>
        <button onClick={()=>{void respondInvitation(team,false);}} className="px-3 py-2">Decline</button>
      </div>)}
      {/* SEASON STANDINGS — computed from imported match records */}
      <div className="mb-6">
        <TeamStandings allTeams={teams} allPlayers={allPlayers} />
      </div>

      {myPending && (
        <div className="mb-4 rounded-lg p-4 flex items-center gap-3" style={{
          background: `${C.gold}11`, border: `1px solid ${C.gold}44`,
        }}>
          <Clock style={{ color: C.goldLight }} />
          <div className="flex-1">
            <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>
              {myPending.name.toUpperCase()} <span className="font-mono text-xs" style={{ color: C.goldLight }}>[PENDING REVIEW]</span>
            </div>
            <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}77` }}>AWAITING ADMIN APPROVAL</div>
          </div>
        </div>
      )}
      {myRejected && !myPending && !myTeam && (
        <div className="mb-4 rounded-lg p-4" style={{
          background: `${C.red}11`, border: `1px solid ${C.red}44`,
        }}>
          <div className="flex items-center gap-3 mb-2">
            <XCircle style={{ color: C.redLight }} />
            <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>
              {myRejected.name.toUpperCase()} <span className="font-mono text-xs" style={{ color: C.redLight }}>[REJECTED]</span>
            </div>
          </div>
          {myRejected.rejectionReason && (
            <div className="font-mono text-xs ml-9 mb-2" style={{ color: `${C.cream}77` }}>REASON: {myRejected.rejectionReason}</div>
          )}
          <button
            onClick={async () => { try { await teamApi.deleteTeam(myRejected.id); await reload(); } catch (error) { setActionError(error instanceof Error ? error.message : 'Could not dismiss team.'); } }}
            className="ml-9 text-xs font-mono underline tracking-wider"
            style={{ color: `${C.cream}77` }}
          >DISMISS & RESUBMIT</button>
        </div>
      )}

      {approved.length === 0 ? (
        <EmptyState icon={<Users size={40} />} text="No approved teams yet. Be the first to submit." />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {approved.map(t => {
            const tColor = t.color || C.green;
            // True member count — unique usernames that match an actual account.
            // Guards against: duplicates in team.members, usernames of deleted
            // accounts still sitting in the array, and case-mismatched entries.
            const seen = new Set<string>();
            const verifiedMembers = (t.members || []).filter(u => {
              const key = u.toLowerCase();
              if (!key || seen.has(key)) return false;
              seen.add(key);
              return allPlayers.some(p => p.username.toLowerCase() === key);
            });
            const memberCount = verifiedMembers.length;
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className="asl-team-card text-left rounded-xl p-4"
                style={{
                  background: C.white,
                  border: `1px solid ${C.navyLight}`,
                  borderTop: `3px solid ${tColor}`,
                  boxShadow: `0 2px 8px ${C.brandNavy}11`,
                }}
              >
                <div className="flex items-start gap-4 mb-3">
                  {/* Team logo thumbnail — falls back to a tag chip if no logo */}
                  {t.logoUrl ? (
                    <img
                      src={t.logoUrl}
                      alt={`${t.name} logo`}
                      className="shrink-0 rounded object-contain"
                      style={{
                        width: 76, height: 76,
                        background: `${tColor}11`,
                        border: `1px solid ${tColor}33`,
                        padding: 4,
                      }}
                    />
                  ) : (
                    <div
                      className="shrink-0 rounded flex items-center justify-center font-display tracking-widest"
                      style={{
                        width: 76, height: 76,
                        background: tColor, color: C.onColor, fontSize: 20,
                      }}
                    >{t.tag}</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="font-display text-2xl tracking-wider truncate leading-tight" style={{ color: C.cream }}>
                        {t.name.toUpperCase()}
                      </div>
                      <div className="font-heading text-xs px-2 py-0.5 rounded tracking-widest shrink-0" style={{
                        background: tColor, color: C.onColor,
                      }}>{t.tag}</div>
                    </div>
                    {t.description && (
                      <div className="font-body text-sm line-clamp-2 leading-snug" style={{ color: `${C.cream}99` }}>{t.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between font-mono text-xs tracking-wider" style={{ color: `${C.cream}66` }}>
                  <span>{memberCount} {memberCount === 1 ? 'MEMBER' : 'MEMBERS'}</span>
                  <span className="flex items-center gap-1.5"><Crown size={12} style={{ color: C.goldLight }} /> {t.ownerUsername}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showSubmit && <SubmitTeamModal account={account} allPlayers={allPlayers} allTeams={teams} onClose={() => setShowSubmit(false)} onSave={() => { void reload(); }} />}

      {selected && (
        <Dialog onClose={() => setSelectedTeamId(null)} label="Team details" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
          background: `${C.black}cc`, backdropFilter: 'blur(8px)',
        }} onClick={() => setSelectedTeamId(null)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full my-8 rounded-xl p-6 fade-in" style={{
            background: C.white,
            border: `2px solid ${selected.color || C.green}`,
            boxShadow: `0 20px 60px ${C.brandNavy}44, 0 0 60px ${selected.color || C.green}33`,
          }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="font-display text-4xl tracking-wider" style={{ color: C.cream }}>{selected.name.toUpperCase()}</div>
                  <div className="font-heading text-sm px-2 py-1 rounded tracking-widest" style={{
                    background: selected.color || C.green, color: C.onColor,
                  }}>{selected.tag}</div>
                </div>
                <div className="font-mono text-[10px] tracking-widest flex items-center gap-1" style={{ color: `${C.cream}66` }}>
                  <Crown size={10} style={{ color: C.goldLight }} /> FOUNDED BY {selected.ownerUsername.toUpperCase()}
                </div>
              </div>
              <button aria-label="Close team details" onClick={() => setSelectedTeamId(null)} className="p-1.5 rounded" style={{
                background: `${C.navyLight}44`, color: C.cream,
              }}><X size={18} /></button>
            </div>

            {selected.description && (
              <p className="font-body mb-4" style={{ color: `${C.cream}cc` }}>{selected.description}</p>
            )}

            <div className="mb-4 flex gap-2">
              {selected.members.includes(account.username) && selected.ownerUsername !== account.username && (
                <button onClick={() => leaveTeam(selected)} className="px-4 py-2 font-heading tracking-wider text-xs rounded" style={{
                  background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66`,
                }}>LEAVE TEAM</button>
              )}
            </div>

            <h4 className="font-display text-xl tracking-wider mb-3 flex items-center gap-2" style={{ color: C.cream }}>
              <Users size={16} /> ROSTER ({(() => {
                // Count only unique usernames that match a real account
                // (same guard as the team card listing — see earlier edit).
                const seen = new Set<string>();
                return (selected.members || []).filter(u => {
                  const key = u.toLowerCase();
                  if (!key || seen.has(key)) return false;
                  seen.add(key);
                  return allPlayers.some(p => p.username.toLowerCase() === key);
                }).length;
              })()})
            </h4>
            <TeamRosterFormation
              team={selected}
              allPlayers={allPlayers}
              rankings={rankings}
              onCardClick={(player) => setViewingPlayerCard(player)}
              isCaptain={isTeamCaptain(account, selected)}
              onLineupSaved={() => { void reload(); }}
            />
          </div>
        </Dialog>
      )}

      {viewingPlayerCard && (
        <PlayerCardModal
          player={viewingPlayerCard}
          team={selected}
          rankings={rankings}
          onClose={() => setViewingPlayerCard(null)}
        />
      )}
    </div>
  );
};
