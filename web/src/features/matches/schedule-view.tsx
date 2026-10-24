import { mergeSeasonPages } from '../dashboard/season-pages';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { Calendar, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect,useMemo,useRef,useState } from 'react';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { readText } from '../../api/page';
import { segment } from '../../api/http';
import { LazyText } from '../content/LazyText';
import { z } from 'zod';
import { useQuery } from '@apollo/client/react';
import { SeasonsDocument } from '../../api/generated/graphql';

import type { Account } from '../accounts/models';
import type { ScheduledMatch } from './models';
type MatchTeam = { id: string; name: string; tag: string; color: string | null; logoUrl?: string | null };
type MatchSummary = Omit<ScheduledMatch, 'notes'> & { notesUrl: string; homeTeam: MatchTeam | null; awayTeam: MatchTeam | null; homeRecord: { w: number; d: number; l: number } | null; awayRecord: { w: number; d: number; l: number } | null };

import { isAdmin } from '../../utils/league';
import { AddMatchModal, EditMatchModal, GenerateScheduleModal } from './schedule-setup';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Slider } from '../../components/ui/slider';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';


export const ScheduleView = ({ account }: { account: Account | null }) => {
  const [seasonPageError, setSeasonPageError] = useState('');
  const [season, setSeason] = useState('');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [emptySeasons, setEmptySeasons] = useState<string[]>([]);
  const seasonQuery = useQuery(SeasonsDocument, { variables: { after: null } });
  const seasons = [...new Set([...(seasonQuery.data?.seasons.nodes ?? []), ...emptySeasons])];
  const page = useRestPage<MatchSummary>(season ? `/api/schedule?season=${segment(season)}${selectedWeek === null ? '' : `&week=${selectedWeek}`}` : null);
  const { loading, error: loadError, restart: reload } = page;
  const matches = page.data?.nodes ?? [];
  const loadedRange = useMemo(() => page.data ? z.object({ weekRange: z.object({ min: z.number().nullable(), max: z.number().nullable(), count: z.number() }) }).parse(page.data).weekRange : null, [page.data]);
  const [savedRange, setSavedRange] = useState<{ season: string; value: NonNullable<typeof loadedRange> } | null>(null);
  const [slidingWeek, setSlidingWeek] = useState<number | null>(null);
  const weekRange = loadedRange ?? (savedRange?.season === season ? savedRange.value : null);
  useEffect(() => { if (loadedRange) setSavedRange({ season, value: loadedRange }); }, [season, loadedRange]);
  const [editError, setEditError] = useState('');
  const [editingTeams, setEditingTeams] = useState<MatchTeam[]>([]);
  const [editing, setEditing] = useState<ScheduledMatch | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const editorRequest = useRef(0);
  const [generating, setGenerating] = useState(false);
  const [adding, setAdding] = useState(false);
  const isAdminUser = isAdmin(account);

  // Default to the most recent season on first load
  useEffect(() => {
    if (!season && seasons.length > 0) setSeason(seasons[0]!);
  }, [seasons, season]);

  // Reset the week slider whenever the season changes — different seasons
  // have different week ranges, so holding the old week would be confusing.
  useEffect(() => { setSelectedWeek(null); setSlidingWeek(null); }, [season]);

  const filtered = matches;
  const recordStringFor = (record: MatchSummary['homeRecord']) =>
    !account || !record || record.w + record.d + record.l === 0 ? null : `${record.w}W-${record.d}D-${record.l}L`;
  useEffect(() => {
    editorRequest.current++;
    setLoadingEditor(false);
    setEditing(null);
    return () => { editorRequest.current++; };
  }, [season, selectedWeek]);
  const openEdit = async (match: MatchSummary) => {
    if (loadingEditor || editing || adding || generating) return;
    const version = ++editorRequest.current;
    setLoadingEditor(true);
    setEditError('');
    try {
      const [notes, streamUrl] = await Promise.all([readText(match.notesUrl), readText(`/api/schedule/${segment(match.id)}/links/stream-url`)]);
      if (version !== editorRequest.current) return;
      setEditingTeams([match.homeTeam, match.awayTeam].filter((team): team is MatchTeam => !!team));
      setEditing({ ...match, notes, streamUrl });
    } catch (error) {
      if (version === editorRequest.current) setEditError(error instanceof Error ? error.message : 'Could not load saved match.');
    } finally {
      if (version === editorRequest.current) setLoadingEditor(false);
    }
  };

  // Group by week
  const byWeek = useMemo(() => {
    const groups: Record<number,MatchSummary[]> = {};
    filtered.forEach(m => {
      if (!groups[m.week]) groups[m.week] = [];
      groups[m.week].push(m);
    });
    // Sort each week by scheduled date (null dates last)
    Object.values(groups).forEach(wk => wk.sort((a, b) => {
      if (!a.scheduledDate && !b.scheduledDate) return 0;
      if (!a.scheduledDate) return 1;
      return b.scheduledDate ? a.scheduledDate - b.scheduledDate : -1;
    }));
    return groups;
  }, [filtered]);

  const fmtDate = (ms: number | null | undefined) => {
    if (!ms) return 'TBD';
    const d = new Date(ms);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      + ' • ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Calendar aria-hidden="true" className="size-6" /> Schedule</h1><p className="mt-1 text-sm text-muted-foreground">Fixtures, results, and match times.</p></div>
        <div className="flex flex-wrap gap-2">
          {seasons.length > 0 && <Select value={season} onValueChange={setSeason}><SelectTrigger className="w-full sm:w-44" aria-label="Schedule season"><SelectValue /></SelectTrigger><SelectContent>{seasons.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>}
          {isAdminUser && <><Button variant="outline" disabled={loadingEditor} onClick={() => setAdding(true)}><Plus className="size-4" /> Add match</Button><Button disabled={loadingEditor} onClick={() => setGenerating(true)}><Plus className="size-4" /> New season</Button></>}
        </div>
      </div>
      {loadingEditor && <p role="status" className="text-sm text-muted-foreground">Loading match editor…</p>}
      {(loadError || editError) && <Alert variant="destructive"><AlertDescription>{loadError || editError}<Button variant="outline" onClick={page.restart}>Restart schedule</Button></AlertDescription></Alert>}
      {weekRange && weekRange.count >= 2 && weekRange.min !== null && weekRange.max !== null && <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><Label htmlFor="schedule-week">Week</Label><Input id="schedule-week" className="w-32" type="number" min={weekRange.min} max={weekRange.max} placeholder="All weeks" value={selectedWeek ?? ''} onChange={event => setSelectedWeek(event.target.value === '' ? null : Math.max(weekRange.min!, Math.min(weekRange.max!, Math.trunc(Number(event.target.value)))))} /><Button variant={selectedWeek === null ? 'secondary' : 'outline'} onClick={() => setSelectedWeek(null)}>All weeks</Button><div className="ml-auto flex items-center gap-2"><Button variant="outline" size="icon" aria-label="Previous week" disabled={selectedWeek === weekRange.min} onClick={() => setSelectedWeek(w => w === null ? weekRange.min : Math.max(weekRange.min!, w - 1))}><ChevronLeft className="size-4" /></Button><span className="text-sm text-muted-foreground">{selectedWeek === null ? `${weekRange.min}–${weekRange.max}` : `${selectedWeek} / ${weekRange.max}`}</span><Button variant="outline" size="icon" aria-label="Next week" disabled={selectedWeek === weekRange.max} onClick={() => setSelectedWeek(w => w === null ? weekRange.min : Math.min(weekRange.max!, w + 1))}><ChevronRight className="size-4" /></Button></div><Slider aria-label="Schedule week" className="basis-full" min={weekRange.min} max={weekRange.max} step={1} value={[slidingWeek ?? selectedWeek ?? weekRange.min]} onValueChange={values => setSlidingWeek(values[0]!)} onValueCommit={values => { setSelectedWeek(values[0]!); setSlidingWeek(null); }} /><p className="text-xs text-muted-foreground">{slidingWeek === null ? (selectedWeek === null ? "Showing all weeks. Move the slider to choose a week." : `Showing week ${selectedWeek}.`) : `Choose week ${slidingWeek}`}</p></CardContent></Card>}
      {(loading || seasonQuery.loading) ? <p role="status" className="py-8 text-center text-muted-foreground">Loading schedule…</p> : (filtered.length === 0 ? <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No matches scheduled for this season yet. {isAdminUser ? 'Add a match or create a new season to generate a round-robin.' : 'Fixtures will appear here when ready.'}</CardContent></Card> : <div className="space-y-6">{Object.keys(byWeek).map(Number).filter(wkNum => selectedWeek === null || wkNum === selectedWeek).sort((a, b) => a - b).map(wkNum => <section key={wkNum} className="space-y-3"><h2 className="flex items-center gap-2 font-semibold">Week {wkNum}<Badge variant="secondary">{byWeek[wkNum].length} matches</Badge></h2><div className="grid gap-3 xl:grid-cols-2">{byWeek[wkNum].map(m => {
        const played = m.status === 'completed' && m.homeScore !== null && m.awayScore !== null;
        return <Card key={m.id} className="overflow-hidden"><CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"><time className="text-sm text-muted-foreground" dateTime={m.scheduledDate ? new Date(m.scheduledDate).toISOString() : undefined}>{fmtDate(m.scheduledDate)}</time><Badge variant={m.status === 'completed' ? 'default' : 'secondary'}>{m.status === 'completed' ? 'Final' : m.status.charAt(0).toUpperCase() + m.status.slice(1)}</Badge></div>
          <div className="space-y-3 p-4">{[{ team: m.homeTeam, score: m.homeScore, record: m.homeRecord, side: 'Home' }, { team: m.awayTeam, score: m.awayScore, record: m.awayRecord, side: 'Away' }].map(({ team, score, record, side }) => <div key={side} className="flex items-center gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted font-semibold" style={{ borderColor: team?.color || undefined }}>{team?.logoUrl ? <MediaImage src={mediaUrl(team.logoUrl)} alt="" className="size-8 object-contain" /> : team?.tag?.slice(0, 3) || '?'}</div><div className="min-w-0 flex-1"><p className="break-words font-medium">{team?.name || 'TBD'}</p><p className="text-xs text-muted-foreground">{side}{recordStringFor(record) && ` · ${recordStringFor(record)}`}</p></div>{played && <span className="text-2xl font-semibold tabular-nums">{score}</span>}</div>)}</div>
          <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3"><LazyText url={m.notesUrl} label="Match notes" />{m.streamUrl && <Button asChild size="sm" variant="outline"><a href={mediaUrl(m.streamUrl)} target="_blank" rel="noopener noreferrer">Watch stream</a></Button>}{isAdminUser && <Button className="ml-auto" variant="outline" size="sm" disabled={loadingEditor} onClick={() => { void openEdit(m); }}>Edit</Button>}</div>
        </CardContent></Card>;
      })}</div></section>)}</div>)}

      <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
{(seasonPageError || seasonQuery.error) && <p role="alert">{seasonPageError || seasonQuery.error?.message}<Button disabled={seasonQuery.loading} onClick={() => { void seasonQuery.refetch({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></p>}
      {seasonQuery.data?.seasons.pageInfo.hasNextPage && <Button onClick={() => { void seasonQuery.fetchMore({ variables: { after: seasonQuery.data!.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}
      {generating && (
        <GenerateScheduleModal
          existingSeasons={seasons}
          onClose={() => setGenerating(false)}
          onGenerated={(newSeason) => {
            // Make sure the season appears in the dropdown even if it has
            // zero matches (e.g. SKIP GENERATION was used).
            setEmptySeasons(prev => prev.includes(newSeason) ? prev : [...prev, newSeason]);
            setSeason(newSeason);
            void reload();
          }}
        />
      )}
      {adding && (
        <AddMatchModal
          existingSeasons={seasons}
          defaultSeason={season}
          onClose={() => setAdding(false)}
          onSaved={(usedSeason) => {
            setSeason(usedSeason);
            // The season now has at least one match, so it's no longer "empty"
            setEmptySeasons(prev => prev.filter(s => s !== usedSeason));
            void reload();
          }}
        />
      )}
      {editing && (
        <EditMatchModal
          key={editing.id}
          match={editing}
          allTeams={editingTeams}
          onClose={() => setEditing(null)}
          onSaved={() => { void reload(); }}
        />
      )}
    </div>
  );
};
