import { Progress } from '../../components/ui/progress';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Card } from '../../components/ui/card';
import { Sparkles } from 'lucide-react';
import { skipToken, useQuery } from '@apollo/client/react';
import { settings as adminApi } from '../admin/api';
import type {Weightings} from '../admin/models';
import { mapAccountCardPreviews, mapDefaultPositionWeights } from '../accounts/api';
import { AccountCardPreviewsDocument, DefaultPositionWeightsDocument } from '../../api/generated/graphql';
import { useResource } from '../../hooks/use-resource';

import { PlayerCard } from '../../components/PlayerCard';
import { POS, POS_LABELS } from '@napl/contracts/league';
import { Button } from '../../components/ui/button';

export const TierPreview = () => {
  const { data, loading, error } = useQuery(AccountCardPreviewsDocument);
  const previews = data ? mapAccountCardPreviews(data) : [];
  return <section className="space-y-6">
    <div className="space-y-2">
      <h2 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="size-6 text-primary" />Card tiers</h2>
      <p className="text-sm text-muted-foreground">Explore each tier’s card design. Award winners receive a black name bar; country flags appear on eligible cards.</p>
    </div>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading card previews…</p>}
    {error && <Alert variant="destructive"><AlertDescription>{error.message}</AlertDescription></Alert>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {previews.map(({ account, label, description }) => <Card key={label} className="flex flex-col items-center gap-4 p-4">
        <div className="w-full max-w-60 [&>div]:aspect-[240/384] [&>div]:!h-auto [&>div]:!w-full [&>div>svg]:size-full"><PlayerCard account={account} size="md" hideTeam /></div>
        <div className="space-y-1 text-center"><h3 className="font-semibold">{label}</h3><p className="text-sm text-muted-foreground">{description}</p></div>
      </Card>)}
    </div>
    <WeightingsPublicView />
  </section>;
};

const WeightingsPublicView = () => {
  const POSITION_NAMES: Record<string,string> = {
    [POS.ST]: POS_LABELS[POS.ST].toUpperCase(), [POS.WG]: POS_LABELS[POS.WG].toUpperCase(),
    [POS.CM]: POS_LABELS[POS.CM].toUpperCase(), [POS.DEF]: POS_LABELS[POS.DEF].toUpperCase(),
    [POS.GK]: 'GOALIE', [POS.FLEX]: POS_LABELS[POS.FLEX].toUpperCase(),
  };
  const STAT_LABELS: Record<string,string> = {
    goalsPerGame: 'GOALS',
    assistsPerGame: 'ASSISTS',
    passesPerGame: 'PASSES',
    tacklesPerGame: 'TACKLES',
    deflectsPerGame: 'DEFLECTIONS',
    cleanSheetPct: 'CLEAN SHEETS',
    catchesPerGame: 'CATCHES',
  };
  const saved = useResource(adminApi.getWeightings, []);
  const defaults = useQuery(DefaultPositionWeightsDocument, !saved.loading && !saved.error && saved.data === null ? {} : skipToken);
  const weights: Weightings = saved.data ?? (defaults.data ? mapDefaultPositionWeights(defaults.data) : {});
  return <section className="space-y-4">
    <div className="space-y-2"><h3 className="text-xl font-semibold">How OVR is scored</h3><p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">Each player’s OVR blends per-game averages and compares them with peers in the same position. The weights below show how each statistic contributes.</p></div>
    {(saved.loading || defaults.loading) && <p role="status" className="text-sm text-muted-foreground">Loading weightings…</p>}
    {(saved.error || defaults.error) && <Alert variant="destructive"><AlertDescription>{saved.error || defaults.error?.message}</AlertDescription><Button variant="outline" className="mt-2" onClick={() => { if (saved.error) void saved.reload(); else void defaults.refetch().catch(() => { /* Apollo exposes the error above. */ }); }}>Try again</Button></Alert>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(weights).map(([position, value]) => <Card key={position} className="space-y-4 p-4">
      <div><h4 className="text-lg font-semibold">{position}</h4><p className="text-xs text-muted-foreground">{POSITION_NAMES[position]}</p></div>
      {Object.keys(value).map(stat => {
        const weight = weights[position]?.[stat];
        const percent = weight === undefined || weight === null ? null : Math.round(weight * 100);
        const label = STAT_LABELS[stat] || stat;
        return <div key={stat} className="space-y-2"><div className="flex items-center justify-between gap-2 text-sm"><span>{label}</span><span className="tabular-nums">{percent === null ? '—' : `${percent}%`}</span></div><Progress className="h-2" value={percent ?? 0} aria-label={`${position} ${label} weighting`} /></div>;
      })}
    </Card>)}</div>
    <p className="text-xs text-muted-foreground">Weights total 100% per position and are maintained by league admins.</p>
  </section>;
};
