import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../../components/ui/radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { useQuery } from '@apollo/client/react';
import { AccountAwardsDocument } from '../../api/generated/graphql';
import { z } from 'zod';
import { Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import type { PlayerAward, AdminPlayer } from '../accounts/models';
import { AWARD_BY_ID, AWARD_TYPES, AwardIcon } from '../../components/Icons';
import { EmptyState } from '../../components/Display';

import { AWARD } from '@napl/contracts/accounts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';







// Awards Manager
export const AwardsManager = ({ onRefresh, currentSeason }: { onRefresh: () => void; currentSeason: string }) => {
  const [season, setSeason] = useState(currentSeason);
  const [awardId, setAwardId] = useState<(typeof AWARD)[keyof typeof AWARD]>(AWARD.STRIKER);
  const [search,setSearch] = useState('');
  const playerPage = useRestPage<AdminPlayer>('/api/accounts?search='+encodeURIComponent(search));
  const [selected,setSelected] = useState<AdminPlayer|null>(null);
  const [after,setAfter] = useState<string|null>(null);
  const [previous,setPrevious] = useState<(string|null)[]>([]);
  const awardPage = useQuery(AccountAwardsDocument,{variables:{id:selected?.id ?? '',first:10,after},skip:!selected});
  const winnerUsername = selected?.username ?? '';
  const allPlayers = [...(selected ? [selected] : []),...(playerPage.data?.nodes ?? []).filter(player=>player.id!==selected?.id)];
  const setWinnerUsername = (name:string) => {setSelected(allPlayers.find(player=>player.username===name) ?? null);setAfter(null);setPrevious([]);};
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => { setSeason(currentSeason); }, [currentSeason]);

  const award = AWARD_BY_ID[awardId];

  // Filter candidate winners: by ideal position for the award (but allow any)
  const idealCandidates = allPlayers.filter(p => p.position === award.pos);
  const otherCandidates = allPlayers.filter(p => p.position !== award.pos);

  const assignAward = async () => {
    if (busy) return;
    setError(''); setInfo('');
    if (!winnerUsername) { setError('Pick a winner'); return; }
    if (!season.trim()) { setError('Season required'); return; }
    const player = selected;
    if (!player) { setError('Player not found'); return; }
    setBusy(true);
    try {
      await accountApi.assignAward(player.id, awardId, season.trim());
      setInfo(`✓ ${award.name} ${season.trim()} assigned to ${player.username}`);
      setPrevious([]); setAfter(null);
      if (!after) await awardPage.refetch();
      await onRefresh();
    } catch (error_) {
      setError('Could not assign award: ' + (error_ instanceof Error ? error_.message : String(error_)));
    } finally {
      setBusy(false);
    }
  };

  const removeAward = async (player: AdminPlayer, targetAward: Pick<PlayerAward,'awardId'|'season'>) => {
    if (busy) return;
    setError(''); setInfo(''); setBusy(true);
    try {
      await accountApi.removeAward(player.id, targetAward.awardId, targetAward.season);
      setRemoving(null);
      setInfo(`✓ ${AWARD_BY_ID[targetAward.awardId]?.name ?? targetAward.awardId} ${targetAward.season} removed from ${player.username}`);
      setPrevious([]); setAfter(null);
      if (!after) await awardPage.refetch();
      await onRefresh();
    } catch (error_) {
      setError('Could not remove award: ' + (error_ instanceof Error ? error_.message : String(error_)));
    } finally {
      setBusy(false);
    }
  };

  const awards = z.array(z.object({awardId:z.string(),season:z.string(),assignedBy:z.string().optional()})).safeParse(awardPage.data?.accountAwards.nodes ?? []);
  const allAwards = selected && awards.success && !awardPage.loading ? awards.data.map(award=>({...award,player:selected})) : [];

  return <div className="space-y-5">
    <Card className="space-y-5 p-4 sm:p-5">
      <div className="space-y-2"><h3 className="flex items-center gap-2 text-xl font-semibold"><Trophy className="size-5" />Assign an award</h3><p className="text-sm text-muted-foreground">Choose an award, season, and player. Suggested positions help find candidates; any player can win.</p></div>
      <RadioGroup aria-label="Award type" value={awardId} disabled={busy} onValueChange={value => setAwardId(value as typeof awardId)} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {AWARD_TYPES.map(type => <Label key={type.id} htmlFor={`award-${type.id}`} className="flex cursor-pointer flex-col gap-2 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent">
          <div className="flex items-center justify-between gap-2"><AwardIcon awardId={type.id} size={28} /><RadioGroupItem id={`award-${type.id}`} value={type.id} /></div><span className="text-sm leading-relaxed">{type.name}</span><span className="text-xs font-normal leading-relaxed text-muted-foreground">{type.desc}</span>
        </Label>)}
      </RadioGroup>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="award-season">Season</Label><Input id="award-season" value={season} disabled={busy} onChange={event => setSeason(event.target.value.toUpperCase())} /></div>
        <div className="space-y-3">
          <div className="space-y-2"><Label htmlFor="award-player-search">Search candidates</Label><Input id="award-player-search" aria-label="Find award player" placeholder="Find player…" value={search} disabled={busy} onChange={event => setSearch(event.target.value)} /></div>
          {playerPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading players…</p>}
          {playerPage.error && <Alert variant="destructive"><AlertDescription>{playerPage.error}</AlertDescription></Alert>}
          <PageButtons {...playerPage} hasNextPage={playerPage.data?.pageInfo.hasNextPage ?? false} />
          <div className="space-y-2"><Label htmlFor="award-winner">Winner</Label><Select value={winnerUsername} onValueChange={setWinnerUsername} disabled={busy}><SelectTrigger id="award-winner"><SelectValue placeholder="Select a winner" /></SelectTrigger><SelectContent>
            {idealCandidates.length > 0 && <SelectGroup><SelectLabel>{award.pos} players</SelectLabel>{idealCandidates.map(player => <SelectItem key={player.id} value={player.username}>{player.username}</SelectItem>)}</SelectGroup>}
            {otherCandidates.length > 0 && <SelectGroup><SelectLabel>Other players</SelectLabel>{otherCandidates.map(player => <SelectItem key={player.id} value={player.username}>{player.username} ({player.position})</SelectItem>)}</SelectGroup>}
          </SelectContent></Select></div>
        </div>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
      <Button className="w-full sm:w-auto" onClick={() => void assignAward()} disabled={busy || !selected || !season.trim()}>{busy ? 'Saving…' : `Assign ${award.name}`}</Button>
    </Card>
    <section className="space-y-3"><h3 className="text-lg font-semibold">{selected ? `${selected.username}’s awards (${awardPage.data?.accountAwards.totalCount ?? 0})` : 'Award history'}</h3>
      {!selected && <p className="text-sm text-muted-foreground">Select a player to review their awards.</p>}
      {awardPage.error && <Alert variant="destructive"><AlertDescription>{awardPage.error.message}</AlertDescription></Alert>}
      {!awards.success && <Alert variant="destructive"><AlertDescription>Invalid award history response. Reload the selected player.</AlertDescription></Alert>}
      {awardPage.loading && <p role="status" className="text-sm text-muted-foreground">Loading awards…</p>}
      {selected && !awardPage.loading && !awardPage.error && allAwards.length === 0 && <EmptyState icon={<Trophy className="size-8" />} text="No awards assigned yet." />}
      {allAwards.map(item => {
        const key = `${item.player.id}:${item.awardId}:${item.season}`;
        const name = AWARD_BY_ID[item.awardId]?.name ?? item.awardId;
        return <Card key={key} className="flex flex-wrap items-center gap-3 p-4"><AwardIcon awardId={item.awardId} size={28} /><div className="min-w-0 flex-1 space-y-1"><h4 className="flex flex-wrap items-center gap-2 font-medium">{name}<Badge variant="secondary">{item.season}</Badge></h4><p className="text-xs text-muted-foreground">{item.player.username}{item.assignedBy ? ` · Assigned by ${item.assignedBy}` : ''}</p></div>
          <AlertDialog open={removing === key} onOpenChange={open => { if (!busy) setRemoving(open ? key : null); }}>
            <AlertDialogTrigger asChild><Button variant="outline" className="text-destructive" disabled={busy}>Remove award</Button></AlertDialogTrigger>
            <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove {name}?</AlertDialogTitle><AlertDialogDescription>This removes the {item.season} award from {item.player.username}’s record and player card.</AlertDialogDescription></AlertDialogHeader>
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={event => { event.preventDefault(); void removeAward(item.player, item); }}>{busy ? 'Removing…' : 'Remove award'}</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>;
      })}
      {selected && <PageButtons loading={awardPage.loading} canPrevious={previous.length > 0} hasNextPage={awardPage.data?.accountAwards.pageInfo.hasNextPage ?? false} previous={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0,-1)); }} next={() => { setPrevious([...previous,after]); setAfter(awardPage.data?.accountAwards.pageInfo.endCursor ?? null); }} />}
    </section>
  </div>;
};
