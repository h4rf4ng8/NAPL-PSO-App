import { Activity, BarChart3, Hand, Shield, Target, TrendingUp, Trophy, Zap } from 'lucide-react';


import type { Account } from './models';
import { Metric } from '../../components/Ui';
import { C } from '../../theme/theme';


import { getStatsForSeason } from '../../utils/rankings';
import { POS } from '@napl/contracts/league';
// PositionBreakdown
export const PositionBreakdown = ({ account, season }: { account: Account; season: string }) => {
  const stats = getStatsForSeason(account, season);
  const games = stats.games || 0;
  const isAttacker = account.position === POS.ST;
  const isMidfielder = account.position === POS.CM;
  const isDefender = account.position === POS.DEF;
  const isGK = account.position === POS.GK;
  const safeRate = (n: number) => games > 0 ? ((n/games)*100).toFixed(0) : '0';
  const safeAvg = (n: number) => games > 0 ? (n/games).toFixed(2) : '0.00';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={18} style={{ color: C.greenLight }} />
        <h4 className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>{account.position} BREAKDOWN</h4>
        {season !== 'all' && (
          <span className="font-mono text-[9px] px-2 py-0.5 rounded tracking-wider" style={{
            background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}44`,
          }}>{season}</span>
        )}
      </div>
      {games === 0 && <div className="font-mono text-sm py-4" style={{ color: `${C.cream}55` }}>No matches in this season yet.</div>}
      {games > 0 && isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Hand />} label="DEFLECTS / GAME" value={safeAvg(stats.deflects)} accent={C.greenLight} />
          <Metric icon={<Shield />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets)}%`} accent={C.greenLight} />
          <Metric icon={<Target />} label="CATCHES / GAME" value={safeAvg(stats.catches)} accent={C.greenLight} />
          <Metric icon={<Trophy />} label="TOTAL DEFLECTS" value={stats.deflects} accent={C.goldLight} />
        </div>
      )}
      {games > 0 && isAttacker && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Target />} label="GOALS / GAME" value={safeAvg(stats.goals)} accent={C.redLight} />
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists)} accent={C.greenLight} />
          <Metric icon={<TrendingUp />} label="G + A" value={stats.goals + stats.assists} accent={C.goldLight} />
          <Metric icon={<Activity />} label="PASSES / GAME" value={safeAvg(stats.passes * games)} accent={C.greenLight} />
        </div>
      )}
      {games > 0 && isMidfielder && !isAttacker && !isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Zap />} label="ASSISTS / GAME" value={safeAvg(stats.assists)} accent={C.greenLight} />
          <Metric icon={<TrendingUp />} label="PASSES / GAME" value={stats.passes} accent={C.greenLight} />
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles)} accent={C.redLight} />
          <Metric icon={<Target />} label="GOALS" value={stats.goals} accent={C.redLight} />
        </div>
      )}
      {games > 0 && isDefender && !isGK && (
        <div className="grid grid-cols-2 gap-2">
          <Metric icon={<Shield />} label="TACKLES / GAME" value={safeAvg(stats.tackles)} accent={C.redLight} />
          <Metric icon={<Trophy />} label="CLEAN SHEET %" value={`${safeRate(stats.cleanSheets)}%`} accent={C.greenLight} />
          <Metric icon={<Activity />} label="PASSES / GAME" value={stats.passes} accent={C.greenLight} />
          <Metric icon={<Target />} label="GOALS" value={stats.goals} accent={C.goldLight} />
        </div>
      )}
    </div>
  );
};
