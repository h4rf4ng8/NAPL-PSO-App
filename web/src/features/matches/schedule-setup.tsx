import { Check } from 'lucide-react';
import { useState } from 'react';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import { matches as matchApi } from './api';

import type { ScheduledMatch } from './models';
import type { Team } from '../teams/models';
import { ModalShell } from '../../components/Dialog';
import { C } from '../../theme/theme';
import { generateRoundRobinSchedule } from '../../utils/league';

// ============ SCHEDULE: GENERATE MODAL ============
// Admin picks the season name + the teams to include, then this generates
// the entire fixture list and inserts it in one shot.
export const GenerateScheduleModal = ({ allTeams = [], existingSeasons = [], onClose, onGenerated }: { allTeams?: Team[]; existingSeasons?: string[]; onClose: () => void; onGenerated: (season:string) => void }) => {
  const [seasonName, setSeasonName] = useState(() => {
    // Suggest next season number based on existing
    const nums = existingSeasons.map(s => Math.trunc(Number(s.replaceAll(/\D/g, '')))).filter(n => !Number.isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `Season ${next}`;
  });
  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const [selectedTeamIds, setSelectedTeamIds] = useState(() => approvedTeams.map(t => t.id));
  const [rounds, setRounds] = useState(2); // how many times each pairing is played
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof generateRoundRobinSchedule> | null>(null); // array of weeks of {homeTeamId, awayTeamId}
  const season = seasonName.trim();
  let seasonError = '';
  if (season.length === 0) seasonError = 'Season name is required.';
  else if (season.length > 160) seasonError = 'Season name must be 160 characters or fewer.';

  const toggleTeam = (id: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setPreview(null);
  };

  const handlePreview = () => {
    setErr('');
    setPreview(null);
    if (selectedTeamIds.length < 2) { setErr('Pick at least 2 teams.'); return; }
    if (seasonError) { setErr(seasonError); return; }
    if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 10) { setErr('Rounds must be a whole number between 1 and 10.'); return; }
    if (selectedTeamIds.length * (selectedTeamIds.length - 1) / 2 * rounds > MAX_SCHEDULE_MATCHES) {
      setErr(`A schedule can contain at most ${MAX_SCHEDULE_MATCHES} matches. Choose fewer teams or rounds.`);
      return;
    }
    const weeks = generateRoundRobinSchedule(selectedTeamIds, rounds);
    setPreview(weeks);
  };

  // Create an empty season with no auto-generated matches — admin will build
  // the schedule match-by-match via ADD MATCH afterward.
  const handleSkipGeneration = async () => {
    setErr('');
    if (seasonError) { setErr(seasonError); return; }
    if (existingSeasons.includes(season)) {
      setErr(`Season "${season}" already exists. Pick a different name or edit the existing one.`);
      return;
    }
    // No matches to insert — just hand the name back so the caller can start
    // using it. The season appears in the dropdown as soon as the first
    // manual match is added.
    onGenerated?.(season);
    onClose?.();
  };

  const handleGenerate = async () => {
    setErr('');
    if (seasonError) { setErr(seasonError); return; }
    if (!preview) { setErr('Preview the schedule first.'); return; }
    // Confirm wipe if the season already exists
    if (existingSeasons.includes(season) && !confirm(`Season "${season}" already has matches. REPLACE all of them with a new generated schedule?`)) return;
    setBusy(true);
    try {
      const rows = preview.flatMap((wk, idx) => wk.map(m => ({
        id: crypto.randomUUID(),
        week: idx + 1,
        homeTeamId: m.homeTeamId,
        awayTeamId: m.awayTeamId,
        scheduledDate: null,
        status: 'scheduled',
        matchType: 'regular',
      })));
      await matchApi.replaceScheduledSeason(season, rows);
      onGenerated?.(season);
      onClose?.();
    } catch (error) {
      setErr('Could not generate: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy(false);
  };

  const totalMatches = preview ? preview.reduce((sum, wk) => sum + wk.length, 0) : 0;
  const teamById = (id: string | null | undefined) => approvedTeams.find(t => t.id === id);

  return (
    <ModalShell title="GENERATE SEASON SCHEDULE" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>SEASON NAME</label>
          <input
            type="text"
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            className="w-full px-3 py-2 font-heading tracking-wider rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
            TEAMS IN THIS SEASON ({selectedTeamIds.length} selected)
          </label>
          {approvedTeams.length === 0 ? (
            <div className="font-mono text-xs p-3 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>
              No approved teams yet. Approve teams first before generating a schedule.
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto rounded" style={{ border: `1px solid ${C.navyLight}33` }}>
              {approvedTeams.map(t => {
                const checked = selectedTeamIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTeam(t.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left"
                    style={{
                      borderBottom: `1px solid ${C.navyLight}22`,
                      background: checked ? `${C.green}22` : 'transparent',
                    }}
                  >
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{
                      border: `1.5px solid ${checked ? C.green : `${C.cream}55`}`,
                      background: checked ? C.green : 'transparent',
                    }}>
                      {checked && <Check size={11} style={{ color: C.onColor }} />}
                    </div>
                    <span className="font-heading tracking-wider text-sm" style={{ color: C.cream }}>
                      {t.tag} — {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
            ROUNDS (HOW MANY TIMES EACH PAIRING PLAYS)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1" max="10"
              value={rounds}
              onChange={(e) => { setRounds(Math.max(1, Math.min(10, Number(e.target.value) || 1))); setPreview(null); }}
              className="w-20 px-3 py-2 font-mono text-sm rounded text-center"
              style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            />
            <span className="font-mono text-[10px]" style={{ color: `${C.cream}99` }}>
              {rounds === 1 ? 'SINGLE round-robin' : (rounds === 2 ? 'DOUBLE round-robin' : `${rounds}× round-robin`)}
            </span>
          </div>
        </div>

        <div className="font-mono text-[10px] p-3 rounded" style={{ background: `${C.navyLight}22`, color: `${C.cream}cc` }}>
          <div className="mb-1" style={{ color: C.goldLight }}>FORMAT PREVIEW</div>
          With {selectedTeamIds.length} teams and {rounds} round{rounds > 1 ? 's' : ''}: each team plays {Math.max(0, (selectedTeamIds.length - 1)) * rounds} games.
          Total: <b>{Math.floor(selectedTeamIds.length * (selectedTeamIds.length - 1) / 2) * rounds}</b> matches
          over <b>{Math.max(0, ((selectedTeamIds.length % 2 === 0 ? (selectedTeamIds.length - 1) : selectedTeamIds.length)) * rounds)}</b> weeks.
          {rounds >= 2 && ' Home/away flipped between rounds for balance.'}
          <br />
          Matches start with no date/time — you set those individually as teams agree on times.
        </div>

        {err && <div className="font-mono text-xs p-2 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{err}</div>}

        {preview && (
          <div className="max-h-64 overflow-y-auto rounded p-2" style={{ background: `${C.brandNavyDeep}66`, border: `1px solid ${C.navyLight}33` }}>
            <div className="font-mono text-[10px] mb-2" style={{ color: C.goldLight }}>
              PREVIEW — {preview.length} WEEKS, {totalMatches} MATCHES
            </div>
            {preview.map((wk, i) => (
              <div key={i} className="mb-2">
                <div className="font-heading text-[10px] tracking-widest" style={{ color: `${C.cream}99` }}>WEEK {i + 1}</div>
                {wk.map((m, mi) => (
                  <div key={mi} className="font-mono text-[10px] pl-2" style={{ color: C.cream }}>
                    {teamById(m.homeTeamId)?.tag || '?'} vs {teamById(m.awayTeamId)?.tag || '?'}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {preview ? (
            <>
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2 font-heading tracking-wider text-sm rounded"
                style={{ background: `${C.navyLight}66`, color: C.cream }}
              >RE-SHUFFLE</button>
              <button
                onClick={handleGenerate}
                disabled={busy}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
                style={{ background: C.green, color: C.onColor }}
              >{busy ? 'GENERATING...' : 'GENERATE & SAVE'}</button>
            </>
          ) : (
            <>
              <button
                onClick={handlePreview}
                className="flex-1 py-2 font-heading tracking-wider text-sm rounded"
                style={{ background: `${C.navyLight}66`, color: C.cream }}
              >PREVIEW SCHEDULE</button>
              {/* Alternative: skip generation entirely and build matches manually */}
              <button
                onClick={handleSkipGeneration}
                className="px-3 py-2 font-heading tracking-wider text-xs rounded"
                style={{ background: `${C.gold}44`, color: C.goldLight, border: `1px solid ${C.gold}66` }}
                title="Create the season with no auto-generated matches — add them individually afterward"
              >SKIP GEN. & BUILD MANUALLY</button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 font-heading tracking-wider text-sm rounded"
            style={{ background: `${C.navyLight}44`, color: `${C.cream}cc` }}
          >CANCEL</button>
        </div>
      </div>
    </ModalShell>
  );
};

// ============ SCHEDULE: EDIT MATCH MODAL ============
// Admin opens this on any individual match to set the date/time, enter a
// score, mark postponed/forfeit, add a stream link, etc.
export const EditMatchModal = ({ match, allTeams = [], onClose, onSaved }: { match: ScheduledMatch; allTeams?: Team[]; onClose: () => void; onSaved: () => void }) => {
  const home = allTeams.find(t => t.id === match.homeTeamId);
  const away = allTeams.find(t => t.id === match.awayTeamId);
  // Convert epoch ms → local 'YYYY-MM-DDTHH:MM' for the datetime-local input
  const toLocalInput = (ms: number | null | undefined) => {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [dateInput, setDateInput] = useState(toLocalInput(match.scheduledDate));
  const [status, setStatus] = useState(match.status || 'scheduled');
  const [homeScore, setHomeScore] = useState(match.homeScore ?? '');
  const [awayScore, setAwayScore] = useState(match.awayScore ?? '');
  const [streamUrl, setStreamUrl] = useState(match.streamUrl || '');
  const [notes, setNotes] = useState(match.notes || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    setBusy(true);
    try {
      const updated = {
        ...match,
        scheduledDate: dateInput ? new Date(dateInput).getTime() : null,
        status,
        homeScore: homeScore === '' ? null : Number(homeScore),
        awayScore: awayScore === '' ? null : Number(awayScore),
        streamUrl: streamUrl.trim(),
        notes: notes.trim(),
      };
      await matchApi.saveScheduledMatch(updated);
      onSaved?.();
      onClose?.();
    } catch (error) {
      setErr('Could not save: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy(false);
  };

  const handleDelete = async () => {
    if (!confirm('Delete this match from the schedule?')) return;
    setBusy(true);
    try {
      await matchApi.deleteScheduledMatch(match.id);
      onSaved?.();
      onClose?.();
    } catch (error) {
      setErr('Could not delete: ' + (error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  };

  return (
    <ModalShell title={`EDIT MATCH — WEEK ${match.week}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-3">
        <div className="font-heading tracking-wider text-center text-base p-2 rounded" style={{
          background: `${C.navyLight}22`, color: C.cream
        }}>
          {home?.tag || '?'} <span style={{ color: `${C.cream}66` }}>vs</span> {away?.tag || '?'}
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>DATE & TIME</label>
          <input
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="w-full px-3 py-2 font-mono text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}66` }}>
            Leave empty if time not yet decided.
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>STATUS</label>
          <div className="grid grid-cols-4 gap-1">
            {['scheduled', 'completed', 'postponed', 'forfeit'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className="py-1.5 font-mono text-[10px] tracking-widest rounded uppercase"
                style={status === s
                  ? { background: C.green, color: C.onColor }
                  : { background: `${C.navyLight}44`, color: `${C.cream}99` }
                }
              >{s}</button>
            ))}
          </div>
        </div>

        {status === 'completed' && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
                {home?.tag || 'HOME'} SCORE
              </label>
              <input
                type="number" min="0"
                value={homeScore}
                onChange={(e) => setHomeScore(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono text-sm rounded"
                style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </div>
            <div>
              <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>
                {away?.tag || 'AWAY'} SCORE
              </label>
              <input
                type="number" min="0"
                value={awayScore}
                onChange={(e) => setAwayScore(Number(e.target.value))}
                className="w-full px-3 py-2 font-mono text-sm rounded"
                style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
            </div>
          </div>
        )}

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>STREAM URL (OPTIONAL)</label>
          <input
            type="url"
            value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)}
            placeholder="https://twitch.tv/..."
            className="w-full px-3 py-2 font-mono text-xs rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>NOTES (OPTIONAL)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. rescheduled from last week"
            className="w-full px-3 py-2 font-body text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
        </div>

        {err && <div className="font-mono text-xs p-2 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{err}</div>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{ background: C.green, color: C.onColor }}
          >{busy ? 'SAVING...' : 'SAVE'}</button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="px-3 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{ background: `${C.red}44`, color: C.redLight }}
          >DELETE</button>
          <button
            onClick={onClose}
            className="px-4 py-2 font-heading tracking-wider text-sm rounded"
            style={{ background: `${C.navyLight}44`, color: `${C.cream}cc` }}
          >CANCEL</button>
        </div>
      </div>
    </ModalShell>
  );
};

// ============ SCHEDULE VIEW (public tab) ============
// Shows the whole season grouped by week. Each row shows home/away, date/time
// (or TBD), status badge, and score if played. Admins see an EDIT button;
// others just see the info.
// ============ SCHEDULE: ADD MATCH MODAL ============
// Standalone "add a one-off match" dialog. Admin picks season (new or existing),
// week number, home and away teams, and optionally a date/time right away.
// Useful for exhibition games, makeups, cup games, or building a whole season
// from scratch after SKIP GENERATION.
export const AddMatchModal = ({ allTeams = [], existingSeasons = [], onClose, onSaved, defaultSeason = '' }: { allTeams?: Team[]; existingSeasons?: string[]; onClose: () => void; onSaved: (season:string) => void; defaultSeason?: string }) => {
  const approvedTeams = allTeams.filter(t => t.status === 'approved');
  const [season, setSeason] = useState(defaultSeason || existingSeasons[0] || '');
  const [week, setWeek] = useState(1);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    if (!season.trim()) { setErr('Season name is required.'); return; }
    if (!homeTeamId || !awayTeamId) { setErr('Pick both home and away teams.'); return; }
    if (homeTeamId === awayTeamId) { setErr('Home and away must be different teams.'); return; }
    if (week < 1) { setErr('Week must be 1 or higher.'); return; }
    setBusy(true);
    try {
      const match = {
        id: `sch_${season.toLowerCase().replaceAll(/\s+/g, '_')}_w${week}_${homeTeamId.slice(-4)}_${awayTeamId.slice(-4)}_${Date.now()}`,
        season,
        week: Number(week),
        homeTeamId,
        awayTeamId,
        scheduledDate: dateInput ? new Date(dateInput).getTime() : null,
        status: 'scheduled',
        matchType: 'regular',
      };
      await matchApi.saveScheduledMatch(match);
      onSaved?.(season);
      onClose?.();
    } catch (error) {
      setErr('Could not save: ' + (error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  };

  return (
    <ModalShell title="ADD MATCH" onClose={onClose} maxWidth="max-w-md">
      <div className="space-y-3">
        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>SEASON</label>
          <input
            type="text"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            list="existing-seasons"
            placeholder="e.g. Season 1"
            className="w-full px-3 py-2 font-heading tracking-wider rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
          <datalist id="existing-seasons">
            {existingSeasons.map(s => <option key={s} value={s} />)}
          </datalist>
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}77` }}>
            Type an existing season name or create a new one.
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>WEEK</label>
          <input
            type="number"
            min="1" max="52"
            value={week}
            onChange={(e) => setWeek(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 px-3 py-2 font-mono text-sm rounded text-center"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>HOME</label>
            <select
              value={homeTeamId}
              onChange={(e) => setHomeTeamId(e.target.value)}
              className="w-full px-2 py-2 font-heading tracking-wider rounded"
              style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            >
              <option value="">— pick team —</option>
              {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.tag} — {t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>AWAY</label>
            <select
              value={awayTeamId}
              onChange={(e) => setAwayTeamId(e.target.value)}
              className="w-full px-2 py-2 font-heading tracking-wider rounded"
              style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
            >
              <option value="">— pick team —</option>
              {approvedTeams.map(t => <option key={t.id} value={t.id}>{t.tag} — {t.name}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] tracking-widest block mb-1" style={{ color: C.cream }}>DATE & TIME (OPTIONAL)</label>
          <input
            type="datetime-local"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="w-full px-3 py-2 font-mono text-sm rounded"
            style={{ background: `${C.navyLight}22`, border: `1px solid ${C.navyLight}66`, color: C.cream }}
          />
          <div className="font-mono text-[9px] mt-0.5" style={{ color: `${C.cream}77` }}>
            Leave empty to set later via EDIT.
          </div>
        </div>

        {err && <div className="font-mono text-xs p-2 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{err}</div>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-1 py-2 font-heading tracking-wider text-sm rounded disabled:opacity-50"
            style={{ background: C.green, color: C.onColor }}
          >{busy ? 'SAVING...' : 'ADD MATCH'}</button>
          <button
            onClick={onClose}
            className="px-4 py-2 font-heading tracking-wider text-sm rounded"
            style={{ background: `${C.navyLight}44`, color: `${C.cream}cc` }}
          >CANCEL</button>
        </div>
      </div>
    </ModalShell>
  );
};
