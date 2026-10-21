import { Calendar, Clock, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { settings as adminApi } from './api';
import type { Account } from '../accounts/models';
import { EmptyState } from '../../components/Display';
import { C } from '../../theme/theme';






// Season Manager
export const SeasonManager = ({ account: _account, allPlayers, currentSeason, onRefresh }: { account: Account; allPlayers: Account[]; currentSeason: string; onRefresh: () => void }) => {
  const [customName, setCustomName] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [error, setError] = useState('');

  // Discover all seasons that have matches
  const allSeasons = useMemo(() => {
    const seasonsSet = new Set([currentSeason]);
    allPlayers.forEach(p => {
      if (p.seasonStats) Object.keys(p.seasonStats).forEach(s => { if (s !== 'all') seasonsSet.add(s); });
      else (p.matches || []).forEach(m => { if (m.season) seasonsSet.add(m.season); });
    });
    return [...seasonsSet].sort((a,b)=>a.localeCompare(b));
  }, [allPlayers, currentSeason]);

  // Determine the next season number (auto-increment from current)
  const suggestNext = (current: string) => {
    const m = current.match(/^S(\d+)$/i);
    return m ? `S${Math.trunc(Number(m[1])) + 1}` : 'S2';
  };
  const nextSeason = suggestNext(currentSeason);

  const startNextSeason = async () => {
    if (!confirm(
      `Start ${nextSeason}?\n\nFrom now on, all new matches will be tagged ${nextSeason}.\nPast season stats will still be viewable, but ${currentSeason} is now closed.\n\nMake sure ${currentSeason} awards have been assigned first!`
    )) return;
    await adminApi.setSeason(nextSeason);
    onRefresh();
  };

  const setCustom = async () => {
    setError('');
    const name = customName.trim().toUpperCase();
    if (!name) { setError('Enter a season name'); return; }
    if (!/^[A-Z0-9-]+$/.test(name)) { setError('Letters, numbers, and dashes only'); return; }
    if (!confirm(`Switch active season to ${name}?`)) return;
    await adminApi.setSeason(name);
    setCustomName('');
    setShowCustom(false);
    onRefresh();
  };

  // Per-season stats summary (matches & participating players)
  const seasonSummaries = allSeasons.map(s => {
    let matches = 0;
    let players = 0;
    allPlayers.forEach(p => {
      const games = p.seasonStats
        ? p.seasonStats[s]?.games || 0
        : (p.matches || []).filter(m => (m.season || 'S1') === s).length;
      matches += games;
      if (games > 0) players += 1;
    });
    return { season: s, matches, players };
  });

  return (
    <div className="space-y-5">
      {/* CURRENT SEASON DISPLAY */}
      <div className="rounded-xl p-5" style={{
        background: `linear-gradient(135deg, ${C.gold}22 0%, ${C.navyDeep}cc 100%)`,
        border: `1px solid ${C.gold}66`,
        boxShadow: `0 4px 16px ${C.gold}22`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: C.greenLight }} />
          <span className="font-mono text-[10px] tracking-[0.3em]" style={{ color: `${C.cream}99` }}>CURRENTLY ACTIVE</span>
        </div>
        <div className="font-display text-5xl tracking-wider mb-1" style={{ color: C.goldLight }}>
          SEASON {currentSeason.replace(/^S/, '')}
        </div>
        <div className="font-mono text-[11px] tracking-wider" style={{ color: `${C.cream}88` }}>
          ALL NEW MATCHES TAGGED <span style={{ color: C.goldLight }}>{currentSeason}</span>
        </div>
      </div>

      {/* START NEXT SEASON */}
      <div className="rounded-xl p-4" style={{
        background: `${C.navyDeep}aa`,
        border: `1px solid ${C.navyLight}66`,
      }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={14} style={{ color: C.greenLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.cream }}>START NEXT SEASON</span>
        </div>
        <p className="font-body text-sm mb-3" style={{ color: `${C.cream}aa` }}>
          One click closes <strong>{currentSeason}</strong> and opens <strong>{nextSeason}</strong>. Past season stats and awards are kept forever. Players will see their {currentSeason} stats frozen, while new matches go into {nextSeason}.
        </p>
        <button
          onClick={startNextSeason}
          className="w-full py-3 font-heading tracking-wider text-base rounded transition-all hover:scale-[1.01]"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 12px ${C.green}66`,
          }}
        >▶ START {nextSeason}</button>

        <button
          onClick={() => setShowCustom(s => !s)}
          className="w-full mt-2 py-1.5 font-mono text-[10px] tracking-[0.2em]"
          style={{ color: `${C.cream}77` }}
        >{showCustom ? '▲ HIDE CUSTOM NAME' : '▼ USE CUSTOM SEASON NAME'}</button>

        {showCustom && (
          <div className="mt-2">
            <div className="flex gap-2">
              <input
                type="text" value={customName}
                onChange={(e) => setCustomName(e.target.value.toUpperCase())}
                placeholder="e.g. WINTER25"
                className="flex-1 rounded px-3 py-2 font-mono focus:outline-none"
                style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              />
              <button onClick={setCustom} className="px-4 py-2 font-heading tracking-wider text-xs rounded" style={{
                background: C.gold, color: C.brandNavy,
              }}>SET</button>
            </div>
            {error && <div className="mt-1 font-mono text-xs" style={{ color: C.redLight }}>{error}</div>}
          </div>
        )}
      </div>

      {/* SEASON HISTORY */}
      <div>
        <h4 className="font-display text-xl tracking-wider mb-2 flex items-center gap-2" style={{ color: C.cream }}>
          <Clock size={14} style={{ color: C.goldLight }} /> SEASON HISTORY
        </h4>
        {seasonSummaries.length === 0 ? (
          <EmptyState icon={<Calendar size={36} />} text="No past seasons yet." />
        ) : (
          <div className="space-y-1.5">
            {seasonSummaries.map(s => {
              const isActive = s.season === currentSeason;
              return (
                <div key={s.season} className="rounded p-3 flex items-center gap-3" style={{
                  background: isActive ? `${C.green}22` : `${C.navyDeep}aa`,
                  border: `1px solid ${isActive ? C.greenLight : C.navyLight}55`,
                  borderLeft: `3px solid ${isActive ? C.greenLight : C.navyLight}`,
                }}>
                  <div className="flex-1">
                    <div className="font-display text-2xl tracking-wider" style={{ color: C.cream }}>
                      {s.season}
                      {isActive && <span className="ml-2 font-mono text-[10px] px-2 py-0.5 rounded" style={{
                        background: C.greenLight, color: C.onColor,
                      }}>ACTIVE</span>}
                    </div>
                    <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}77` }}>
                      {s.matches} {s.matches === 1 ? 'MATCH' : 'MATCHES'} • {s.players} {s.players === 1 ? 'PLAYER' : 'PLAYERS'}
                    </div>
                  </div>
                  {!isActive && (
                    <button
                      onClick={async () => {
                        if (!confirm(`Re-activate ${s.season}? New matches will be tagged with this season again.`)) return;
                        await adminApi.setSeason(s.season);
                        onRefresh();
                      }}
                      className="px-3 py-1.5 font-heading tracking-wider text-[10px] rounded"
                      style={{ background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}66` }}
                    >RE-ACTIVATE</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
