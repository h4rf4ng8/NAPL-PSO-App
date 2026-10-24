import { ArticleDetailView, ArticlesListView } from './Articles';
import { Calendar, Flag, Plus, Star, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { content as contentApi } from './api';
import type { Account } from '../accounts/models';
import type { News, NewsSummary } from './models';
import type { TeamSummary as Team } from '../teams/models';
import { TeamSelect } from '../teams/TeamSelect';
import { EmptyState, TeamPill } from '../../components/Display';
import { ModalShell } from '../../components/Dialog';
import { isAdmin } from '../../utils/league';
import { useQuery } from '@apollo/client/react';
import { HomeNewsDocument } from '../../api/generated/graphql';
import { readText } from '../../api/page';
import { LazyText } from './LazyText';
import { newsSummarySchema } from './models';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

const detectNewsPath = () => {
  const path = (location.hash.slice(1) || '/').replace(/\/+$/, '');
  const match = path.match(/^\/articles\/([^/]+)$/);
  return { sub: path === '/articles' || match ? 'articles' : 'news', slug: match?.[1] ?? null };
};
export const NewsHub = ({ account, allTeams }: { account: Account | null; allTeams: Team[] }) => {
  const [state, setState] = useState(detectNewsPath);
  useEffect(() => { const changed = () => setState(detectNewsPath()); addEventListener('hashchange', changed); return () => removeEventListener('hashchange', changed); }, []);
  const goTo = (sub: string, slug: string | null = null) => {
    const hash = sub === 'news' ? '#/news' : (slug ? `#/articles/${slug}` : '#/articles');
    if (location.hash !== hash) location.hash = hash;
    setState({ sub, slug });
  };
  return state.slug ? <ArticleDetailView key={state.slug} slug={state.slug} account={account} onBack={() => goTo('articles')} /> : <Tabs value={state.sub} onValueChange={goTo} className="space-y-4"><TabsList aria-label="News sections"><TabsTrigger value="news">News</TabsTrigger><TabsTrigger value="articles">Articles</TabsTrigger></TabsList><TabsContent value="news"><NewsView account={account} allTeams={allTeams} /></TabsContent><TabsContent value="articles"><ArticlesListView account={account} onOpenArticle={slug => goTo('articles', slug)} /></TabsContent></Tabs>;
};

const newsTabs = [
  { id: 'matchup', label: 'Matchups', icon: Calendar },
  { id: 'announcement', label: 'Announcements', icon: Flag },
  { id: 'result', label: 'Results', icon: Trophy },
];
const NewsView = ({ account, allTeams }: { account: Account | null; allTeams: Team[] }) => {
  const [kind, setKind] = useState('matchup');
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const { data, loading, error, refetch: refresh } = useQuery(HomeNewsDocument, { variables: { kind, after } });
  const news = (data?.homeNews.nodes ?? []).map(row => newsSummarySchema.parse(row));
  const ordered = news.filter(item => item.type === kind).sort((a, b) => kind === 'announcement' ? (a.pinned === b.pinned ? b.createdAt - a.createdAt : Number(b.pinned) - Number(a.pinned)) : (kind === 'matchup' ? (a.date || 0) - (b.date || 0) : (b.date || 0) - (a.date || 0)));
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [editing, setEditing] = useState<News | null>(null);
  const [deleting, setDeleting] = useState<NewsSummary | null>(null);
  const [receipt, setReceipt] = useState('');
  const restart = () => { setAfter(null); setPrevious([]); void refresh({ after: null }).catch(() => {}); };
  const handleDelete = async () => {
    if (!deleting || busy) return;
    setBusy(true); setEditError('');
    try { await contentApi.deleteNews(deleting.id); }
    catch (error) { setEditError('Could not delete: ' + (error instanceof Error ? error.message : String(error))); setBusy(false); return; }
    setDeleting(null); setBusy(false); setReceipt('News item deleted.'); toast.success('News item deleted.'); restart();
  };
  const handleEdit = async (item: NewsSummary) => {
    if (busy) return;
    setBusy(true); setEditError('');
    try { const [body, notes] = await Promise.all([readText(item.bodyUrl), readText(item.notesUrl)]); setEditing({ ...item, body, notes }); setShowCompose(true); }
    catch (error) { setEditError(error instanceof Error ? error.message : 'Could not load post.'); }
    finally { setBusy(false); }
  };
  const admin = isAdmin(account);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">League news</h2>{admin && <Button disabled={busy} onClick={() => { setEditing(null); setShowCompose(true); }}><Plus className="mr-2 size-4" />New post</Button>}</div>
    <Tabs value={kind} onValueChange={value => { setKind(value); setAfter(null); setPrevious([]); }}><TabsList aria-label="News type" className="h-auto w-full flex-wrap justify-start">{newsTabs.map(tab => <TabsTrigger key={tab.id} value={tab.id}><tab.icon className="mr-2 size-4" />{tab.label}</TabsTrigger>)}</TabsList>
      {newsTabs.map(tab => <TabsContent key={tab.id} value={tab.id} className="space-y-4">
        {error && <Alert variant="destructive"><AlertDescription>{error.message} <Button variant="outline" onClick={restart}>Restart posts</Button></AlertDescription></Alert>}
        {editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}
        {receipt && <p role="status" className="text-sm text-success">{receipt}</p>}
        {loading && <div role="status"><span className="sr-only">Loading news…</span><Skeleton className="h-32" /></div>}
        {!loading && !error && ordered.length === 0 && <EmptyState icon={<tab.icon className="size-8" />} text={`No ${tab.label.toLowerCase()} posted yet.`} />}
        {ordered.map(item => {
          const home = item.homeTeam ?? allTeams.find(team => team.id === item.homeTeamId);
          const away = item.awayTeam ?? allTeams.find(team => team.id === item.awayTeamId);
          return <Card key={item.id} className={item.pinned ? 'border-warning/50' : undefined}><CardHeader className="gap-3"><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{item.pinned && <Badge variant="secondary"><Star className="mr-1 size-3 text-warning" />Pinned</Badge>}{item.type === 'matchup' && <Badge variant="outline">{item.date && item.date >= Date.now() ? 'Upcoming' : (item.date ? 'Past' : 'Date TBD')}</Badge>}{item.autoFromSubmission && <Badge variant="secondary">Imported result</Badge>}<time>{item.type === 'announcement' ? new Date(item.createdAt).toLocaleDateString() : (item.date ? new Date(item.date).toLocaleString() : 'Date to be confirmed')}</time></div>
            {item.type === 'announcement' ? <CardTitle className="break-words text-xl">{item.title}</CardTitle> : <div className="grid min-w-0 items-center gap-3 sm:grid-cols-[1fr_auto_1fr]"><TeamPill team={home} fallback={item.homeTeamId} /><span className="text-2xl font-semibold tabular-nums">{item.type === 'result' ? `${item.homeScore ?? 0} – ${item.awayScore ?? 0}` : 'vs'}</span><TeamPill team={away} fallback={item.awayTeamId} /></div>}
          </CardHeader><CardContent className="space-y-3"><LazyText url={item.type === 'announcement' ? item.bodyUrl : item.notesUrl} label={item.type === 'announcement' ? 'Read announcement' : 'Read match notes'} />{item.type === 'announcement' && <p className="text-sm text-muted-foreground">By {item.author || 'League staff'}</p>}{admin && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => { void handleEdit(item); }}>Edit</Button><Button variant="destructive" disabled={busy} onClick={() => { setEditError(''); setDeleting(item); }}>Delete</Button></div>}</CardContent></Card>;
        })}
        <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous posts</Button><Button variant="outline" disabled={loading || !data?.homeNews.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(data?.homeNews.pageInfo.endCursor ?? null); }}>Next posts</Button>{data && <span className="text-sm text-muted-foreground">{data.homeNews.totalCount} posts</span>}</div>
      </TabsContent>)}
    </Tabs>
    {showCompose && <NewsComposeModal existing={editing} defaultType={kind} onClose={() => { setShowCompose(false); setEditing(null); }} onSave={() => { setShowCompose(false); setEditing(null); setReceipt('News post saved.'); toast.success('News post saved.'); restart(); }} />}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this news item?</AlertDialogTitle><AlertDialogDescription>This permanently removes the post from the league feed.</AlertDialogDescription></AlertDialogHeader>{editError && <Alert variant="destructive"><AlertDescription>{editError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void handleDelete(); }}>{busy ? 'Deleting…' : 'Delete post'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};

