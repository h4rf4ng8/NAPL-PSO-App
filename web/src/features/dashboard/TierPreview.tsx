import { Sparkles } from 'lucide-react';
import { skipToken, useQuery } from '@apollo/client/react';
import { settings as adminApi } from '../admin/api';
import type {Weightings} from '../admin/models';
import { mapAccountCardPreviews, mapDefaultPositionWeights } from '../accounts/api';
import { AccountCardPreviewsDocument, DefaultPositionWeightsDocument } from '../../api/generated/graphql';
import { useResource } from '../../hooks/use-resource';
import { C } from '../../theme/theme';
import { PlayerCard } from '../../components/PlayerCard';
import { POS, POS_LABELS } from '@napl/contracts/league';
export const TierPreview = () => {
  const { data, loading, error } = useQuery(AccountCardPreviewsDocument);
  const previews = data ? mapAccountCardPreviews(data) : [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>TIER PREVIEW</h3>
      </div>
      <p className="font-body text-sm mb-6" style={{ color: `${C.cream}aa` }}>
        Each tier rendered with its material treatment. Award winners get a black name bar; the Gold card shows a country flag.
      </p>
      {loading && <p role="status">Loading card previews…</p>}
      {error && <p role="alert">{error.message}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
        {previews.map(({ account, label, description }) => (
          <div key={label} className="flex flex-col items-center gap-3">
            <PlayerCard account={account} size="md" hideTeam />
            <div className="text-center">
              <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>{label}</div>
              <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}66` }}>{description}</div>
            </div>
          </div>
        ))}
      </div>
      <WeightingsPublicView />
    </div>
  );
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
  const POS_COLOR:Record<string,string> = {
    [POS.ST]: '#ff6b4a', [POS.WG]: '#ff9a3c', [POS.CM]: '#f5cc3e', [POS.DEF]: '#4a90e2', [POS.GK]: '#4caf50', [POS.FLEX]: '#b887ff',
  };
  const saved = useResource(adminApi.getWeightings, []);
  const defaults = useQuery(DefaultPositionWeightsDocument, !saved.loading && !saved.error && saved.data === null ? {} : skipToken);
  const weights: Weightings = saved.data ?? (defaults.data ? mapDefaultPositionWeights(defaults.data) : {});
  return (
    <div className="mt-10 rounded-xl p-5" style={{
      background: `${C.navyDeep}aa`,
      border: `1px solid ${C.navyLight}66`,
    }}>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-display tracking-wider text-xl mb-1" style={{ color: C.cream }}>
            HOW OVR IS SCORED
          </h3>
          <p className="font-body text-sm max-w-xl" style={{ color: `${C.cream}aa`, lineHeight: 1.6 }}>
            Every player's OVR is a weighted blend of their per-game stat averages,
            compared to peers in their position. Weights differ per position so
            a defender isn't ranked by goals and a striker isn't ranked by tackles.
          </p>
        </div>
      </div>
      {(saved.loading || defaults.loading) && <p role="status">Loading weightings…</p>}
      {(saved.error || defaults.error) && <p role="alert">
        {saved.error || defaults.error?.message} <button onClick={() => {
          if (saved.error) void saved.reload();
          else void defaults.refetch().catch(() => { /* Apollo exposes the error above. */ });
        }}>Try again</button>
      </p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(weights).map(([pos, value]) => {
          const posColor = POS_COLOR[pos];
          return (
            <div key={pos} className="rounded-lg p-4" style={{
              background: C.white,
              border: `1px solid ${C.navyLight}66`,
              borderTop: `3px solid ${posColor}`,
            }}>
              <div className="flex items-baseline gap-2 mb-3">
                <div className="font-display tracking-widest text-xl" style={{ color: C.brandNavyDeep }}>
                  {pos}
                </div>
                <div className="font-mono text-[10px] tracking-widest" style={{ color: `${C.brandNavy}77` }}>
                  {POSITION_NAMES[pos]}
                </div>
              </div>
              <div className="space-y-2">
                {Object.keys(value).map(stat => {
                  const w = weights?.[pos]?.[stat];
                  const pct = w === undefined || w === null ? null : Math.round(w * 100);
                  return (
                    <div key={stat}>
                      <div className="flex items-baseline justify-between mb-1">
                        <div className="font-body text-sm" style={{ color: C.brandNavy }}>
                          {STAT_LABELS[stat] || stat}
                        </div>
                        <div className="font-display text-base tracking-wider tabular-nums" style={{ color: posColor }}>
                          {pct === null ? '—' : `${pct}%`}
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${C.navyLight}22` }}>
                        <div className="h-full rounded-full" style={{
                          width: pct === null ? '0%' : `${pct}%`,
                          background: posColor,
                          transition: 'width 0.3s ease-out',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="font-mono text-[10px] tracking-wider mt-4 text-center" style={{ color: `${C.cream}66` }}>
        WEIGHTS SUM TO 100% PER POSITION · UPDATED BY LEAGUE ADMINS
      </div>
    </div>
  );
};
