import { Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import type { Account, PlayerAward } from '../accounts/models';
import { AWARD_BY_ID, AWARD_TYPES, AwardIcon } from '../../components/Icons';
import { EmptyState } from '../../components/Display';
import { C } from '../../theme/theme';
import { AWARD } from '@napl/contracts/accounts';






// Awards Manager
export const AwardsManager = ({ allPlayers, onRefresh, currentSeason }: { allPlayers: Account[]; onRefresh: () => void; currentSeason: string }) => {
  const [season, setSeason] = useState(currentSeason);
  const [awardId, setAwardId] = useState<(typeof AWARD)[keyof typeof AWARD]>(AWARD.STRIKER);
  const [winnerUsername, setWinnerUsername] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setSeason(currentSeason); }, [currentSeason]);

  const award = AWARD_BY_ID[awardId];

  // Filter candidate winners: by ideal position for the award (but allow any)
  const idealCandidates = allPlayers.filter(p => p.position === award.pos);
  const otherCandidates = allPlayers.filter(p => p.position !== award.pos);

  const assignAward = async () => {
    if (busy) return;
    setError(''); setInfo('');
    if (!winnerUsername) { setError('Pick a winner'); return; }
    if (!season.trim()) { setError('Season required'); return; }
    const player = allPlayers.find(p => p.username === winnerUsername);
    if (!player) { setError('Player not found'); return; }
    setBusy(true);
    try {
      await accountApi.assignAward(player.id, awardId, season.trim());
      setInfo(`✓ ${award.name} ${season.trim()} assigned to ${player.username}`);
      setWinnerUsername('');
      await onRefresh();
    } catch (error_) {
      setError('Could not assign award: ' + (error_ instanceof Error ? error_.message : String(error_)));
    } finally {
      setBusy(false);
    }
  };

  const removeAward = async (player: Account, targetAward: PlayerAward) => {
    if (busy || !confirm(`Remove this award from ${player.username}?`)) return;
    setError(''); setInfo(''); setBusy(true);
    try {
      await accountApi.removeAward(player.id, targetAward.awardId, targetAward.season);
      setInfo(`✓ ${AWARD_BY_ID[targetAward.awardId]?.name ?? targetAward.awardId} ${targetAward.season} removed from ${player.username}`);
      await onRefresh();
    } catch (error_) {
      setError('Could not remove award: ' + (error_ instanceof Error ? error_.message : String(error_)));
    } finally {
      setBusy(false);
    }
  };

  // List all current award holders (across all seasons)
  const allAwards:(PlayerAward & {player:Account})[] = [];
  allPlayers.forEach(p => {
    (p.awards || []).forEach(aw => {
      allAwards.push({ ...aw, player: p });
    });
  });
  allAwards.sort((a, b) => (b.assignedAt || 0) - (a.assignedAt || 0));

  return (
    <div className="space-y-5">
      {/* ASSIGN NEW AWARD */}
      <div className="rounded-lg p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.navyDeep}aa 100%)`,
        border: `1px solid ${C.gold}44`,
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>ASSIGN AWARD</span>
        </div>

        {/* Award type picker */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {AWARD_TYPES.map(a => {
            const active = awardId === a.id;
            return (
              <button
                key={a.id}
                onClick={() => setAwardId(a.id)}
                className="p-3 rounded transition-all flex flex-col items-center gap-1.5"
                style={{
                  background: active ? `${C.gold}22` : `${C.navyLight}33`,
                  border: `1.5px solid ${active ? C.gold : 'transparent'}`,
                }}
              >
                <AwardIcon awardId={a.id} size={28} />
                <span className="font-heading text-[10px] tracking-wider" style={{ color: C.cream }}>{a.name.toUpperCase()}</span>
                <span className="font-mono text-[9px]" style={{ color: `${C.cream}66` }}>{a.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>SEASON</label>
            <input
              type="text" value={season}
              onChange={(e) => setSeason(e.target.value.toUpperCase())}
              className="w-full rounded px-3 py-2 font-mono focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            />
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>WINNER</label>
            <select
              value={winnerUsername}
              onChange={(e) => setWinnerUsername(e.target.value)}
              className="w-full rounded px-3 py-2 font-body focus:outline-none"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            >
              <option value="" style={{ background: C.navyDeep }}>— Select winner —</option>
              {idealCandidates.length > 0 && (
                <optgroup label={`${award.pos} players`}>
                  {idealCandidates.map(p => <option key={p.username} value={p.username} style={{ background: C.navyDeep }}>{p.username}</option>)}
                </optgroup>
              )}
              {otherCandidates.length > 0 && (
                <optgroup label="Other players">
                  {otherCandidates.map(p => <option key={p.username} value={p.username} style={{ background: C.navyDeep }}>{p.username} ({p.position})</option>)}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {error && <div className="mt-2 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        {info && <div className="mt-2 font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.green}22`, color: C.greenLight }}>{info}</div>}

        <button
          onClick={() => void assignAward()}
          disabled={busy}
          className="w-full mt-3 py-2.5 font-heading tracking-wider text-sm rounded"
          style={{
            background: `linear-gradient(135deg, ${C.gold} 0%, ${C.goldLight} 100%)`,
            color: C.brandNavy,
            boxShadow: `0 4px 12px ${C.gold}66`,
          }}
        >{busy ? 'SAVING…' : `ASSIGN ${award.name.toUpperCase()}`}</button>
      </div>

      {/* CURRENT AWARDS LIST */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-3" style={{ color: C.cream }}>
          CURRENT WINNERS ({allAwards.length})
        </h4>
        {allAwards.length === 0 ? (
          <EmptyState icon={<Trophy size={40} />} text="No awards assigned yet." />
        ) : (
          <div className="space-y-1.5">
            {allAwards.map(aw => {
              const a = AWARD_BY_ID[aw.awardId];
              return (
                <div key={`${aw.player.id}:${aw.awardId}:${aw.season}`} className="rounded p-2.5 flex items-center gap-3" style={{
                  background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}33`,
                }}>
                  <AwardIcon awardId={aw.awardId} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                      {(a?.name ?? aw.awardId).toUpperCase()} <span style={{ color: C.goldLight }}>{aw.season}</span>
                    </div>
                    <div className="font-mono text-[10px]" style={{ color: `${C.cream}77` }}>
                      {aw.player.username}{aw.assignedBy ? ` • assigned by ${aw.assignedBy}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => void removeAward(aw.player, aw)}
                    disabled={busy}
                    className="px-2 py-1 font-heading tracking-wider text-[10px] rounded"
                    style={{ background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44` }}
                  >REMOVE</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Picks a winner team and a runner-up team for a given season. On save, the current
// rosters of those teams get a `championship` entry stamped onto each player's account
// (so transferring later doesn't strip the trophy). Editing a past season wipes any
// previous championship entries for that season first.
