import { CheckCircle, XCircle } from 'lucide-react';
import React, { useState } from 'react';
import { matches as matchApi } from './api';

import type { Account } from '../accounts/models';
import type { PlayerStat, StatEdit, Submission } from './models';
import type { Team } from '../teams/models';
import { StatField, StatLine, TeamPill, ToggleField } from '../../components/Ui';
import { C } from '../../theme/theme';
import { POS } from '@napl/contracts/league';

// ============ REVIEW MATCH STATS ============
export const ReviewMatchStats = ({ account: _account, allPlayers: _allPlayers, allTeams, submission, onBack }: { account: Account; allPlayers: Account[]; allTeams: Team[]; submission: Submission; onBack: () => void }) => {
  // Allow inline editing of player stats during review
  const [editedStats, setEditedStats] = useState(() => {
    const map = new Map<string,PlayerStat>();
    submission.playerStats.forEach(p => map.set(p.username.toLowerCase(), { ...p }));
    return map;
  });
  const [editedMatchInfo, _setEditedMatchInfo] = useState({ ...submission.matchInfo });
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState<StatEdit[]>([]); // log of changes

  const home = allTeams.find(t => t.id === submission.matchInfo.homeTeamId);
  const away = allTeams.find(t => t.id === submission.matchInfo.awayTeamId);

  const updateStat = (username: string, field: keyof PlayerStat, value: number | boolean) => {
    const lc = username.toLowerCase();
    const map = new Map(editedStats);
    const orig = submission.playerStats.find(p => p.username.toLowerCase() === lc);
    const oldVal = orig?.[field];
    const previous=map.get(lc);
    if(!previous) return;
    map.set(lc, { ...previous, [field]: value });
    setEditedStats(map);
    if (oldVal !== value) {
      setEdits(es => [...es.filter(e => !(e.username === username && e.field === field)),
        { username, field, oldVal, newVal: value }]);
    }
  };

  const approve = async () => {
    setError(''); setBusy(true);
    try {
      // Iterator.toArray is newer than the supported ES2022 browser baseline.
      // eslint-disable-next-line unicorn/prefer-iterator-to-array
      await matchApi.approveSubmission(submission.id,editedMatchInfo,[...editedStats.values()],edits);
      onBack();
    } catch (error_) {
      setError('Could not approve: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const reject = async () => {
    const reason = prompt('Why are you rejecting? (the submitter will see this)') || '';
    setBusy(true);
    try {
      await matchApi.rejectSubmission(submission.id,reason);
      onBack();
    } catch (error_) {
      setError('Could not reject: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="font-mono text-xs tracking-wider flex items-center gap-1" style={{ color: `${C.cream}88` }}>
        ← BACK
      </button>

      <div className="rounded-xl p-5" style={{ background: `${C.navyDeep}aa`, border: `1px solid ${C.gold}55` }}>
        <div className="font-mono text-[10px] tracking-[0.3em] mb-1" style={{ color: `${C.gold}cc` }}>REVIEW SUBMISSION</div>
        <div className="font-mono text-[11px] tracking-wider mb-3" style={{ color: `${C.cream}66` }}>
          SUBMITTED BY <span style={{ color: C.cream }}>{submission.submittedBy.toUpperCase()}</span> ON {new Date(submission.submittedAt).toLocaleString()}
        </div>

        {/* Match info display */}
        <div className="rounded-lg p-3 mb-4" style={{ background: C.navyDeep }}>
          <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: `${C.cream}66` }}>
            {new Date(editedMatchInfo.date).toLocaleDateString()} • {editedMatchInfo.season}
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <TeamPill team={home} fallback={editedMatchInfo.homeTeamId} />
            <span className="font-display text-2xl" style={{ color: C.cream }}>{editedMatchInfo.homeScore}</span>
            <span className="font-mono text-xs" style={{ color: `${C.cream}66` }}>—</span>
            <span className="font-display text-2xl" style={{ color: C.cream }}>{editedMatchInfo.awayScore}</span>
            <TeamPill team={away} fallback={editedMatchInfo.awayTeamId} />
          </div>
        </div>

        <div className="flex justify-between items-center mb-3">
          <div className="font-display text-lg tracking-wider" style={{ color: C.cream }}>PLAYER STATS</div>
          <button
            onClick={() => setEditing(e => !e)}
            className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
            style={{
              background: editing ? `${C.gold}22` : `${C.navyLight}66`,
              color: editing ? C.goldLight : C.cream,
              border: `1px solid ${editing ? C.gold : C.navyLight}66`,
            }}
          >{editing ? '✓ EDITING' : '✎ EDIT VALUES'}</button>
        </div>

        <div className="space-y-3 mb-4">
          {Array.from(editedStats.values(), (ps) => {
            const isGK = ps.position === POS.GK;
            return (
              <div key={ps.username} className="rounded-lg p-3" style={{
                background: C.navyDeep, border: `1px solid ${C.navyLight}55`,
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="font-display text-base tracking-wider" style={{ color: C.cream }}>
                    {ps.username.toUpperCase()}
                  </div>
                  <div className="font-mono text-[10px] px-2 py-0.5 rounded" style={{
                    background: `${C.brandNavy}cc`, color: C.cream,
                  }}>{ps.position}</div>
                </div>
                {editing ? (
                  isGK ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatField label="DEFLECTS"   value={ps.deflects}   onChange={(v) => updateStat(ps.username, 'deflects', v)} />
                      <StatField label="CATCHES" value={ps.catches} onChange={(v) => updateStat(ps.username, 'catches', v)} />
                      <StatField label="PASSES"  value={ps.passes}  onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <ToggleField label="CLEAN SHEET" value={ps.cleanSheet} onChange={(v) => updateStat(ps.username, 'cleanSheet', v)} />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatField label="GOALS"   value={ps.goals}         onChange={(v) => updateStat(ps.username, 'goals', v)} />
                      <StatField label="ASSISTS" value={ps.assists}       onChange={(v) => updateStat(ps.username, 'assists', v)} />
                      <StatField label="PASSES"  value={ps.passes}        onChange={(v) => updateStat(ps.username, 'passes', v)} />
                      <StatField label="TACKLES" value={ps.tackles}       onChange={(v) => updateStat(ps.username, 'tackles', v)} />
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                    {isGK ? (
                      <>
                        <StatLine label="DFL" value={ps.deflects} />
                        <StatLine label="CATCH" value={ps.catches} />
                        <StatLine label="PASS"  value={ps.passes} />
                        <StatLine label="CS"    value={ps.cleanSheet ? '✓' : '—'} />
                      </>
                    ) : (
                      <>
                        <StatLine label="GOAL" value={ps.goals} />
                        <StatLine label="AST"  value={ps.assists} />
                        <StatLine label="PASS" value={ps.passes} />
                        <StatLine label="TKL"  value={ps.tackles} />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {edits.length > 0 && (
          <div className="rounded-lg p-3 mb-3" style={{ background: `${C.gold}11`, border: `1px solid ${C.gold}44` }}>
            <div className="font-mono text-[10px] tracking-[0.25em] mb-1" style={{ color: C.goldLight }}>
              YOU EDITED {edits.length} {edits.length === 1 ? 'VALUE' : 'VALUES'}
            </div>
            <div className="space-y-0.5">
              {edits.map((e, i) => (
                <div key={i} className="font-mono text-[10px]" style={{ color: `${C.cream}99` }}>
                  {e.username} • {e.field}: <span style={{ color: C.redLight }}>{String(e.oldVal)}</span> → <span style={{ color: C.greenLight }}>{String(e.newVal)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <div className="font-mono text-xs px-2 py-1 rounded mb-3" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={reject}
            disabled={busy}
            className="py-3 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `${C.red}33`,
              color: C.redLight,
              border: `1px solid ${C.red}66`,
            }}
          ><XCircle size={14} /> REJECT</button>
          <button
            onClick={approve}
            disabled={busy}
            className="py-3 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          ><CheckCircle size={14} /> {busy ? 'WORKING...' : 'APPROVE'}</button>
        </div>
      </div>
    </div>
  );
};
