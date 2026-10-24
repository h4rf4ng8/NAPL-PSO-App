import { usePageCursor } from '../../hooks/use-page-cursor';
import type { TeamSummary as Team } from '../teams/models';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useState } from 'react';
import { MAX_SCHEDULE_MATCHES } from '@napl/contracts/league';
import { PageButtons } from '../../components/PageButtons';
import { TeamSelect } from '../teams/TeamSelect';
import { matches as matchApi } from './api';

import type { ScheduledMatch } from './models';
import { ModalShell } from '../../components/Dialog';

import { generateRoundRobinSchedule } from '../../utils/league';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { Button } from '../../components/ui/button';


// ============ SCHEDULE: GENERATE MODAL ============
// Admin picks the season name + the teams to include, then this generates
// the entire fixture list and inserts it in one shot.
export const GenerateScheduleModal = ({ existingSeasons = [], onClose, onGenerated }: { existingSeasons?: string[]; onClose: () => void; onGenerated: (season:string) => void }) => {
  const [seasonName, setSeasonName] = useState(() => {
    // Suggest next season number based on existing
    const nums = existingSeasons.map(s => Math.trunc(Number(s.replaceAll(/\D/g, '')))).filter(n => !Number.isNaN(n));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    return `Season ${next}`;
  });
  const [teamSearch, setTeamSearch] = useState('');
  const cursor = usePageCursor(teamSearch);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: 'approved', search: teamSearch, after: cursor.after } });
  const teamPage = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    restart: () => { cursor.restart(); if (!cursor.after) void teamQuery.refetch().catch(() => {}); },
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const approvedTeams = teamPage.data?.nodes ?? [];
  const [selectedNames, setSelectedNames] = useState<Record<string,string>>({});
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [rounds, setRounds] = useState(2); // how many times each pairing is played
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof generateRoundRobinSchedule> | null>(null); // array of weeks of {homeTeamId, awayTeamId}
  const season = seasonName.trim();
  let seasonError = '';
  if (season.length === 0) seasonError = 'Season name is required.';
  else if (season.length > 160) seasonError = 'Season name must be 160 characters or fewer.';

  const toggleTeam = (id: string) => {
    const team = approvedTeams.find(team => team.id === id); if (team) setSelectedNames(previous => ({ ...previous, [id]: team.name }));
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
  const teamById = (id: string | null | undefined) => id ? { name: selectedNames[id] ?? id, tag: selectedNames[id] ?? id } : undefined;

  return (
    <ModalShell title="Generate season schedule" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div className="space-y-2"><Label htmlFor="generation-season">Season name</Label><Input id="generation-season" value={seasonName} onChange={e => setSeasonName(e.target.value)} maxLength={160} /></div>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">Teams in this season · {selectedTeamIds.length} selected</legend>
          <Input aria-label="Search generation teams" placeholder="Search approved teams" value={teamSearch} onChange={event => setTeamSearch(event.target.value)} />
          {teamPage.error && <Alert variant="destructive"><AlertDescription>{teamPage.error}<Button variant="outline" onClick={teamPage.restart}>Restart teams</Button></AlertDescription></Alert>}
          {teamPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading teams…</p>}
          <div className="flex flex-wrap gap-2">{selectedTeamIds.map(id => <Button size="sm" variant="secondary" key={id} onClick={() => toggleTeam(id)}>Remove {selectedNames[id] ?? id}</Button>)}</div>
          <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
            {approvedTeams.map(t => <label key={t.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent"><Checkbox checked={selectedTeamIds.includes(t.id)} onCheckedChange={() => toggleTeam(t.id)} /><span className="text-sm">{t.tag} — {t.name}</span></label>)}
            {!teamPage.loading && approvedTeams.length === 0 && <p className="p-4 text-sm text-muted-foreground">No approved teams found. Try another search or approve teams first.</p>}
          </div>
          <PageButtons {...teamPage} hasNextPage={teamPage.data?.pageInfo.hasNextPage ?? false} />
        </fieldset>
        <div className="space-y-2"><Label htmlFor="generation-rounds">Rounds per pairing</Label><Input id="generation-rounds" className="max-w-24" type="number" min="1" max="10" value={rounds} onChange={e => { setRounds(Math.max(1, Math.min(10, Number(e.target.value) || 1))); setPreview(null); }} /></div>
        <div className="rounded-lg bg-muted p-4 text-sm space-y-1">
          <p className="font-medium">{selectedTeamIds.length} teams · {Math.floor(selectedTeamIds.length * (selectedTeamIds.length - 1) / 2) * rounds} matches · {Math.max(0, (selectedTeamIds.length % 2 === 0 ? selectedTeamIds.length - 1 : selectedTeamIds.length) * rounds)} weeks</p>
          <p className="text-muted-foreground">Each team plays {Math.max(0, selectedTeamIds.length - 1) * rounds} games.{rounds >= 2 && ' Home and away flip between rounds.'} Set dates and times after generation.</p>
        </div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        {preview && <section aria-label="Schedule preview" className="rounded-lg border p-4 space-y-3"><h3 className="font-medium">Preview <Badge variant="secondary">{preview.length} weeks · {totalMatches} matches</Badge></h3><div className="max-h-64 overflow-y-auto grid gap-4 sm:grid-cols-2">{preview.map((wk, i) => <div key={i}><h4 className="mb-1 text-sm font-medium">Week {i + 1}</h4>{wk.map((m, mi) => <p key={mi} className="text-sm text-muted-foreground">{teamById(m.homeTeamId)?.name || '?'} vs {teamById(m.awayTeamId)?.name || '?'}</p>)}</div>)}</div></section>}
        <div className="flex flex-wrap gap-2">
          {preview ? <><Button variant="outline" disabled={busy} onClick={() => setPreview(null)}>Change schedule</Button><Button disabled={busy} onClick={() => { if (existingSeasons.includes(season)) setReplaceOpen(true); else void handleGenerate(); }}>{busy ? 'Generating…' : 'Generate & save'}</Button></> : <><Button onClick={handlePreview}>Preview schedule</Button><Button variant="outline" onClick={handleSkipGeneration}>Build manually</Button></>}
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
        </div>
      </div>
      <AlertDialog open={replaceOpen} onOpenChange={setReplaceOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Replace this season’s schedule?</AlertDialogTitle><AlertDialogDescription>All matches in {season} will be replaced with the {totalMatches} matches in this preview. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep existing schedule</AlertDialogCancel><AlertDialogAction onClick={() => { void handleGenerate(); }}>Replace schedule</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </ModalShell>
  );
};

// ============ SCHEDULE: EDIT MATCH MODAL ============
// Admin opens this on any individual match to set the date/time, enter a
// score, mark postponed/forfeit, add a stream link, etc.
export const EditMatchModal = ({ match, allTeams = [], onClose, onSaved }: { match: ScheduledMatch; allTeams?: Pick<Team, 'id' | 'name' | 'tag'>[]; onClose: () => void; onSaved: () => void }) => {
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
  const [deleteOpen, setDeleteOpen] = useState(false);

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
    <ModalShell title={`Edit match · Week ${match.week}`} onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <p className="rounded-lg bg-muted p-3 text-center font-medium">{home?.name || '?'} vs {away?.name || '?'}</p>
        <div className="space-y-2"><Label htmlFor="match-date">Date & time</Label><Input id="match-date" type="datetime-local" value={dateInput} onChange={e => setDateInput(e.target.value)} /><p className="text-xs text-muted-foreground">Your local time. Leave empty if undecided.</p></div>
        <div className="space-y-2"><Label htmlFor="match-status">Status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="match-status"><SelectValue /></SelectTrigger><SelectContent>{['scheduled', 'completed', 'postponed', 'forfeit'].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
        {status === 'completed' && <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="home-score">{home?.tag || 'Home'} score</Label><Input id="home-score" type="number" min="0" value={homeScore} onChange={e => setHomeScore(e.target.value === '' ? '' : Number(e.target.value))} /></div><div className="space-y-2"><Label htmlFor="away-score">{away?.tag || 'Away'} score</Label><Input id="away-score" type="number" min="0" value={awayScore} onChange={e => setAwayScore(e.target.value === '' ? '' : Number(e.target.value))} /></div></div>}
        <div className="space-y-2"><Label htmlFor="match-stream">Stream URL (optional)</Label><Input id="match-stream" type="url" value={streamUrl} onChange={e => setStreamUrl(e.target.value)} placeholder="https://twitch.tv/…" /></div>
        <div className="space-y-2"><Label htmlFor="match-notes">Notes (optional)</Label><Textarea id="match-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Rescheduled from last week…" /></div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        <div className="flex flex-wrap gap-2"><Button onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save match'}</Button><Button variant="destructive" onClick={() => setDeleteOpen(true)} disabled={busy}>Delete match</Button><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </div>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this scheduled match?</AlertDialogTitle><AlertDialogDescription>{home?.name || 'Home'} vs {away?.name || 'Away'} will be removed from week {match.week}. Imported player records are unaffected.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { void handleDelete(); }}>Delete match</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
export const AddMatchModal = ({ existingSeasons = [], onClose, onSaved, defaultSeason = '' }: { existingSeasons?: string[]; onClose: () => void; onSaved: (season:string) => void; defaultSeason?: string }) => {
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
    <ModalShell title="Add match" onClose={onClose} maxWidth="max-w-xl">
      <div className="space-y-4">
        <div className="space-y-2"><Label htmlFor="add-season">Season</Label><Input id="add-season" value={season} onChange={e => setSeason(e.target.value)} list="existing-seasons" placeholder="Season 1" /><datalist id="existing-seasons">{existingSeasons.map(s => <option key={s} value={s} />)}</datalist><p className="text-xs text-muted-foreground">Choose an existing season or enter a new name.</p></div>
        <div className="space-y-2"><Label htmlFor="add-week">Week</Label><Input id="add-week" className="max-w-24" type="number" min="1" max="52" value={week} onChange={e => setWeek(Math.max(1, Number(e.target.value) || 1))} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Home</Label><TeamSelect value={homeTeamId} onChange={setHomeTeamId} label="Home team" /></div><div className="space-y-2"><Label>Away</Label><TeamSelect value={awayTeamId} onChange={setAwayTeamId} label="Away team" /></div></div>
        <div className="space-y-2"><Label htmlFor="add-date">Date & time (optional)</Label><Input id="add-date" type="datetime-local" value={dateInput} onChange={e => setDateInput(e.target.value)} /><p className="text-xs text-muted-foreground">Your local time. You can set this later.</p></div>
        {err && <Alert variant="destructive"><AlertDescription>{err}</AlertDescription></Alert>}
        <div className="flex gap-2"><Button onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Add match'}</Button><Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button></div>
      </div>
    </ModalShell>
  );
};