const NewsComposeModal = ({ existing, defaultType, onClose, onSave }: { existing?: News | null; defaultType: string; onClose: () => void; onSave: () => void }) => {
  const [type, setType] = useState(existing?.type || defaultType);
  const [title, setTitle] = useState(existing?.title || '');
  const [body, setBody] = useState(existing?.body || '');
  const [pinned, setPinned] = useState(existing?.pinned || false);
  const [homeTeamId, setHomeTeamId] = useState(existing?.homeTeamId || '');
  const [awayTeamId, setAwayTeamId] = useState(existing?.awayTeamId || '');
  const [homeScore, setHomeScore] = useState(existing?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(existing?.awayScore ?? 0);
  const [date, setDate] = useState(() => { const date = existing?.date ? new Date(existing.date) : new Date(); const pad = (value: number) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; });
  const [notes, setNotes] = useState(existing?.notes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (saving) return;
    setError('');
    const base = { id: existing?.id || `n_${Math.random().toString(36).slice(2, 10)}`, type };
    let item;
    if (type === 'announcement') {
      if (!title.trim() || !body.trim()) { setError('Title and body are required.'); return; }
      item = { ...base, title: title.trim(), body: body.trim(), pinned };
    } else {
      if (!homeTeamId || !awayTeamId) { setError('Pick both teams.'); return; }
      if (homeTeamId === awayTeamId) { setError('Teams must be different.'); return; }
      if (!date || !Number.isFinite(new Date(date).getTime())) { setError('Enter a valid match date.'); return; }
      item = { ...base, homeTeamId, awayTeamId, date: new Date(date).getTime(), notes: notes.trim(), ...(type === 'result' && { homeScore: Number(homeScore) || 0, awayScore: Number(awayScore) || 0 }) };
    }
    setSaving(true);
    try { await contentApi.saveNews(item); }
    catch (error) { setError('Could not save: ' + (error instanceof Error ? error.message : String(error))); setSaving(false); return; }
    onSave();
  };
  return <ModalShell title={existing ? 'Edit news' : 'New news post'} onClose={onClose} maxWidth="max-w-xl"><form className="space-y-5" onSubmit={event => { event.preventDefault(); void save(); }}>
    {!existing && <fieldset disabled={saving} className="space-y-2"><legend className="mb-2 text-sm font-medium">Post type</legend><RadioGroup value={type} onValueChange={setType} className="flex flex-wrap gap-3">{newsTabs.map(tab => <Label key={tab.id} className="flex min-h-11 items-center gap-2 rounded-md border px-3"><RadioGroupItem value={tab.id} />{tab.label}</Label>)}</RadioGroup></fieldset>}
    {type === 'announcement' ? <><div className="space-y-2"><Label htmlFor="news-title">Title</Label><Input id="news-title" value={title} onChange={event => setTitle(event.target.value)} disabled={saving} /></div><div className="space-y-2"><Label htmlFor="news-body">Body</Label><Textarea id="news-body" rows={6} value={body} onChange={event => setBody(event.target.value)} disabled={saving} /></div><div className="flex min-h-11 items-center gap-3"><Switch id="news-pinned" checked={pinned} onCheckedChange={setPinned} disabled={saving} /><Label htmlFor="news-pinned">Pin to top</Label></div></> : <>
      <fieldset disabled={saving} className="grid gap-4 sm:grid-cols-2"><TeamSelect value={homeTeamId} onChange={setHomeTeamId} label="Home team" /><TeamSelect value={awayTeamId} onChange={setAwayTeamId} label="Away team" /></fieldset>
      <div className="space-y-2"><Label htmlFor="news-date">{type === 'matchup' ? 'Kickoff date and time' : 'Match date'}</Label><Input id="news-date" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} disabled={saving} /></div>
      {type === 'result' && <div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label htmlFor="news-home-score">Home score</Label><Input id="news-home-score" type="number" min={0} value={homeScore} onChange={event => setHomeScore(Number(event.target.value))} disabled={saving} /></div><div className="space-y-2"><Label htmlFor="news-away-score">Away score</Label><Input id="news-away-score" type="number" min={0} value={awayScore} onChange={event => setAwayScore(Number(event.target.value))} disabled={saving} /></div></div>}
      <div className="space-y-2"><Label htmlFor="news-notes">Notes (optional)</Label><Textarea id="news-notes" value={notes} onChange={event => setNotes(event.target.value)} disabled={saving} /></div>
    </>}
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="flex flex-wrap gap-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : (existing ? 'Save changes' : 'Publish post')}</Button><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button></div>
  </form></ModalShell>;
};
