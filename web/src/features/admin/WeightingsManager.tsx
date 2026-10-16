import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { settings as adminApi } from './api';
import type { Weightings } from './models';
import { C } from '../../theme/theme';

import { STAT_KEY_LABELS } from '../../utils/rankings';
import { loadDefaultPositionWeights } from '../accounts/api';
import { POS, POS_LABELS } from '@napl/contracts/league';




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
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const saved = await adminApi.getWeightings();
      // Convert from 0-1 decimals to 0-100 percentages for editing
      const source = saved || await loadDefaultPositionWeights();
      const asPct:Weightings = {};
      for (const [pos, positionStats] of Object.entries(source)) {
        asPct[pos] = {};
        for (const [stat, value] of Object.entries(positionStats)) {
          asPct[pos][stat] = Math.round(value * 100);
        }
      }
      setWeights(asPct);
      setLoading(false);
    })();
  }, []);

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
    if (!confirm('Reset all weightings back to the original defaults?')) return;
    const defaults = await loadDefaultPositionWeights();
    const asPct:Weightings = {};
    for (const [pos, positionStats] of Object.entries(defaults)) {
      asPct[pos] = {};
      for (const [stat, value] of Object.entries(positionStats)) {
        asPct[pos][stat] = Math.round(value * 100);
      }
    }
    setWeights(asPct);
    setInfo('Defaults loaded — click Save to apply.');
  };

  if (loading || !weights) {
    return <div className="font-mono text-sm tracking-wider" style={{ color: `${C.cream}77` }}>Loading weightings…</div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>STAT WEIGHTINGS</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          These control how each stat counts toward a player's ranking and tier. Each position must total exactly 100%. Changes apply to all rankings immediately after saving.
        </p>
      </div>

      {/* One card per position */}
      {Object.entries(weights).map(([pos, positionStats]) => {
        const total = posTotal(pos);
        const valid = total === 100;
        return (
          <div key={pos} className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>{POSITION_NAMES[pos]}</span>
              <span className="font-heading tracking-wider text-sm px-3 py-1 rounded" style={{
                background: valid ? `${C.green}22` : `${C.red}22`,
                color: valid ? C.green : C.red,
              }}>{total}% {valid ? '✓' : (total > 100 ? '— too high' : '— too low')}</span>
            </div>
            <div className="space-y-2">
              {Object.keys(positionStats).map(stat => (
                <div key={stat} className="flex items-center gap-3">
                  <span className="font-body text-sm flex-1" style={{ color: C.brandNavy }}>
                    {STAT_KEY_LABELS[stat] || stat}
                  </span>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0" max="100"
                      value={weights[pos][stat]}
                      onChange={(e) => setStat(pos, stat, e.target.value)}
                      className="w-20 rounded text-center font-display text-lg py-1.5"
                      style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.brandNavy }}
                    />
                    <span className="font-mono text-sm" style={{ color: `${C.brandNavy}77` }}>%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {error && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}>{error}</div>}
      {info && <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>}

      <div className="flex gap-3">
        <button
          onClick={resetToDefault}
          className="px-4 py-2.5 font-heading tracking-wider text-sm rounded"
          style={{ background: `${C.navyLight}66`, color: C.brandNavy, border: `1px solid ${C.navyLight}` }}
        >RESET TO DEFAULTS</button>
        <button
          onClick={save}
          disabled={saving || !allValid()}
          className="flex-1 py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
          style={{
            background: allValid() ? `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)` : C.navyLight,
            color: C.onColor,
            boxShadow: allValid() ? `0 2px 8px ${C.green}66` : 'none',
          }}
        >{saving ? 'SAVING…' : (allValid() ? 'SAVE WEIGHTINGS' : 'FIX TOTALS TO SAVE')}</button>
      </div>
    </div>
  );
};
