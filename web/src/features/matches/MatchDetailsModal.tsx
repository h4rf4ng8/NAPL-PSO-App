import { useEffect, useState } from 'react';
import { ModalShell } from '../../components/Dialog';
import { matches as matchesApi, type MatchDetails, type MatchParticipant } from './api';
import { C } from '../../theme/theme';
import { Edit3, Shield, Trash2 } from 'lucide-react';
import { ResultBadge } from '../../components/Display';
import type { Account } from '../accounts/models';
import { isAdmin as hasAdminRole } from '../../utils/league';

// Stats an admin can edit for one player in one match. cleanSheet is a
// defender/GK flag; the aggregate uses it to recount clean sheets.
type EditableStats = Pick<MatchParticipant, 'goals' | 'assists' | 'passes' | 'tackles' | 'deflects' | 'catches' | 'cleanSheet'>;

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
  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditableStats | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const openEdit = (player: MatchParticipant) => {
    setEditingUsername(player.username);
    setEditDraft({
      goals: player.goals, assists: player.assists, passes: player.passes, tackles: player.tackles,
      deflects: player.deflects, catches: player.catches, cleanSheet: player.cleanSheet,
    });
    setEditError('');
  };
  const cancelEdit = () => { setEditingUsername(null); setEditDraft(null); setEditError(''); };
  const saveEdit = async () => {
    if (!editingUsername || !editDraft) return;
    setSavingEdit(true); setEditError('');
    try {
      await matchesApi.updateMatchStats(matchId, editingUsername, editDraft);
      // Re-fetch so the modal reflects the new numbers without closing.
      const refreshed = await matchesApi.fetchMatchDetails(matchId);
      setDetails(refreshed);
      cancelEdit();
    } catch (saveError) {
      setEditError(saveError instanceof Error ? saveError.message : 'Could not save edit.');
    }
    setSavingEdit(false);
  };

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
                {players.map(player => editDraft && editingUsername === player.username ? (
                  <div key={player.username} className="rounded px-2 py-2 font-mono text-xs space-y-2" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}66` }}>
                    <div className="font-heading tracking-wider" style={{ color: C.goldLight }}>EDIT {player.username.toUpperCase()}</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(['goals', 'assists', 'passes', 'tackles', 'deflects', 'catches'] as const).map(field => (
                        <label key={field} className="flex flex-col">
                          <span className="uppercase tracking-wider text-[9px]" style={{ color: `${C.cream}88` }}>{field}</span>
                          <input type="number" min={0} value={editDraft[field]}
                            onChange={event => setEditDraft({ ...editDraft, [field]: Number(event.target.value) })}
                            className="w-full px-2 py-1 rounded" style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }} />
                        </label>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-xs" style={{ color: C.cream }}>
                      <input type="checkbox" checked={editDraft.cleanSheet}
                        onChange={event => setEditDraft({ ...editDraft, cleanSheet: event.target.checked })} />
                      Clean sheet
                    </label>
                    {editError && <p role="alert" style={{ color: C.redLight }}>{editError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => { void saveEdit(); }} disabled={savingEdit}
                        className="flex-1 py-1.5 font-heading tracking-wider text-[10px] rounded disabled:opacity-50"
                        style={{ background: C.green, color: C.onColor }}>{savingEdit ? 'SAVING…' : 'SAVE'}</button>
                      <button onClick={cancelEdit} disabled={savingEdit}
                        className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded disabled:opacity-50"
                        style={{ background: `${C.navyLight}66`, color: C.cream }}>CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <div key={player.username} className="rounded px-2 py-1.5 flex items-center gap-2 font-mono text-xs" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}44` }}>
                    <ResultBadge result={player.result} />
                    <span className="flex-1 truncate" style={{ color: C.cream }}>{player.username} <span style={{ color: `${C.cream}66` }}>({player.position})</span></span>
                    <span><span style={{ color: C.greenLight }}>{player.goals}</span>G</span>
                    <span><span style={{ color: C.goldLight }}>{player.assists}</span>A</span>
                    <span><span style={{ color: `${C.cream}88` }}>{player.passes}</span>P</span>
                    <span><span style={{ color: `${C.cream}88` }}>{player.tackles}</span>T</span>
                    {player.cleanSheet && <Shield size={12} style={{ color: C.greenLight }} />}
                    {canDelete && (
                      <button onClick={() => openEdit(player)} aria-label={`Edit ${player.username}`}
                        className="p-1 rounded" style={{ background: `${C.navyLight}55`, color: C.goldLight }}>
                        <Edit3 size={12} />
                      </button>
                    )}
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
