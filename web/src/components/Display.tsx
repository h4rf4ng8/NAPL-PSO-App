import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import type { News, TeamSummary as Team } from '../api/models';
import { cn } from '../lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

export const Metric = ({ icon, label, value, accent }: { icon?: ReactNode; label: string; value: ReactNode; accent?: string }) => (
  <div className="min-w-0 border-l-2 border-primary/30 px-4 py-2" style={{ borderLeftColor: accent }}>
    <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
      {icon && <span className="inline-flex size-4 items-center justify-center" aria-hidden="true">{icon}</span>}{label}
    </div>
    <div className="text-3xl font-semibold tabular-nums">{value}</div>
  </div>
);

export const RecordBox = ({ value, label, color }: { value: ReactNode; label: string; color: string }) => (
  <div className="p-3 text-center">
    <div className="text-3xl font-semibold tabular-nums" style={{ color }}>{value}</div>
    <div className="mt-1 text-sm font-semibold text-muted-foreground">{label}</div>
  </div>
);

export const ResultBadge = ({ result, small }: { result: string; small?: boolean }) => (
  <Badge variant="outline" className={cn('shrink-0 justify-center p-0 font-semibold', small ? 'size-7 text-sm' : 'size-10 text-lg',
    result === 'W' ? 'border-success/30 bg-success/10 text-success' : (result === 'L' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning'))}>
    {result}
  </Badge>
);

export const EmptyState = ({ icon, text }: { icon?: ReactNode; text: string }) => (
  <div className="px-4 py-12 text-center text-base text-muted-foreground">
    {icon && <div className="mb-3 flex justify-center" aria-hidden="true">{icon}</div>}{text}
  </div>
);

export const QuickStat = ({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) => (
  <Metric label={label} value={value} accent={accent} />
);

export const Section = ({ title, children, onMore }: { title: string; children: ReactNode; onMore?: () => void }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {onMore && <Button variant="ghost" onClick={onMore} aria-label={`More ${title.toLowerCase()}`}>More <ChevronRight /></Button>}
    </div>
    {children}
  </section>
);

export const ResultRow = ({ r, home, away }: { r: Pick<News, 'date' | 'homeScore' | 'awayScore'>; home: Pick<Team, 'name'> | null | undefined; away: Pick<Team, 'name'> | null | undefined }) => {
  const homeWon = (r.homeScore || 0) > (r.awayScore || 0);
  const awayWon = (r.awayScore || 0) > (r.homeScore || 0);
  return <div className="flex flex-col gap-3 border-b py-4 last:border-0 sm:flex-row sm:items-center">
    <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.date || 0).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
    <div className="grid min-w-0 flex-1 grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
      <span className={cn('break-words text-right', homeWon ? 'font-semibold' : 'text-muted-foreground')}>{home?.name || '?'}</span>
      <span className="whitespace-nowrap text-lg font-semibold tabular-nums"><span className={homeWon ? 'text-success' : undefined}>{r.homeScore}</span> <span className="text-muted-foreground">–</span> <span className={awayWon ? 'text-success' : undefined}>{r.awayScore}</span></span>
      <span className={cn('break-words', awayWon ? 'font-semibold' : 'text-muted-foreground')}>{away?.name || '?'}</span>
    </div>
  </div>;
};

export const TeamPill = ({ team, fallback, dimmed = false }: { team?: { name: string; tag: string; color: string | null } | null | undefined; fallback: string | null; dimmed?: boolean }) => (
  <Badge variant="secondary" className={cn('max-w-full gap-2 py-1.5', dimmed && 'opacity-60')}>
    {team ? <><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: team.color || 'hsl(var(--primary))' }} aria-hidden="true" /><span>{team.tag}</span><span className="hidden truncate font-normal sm:inline">{team.name}</span></> : (fallback === null || fallback === '' ? '?' : fallback)}
  </Badge>
);
