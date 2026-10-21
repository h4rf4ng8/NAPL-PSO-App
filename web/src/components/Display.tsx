import { ChevronRight, Star } from 'lucide-react';
import React from 'react';
import type { News, Team } from '../api/models';
import { C } from '../theme/theme';

// ============ POSITION BREAKDOWN ============
export const Metric = ({ icon, label, value, accent = C.green }: { icon?: React.ReactNode; label: string; value: React.ReactNode; accent?: string }) => (
  <div className="rounded-lg px-3 py-2.5 transition-all hover:scale-[1.02]" style={{
    background: C.white,
    border: `1px solid ${accent}44`,
    boxShadow: `0 1px 3px ${C.brandNavy}11, 0 0 0 1px ${accent}11 inset`,
  }}>
    <div className="flex items-center gap-1.5 mb-1" style={{ color: accent }}>
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center">{icon}</span>
      <span className="font-mono text-[9px] tracking-[0.2em]" style={{ opacity: 0.9 }}>{label}</span>
    </div>
    <div className="font-display text-2xl" style={{ color: C.cream }}>{value}</div>
  </div>
);

export const RecordBox = ({ value, label, color }: { value: React.ReactNode; label: string; color: string }) => (
  <div className="rounded-lg p-2 text-center" style={{
    background: `${color}11`, border: `1px solid ${color}44`,
  }}>
    <div className="font-display text-3xl" style={{ color }}>{value}</div>
    <div className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}77` }}>{label}</div>
  </div>
);

export const ResultBadge = ({ result, small }: { result: string; small?: boolean }) => {
  const color = result === 'W' ? C.greenLight : (result === 'L' ? C.redLight : C.goldLight);
  return (
    <div className={`rounded flex items-center justify-center font-display ${small ? 'w-7 h-7 text-base' : 'w-10 h-10 text-xl'}`} style={{
      background: `${color}22`, color, border: `1px solid ${color}66`,
    }}>{result}</div>
  );
};

export const EmptyState = ({ icon, text }: { icon?: React.ReactNode; text: string }) => (
  <div className="text-center py-16 font-mono text-sm" style={{ color: `${C.cream}55` }}>
    <div className="flex justify-center mb-3" style={{ color: `${C.cream}33` }}>{icon}</div>
    {text}
  </div>
);

export const QuickStat = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: string }) => (
  <div className="rounded-lg p-4" style={{
    background: C.white,
    border: `1px solid ${C.navyLight}`,
    borderTop: `3px solid ${accent}`,
  }}>
    <div className="font-mono text-[10px] tracking-[0.25em]" style={{ color: `${C.brandNavy}77` }}>
      {label}
    </div>
    <div className="font-display text-2xl tracking-wider mt-1" style={{ color: C.brandNavy }}>
      {value}
    </div>
  </div>
);

export const Section = ({ title, children, onMore }: { title: string; children: React.ReactNode; onMore?: () => void }) => (
  <div>
    <div className="flex items-center justify-between mb-3">
      <h3 className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>{title}</h3>
      {onMore && (
        <button onClick={onMore} className="font-mono text-[10px] tracking-[0.25em] flex items-center gap-1" style={{ color: C.green }}>
          MORE <ChevronRight size={12} />
        </button>
      )}
    </div>
    {children}
  </div>
);

export const ArticleCard = ({ title, body, pinned, date, author }: { title: string; body: string; pinned: boolean; date: number | null; author: string }) => (
  <article className="rounded-xl p-5 transition-all hover:translate-y-[-1px]" style={{
    background: C.white,
    border: `1px solid ${pinned ? C.gold + '88' : C.navyLight}`,
    borderLeft: `4px solid ${pinned ? C.goldLight : C.green}`,
    boxShadow: `0 2px 8px ${C.brandNavy}11`,
  }}>
    <div className="flex items-center gap-2 mb-2">
      {pinned && <Star size={11} style={{ color: C.goldLight }} />}
      <div className="font-mono text-[10px] tracking-[0.25em]" style={{ color: pinned ? C.goldLight : C.green }}>
        {pinned ? 'PINNED' : 'ANNOUNCEMENT'}
      </div>
    </div>
    <h4 className="font-display text-2xl tracking-wider mb-2" style={{ color: C.brandNavy, lineHeight: 1.1 }}>
      {title}
    </h4>
    <p className="font-body text-sm mb-3" style={{ color: `${C.brandNavy}cc`, lineHeight: 1.6 }}>
      {body.length > 180 ? body.slice(0, 180) + '…' : body}
    </p>
    <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.brandNavy}66` }}>
      BY {(author.length > 0 ? author : 'admin').toUpperCase()} • {new Date(date === null ? 0 : date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
    </div>
  </article>
);

export const ResultRow = ({ r, home, away }: { r: News; home: Team | undefined; away: Team | undefined }) => {
  const homeWon = (r.homeScore || 0) > (r.awayScore || 0);
  const awayWon = (r.awayScore || 0) > (r.homeScore || 0);
  return (
    <div className="rounded-lg px-4 py-3 flex items-center gap-3" style={{
      background: C.white,
      border: `1px solid ${C.navyLight}`,
    }}>
      <div className="font-mono text-[9px] tracking-[0.25em] w-14 flex-shrink-0" style={{ color: `${C.brandNavy}66` }}>
        {new Date(r.date || 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}
      </div>
      <div className="flex-1 flex items-center justify-center gap-2 flex-wrap">
        <span className="font-heading text-sm tracking-wider text-right" style={{
          color: homeWon ? C.brandNavy : `${C.brandNavy}88`,
          fontWeight: homeWon ? 700 : 400,
          minWidth: 80,
        }}>{home?.name || '?'}</span>
        <span className="font-display text-xl px-2" style={{
          color: homeWon ? C.green : (awayWon ? `${C.brandNavy}66` : C.brandNavy),
        }}>{r.homeScore}</span>
        <span className="font-mono text-xs" style={{ color: `${C.brandNavy}55` }}>—</span>
        <span className="font-display text-xl px-2" style={{
          color: awayWon ? C.green : (homeWon ? `${C.brandNavy}66` : C.brandNavy),
        }}>{r.awayScore}</span>
        <span className="font-heading text-sm tracking-wider" style={{
          color: awayWon ? C.brandNavy : `${C.brandNavy}88`,
          fontWeight: awayWon ? 700 : 400,
          minWidth: 80,
        }}>{away?.name || '?'}</span>
      </div>
    </div>
  );
};

export const TeamPill = ({ team, fallback, dimmed = false }: { team?: Team | null | undefined; fallback: string | null; dimmed?: boolean }) => {
  if (!team) return (
    <div className="font-mono text-[10px] tracking-wider px-2 py-1 rounded" style={{
      background: `${C.navyLight}33`, color: `${C.cream}66`, opacity: dimmed ? 0.5 : 1,
    }}>{fallback === null || fallback === '' ? '?' : fallback}</div>
  );
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded" style={{
      background: (team.color || C.brandNavy) + 'dd',
      border: `1px solid ${team.color || C.brandNavy}`,
      opacity: dimmed ? 0.55 : 1,
    }}>
      <span className="font-heading tracking-wider text-xs" style={{ color: '#fff', letterSpacing: 1.5 }}>{team.tag}</span>
      <span className="font-display text-sm tracking-wider hidden sm:inline" style={{ color: '#fff' }}>{team.name.toUpperCase()}</span>
    </div>
  );
};

