import { useEffect, useState } from 'react';
import { ModalShell } from '../../components/Dialog';
import { matches as matchesApi, type MatchDetails, type MatchParticipant } from './api';
import { C } from '../../theme/theme';
import { Shield, Trash2 } from 'lucide-react';
import { ResultBadge } from '../../components/Display';
import type { Account } from '../accounts/models';
import { isAdmin as hasAdminRole } from '../../utils/league';

// Group participants by the team they played on (via ownTeamId on the match
// record). Players whose team isn't recorded fall into the 'unknown' bucket.
const groupByTeam = (participants: MatchParticipant[]): [string, MatchParticipant[]][] => {
  const groups = new Map<string, MatchParticipant[]>();
  for (const p of participants) {
    const key = p.teamId ?? 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return [...groups];
};

export const MatchDetailsModal = ({ matchId, account, onClose, onDeleted }: {
  matchId: string; account: Account | null; onClose: () => void; onDeleted?: () => void;
}) => {
  const [details, setDetails] = useState<MatchDetails | null>(null);
  const [loadError, setLoadError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    let abandoned = false;
    const load = async () => {
      try {
        const result = await matchesApi.fetchMatchDetails(matchId);
        if (!abandoned) setDetails(result);
      } catch (error) {
        if (!abandoned) setLoadError(error instanceof Error ? error.message : 'Could not load match details.');
      }
    };
    void load();
    return () => { abandoned = true; };
  }, [matchId]);

  const handleDelete = async () => {
    if (!confirm('Delete this match from every player\u{2019}s record? This cannot be undone.')) return;
    setDeleting(true); setDeleteError('');
    try {
      await matchesApi.deleteMatch(matchId);
      onDeleted?.();
      onClose();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Could not delete match.');
    }
    setDeleting(false);
  };

  const canDelete = account && hasAdminRole(account);
  const groups = details ? groupByTeam(details.participants) : [];
  // Prefer the first participant that has goalsFor/goalsAgainst set — forfeits
  // or incomplete entries may miss these, so this falls back gracefully.
  const scoreCarrier = details?.participants.find(p => typeof p.goalsFor === 'number' && typeof p.goalsAgainst === 'number');
  const date = details?.participants.find(p => typeof p.date === 'number')?.date;
  const season = details?.participants.find(p => p.season)?.season;

  return (
    <ModalShell onClose={onClose} title="Match details">
      {!details && !loadError && <p role="status" className="font-mono text-xs" style={{ color: `${C.cream}aa` }}>Loading match\u2026</p>}
      {loadError && <p role="alert" className="font-mono text-xs" style={{ color: C.redLight }}>{loadError}</p>}
      {details && (
        <>
          <div className="mb-3 font-mono text-xs" style={{ color: `${C.cream}aa` }}>
            {date ? new Date(date).toLocaleDateString() : 'Date unknown'}
            {season && <> &middot; <span style={{ color: C.cream }}>{season}</span></>}
            {scoreCarrier && <> &middot; <span style={{ color: C.cream }}>{scoreCarrier.goalsFor}\u{2013}{scoreCarrier.goalsAgainst}</span> (from {scoreCarrier.username}&rsquo;s perspective)</>}
          </div>
          {groups.length === 0 && <p className="font-mono text-xs" style={{ color: `${C.cream}aa` }}>No player records found for this match.</p>}
          {groups.map(([teamKey, players]) => (
            <div key={teamKey} className="mb-4">
              <h4 className="font-heading tracking-wider text-sm mb-2" style={{ color: C.cream }}>
                {teamKey === 'unknown' ? 'UNASSIGNED' : (players[0]?.opponent ? `vs ${players[0].opponent.toUpperCase()}` : teamKey)}
              </h4>
              <div className="space-y-1">
                {players.map(player => (
                  <div key={player.username} className="rounded px-2 py-1.5 flex items-center gap-2 font-mono text-xs" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}44` }}>
                    <ResultBadge result={player.result} />
                    <span className="flex-1 truncate" style={{ color: C.cream }}>{player.username} <span style={{ color: `${C.cream}66` }}>({player.position})</span></span>
                    <span><span style={{ color: C.greenLight }}>{player.goals}</span>G</span>
                    <span><span style={{ color: C.goldLight }}>{player.assists}</span>A</span>
                    <span><span style={{ color: `${C.cream}88` }}>{player.passes}</span>P</span>
                    <span><span style={{ color: `${C.cream}88` }}>{player.tackles}</span>T</span>
                    {player.cleanSheet && <Shield size={12} style={{ color: C.greenLight }} />}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {canDelete && (
            <div className="mt-4 pt-3" style={{ borderTop: `1px solid ${C.navyLight}44` }}>
              {deleteError && <p role="alert" className="font-mono text-xs mb-2" style={{ color: C.redLight }}>{deleteError}</p>}
              <button onClick={() => { void handleDelete(); }} disabled={deleting} className="w-full py-2 font-heading tracking-wider text-xs rounded flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: `${C.red}33`, color: C.redLight, border: `1px solid ${C.red}66` }}>
                <Trash2 size={14} /> {deleting ? 'DELETING\u{2026}' : 'DELETE MATCH FROM ALL PLAYERS'}
              </button>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
};
