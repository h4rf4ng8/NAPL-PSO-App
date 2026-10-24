import { Crown, Plus, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { settings as adminApi } from './api';
import type { AdminPlayer } from '../accounts/models';
import type { RoleAssignment } from './models';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { ModalShell } from '../../components/Dialog';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../../components/ui/alert-dialog';

export const AdminsManager = () => {
  const rolePage = useRestPage<RoleAssignment>('/api/roles');
  const { data, loading, error: loadError, reload } = rolePage;
  const dynamicAdmins = loadError ? [] : data?.nodes ?? [];
  const [saving, setSaving] = useState(false);
  const disabled = !data || loading || !!loadError || saving;
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminPlayer | null>(null);
  const [removing, setRemoving] = useState<RoleAssignment | null>(null);
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search=' + encodeURIComponent(search));
  const adminIds = new Set(dynamicAdmins.map(admin => admin.userId));
  const candidates = (playerPage.data?.nodes ?? []).filter(player => !adminIds.has(player.id));

  const saveRoles = async (change: (roles: RoleAssignment[]) => RoleAssignment[], message: string) => {
    if (disabled) return;
    setSaving(true); setError(''); setInfo('');
    try {
      // Replace only from a fresh complete snapshot, including off-page assignments.
      await adminApi.setAdminList(change(await adminApi.getAdminList()));
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not update administrators.'); setSaving(false); return; }
    setPickerOpen(false); setRemoving(null); setSelected(null); setSearch('');
    setInfo(message); toast.success(message); setSaving(false); rolePage.restart();
  };
  const promote = async () => {
    if (disabled || !selected) return;
    await saveRoles(roles => roles.some(role => role.userId === selected.id) ? roles : [...roles, { userId: selected.id, username: selected.username, role: 'admin' }], `${selected.username} promoted to admin.`);
  };
  const demote = async () => {
    if (disabled || !removing) return;
    await saveRoles(roles => {
      if (roles.some(role => role.userId === removing.userId && role.role === 'super_admin')) throw new Error('Super administrators cannot be removed.');
      return roles.filter(role => role.userId !== removing.userId);
    }, `Administrator access removed for ${removing.username}.`);
  };
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Crown className="size-5 text-warning" />Administrators</CardTitle><CardDescription>Administrators review teams, import matches, assign awards, and manage seasons. Super administrators also manage access.</CardDescription></CardHeader><CardContent><Button disabled={disabled} onClick={() => { setError(''); setSelected(null); setPickerOpen(true); }}><Plus className="mr-2 size-4" />Promote a player</Button></CardContent></Card>
    {loading && <div role="status"><span className="sr-only">Loading administrators…</span><Skeleton className="h-24" /></div>}
    {loadError && <Alert variant="destructive"><AlertDescription>{loadError} <Button variant="outline" onClick={() => { void reload(); }}>Try again</Button></AlertDescription></Alert>}
    {error && !pickerOpen && !removing && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {info && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">{info}</p>}
    <section aria-labelledby="admins-heading" className="space-y-3"><h2 id="admins-heading" className="text-lg font-semibold">Current administrators{data && ` (${data.totalCount})`}</h2>
      {dynamicAdmins.map(role => <Card key={role.userId}><CardContent className="flex flex-wrap items-center gap-3 p-4"><Crown className="size-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="break-words font-semibold">{role.username}</p><Badge variant="secondary">{role.role === 'super_admin' ? 'Super admin · protected' : 'Admin'}</Badge></div>{role.role !== 'super_admin' && <Button variant="destructive" disabled={disabled} onClick={() => { setError(''); setRemoving(role); }}>Remove</Button>}</CardContent></Card>)}
      {data?.totalCount === 0 && <p className="text-muted-foreground">No administrator assignments were returned.</p>}
    </section>
    <PageButtons {...rolePage} loading={rolePage.loading || saving} hasNextPage={data?.pageInfo.hasNextPage ?? false} />
    {pickerOpen && <ModalShell title="Promote a player" onClose={() => setPickerOpen(false)} maxWidth="max-w-xl"><p className="text-sm text-muted-foreground">Choose a registered player to grant administrator access.</p><Label htmlFor="admin-player-search">Search players</Label><Command shouldFilter={false} className="border"><CommandInput id="admin-player-search" value={search} onValueChange={setSearch} disabled={saving} placeholder="Player name…" /><CommandList aria-busy={playerPage.loading}>
      {playerPage.loading && <p role="status" className="p-3 text-sm text-muted-foreground">Loading players…</p>}
      {!playerPage.loading && !playerPage.error && <CommandEmpty>No eligible players on this page.</CommandEmpty>}
      <CommandGroup>{candidates.map(player => <CommandItem key={player.id} value={player.id} disabled={disabled || playerPage.loading || !!playerPage.error} onSelect={() => setSelected(player)}><User className="mr-2 size-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{player.username}<span className="block text-xs text-muted-foreground">{player.position} · {player.stats.games} games</span></span>{selected?.id === player.id && <Badge variant="secondary">Selected</Badge>}</CommandItem>)}</CommandGroup>
    </CommandList></Command>{playerPage.error && <Alert variant="destructive"><AlertDescription>{playerPage.error} <Button variant="outline" onClick={playerPage.restart}>Restart players</Button></AlertDescription></Alert>}<PageButtons {...playerPage} loading={playerPage.loading || saving} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
      {selected && <p className="break-words text-sm">Selected: <strong>{selected.username}</strong></p>}{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="flex flex-wrap gap-2"><Button disabled={disabled || !selected || !!playerPage.error} onClick={() => { void promote(); }}>{saving ? 'Saving…' : 'Promote to admin'}</Button><Button variant="outline" disabled={saving} onClick={() => setPickerOpen(false)}>Cancel</Button></div>
    </ModalShell>}
    <AlertDialog open={!!removing} onOpenChange={open => { if (!open && !saving) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove administrator access?</AlertDialogTitle><AlertDialogDescription>{removing?.username} will lose administrator access. Their player account and league history will remain.</AlertDialogDescription></AlertDialogHeader>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}<AlertDialogFooter><AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={event => { event.preventDefault(); void demote(); }}>{saving ? 'Saving…' : 'Remove administrator'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
};
