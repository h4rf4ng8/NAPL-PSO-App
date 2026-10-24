import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Label } from '../../components/ui/label';
import { Slider } from '../../components/ui/slider';
import { useEffect, useState } from 'react';
import { settings as adminApi } from './api';
import type { Weightings } from './models';


import { STAT_KEY_LABELS } from '../../utils/rankings';
import { mapDefaultPositionWeights } from '../accounts/api';
import { useLazyQuery } from '@apollo/client/react';
import { DefaultPositionWeightsDocument } from '../../api/generated/graphql';
import { POS, POS_LABELS } from '@napl/contracts/league';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';





// Weightings Manager
export const WeightingsManager = ({ onRefresh }: { onRefresh: () => void }) => {
  const POSITION_NAMES: Record<string,string> = {
    [POS.ST]: POS_LABELS[POS.ST].toUpperCase(), [POS.WG]: POS_LABELS[POS.WG].toUpperCase(),
    [POS.CM]: POS_LABELS[POS.CM].toUpperCase(), [POS.DEF]: POS_LABELS[POS.DEF].toUpperCase(),
    [POS.GK]: 'GOALIE', [POS.FLEX]: 'FLEX (STRIKER + DEFENDER)',
  };

  // weights stored as whole-number percentages (0-100) for the UI
  const [weights, setWeights] = useState<Weightings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [loadDefaults] = useLazyQuery(DefaultPositionWeightsDocument);
  const getDefaults = async () => {
    const { data } = await loadDefaults();
    if (!data) throw new Error('Default weightings unavailable.');
    return mapDefaultPositionWeights(data);
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await adminApi.getWeightings();
        if (!mounted) return;
        // Convert from 0-1 decimals to 0-100 percentages for editing
        const source = saved || await getDefaults();
        const asPct:Weightings = {};
        for (const [pos, positionStats] of Object.entries(source)) {
          asPct[pos] = {};
          for (const [stat, value] of Object.entries(positionStats)) {
            asPct[pos][stat] = Math.round(value * 100);
          }
        }
        if (mounted) setWeights(asPct);
      } catch (error) {
        if (mounted) setError(error instanceof Error ? error.message : 'Could not load weightings.');
      } finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false; };
  }, [loadDefaults]);

  const setStat = (pos: string, stat: string, value: string) => {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    setWeights(w => ({ ...w, [pos]: { ...w[pos], [stat]: v } }));
    setInfo(''); setError('');
  };

  const posTotal = (pos: string) => Object.values(weights[pos] || {}).reduce((a, b) => a + b, 0);
  const allValid = () => Object.keys(weights).length > 0 && Object.keys(weights).every(pos => posTotal(pos) === 100);

  const save = async () => {
    setError(''); setInfo('');
    if (!allValid()) {
      setError('Every position must add up to exactly 100% before saving.');
      return;
    }
    setSaving(true);
    try {
      // Convert back from 0-100 percentages to 0-1 decimals for storage
      const asDecimal:Weightings = {};
      for (const [pos, positionStats] of Object.entries(weights)) {
        asDecimal[pos] = {};
        for (const [stat, value] of Object.entries(positionStats)) {
          asDecimal[pos][stat] = value / 100;
        }
      }
      await adminApi.setWeightings(asDecimal);
      setInfo('✓ Weightings saved. Rankings will update.');
      onRefresh?.();
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setSaving(false);
  };

  const resetToDefault = async () => {
    setResetting(true);
    setError(''); setInfo('');
    try {
      const defaults = await getDefaults();
      const asPct:Weightings = {};
      for (const [pos, positionStats] of Object.entries(defaults)) {
        asPct[pos] = {};
        for (const [stat, value] of Object.entries(positionStats)) {
          asPct[pos][stat] = Math.round(value * 100);
        }
      }
      setWeights(asPct);
      setInfo('Defaults loaded — click Save to apply.');
      setResetOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not load default weightings.');
    } finally { setResetting(false); }
  };

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading weightings…</p>;
  return <section className="space-y-5">
    <div className="space-y-2"><h3 className="text-xl font-semibold">Stat weightings</h3><p className="max-w-3xl text-sm text-muted-foreground">Control how each statistic contributes to ranking and card tier. Every position must total exactly 100%. Saved changes apply to all rankings.</p></div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {info && <Alert role="status"><AlertDescription>{info}</AlertDescription></Alert>}
    <div className="grid items-start gap-4 xl:grid-cols-2">{Object.entries(weights).map(([position, positionStats]) => {
      const total = posTotal(position);
      const valid = total === 100;
      return <Card key={position} className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{POSITION_NAMES[position]}</h4><Badge variant={valid ? 'secondary' : 'destructive'}>{total}%{valid ? ' · Ready' : (total > 100 ? ' · Too high' : ' · Too low')}</Badge></div>
        {Object.entries(positionStats).map(([stat, value]) => <div key={stat} className="space-y-1">
          <div className="flex items-center justify-between gap-3"><Label htmlFor={`weight-${position}-${stat}`} className="leading-relaxed">{STAT_KEY_LABELS[stat] || stat}</Label><div className="flex shrink-0 items-center gap-1"><Input id={`weight-${position}-${stat}`} type="number" min={0} max={100} disabled={saving || resetting} value={value} onChange={event => setStat(position, stat, event.target.value)} className="w-20 text-center tabular-nums" /><span className="text-sm text-muted-foreground">%</span></div></div>
          <Slider aria-label={`${position} ${STAT_KEY_LABELS[stat] || stat} percent`} className="min-h-11" min={0} max={100} step={1} value={[value]} disabled={saving || resetting} onValueChange={values => setStat(position, stat, String(values[0] ?? 0))} />
        </div>)}
      </Card>;
    })}</div>
    <div className="flex flex-col gap-3 sm:flex-row">
      <AlertDialog open={resetOpen} onOpenChange={open => { if (!resetting) setResetOpen(open); }}>
        <AlertDialogTrigger asChild><Button variant="outline" disabled={saving}>Reset draft to defaults</Button></AlertDialogTrigger>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reset this draft?</AlertDialogTitle><AlertDialogDescription>Your unsaved edits will be replaced with the original defaults. Rankings stay unchanged until you save the weightings.</AlertDialogDescription></AlertDialogHeader>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <AlertDialogFooter><AlertDialogCancel disabled={resetting}>Cancel</AlertDialogCancel><AlertDialogAction disabled={resetting} onClick={event => { event.preventDefault(); void resetToDefault(); }}>{resetting ? 'Loading defaults…' : 'Load defaults'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button disabled={saving || resetting || !allValid()} onClick={save}>{saving ? 'Saving…' : 'Save weightings'}</Button>
    </div>
    {!allValid() && <p className="text-sm text-muted-foreground">Every position must total exactly 100% before you can save.</p>}
  </section>;
};
