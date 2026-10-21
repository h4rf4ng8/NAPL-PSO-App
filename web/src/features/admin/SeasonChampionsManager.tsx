import { Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import type { Champions } from './models';
import type { Team } from '../teams/models';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/Display';
import { C } from '../../theme/theme';






// SeasonChampions Manager
export const SeasonChampionsManager = ({ account: _account, allPlayers, allTeams, currentSeason, onRefresh }: { account: Account; allPlayers: Account[]; allTeams: Team[]; currentSeason: string; onRefresh: () => void }) => {
  const [champions, setChampions] = useState<Champions>({});             // { S1: { winnerTeamId, runnerUpTeamId } }
  const [editingSeason, setEditingSeason] = useState(currentSeason);
  const [winnerTeamId, setWinnerTeamId] = useState('');
  const [runnerUpTeamId, setRunnerUpTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [confirming, setConfirming] = useState<'save' | 'clear' | null>(null);          // 'save' | 'clear' | null

  const approvedTeams = useMemo(
    () => allTeams.filter(t => t.status === 'approved').sort((a, b) => a.name.localeCompare(b.name)),
    [allTeams]
  );

  // Load championships once
  useEffect(() => {
    (async () => {
      const c = await adminApi.getChampions();
      setChampions(c || {});
    })();
  }, []);

  // Whenever the editing season changes, pre-fill from saved values
  useEffect(() => {
    const existing = champions[editingSeason] || {};
    setWinnerTeamId(existing.winnerTeamId || '');
    setRunnerUpTeamId(existing.runnerUpTeamId || '');
    setError(''); setInfo('');
  }, [editingSeason, champions]);

  const teamById = (id: string | null | undefined) => approvedTeams.find(t => t.id === id) || allTeams.find(t => t.id === id);
  const playersOnTeam = (teamId: string | null | undefined) => allPlayers.filter(p => p.teamId === teamId);

  // Collect every season that currently has championships set, plus the current season
  const knownSeasons = useMemo(() => {
    const set = new Set(Object.keys(champions));
    set.add(currentSeason);
    return [...set].sort((a,b)=>a.localeCompare(b));
  }, [champions, currentSeason]);

  const reset = () => {
    setError(''); setInfo(''); setConfirming(null);
  };

  // Save handler — confirms first to make the impact explicit
  const requestSave = () => {
    setError(''); setInfo('');
    if (!editingSeason.trim()) { setError('Pick a season'); return; }
    if (!winnerTeamId && !runnerUpTeamId) { setError('Pick at least a winner or runner-up'); return; }
    if (winnerTeamId && winnerTeamId === runnerUpTeamId) {
      setError('Winner and runner-up cannot be the same team');
      return;
    }
    setConfirming('save');
  };

  const doSave = async () => {
    setBusy(true);
    setError(''); setInfo('');
    try {
      const now = Date.now();
      const next = { ...champions };
      if (winnerTeamId || runnerUpTeamId) {
        next[editingSeason] = {
          winnerTeamId: winnerTeamId || null,
          runnerUpTeamId: runnerUpTeamId || null,
          setAt: now,
        };
      } else {
        delete next[editingSeason];
      }
      await adminApi.setChampions(next);
      setChampions(next);

      const wTeam = winnerTeamId ? teamById(winnerTeamId) : null;
      const rTeam = runnerUpTeamId ? teamById(runnerUpTeamId) : null;
      const wCount = wTeam ? playersOnTeam(winnerTeamId).length : 0;
      const rCount = rTeam ? playersOnTeam(runnerUpTeamId).length : 0;
      const parts = [];
      if (wTeam) parts.push(`${wTeam.name} (winner) — ${wCount} player${wCount === 1 ? '' : 's'}`);
      if (rTeam) parts.push(`${rTeam.name} (runner-up) — ${rCount} player${rCount === 1 ? '' : 's'}`);
      setInfo(`Saved ${editingSeason}: ${parts.join(' · ')}`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (error_) {
      setError('Save failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const requestClear = () => {
    if (!champions[editingSeason]) { setError(`No championship set for ${editingSeason}`); return; }
    setError(''); setInfo('');
    setConfirming('clear');
  };

  const doClear = async () => {
    setBusy(true);
    try {
      const next = { ...champions };
      delete next[editingSeason];
      await adminApi.setChampions(next);
      setChampions(next);
      setWinnerTeamId(''); setRunnerUpTeamId('');
      setInfo(`Cleared ${editingSeason} championships.`);
      setConfirming(null);
      if (onRefresh) await onRefresh();
    } catch (error_) {
      setError('Clear failed: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Trophy size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>SEASON CHAMPIONS</h3>
      </div>
      <p className="font-body text-sm mb-4" style={{ color: `${C.cream}99` }}>
        Pick the season winner (gold trophy) and runner-up (silver trophy). The trophy is awarded to the team's <span style={{ color: C.goldLight }}>current roster</span> — players who later transfer keep their trophy. Editing a season replaces the previous result.
      </p>

      {/* SEASON PICKER + TEAM PICKERS */}
      <div className="rounded-xl p-4 mb-6" style={{ background: `${C.navyDeep}88`, border: `1px solid ${C.navyLight}66` }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>SEASON</div>
            <div className="flex gap-2">
              <select
                value={editingSeason}
                onChange={(e) => setEditingSeason(e.target.value)}
                className="flex-1 px-3 py-2 font-body text-sm rounded focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
              >
                {knownSeasons.map(s => <option key={s} value={s} style={{ background: C.navyDeep }}>{s}</option>)}
                {!knownSeasons.includes(editingSeason) && (
                  <option value={editingSeason} style={{ background: C.navyDeep }}>{editingSeason}</option>
                )}
              </select>
              <input
                type="text"
                placeholder="New season..."
                onKeyDown={(e) => { if (!(e.key === 'Enter' && e.currentTarget.value.trim())) {
                  return;
                }

                setEditingSeason(e.currentTarget.value.trim().toUpperCase()); e.currentTarget.value = ''; }}
                className="w-28 px-2 py-2 font-mono text-[11px] rounded focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}88`, color: C.cream }}
                title="Type a new season name and press Enter"
              />
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>
              🥇 WINNER (GOLD TROPHY)
            </div>
            <select
              value={winnerTeamId}
              onChange={(e) => setWinnerTeamId(e.target.value)}
              className="w-full px-3 py-2 font-body text-sm rounded focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.gold}66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— None —</option>
              {approvedTeams.map(t => (
                <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>
                  {t.name} ({playersOnTeam(t.id).length} players)
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.cream}99` }}>
              🥈 RUNNER-UP (SILVER TROPHY)
            </div>
            <select
              value={runnerUpTeamId}
              onChange={(e) => setRunnerUpTeamId(e.target.value)}
              className="w-full px-3 py-2 font-body text-sm rounded focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid #cdd3dc66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— None —</option>
              {approvedTeams.map(t => (
                <option key={t.id} value={t.id} style={{ background: C.navyDeep }}>
                  {t.name} ({playersOnTeam(t.id).length} players)
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && <div className="mt-3 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        {info && <div className="mt-3 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.greenLight }}>{info}</div>}

        <div className="flex gap-2 mt-3 flex-wrap">
          <button
            onClick={requestSave}
            disabled={busy}
            className="flex-1 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
              color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.gold}66`,
            }}
          >{busy ? 'WORKING...' : `SAVE ${editingSeason} CHAMPIONS`}</button>
          {champions[editingSeason] && (
            <button
              onClick={requestClear}
              disabled={busy}
              className="px-4 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
              style={{ background: 'transparent', color: C.redLight, border: `1px solid ${C.red}88` }}
            >CLEAR {editingSeason}</button>
          )}
        </div>

        {/* Roster preview */}
        {(winnerTeamId || runnerUpTeamId) && (
          <div className="mt-4 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3" style={{ borderTop: `1px solid ${C.navyLight}44` }}>
            {winnerTeamId && (
              <div>
                <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: C.goldLight }}>
                  PLAYERS GETTING THE GOLD TROPHY
                </div>
                <div className="font-body text-xs" style={{ color: C.cream }}>
                  {playersOnTeam(winnerTeamId).length === 0
                    ? <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>No current players on this team</span>
                    : playersOnTeam(winnerTeamId).map(p => p.username).join(', ')}
                </div>
              </div>
            )}
            {runnerUpTeamId && (
              <div>
                <div className="font-mono text-[10px] tracking-wider mb-1" style={{ color: '#cdd3dc' }}>
                  PLAYERS GETTING THE SILVER TROPHY
                </div>
                <div className="font-body text-xs" style={{ color: C.cream }}>
                  {playersOnTeam(runnerUpTeamId).length === 0
                    ? <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>No current players on this team</span>
                    : playersOnTeam(runnerUpTeamId).map(p => p.username).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* CONFIRMATION MODAL */}
      {confirming && (
        <Dialog onClose={() => setConfirming(null)} label="Confirm championship change" className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: `${C.black}cc`, backdropFilter: 'blur(8px)' }}>
          <div className="max-w-md w-full rounded-xl p-5" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="font-display text-xl tracking-wider mb-2" style={{ color: C.brandNavy }}>
              {confirming === 'save' ? `SAVE ${editingSeason} CHAMPIONS?` : `CLEAR ${editingSeason}?`}
            </div>
            <div className="font-body text-sm mb-4" style={{ color: `${C.brandNavy}cc` }}>
              {confirming === 'save'
                ? `This will award trophies to the current rosters. ${champions[editingSeason] ? `Any previous ${editingSeason} trophies will be removed first (players who have since transferred will lose them).` : ''}`
                : `Every player who currently holds a ${editingSeason} trophy will lose it. This cannot be undone.`}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(null)}
                disabled={busy}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded"
                style={{ background: 'transparent', color: C.brandNavy, border: `1px solid ${C.navyLight}` }}
              >CANCEL</button>
              <button
                onClick={confirming === 'save' ? doSave : doClear}
                disabled={busy}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
                style={{
                  background: confirming === 'save' ? C.gold : C.red,
                  color: confirming === 'save' ? C.brandNavy : C.onColor,
                }}
              >{busy ? 'WORKING...' : (confirming === 'save' ? 'YES, AWARD' : 'YES, CLEAR')}</button>
            </div>
          </div>
        </Dialog>
      )}

      {/* PAST SEASONS LIST */}
      <div>
        <h4 className="font-display text-lg tracking-wider mb-2" style={{ color: C.cream }}>
          RECORD ({Object.keys(champions).length} season{Object.keys(champions).length === 1 ? '' : 's'})
        </h4>
        {Object.keys(champions).length === 0 ? (
          <EmptyState icon={<Trophy size={40} />} text="No season champions recorded yet." />
        ) : (
          <div className="space-y-1.5">
            {Object.entries(champions).sort(([a], [b]) => a.localeCompare(b)).map(([season, info]) => {
              const w = info.winnerTeamId ? teamById(info.winnerTeamId) : null;
              const r = info.runnerUpTeamId ? teamById(info.runnerUpTeamId) : null;
              return (
                <div key={season} className="rounded p-2.5 flex items-center gap-3" style={{
                  background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}33`,
                }}>
                  <div className="font-display text-lg tracking-wider" style={{ color: C.goldLight, width: 48 }}>{season}</div>
                  <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-1">
                    <div className="font-body text-sm" style={{ color: C.cream }}>
                      🥇 <span style={{ color: C.goldLight }}>Winner:</span> {w ? w.name : <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>—</span>}
                    </div>
                    <div className="font-body text-sm" style={{ color: C.cream }}>
                      🥈 <span style={{ color: '#cdd3dc' }}>Runner-Up:</span> {r ? r.name : <span style={{ color: `${C.cream}66`, fontStyle: 'italic' }}>—</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditingSeason(season); reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                    className="font-mono text-[10px] tracking-wider px-2 py-1 rounded"
                    style={{ background: 'transparent', color: C.goldLight, border: `1px solid ${C.gold}44` }}
                  >EDIT</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
