import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { EmptyState } from '../../components/Display';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { CheckCircle, User } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import type { AdminPlayer } from '../accounts/models';

import { MediaImage } from '../../components/MediaImage';
import { Button } from '../../components/ui/button';







// Pictures Manager
export const PicturesManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const page = useRestPage<AdminPlayer>('/api/accounts?pendingImage=1', 50);
  const allPlayers = page.data?.nodes ?? [];
  const refresh = () => { page.restart(); onRefresh(); };
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState('');
  const [rejecting, setRejecting] = useState<string | null>(null);

  // Players who have a picture waiting for review
  const pending = allPlayers.filter(p => p.pendingImageUrl);

  const approve = async (player: AdminPlayer) => {
    setBusy(player.username); setInfo('');
    try {
      // The pending picture becomes the live picture
      await accountApi.reviewImage(player.id, true);
      setInfo(`✓ ${player.username}'s picture approved`);
      refresh();
    } catch (error) {
      setInfo('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  const reject = async (player: AdminPlayer) => {
    setBusy(player.username); setInfo('');
    try {
      // Discard the pending picture; live imageUrl untouched
      await accountApi.reviewImage(player.id, false);
      setRejecting(null);
      setInfo(`${player.username}'s picture rejected`);
      refresh();
    } catch (error) {
      setInfo('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  return <section className="space-y-5">
    <div className="space-y-2"><h3 className="text-xl font-semibold">Picture review</h3><p className="text-sm text-muted-foreground">Compare new uploads with the current picture. Approved pictures appear on the player’s card; rejecting an upload keeps their current picture.</p></div>
    {page.loading && <p role="status" className="text-sm text-muted-foreground">Loading pictures…</p>}
    {page.error && <Alert variant="destructive"><AlertDescription>{page.error}</AlertDescription><Button className="mt-2" variant="outline" onClick={page.restart}>Retry</Button></Alert>}
    {info && <Alert role={info.startsWith('Error:') ? 'alert' : 'status'} variant={info.startsWith('Error:') ? 'destructive' : 'default'}><AlertDescription>{info}</AlertDescription></Alert>}
    {!page.loading && !page.error && pending.length === 0 && <EmptyState icon={<CheckCircle className="size-8" />} text="No pictures waiting for review." />}
    <div className="space-y-4">{pending.map(player => <Card key={player.id} className="space-y-4 p-4">
      <h4 className="flex flex-wrap items-center gap-2 font-semibold">{player.username}<Badge variant="secondary">{player.position}</Badge></h4>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(140px,1fr)] sm:items-center">
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <figure className="space-y-2"><figcaption className="text-sm text-muted-foreground">Current picture</figcaption><div className="aspect-square w-full max-w-48 overflow-hidden rounded-lg border bg-muted">{player.imageUrl ? <MediaImage src={player.imageUrl} alt={`${player.username}’s current picture`} className="size-full object-cover" /> : <div className="flex size-full items-center justify-center text-muted-foreground"><User className="size-10" /><span className="sr-only">No current picture</span></div>}</div></figure>
          <figure className="space-y-2"><figcaption className="text-sm font-medium">Pending picture</figcaption><div className="aspect-square w-full max-w-48 overflow-hidden rounded-lg border-2 border-primary bg-muted"><MediaImage src={player.pendingImageUrl || undefined} alt={`${player.username}’s pending picture`} className="size-full object-cover" /></div></figure>
        </div>
        <div className="flex flex-col gap-2">
          <Button disabled={!!busy} onClick={() => approve(player)}><CheckCircle />{busy === player.username ? 'Working…' : 'Approve picture'}</Button>
          <AlertDialog open={rejecting === player.id} onOpenChange={open => { if (!busy) setRejecting(open ? player.id : null); }}>
            <AlertDialogTrigger asChild><Button disabled={!!busy} variant="outline" className="text-destructive">Reject picture</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reject this picture?</AlertDialogTitle><AlertDialogDescription>{player.username}’s new upload will be discarded. Their current picture will stay on their card.</AlertDialogDescription></AlertDialogHeader>
              {info.startsWith('Error:') && <Alert variant="destructive"><AlertDescription>{info}</AlertDescription></Alert>}
              <AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={event => { event.preventDefault(); void reject(player); }}>{busy ? 'Rejecting…' : 'Reject picture'}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>)}</div>
    <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
  </section>;
};
