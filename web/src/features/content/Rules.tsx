import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { content as contentApi } from './api';
import type { Rule, RuleSummary } from './models';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { request } from '../../api/http';
import { renderRulesBody } from '../../utils/content';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

export const RulesView = ({ onJump: _onJump }: { onJump: (view: string) => void }) => {
  const page = useRestPage<RuleSummary>('/api/rules');
  const [selected, setSelected] = useState<Rule | null>(null);
  const [requested, setRequested] = useState<RuleSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current++; }, []);
  const open = async (section: RuleSummary) => {
    const id = ++requestId.current;
    setRequested(section); setSelected(null); setError(''); setLoading(true);
    try { const full = await request<Rule>(section.bodyUrl); if (requestId.current === id) setSelected(full); }
    catch (error) { if (requestId.current === id) setError(error instanceof Error ? error.message : 'Could not load section.'); }
    finally { if (requestId.current === id) setLoading(false); }
  };
  return <div className="space-y-4">
    <p className="text-muted-foreground">Official Alliance Strikers League rulebook.</p>
    {page.error && <Alert variant="destructive"><AlertDescription>{page.error} <Button variant="outline" onClick={page.restart}>Restart contents</Button></AlertDescription></Alert>}
    <div className="grid items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="space-y-4 lg:sticky lg:top-24" aria-label="Rulebook contents">
        <div className="space-y-2 lg:hidden"><Label htmlFor="rule-section">Contents</Label><Select value={requested?.id ?? ''} onValueChange={id => { const section = page.data?.nodes.find(item => item.id === id); if (section) void open(section); }}><SelectTrigger id="rule-section"><SelectValue placeholder="Choose a section" /></SelectTrigger><SelectContent>{requested && !page.data?.nodes.some(item => item.id === requested.id) && <SelectItem value={requested.id}>{requested.title}</SelectItem>}{page.data?.nodes.map(section => <SelectItem key={section.id} value={section.id}>{section.title}</SelectItem>)}</SelectContent></Select></div>
        <Card className="hidden lg:block"><CardHeader><CardTitle className="text-lg">Contents</CardTitle></CardHeader><CardContent><ol className="space-y-1">{page.data?.nodes.map(section => <li key={section.id}><Button variant={requested?.id === section.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start whitespace-normal text-left" onClick={() => { void open(section); }}>{section.title}</Button></li>)}</ol></CardContent></Card>
        {page.loading && <div role="status"><span className="sr-only">Loading contents…</span><Skeleton className="h-20" /></div>}
        {page.data?.totalCount === 0 && <p className="text-sm text-muted-foreground">No rule sections have been published.</p>}
        <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
      </aside>
      <Card className="min-w-0"><CardHeader><CardTitle>{requested?.title ?? 'Read the rules'}</CardTitle></CardHeader><CardContent className="space-y-4 break-words">
        {loading && <div role="status"><span className="sr-only">Loading rule section…</span><Skeleton className="h-40" /></div>}
        {error && <Alert variant="destructive"><AlertDescription>{error} <Button variant="outline" onClick={() => { if (requested) void open(requested); }}>Try again</Button></AlertDescription></Alert>}
        {selected ? renderRulesBody(selected.body) : !loading && !error && <p className="text-muted-foreground">Choose a section to read the rulebook.</p>}
      </CardContent></Card>
    </div>
  </div>;
};

export const RulesManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const page = useRestPage<RuleSummary>('/api/rules');
  const sections = page.data?.nodes ?? [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [deleting, setDeleting] = useState<RuleSummary | null>(null);
  const cancelEdit = () => { setEditingId(null); setEditTitle(''); setEditBody(''); setMsg(''); };
  const startNew = () => { setEditingId(`rs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`); setEditTitle(''); setEditBody(''); setMsg(''); };
  const startEdit = async (section: RuleSummary) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { const full = await request<Rule>(section.bodyUrl); setEditingId(full.id); setEditTitle(full.title); setEditBody(full.body); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not load complete section.'); }
    finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (busy) return;
    setMsg(''); const title = editTitle.trim();
    if (!title) { setMsg('Title required'); return; }
    setBusy(true);
    try {
      const existing = sections.find(section => section.id === editingId);
      await contentApi.saveRulesSection({ id: editingId || crypto.randomUUID(), title, body: editBody, sortOrder: existing ? existing.sortOrder : page.data?.totalCount ?? 0 });
    } catch (error) { setMsg('Save failed: ' + (error instanceof Error ? error.message : String(error))); setBusy(false); return; }
    cancelEdit(); setBusy(false); toast.success('Rule section saved.'); page.restart(); onRefresh();
  };
  const removeSection = async () => {
    if (!deleting || busy) return;
    setBusy(true); setMsg('');
    try { await contentApi.deleteRulesSection(deleting.id); }
    catch (error) { setMsg('Delete failed: ' + (error instanceof Error ? error.message : String(error))); setBusy(false); return; }
    setDeleting(null); setBusy(false); toast.success('Rule section deleted.'); page.restart(); onRefresh();
  };
  const move = async (idx: number, dir: number) => {
    if (busy || !sections[idx]) return;
    setBusy(true); setMsg('');
    try { await contentApi.moveRulesSection(sections[idx]!.id, dir < 0 ? 'up' : 'down'); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Could not move section.'); setBusy(false); return; }
    setBusy(false); page.restart(); onRefresh();
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Rulebook sections</h2><p className="text-sm text-muted-foreground">Publish and order the official rules.</p></div><Button onClick={startNew} disabled={editingId !== null || busy || page.loading}><Plus className="mr-2 size-4" />New section</Button></div>
    {page.error && <Alert variant="destructive"><AlertDescription>{page.error} <Button variant="outline" disabled={!!editingId || busy} onClick={page.restart}>Restart sections</Button></AlertDescription></Alert>}
    {msg && <Alert variant="destructive"><AlertDescription>{msg}</AlertDescription></Alert>}
    <PageButtons {...page} loading={page.loading || editingId !== null || busy} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
    {editingId && <Card><CardHeader><CardTitle>{sections.some(section => section.id === editingId) ? 'Edit section' : 'New section'}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="space-y-2"><Label htmlFor="rule-title">Title</Label><Input id="rule-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} disabled={busy} /></div>
      <Tabs defaultValue="write"><TabsList aria-label="Rule editor mode"><TabsTrigger value="write">Write</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger></TabsList><TabsContent value="write" className="space-y-2"><Label htmlFor="rule-body">Body</Label><Textarea id="rule-body" value={editBody} onChange={event => setEditBody(event.target.value)} rows={12} disabled={busy} aria-describedby="rule-format" /><p id="rule-format" className="text-sm text-muted-foreground">Use ## Heading, ### Subheading, **bold**, *italic*, - bullets, 1. numbered lists, and [text](url). Separate paragraphs with a blank line.</p></TabsContent><TabsContent value="preview" className="min-h-32 break-words rounded-lg border p-4">{editBody ? renderRulesBody(editBody) : <p className="text-muted-foreground">Your preview will appear here.</p>}</TabsContent></Tabs>
      <div className="flex flex-wrap gap-2"><Button onClick={() => { void saveEdit(); }} disabled={busy}>{busy ? 'Saving…' : 'Save section'}</Button><Button variant="outline" onClick={cancelEdit} disabled={busy}>Cancel</Button></div>
    </CardContent></Card>}
    {page.loading && <div role="status"><span className="sr-only">Loading sections…</span><Skeleton className="h-24" /></div>}
    {sections.map((section, index) => <Card key={section.id}><CardContent className="flex flex-wrap items-center gap-3 p-4"><div className="flex gap-1"><Button size="icon" variant="outline" aria-label={`Move ${section.title} up`} disabled={(index === 0 && !page.canPrevious) || !!editingId || busy} onClick={() => { void move(index, -1); }}><ArrowUp className="size-4" /></Button><Button size="icon" variant="outline" aria-label={`Move ${section.title} down`} disabled={(index === sections.length - 1 && !page.data?.pageInfo.hasNextPage) || !!editingId || busy} onClick={() => { void move(index, 1); }}><ArrowDown className="size-4" /></Button></div><div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{section.title}</h3><p className="text-sm text-muted-foreground">Updated {new Date(section.updatedAt).toLocaleDateString()}</p></div><div className="flex gap-2"><Button variant="outline" disabled={!!editingId || busy} onClick={() => { void startEdit(section); }}>Edit</Button><Button variant="destructive" disabled={!!editingId || busy} onClick={() => { setMsg(''); setDeleting(section); }}>Delete</Button></div></CardContent></Card>)}
    {!page.loading && !page.error && sections.length === 0 && !editingId && <Card><CardContent className="p-6 text-muted-foreground">No sections yet. Add the first section to begin the rulebook.</CardContent></Card>}
    <AlertDialog open={!!deleting} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this section?</AlertDialogTitle><AlertDialogDescription>“{deleting?.title}” will be permanently removed.</AlertDialogDescription></AlertDialogHeader>{msg && <Alert variant="destructive"><AlertDescription>{msg}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void removeSection(); }}>{busy ? 'Deleting…' : 'Delete section'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};
