import { ArrowRight, Pencil, Swords, Trash2, User } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { MediaImage, mediaUrl } from '../../components/MediaImage';
import { ModalShell } from '../../components/Dialog';
import { PageButtons } from '../../components/PageButtons';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';
import { teams as teamApi } from './api';
import { useRestPage } from '../../hooks/use-rest-page';
import { SeasonsDocument } from '../../api/generated/graphql';
import { mergeSeasonPages } from '../dashboard/season-pages';
import { segment } from '../../api/http';
import type { Account } from '../accounts/models';
import type { Transfer } from './models';
import { isAdmin } from '../../utils/league';

type TransferTeam = { id: string; name: string; tag: string; color: string | null; logoUrl: string | null };
const windowLabels: Record<string, string> = { league: 'League window', cross_league: 'Cross-league window' };

export const TransfersView = ({ account }: { account: Account | null }) => {
  const [seasonPageError, setSeasonPageError] = useState('');
  const [seasonFilter, setSeasonFilter] = useState('all');
  const page = useRestPage<Transfer & { fromTeam: TransferTeam | null; toTeam: TransferTeam | null }>(`/api/transfers${seasonFilter === 'all' ? '' : `?season=${segment(seasonFilter)}`}`);
  const { loading, error } = page;
  const { data: seasonData, fetchMore: moreSeasons, refetch: refreshSeasons } = useQuery(SeasonsDocument, { variables: { after: null } });
  const seasons = seasonData?.seasons.nodes ?? [];
  const filtered = page.data?.nodes ?? [];
  const [editingWindow, setEditingWindow] = useState<Transfer | null>(null);
  const [windowValue, setWindowValue] = useState('none');
  const [deleting, setDeleting] = useState<Transfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const isAdminUser = isAdmin(account);

  const setWindow = async () => {
    if (!editingWindow) return;
    setBusy(true); setActionError('');
    try { await teamApi.saveTransfer({ ...editingWindow, windowType: windowValue === 'none' ? null : windowValue }); setEditingWindow(null); page.restart(); }
    catch (error) { setActionError('Could not update window: ' + (error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };
  const deleteTransfer = async () => {
    if (!deleting) return;
    setBusy(true); setActionError('');
    try { await teamApi.deleteTransfer(deleting.id); setDeleting(null); page.restart(); }
    catch (error) { setActionError('Could not delete: ' + (error instanceof Error ? error.message : String(error))); }
    finally { setBusy(false); }
  };

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">Transfer market</h1><p className="mt-1 text-sm text-muted-foreground">Follow signings, transfers, and releases across the league.</p></div><Select value={seasonFilter} onValueChange={setSeasonFilter}><SelectTrigger aria-label="Transfer season" className="w-full sm:w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All seasons</SelectItem>{seasons.map(season => <SelectItem key={season} value={season}>{season}</SelectItem>)}</SelectContent></Select></header>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading transfer activity…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error}<Button variant="link" onClick={page.restart}>Restart transfers</Button></AlertDescription></Alert>}
    {actionError && !editingWindow && !deleting && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}
    {!loading && !error && filtered.length === 0 && <Card><CardContent className="space-y-2 py-12 text-center"><Swords className="mx-auto size-8 text-muted-foreground" /><p className="font-medium">No transfer activity yet.</p><p className="text-sm text-muted-foreground">Roster moves will appear here as players join and leave teams.</p></CardContent></Card>}
    {!loading && !error && <div className="space-y-3">{filtered.map(transfer => <Card key={transfer.id}><CardContent className="space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{transfer.playerUsername}</h2><p className="mt-1 text-xs text-muted-foreground">{transfer.createdAt ? new Date(transfer.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable'} · {transfer.season}</p></div><div className="flex flex-wrap gap-2"><Badge variant={transfer.kind === 'release' ? 'outline' : 'secondary'} className="capitalize">{transfer.kind}</Badge>{transfer.windowType && windowLabels[transfer.windowType] && <Badge variant="outline">{windowLabels[transfer.windowType]}</Badge>}</div></div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-5"><TeamIdentity teamId={transfer.fromTeamId} team={transfer.fromTeam} /><ArrowRight className="size-4 text-muted-foreground" /><TeamIdentity teamId={transfer.toTeamId} team={transfer.toTeam} /></div>
      {isAdminUser && <div className="flex flex-wrap gap-2 border-t pt-3"><Button variant="ghost" size="sm" onClick={() => { setActionError(''); setWindowValue(transfer.windowType ?? 'none'); setEditingWindow(transfer); }}><Pencil className="mr-2 size-4" />Edit window</Button><Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setActionError(''); setDeleting(transfer); }}><Trash2 className="mr-2 size-4" />Delete entry</Button></div>}
    </CardContent></Card>)}</div>}
    <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
    {seasonPageError && <Alert variant="destructive"><AlertDescription>{seasonPageError}<Button variant="link" onClick={() => { void refreshSeasons({ after: null }).then(() => setSeasonPageError('')).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>Restart seasons</Button></AlertDescription></Alert>}
    {seasonData?.seasons.pageInfo.hasNextPage && <Button variant="outline" onClick={() => { void moreSeasons({ variables: { after: seasonData.seasons.pageInfo.endCursor }, updateQuery: (before, { fetchMoreResult }) => ({ seasons: mergeSeasonPages(before.seasons, fetchMoreResult.seasons) }) }).catch((error: unknown) => { setSeasonPageError(error instanceof Error ? error.message : 'Could not load seasons.'); }); }}>More seasons</Button>}
    {editingWindow && <ModalShell title="Transfer window" onClose={() => { if (!busy) setEditingWindow(null); }} maxWidth="max-w-md"><div className="space-y-5"><p className="text-sm text-muted-foreground">Choose the window for {editingWindow.playerUsername}’s transfer.</p><RadioGroup value={windowValue} onValueChange={setWindowValue} disabled={busy} aria-label="Transfer window">{[['none', 'No window'], ...Object.entries(windowLabels)].map(([value, label]) => <Label key={value} className="flex min-h-11 items-center gap-3 rounded-md border p-3"><RadioGroupItem value={value!} />{label}</Label>)}</RadioGroup>{actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setEditingWindow(null)}>Cancel</Button><Button disabled={busy} onClick={() => { void setWindow(); }}>{busy ? 'Saving…' : 'Save window'}</Button></div></div></ModalShell>}
    <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this transfer entry?</AlertDialogTitle><AlertDialogDescription>This removes the entry from the log. It does not undo the roster move.</AlertDialogDescription></AlertDialogHeader>{actionError && <Alert variant="destructive"><AlertDescription>{actionError}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={busy} onClick={event => { event.preventDefault(); void deleteTransfer(); }}>{busy ? 'Deleting…' : 'Delete entry'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};

function TeamIdentity({ teamId, team }: { teamId: string | null; team: TransferTeam | null }) {
  return <div className="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left"><div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">{team?.logoUrl ? <MediaImage src={mediaUrl(team.logoUrl)} alt="" className="size-8 object-contain" /> : <User className="size-4 text-muted-foreground" />}</div><div className="min-w-0"><p className="break-words text-sm font-medium">{teamId ? team?.tag || 'Unknown team' : 'Free agent'}</p>{team && <p className="break-words text-xs text-muted-foreground">{team.name}</p>}</div></div>;
}
