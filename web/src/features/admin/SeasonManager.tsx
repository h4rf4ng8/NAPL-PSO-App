import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible';
import { useQuery } from '@apollo/client/react';
import { SeasonsDocument } from '../../api/generated/graphql';
import { PageButtons } from '../../components/PageButtons';
import { z } from 'zod';
import { Calendar, Clock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import { EmptyState } from '../../components/Display';

import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';







// Season Manager
export const SeasonManager = ({ account: _account, currentSeason, onRefresh }: { account: Account; currentSeason: string; onRefresh: () => void }) => {
  const [customName, setCustomName] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const [after,setAfter] = useState<string|null>(null);
  const [previous,setPrevious] = useState<(string|null)[]>([]);
  const seasons = useQuery(SeasonsDocument,{variables:{first:10,after}});

  // Determine the next season number (auto-increment from current)
  const suggestNext = (current: string) => {
    const m = current.match(/^S(\d+)$/i);
    return m ? `S${Math.trunc(Number(m[1])) + 1}` : 'S2';
  };
  const nextSeason = suggestNext(currentSeason);

  const summaries = z.array(z.object({games:z.number(),players:z.number()})).safeParse(seasons.data?.seasons.summaries ?? []);
  const seasonSummaries = (seasons.data?.seasons.nodes ?? []).map((season,index)=>({season,...(summaries.success && summaries.data[index])}));

  const customSeason = customName.trim().toUpperCase();
  const validCustom = /^[A-Z0-9-]+$/.test(customSeason);
  return <div className="space-y-5">
    <Card><CardHeader><Badge className="w-fit" variant="secondary">Active season</Badge><CardTitle className="text-3xl">{currentSeason}</CardTitle><CardDescription>All new matches are tagged with {currentSeason}.</CardDescription></CardHeader></Card>
    <Card><CardHeader><CardTitle>Start next season</CardTitle><CardDescription>Close {currentSeason} and open {nextSeason}. Past statistics and awards stay available.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <SeasonActivation season={nextSeason} onActivated={onRefresh}><Button className="w-full">Start {nextSeason}</Button></SeasonActivation>
        <Collapsible open={showCustom} onOpenChange={setShowCustom}>
          <CollapsibleTrigger asChild><Button variant="ghost" className="w-full">{showCustom ? 'Hide custom season name' : 'Use a custom season name'}</Button></CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <Label htmlFor="custom-season">Custom season name</Label><Input id="custom-season" value={customName} onChange={event => setCustomName(event.target.value.toUpperCase())} placeholder="For example, WINTER26" aria-describedby="custom-season-help" />
            <p id="custom-season-help" className="text-xs text-muted-foreground">Use letters, numbers, and dashes.</p>
            <SeasonActivation season={customSeason} onActivated={() => { setCustomName(''); setShowCustom(false); onRefresh(); }}><Button disabled={!validCustom}>Activate custom season</Button></SeasonActivation>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
    <section className="space-y-3"><h3 className="flex items-center gap-2 text-lg font-semibold"><Clock className="size-5" />Season history</h3>
      {seasons.loading && <p role="status" className="text-sm text-muted-foreground">Loading season history…</p>}
      {seasons.error && <Alert variant="destructive"><AlertDescription>{seasons.error.message}</AlertDescription><Button variant="outline" className="mt-2" onClick={() => { setAfter(null); setPrevious([]); void seasons.refetch({after:null}).catch(() => { /* Apollo exposes errors above. */ }); }}>Retry season history</Button></Alert>}
      {!seasons.loading && !seasons.error && seasonSummaries.length === 0 && <EmptyState icon={<Calendar className="size-8" />} text="No past seasons yet." />}
      {seasonSummaries.map(summary => <Card key={summary.season} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="space-y-1"><h4 className="flex items-center gap-2 font-semibold">{summary.season}{summary.season === currentSeason && <Badge variant="secondary">Active</Badge>}</h4><p className="text-sm text-muted-foreground">{summary.games === undefined ? 'Statistics unavailable' : `${summary.games} player appearances · ${summary.players} players`}</p></div>
        {summary.season !== currentSeason && <SeasonActivation season={summary.season} onActivated={onRefresh}><Button variant="outline">Reactivate {summary.season}</Button></SeasonActivation>}
      </Card>)}
      <PageButtons loading={seasons.loading} canPrevious={previous.length > 0} hasNextPage={seasons.data?.seasons.pageInfo.hasNextPage ?? false} previous={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0,-1)); }} next={() => { setPrevious([...previous, after]); setAfter(seasons.data?.seasons.pageInfo.endCursor ?? null); }} />
    </section>
  </div>;
};

function SeasonActivation({ season, onActivated, children }: { season: string; onActivated: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const activate = async () => {
    setBusy(true); setError('');
    try { await adminApi.setSeason(season); setOpen(false); onActivated(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not change the active season.'); }
    finally { setBusy(false); }
  };
  return <AlertDialog open={open} onOpenChange={value => { if (busy) {
    return;
  }

  setOpen(value); setError(''); }}>
    <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
    <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Activate {season}?</AlertDialogTitle><AlertDialogDescription>All new matches will be tagged {season}. Previous season statistics remain available. Make sure awards for the current season have been assigned first.</AlertDialogDescription></AlertDialogHeader>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void activate(); }}>{busy ? 'Activating…' : `Activate ${season}`}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
