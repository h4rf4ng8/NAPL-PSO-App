import { CheckCircle, Clock, Plus, XCircle } from 'lucide-react';
import { useMemo,useState } from 'react';
import { matches as matchApi } from './api';
import { useResource } from '../../hooks/use-resource';

import type { Account } from '../accounts/models';
import type { PlayerStat, Submission } from './models';
import type { Team } from '../teams/models';
import { BigNumberInput, StatField, ToggleField } from '../../components/Ui';
import { C } from '../../theme/theme';

import { ReviewMatchStats } from './stats-submission';
import { POS } from '@napl/contracts/league';

// ============ STATS MANAGER (admin: 2-admin review system) ============
export const StatsManager = ({ account, allPlayers, allTeams, currentSeason, onRefresh }: { account: Account; allPlayers: Account[]; allTeams: Team[]; currentSeason: string; onRefresh: () => void }) => {
  const [view, setView] = useState('home'); // home | submit | review
  const { data: submissions = [], error: loadError, reload } = useResource(matchApi.listSubmissions, []);
  const [reviewing, setReviewing] = useState<Submission | null>(null);

  const myUsername = account.username.toLowerCase();
  // Same admin can't review their own submission
  const myPending      = submissions.filter(s => s.status === 'pending' && s.submittedBy.toLowerCase() === myUsername);
  const reviewable     = submissions.filter(s => s.status === 'pending' && s.submittedBy.toLowerCase() !== myUsername);
  const recentApproved = submissions.filter(s => s.status === 'approved').sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0)).slice(0, 5);
  const recentRejected = submissions.filter(s => s.status === 'rejected').sort((a, b) => (b.reviewedAt || 0) - (a.reviewedAt || 0)).slice(0, 5);

  if (view === 'submit') {
    return <SubmitMatchStats
      allPlayers={allPlayers} allTeams={allTeams} currentSeason={currentSeason}
      existing={null}
      onCancel={() => setView('home')}
      onSubmitted={() => { setView('home'); void reload(); }}
    />;
  }
  if (view === 'review' && reviewing) {
    return <ReviewMatchStats
      account={account} allPlayers={allPlayers} allTeams={allTeams}
      submission={reviewing}
      onBack={() => { setReviewing(null); setView('home'); void reload(); onRefresh(); }}
    />;
  }

  return (
    <div className="space-y-5">
      {loadError && <p role="alert">{loadError}</p>}
      {/* BIG START BUTTON */}
      <button
        onClick={() => setView('submit')}
        className="w-full py-5 font-display tracking-wider text-2xl rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.01]"
        style={{
          background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
          color: C.onColor,
          boxShadow: `0 6px 20px ${C.green}77`,
          border: `1px solid ${C.greenLight}`,
        }}
      >
        <Plus size={26} /> ADD STATS FROM A MATCH
      </button>

      {/* PENDING REVIEW (matches submitted by other admins, awaiting your approval) */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
          <Clock size={14} style={{ color: C.goldLight }} /> NEEDS YOUR REVIEW ({reviewable.length})
        </h4>
        {reviewable.length === 0 ? (
          <div className="rounded-lg p-4 text-center" style={{ background: `${C.navyDeep}66`, border: `1px dashed ${C.navyLight}55` }}>
            <p className="font-mono text-xs tracking-wider" style={{ color: `${C.cream}66` }}>
              NOTHING TO REVIEW. WHEN ANOTHER ADMIN SUBMITS A MATCH, IT'LL APPEAR HERE.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {reviewable.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams}
                onClick={() => { setReviewing(s); setView('review'); }}
                action="REVIEW" actionColor={C.gold} />
            ))}
          </div>
        )}
      </div>

      {/* MY PENDING (waiting for someone else to review) */}
      {myPending.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <Clock size={14} style={{ color: `${C.cream}66` }} /> WAITING FOR ANOTHER ADMIN ({myPending.length})
          </h4>
          <div className="space-y-2">
            {myPending.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim
                action="WAITING" actionColor={`${C.cream}55`} />
            ))}
          </div>
        </div>
      )}

      {/* RECENT APPROVED */}
      {recentApproved.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <CheckCircle size={14} style={{ color: C.greenLight }} /> RECENTLY APPROVED
          </h4>
          <div className="space-y-2">
            {recentApproved.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim status="approved" />
            ))}
          </div>
        </div>
      )}

      {/* RECENT REJECTED */}
      {recentRejected.length > 0 && (
        <div>
          <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
            <XCircle size={14} style={{ color: C.redLight }} /> RECENTLY REJECTED
          </h4>
          <div className="space-y-2">
            {recentRejected.map(s => (
              <SubmissionRow key={s.id} sub={s} allTeams={allTeams} dim status="rejected" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const SubmissionRow = ({ sub, allTeams, dim = false, status, onClick, action, actionColor }: { sub: Submission; allTeams: Team[]; dim?: boolean; status?: string; onClick?: () => void; action?: string; actionColor?: string }) => {
  const home = allTeams.find(t => t.id === sub.matchInfo.homeTeamId);
  const away = allTeams.find(t => t.id === sub.matchInfo.awayTeamId);
  const clickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={`rounded-lg p-3 flex items-center justify-between gap-3 ${clickable ? 'cursor-pointer transition-all hover:scale-[1.01]' : ''}`}
      style={{
        background: `${C.navyDeep}aa`,
        border: `1px solid ${C.navyLight}44`,
        borderLeft: `3px solid ${
          status === 'approved' ? C.greenLight :
          (status === 'rejected' ? C.redLight :
          actionColor || C.gold)
        }`,
        opacity: dim ? 0.7 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
          {(home?.name || '?').toUpperCase()} <span style={{ color: `${C.cream}66` }}>{sub.matchInfo.homeScore} — {sub.matchInfo.awayScore}</span> {(away?.name || '?').toUpperCase()}
        </div>
        <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}66` }}>
          {new Date(sub.matchInfo.date).toLocaleDateString()} • {sub.matchInfo.season} • {sub.playerStats.length} PLAYERS • BY {sub.submittedBy.toUpperCase()}
        </div>
      </div>
      {action && (
        <div className="font-heading tracking-wider text-[11px] px-3 py-1.5 rounded flex-shrink-0" style={{
          background: actionColor === C.gold ? C.gold : `${actionColor}33`,
          color: actionColor === C.gold ? C.brandNavy : actionColor,
        }}>{action}</div>
      )}
    </div>
  );
};

// ============ SUBMIT MATCH STATS FORM ============
export const SubmitMatchStats = ({ allPlayers, allTeams, currentSeason, existing, onCancel, onSubmitted }: { allPlayers: Account[]; allTeams: Team[]; currentSeason: string; existing?: Submission | null; onCancel: () => void; onSubmitted: () => void }) => {
  const [step, setStep] = useState(1);
  const today = new Date();
  

  const [matchInfo, setMatchInfo] = useState(existing?.matchInfo || {
    date: today.getTime(),
    season: currentSeason,
    homeTeamId: '',
    awayTeamId: '',
    homeScore: 0,
    awayScore: 0,
  });
  const [selectedUsernames, setSelectedUsernames] = useState(
    new Set((existing?.playerStats || []).map(p => p.username.toLowerCase()))
  );
  const [playerStats, setPlayerStats] = useState(() => {
    const map = new Map<string,PlayerStat>();
    (existing?.playerStats || []).forEach(p => map.set(p.username.toLowerCase(), p));
    return map;
  });
  const [error, setError] = useState('');

  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const homeTeam = approvedTeams.find(t => t.id === matchInfo.homeTeamId);
  const awayTeam = approvedTeams.find(t => t.id === matchInfo.awayTeamId);

  // Players from selected teams
  const candidatePlayers = useMemo(() => {
    if (!matchInfo.homeTeamId && !matchInfo.awayTeamId) return [];
    const ids = new Set([matchInfo.homeTeamId, matchInfo.awayTeamId].filter(Boolean));
    return allPlayers.filter(p => ids.has(p.teamId || ''));
  }, [allPlayers, matchInfo.homeTeamId, matchInfo.awayTeamId]);

  const toggleSelected = (username: string) => {
    const lc = username.toLowerCase();
    const next = new Set(selectedUsernames);
    if (next.has(lc)) next.delete(lc);
    else next.add(lc);
    setSelectedUsernames(next);
  };

  const updatePlayerStat = (username: string, field: keyof PlayerStat, value: number | boolean) => {
    const lc = username.toLowerCase();
    const map = new Map(playerStats);
    const existing = map.get(lc);
    if(!existing) return;
    map.set(lc, { ...existing, [field]: value });
    setPlayerStats(map);
  };

  const goToStep2 = () => {
    setError('');
    if (!matchInfo.homeTeamId || !matchInfo.awayTeamId) { setError('Pick both teams'); return; }
    if (matchInfo.homeTeamId === matchInfo.awayTeamId) { setError('Teams must be different'); return; }
    setStep(2);
  };
  const goToStep3 = () => {
    setError('');
    if (selectedUsernames.size === 0) { setError('Pick at least one player'); return; }
    // Initialize blank stats for newly selected players
    const map = new Map(playerStats);
    for (const lc of selectedUsernames) {
      if (map.has(lc)) {
        continue;
      }

      const player = allPlayers.find(p => p.username.toLowerCase() === lc);
      if(!player) continue;
      map.set(lc, { username:player.username,position:player.position,goals:0,assists:0,passes:0,tackles:0,deflects:0,catches:0,cleanSheet:false });
    }
    setPlayerStats(map);
    setStep(3);
  };

  const submit = async () => {
    setError('');
    const finalStats = Array.from(selectedUsernames, lc => playerStats.get(lc)).filter((p):p is PlayerStat=>!!p);
    if (finalStats.length === 0) { setError('No players to submit'); return; }
    const sub = {
      id: existing?.id || `sub_${Math.random().toString(36).slice(2, 10)}`,
      matchInfo,
      playerStats: finalStats,
      edits: [],
    };
    try { await matchApi.saveSubmission(sub); onSubmitted(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not submit match.'); }
  };

  // ===== STEP 1: MATCH INFO =====
  if (step === 1) {
    return (
      <div className="space-y-4">
        <button onClick={onCancel} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
          ← BACK
        </button>
        <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
          <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 1 OF 3</div>
          <h4 className="font-display text-2xl tracking-wider mb-4" style={{ color: C.cream }}>WHEN AND WHO?</h4>

          <div className="space-y-4">
            <div>
              <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>MATCH DATE</label>
              <input
                type="date"
                value={(() => {
                  const d = new Date(matchInfo.date);
                  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                })()}
                onChange={(e) => {
                  const [y, m, d] = e.target.value.split('-').map(Number);
                  setMatchInfo({ ...matchInfo, date: new Date(y, m - 1, d).getTime() });
                }}
                className="w-full rounded px-3 py-3 text-base"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>HOME TEAM</label>
                <select
                  value={matchInfo.homeTeamId}
                  onChange={(e) => setMatchInfo({ ...matchInfo, homeTeamId: e.target.value })}
                  className="w-full rounded px-3 py-3 text-base"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                >
                  <option value="" style={{ background: C.navyDeep }}>— select team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>AWAY TEAM</label>
                <select
                  value={matchInfo.awayTeamId}
                  onChange={(e) => setMatchInfo({ ...matchInfo, awayTeamId: e.target.value })}
                  className="w-full rounded px-3 py-3 text-base"
                  style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
                >
                  <option value="" style={{ background: C.navyDeep }}>— select team —</option>
                  {approvedTeams.map(t => <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>{t.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>HOME SCORE</label>
                <BigNumberInput value={matchInfo.homeScore} onChange={(v) => setMatchInfo({ ...matchInfo, homeScore: v })} />
              </div>
              <div>
                <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>AWAY SCORE</label>
                <BigNumberInput value={matchInfo.awayScore} onChange={(v) => setMatchInfo({ ...matchInfo, awayScore: v })} />
              </div>
            </div>

            {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

            <button
              onClick={goToStep2}
              className="w-full py-3 font-heading tracking-wider text-base rounded mt-2"
              style={{
                background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                color: C.onColor,
                boxShadow: `0 4px 12px ${C.green}66`,
              }}
            >NEXT: PICK PLAYERS →</button>
          </div>
        </div>
      </div>
    );
  }

  // ===== STEP 2: PICK PLAYERS =====
  if (step === 2) {
    const homePlayers = candidatePlayers.filter(p => p.teamId === matchInfo.homeTeamId);
    const awayPlayers = candidatePlayers.filter(p => p.teamId === matchInfo.awayTeamId);

    return (
      <div className="space-y-4">
        <button onClick={() => setStep(1)} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
          ← BACK
        </button>
        <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
          <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 2 OF 3</div>
          <h4 className="font-display text-2xl tracking-wider mb-1" style={{ color: C.cream }}>WHO PLAYED?</h4>
          <p className="font-mono text-[11px] tracking-wider mb-4" style={{ color: `${C.cream}77` }}>
            TAP A PLAYER TO ADD/REMOVE. SELECTED: {selectedUsernames.size}
          </p>

          {[
            { team: homeTeam, players: homePlayers, label: 'HOME' },
            { team: awayTeam, players: awayPlayers, label: 'AWAY' },
          ].map(({ team, players, label }) => (
            <div key={label} className="mb-4">
              <div className="font-mono text-[10px] tracking-[0.25em] mb-2" style={{ color: `${C.cream}88` }}>
                {label} • <span style={{ color: team?.color || C.cream }}>{team?.name?.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {players.length === 0 ? (
                  <div className="col-span-full font-mono text-xs italic" style={{ color: `${C.cream}55` }}>
                    No registered players on this team
                  </div>
                ) : players.map(p => {
                  const lc = p.username.toLowerCase();
                  const selected = selectedUsernames.has(lc);
                  return (
                    <button
                      key={p.username}
                      onClick={() => toggleSelected(p.username)}
                      className="rounded-lg p-3 text-left transition-all"
                      style={{
                        background: selected ? `${C.greenLight}22` : `${C.navyDeep}cc`,
                        border: `2px solid ${selected ? C.greenLight : C.navyLight + '44'}`,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {selected && <CheckCircle size={14} style={{ color: C.greenLight }} />}
                        <div className="flex-1 min-w-0">
                          <div className="font-heading tracking-wider text-sm truncate" style={{ color: C.cream }}>
                            {p.username.toUpperCase()}
                          </div>
                          <div className="font-mono text-[10px]" style={{ color: `${C.cream}66` }}>
                            {p.position}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {error && <div className="font-mono text-xs px-2 py-1 rounded mb-2" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

          <button
            onClick={goToStep3}
            className="w-full py-3 font-heading tracking-wider text-base rounded"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 4px 12px ${C.green}66`,
            }}
          >NEXT: ENTER STATS →</button>
        </div>
      </div>
    );
  }

  // ===== STEP 3: PER-PLAYER STATS =====
  return (
    <div className="space-y-4">
      <button onClick={() => setStep(2)} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
        ← BACK
      </button>
      <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}66` }}>
        <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.cream}66` }}>STEP 3 OF 3</div>
        <h4 className="font-display text-2xl tracking-wider mb-1" style={{ color: C.cream }}>FILL IN STATS</h4>
        <p className="font-mono text-[11px] tracking-wider mb-4" style={{ color: `${C.cream}77` }}>
          USE THE +/− BUTTONS OR TAP A NUMBER TO TYPE IT
        </p>

        <div className="space-y-4">
          {Array.from(selectedUsernames, lc => {
            const stat = playerStats.get(lc);
            if (!stat) return null;
            const isGK = stat.position === POS.GK;
            return (
              <div key={lc} className="rounded-lg p-3" style={{
                background: C.navyDeep, border: `1px solid ${C.navyLight}55`,
              }}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>
                    {stat.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] tracking-wider px-2 py-0.5 rounded" style={{
                    background: `${C.brandNavy}cc`, color: C.cream,
                  }}>{stat.position}</div>
                </div>
                {isGK ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatField label="DEFLECTS"   value={stat.deflects}      onChange={(v) => updatePlayerStat(stat.username, 'deflects', v)} />
                    <StatField label="CATCHES" value={stat.catches}    onChange={(v) => updatePlayerStat(stat.username, 'catches', v)} />
                    <StatField label="PASSES"  value={stat.passes}     onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <ToggleField label="CLEAN SHEET" value={stat.cleanSheet} onChange={(v) => updatePlayerStat(stat.username, 'cleanSheet', v)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <StatField label="GOALS"    value={stat.goals}         onChange={(v) => updatePlayerStat(stat.username, 'goals', v)} />
                    <StatField label="ASSISTS"  value={stat.assists}       onChange={(v) => updatePlayerStat(stat.username, 'assists', v)} />
                    <StatField label="PASSES"   value={stat.passes}        onChange={(v) => updatePlayerStat(stat.username, 'passes', v)} />
                    <StatField label="TACKLES"  value={stat.tackles}       onChange={(v) => updatePlayerStat(stat.username, 'tackles', v)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <div className="font-mono text-xs px-2 py-1 rounded mt-3" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <button
          onClick={submit}
          className="w-full py-4 font-heading tracking-wider text-lg rounded mt-4"
          style={{
            background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
            color: C.brandNavy,
            boxShadow: `0 4px 12px ${C.gold}88`,
          }}
        >SUBMIT FOR REVIEW →</button>
        <p className="font-mono text-[10px] tracking-wider text-center mt-2" style={{ color: `${C.cream}55` }}>
          ANOTHER ADMIN REVIEWS BEFORE STATS GO LIVE.
          <br />
          ONCE APPROVED, THE MATCH RESULT IS POSTED AUTOMATICALLY TO NEWS.
        </p>
      </div>
    </div>
  );
};
