import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { PageButtons } from '../../components/PageButtons';
import { LazyText } from '../content/LazyText';
import { loadTeamForEdit } from '../teams/api';
import type { TeamSummary, Team } from '../teams/models';
import { BookOpen, Calendar, CheckCircle, Crown, MessageSquare, Sparkles, TrendingUp, Trophy, User, Users, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { teams as teamApi } from '../teams/api';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import { isSuperAdmin } from '../../utils/league';
import { RulesManager } from '../content';
import { ImportMatchManager } from '../matches';
import { EditTeamModal } from '../teams';
import { TotwManager } from '../voting';
import { SeasonManager } from './SeasonManager';
import { AwardsManager } from './AwardsManager';
import { SeasonChampionsManager } from './SeasonChampionsManager';
import { PlayersManager } from './PlayersManager';
import { PicturesManager } from './PicturesManager';
import { WeightingsManager } from './WeightingsManager';
import { IntegrationsManager } from './IntegrationsManager';
import { AdminsManager } from './AdminsManager';
import { ModalShell } from '../../components/Dialog';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

export const AdminPanel = ({ account }: { account: Account }) => {
  const [section, setSection] = useState('teams');
  const [loadError, setLoadError] = useState('');
  const [championsOpen, setChampionsOpen] = useState(false);
  const [tab, setTab] = useState('pending');
  const [currentSeason, setCurrentSeason] = useState('S1');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const editorRequest = useRef(0);
  const [rejectingTeam, setRejectingTeam] = useState<TeamSummary | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [deletingTeam, setDeletingTeam] = useState<TeamSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const cursor = usePageCursor(tab);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: tab, search: null, after: cursor.after }, skip: section !== 'teams' });
  const teamPage = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    restart: () => { cursor.restart(); if (!cursor.after) void teamQuery.refetch().catch(() => {}); },
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const teams = teamPage.data?.nodes ?? [];
  const refresh = async () => {
    teamPage.restart();
    try { setCurrentSeason(await adminApi.getSeason()); }
    catch { setLoadError('Could not load current season.'); }
  };
  useEffect(() => {
    let active = true;
    void adminApi.getSeason().then(season => { if (active) setCurrentSeason(season); }).catch(() => { if (active) setLoadError('Could not load current season.'); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    editorRequest.current++;
    setLoadingEditor(false);
    setEditingTeam(null);
    return () => { editorRequest.current++; };
  }, [section, tab]);
  const openTeamEditor = async (team: TeamSummary) => {
    if (loadingEditor || editingTeam) return;
    const version = ++editorRequest.current;
    setLoadError('');
    setLoadingEditor(true);
    try {
      const loaded = await loadTeamForEdit(team.id);
      if (version === editorRequest.current) setEditingTeam(loaded);
    } catch {
      if (version === editorRequest.current) setLoadError('Could not load team editor.');
    } finally {
      if (version === editorRequest.current) setLoadingEditor(false);
    }
  };
  const review = async (team: TeamSummary, status: 'approved' | 'rejected', reason = '') => {
    setLoadError(''); setBusy(true);
    try { await teamApi.reviewTeam(team.id, status, reason); setRejectingTeam(null); await refresh(); }
    catch { setLoadError(`Could not ${status === 'approved' ? 'approve' : 'reject'} ${team.name}.`); }
    finally { setBusy(false); }
  };
  const removeTeam = async () => {
    if (!deletingTeam) return;
    setLoadError(''); setBusy(true);
    try { await teamApi.deleteTeam(deletingTeam.id); setDeletingTeam(null); await refresh(); }
    catch { setLoadError(`Could not delete ${deletingTeam.name}.`); }
    finally { setBusy(false); }
  };
  const visible = teams.filter(team => team.status === tab);
  const sections = [
    { id: 'teams', label: 'Teams', icon: Users }, { id: 'totw', label: 'Team of the Week', icon: Trophy },
    { id: 'players', label: 'Players', icon: User }, { id: 'import', label: 'Import matches', icon: TrendingUp },
    { id: 'rules', label: 'Rules', icon: BookOpen }, { id: 'pictures', label: 'Pictures', icon: User },
    { id: 'awards', label: 'Awards', icon: Trophy }, { id: 'season', label: 'Season', icon: Calendar },
    ...(isSuperAdmin(account) ? [{ id: 'admins', label: 'Administrators', icon: Crown }, { id: 'weights', label: 'Rating weights', icon: Sparkles }, { id: 'integrations', label: 'Discord', icon: MessageSquare }] : []),
  ];

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-3xl font-semibold tracking-tight">Administration</h1><p className="mt-1 text-sm text-muted-foreground">Manage league operations and review changes.</p></div><Badge variant="secondary">{currentSeason}</Badge></header>
    {loadingEditor && <p role="status" className="text-sm text-muted-foreground">Loading team editor…</p>}
    {(loadError || teamPage.error) && <Alert variant="destructive"><AlertDescription>{loadError || teamPage.error}</AlertDescription></Alert>}
    <div className="grid min-w-0 gap-6 xl:grid-cols-[13rem_minmax(0,1fr)]">
      <nav className="hidden space-y-1 xl:block" aria-label="Administration sections">{sections.map(item => <Button key={item.id} variant={section === item.id ? 'secondary' : 'ghost'} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)} className="w-full justify-start gap-3"><item.icon className="size-4" />{item.label}</Button>)}</nav>
      <div className="space-y-2 xl:hidden"><Label htmlFor="admin-section">Administration section</Label><Select value={section} onValueChange={setSection}><SelectTrigger id="admin-section" aria-label="Admin section"><SelectValue /></SelectTrigger><SelectContent>{sections.map(item => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="min-w-0">
        {section === 'admins' && isSuperAdmin(account) && <AdminsManager />}
        {section === 'weights' && isSuperAdmin(account) && <WeightingsManager onRefresh={refresh} />}
        {section === 'integrations' && isSuperAdmin(account) && <IntegrationsManager />}
        {section === 'import' && <ImportMatchManager account={account} currentSeason={currentSeason} onRefresh={refresh} />}
        {section === 'rules' && <RulesManager onRefresh={refresh} />}
        {section === 'pictures' && <PicturesManager onRefresh={refresh} />}
        {section === 'players' && <PlayersManager currentSeason={currentSeason} onRefresh={refresh} />}
        {section === 'totw' && <TotwManager onRefresh={refresh} />}
        {section === 'season' && <SeasonManager account={account} currentSeason={currentSeason} onRefresh={refresh} />}
        {section === 'awards' && <div className="space-y-6"><AwardsManager onRefresh={refresh} currentSeason={currentSeason} /><Button variant="outline" aria-expanded={championsOpen} onClick={() => setChampionsOpen(open => !open)}>{championsOpen ? 'Close championship editor' : 'Edit championships'}</Button>{championsOpen && <SeasonChampionsManager account={account} currentSeason={currentSeason} onRefresh={refresh} />}</div>}
        {section === 'teams' && <div className="space-y-4"><div><h2 className="text-xl font-semibold">Team reviews</h2><p className="mt-1 text-sm text-muted-foreground">Review submissions and manage approved teams.</p></div><Tabs value={tab} onValueChange={setTab}><TabsList aria-label="Team status" className="grid w-full grid-cols-3"><TabsTrigger value="pending">Pending</TabsTrigger><TabsTrigger value="approved">Approved</TabsTrigger><TabsTrigger value="rejected">Rejected</TabsTrigger></TabsList><TabsContent value={tab} className="space-y-4 pt-3">
          {teamPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading team reviews…</p>}
          {!teamPage.loading && visible.length === 0 && <Card><CardContent className="space-y-2 py-12 text-center"><CheckCircle className="mx-auto size-8 text-muted-foreground" /><p className="font-medium">Nothing here.</p><p className="text-sm text-muted-foreground">No {tab} teams on this page.</p></CardContent></Card>}
          {visible.map(team => <Card key={team.id}><CardHeader className="pb-3"><div className="flex flex-wrap items-center gap-2"><CardTitle className="break-words text-xl">{team.name}</CardTitle><Badge variant="outline">{team.tag}</Badge></div><p className="break-words text-sm text-muted-foreground">By {team.ownerUsername} · {new Date(team.createdAt ?? 0).toLocaleString()}</p></CardHeader><CardContent className="space-y-4"><LazyText url={`/api/teams/${encodeURIComponent(team.id)}/text/description`} label="Read team description" />{tab === 'rejected' && <LazyText url={`/api/teams/${encodeURIComponent(team.id)}/text/rejectionReason`} label="Read rejection reason" />}<div className="flex flex-wrap gap-2">
            {tab === 'pending' && <><Button disabled={busy} onClick={() => review(team, 'approved')}><CheckCircle className="mr-2 size-4" />APPROVE</Button><Button variant="outline" disabled={busy} onClick={() => { setLoadError(''); setRejectionReason(''); setRejectingTeam(team); }}><XCircle className="mr-2 size-4" />Reject</Button></>}
            {tab === 'approved' && <><Button variant="outline" disabled={busy || loadingEditor} onClick={() => { void openTeamEditor(team); }}>Edit</Button><Button variant="outline" className="text-destructive" disabled={busy || loadingEditor} onClick={() => { setLoadError(''); setDeletingTeam(team); }}>Delete</Button></>}
            {tab === 'rejected' && <Button disabled={busy} onClick={() => review(team, 'approved')}>Re-approve</Button>}
          </div></CardContent></Card>)}
          <PageButtons {...teamPage} hasNextPage={teamPage.data?.pageInfo.hasNextPage ?? false} />
        </TabsContent></Tabs></div>}
      </div>
    </div>
    {editingTeam && <EditTeamModal key={editingTeam.id} team={editingTeam} onClose={() => setEditingTeam(null)} onSaved={() => { setEditingTeam(null); void refresh(); }} />}
    {rejectingTeam && <ModalShell title={`Reject ${rejectingTeam.name}`} onClose={() => { if (!busy) setRejectingTeam(null); }} maxWidth="max-w-lg"><div className="space-y-4"><p className="text-sm text-muted-foreground">Give the captain context for the review so they can revise their submission.</p><div className="space-y-2"><Label htmlFor="team-rejection-reason">Reason <span className="text-muted-foreground">(optional)</span></Label><Textarea id="team-rejection-reason" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} rows={4} disabled={busy} /></div>{loadError && <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setRejectingTeam(null)}>Cancel</Button><Button variant="destructive" disabled={busy} onClick={() => { void review(rejectingTeam, 'rejected', rejectionReason); }}>{busy ? 'Saving…' : 'Reject team'}</Button></div></div></ModalShell>}
    <AlertDialog open={deletingTeam !== null} onOpenChange={open => { if (!open && !busy) setDeletingTeam(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete {deletingTeam?.name}?</AlertDialogTitle><AlertDialogDescription>This permanently removes the team. Review the selected team before continuing.</AlertDialogDescription></AlertDialogHeader>{loadError && <Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={event => { event.preventDefault(); void removeTeam(); }}>{busy ? 'Deleting…' : 'Delete team'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};
