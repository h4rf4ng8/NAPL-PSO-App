import {
ChevronRight,
Star,
X
} from 'lucide-react';
import React,{ useEffect,useRef } from 'react';
import type { News,Team } from '../api/models';
import { C } from '../theme/theme';
import { ASLCrest } from './Icons';

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}88` }}>{label}</label>
    {children}
  </div>
);

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
Keeps keyboard focus inside the active dialog, then returns it to its opener.
*/
export function useDialog(onClose?: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    (controls()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      // Only the topmost dialog handles keys when a nested editor opens.
      if (!dialog.contains(document.activeElement)) return;
      if (event.key === 'Escape' && closeRef.current) {
        event.preventDefault(); event.stopPropagation(); closeRef.current();
      } else if (event.key === 'Tab') {
        const elements = controls();
        const first = elements[0]; const last = elements.at(-1);
        if (!first || !last) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    dialog.addEventListener('keydown', keydown);
    return () => {
      dialog.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  return dialogRef;
}

export function Dialog({onClose,label,children,...props}: React.HTMLAttributes<HTMLDivElement> & {onClose: () => void;label:string}) {
  const dialogRef=useDialog(onClose);
  return <div {...props} ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div>;
}

// ============ MODAL WRAPPER ============
export const ModalShell = ({ onClose, title, children, maxWidth = 'max-w-2xl' }: { onClose: () => void; title: string; children: React.ReactNode; maxWidth?: string }) => {
  const dialogRef = useDialog(onClose);
  return (
  <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
    background: `${C.black}cc`, backdropFilter: 'blur(8px)',
  }}>
    <div className={`${maxWidth} w-full my-8 rounded-xl fade-in relative`} style={{
      background: C.white,
      border: `1px solid ${C.navyLight}`,
      boxShadow: `0 20px 60px ${C.brandNavy}33`,
    }}>
      <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl" style={{
        background: `linear-gradient(90deg, ${C.brandNavy} 0%, ${C.green} 50%, ${C.red} 100%)`,
      }} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <ASLCrest size={28} />
            <h2 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>{title}</h2>
          </div>
          <button aria-label="Close dialog" onClick={onClose} className="p-1.5 rounded transition-all hover:scale-110" style={{
            background: `${C.navyLight}44`, color: C.cream,
          }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  </div>
);
};

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

export const SmallStat = ({ value, label }: { value: React.ReactNode; label: string }) => (
  <div className="rounded p-2 text-center" style={{ background: `${C.navyLight}33` }}>
    <div className="font-display text-2xl" style={{ color: C.cream }}>{value}</div>
    <div className="font-mono text-[9px] tracking-widest" style={{ color: `${C.cream}66` }}>{label}</div>
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

// Big +/- number input - much easier than typing on mobile
export const BigNumberInput = ({ value, onChange, min = 0, max = 999 }: { value: number; onChange: (value:number) => void; min?: number; max?: number }) => (
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={() => onChange(Math.max(min, (Number(value) || 0) - 1))}
      className="w-12 h-12 rounded font-display text-2xl flex items-center justify-center"
      style={{ background: `${C.brandNavy}cc`, color: C.cream, border: `1px solid ${C.navyLight}66` }}
    >−</button>
    <input
      type="number"
      value={value}
      min={min} max={max}
      onChange={(e) => {
        const v = Math.trunc(Number(e.target.value));
        onChange(Number.isNaN(v) ? 0 : Math.max(min, Math.min(max, v)));
      }}
      className="flex-1 rounded text-center font-display text-2xl py-2"
      style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
    />
    <button
      type="button"
      onClick={() => onChange(Math.min(max, (Number(value) || 0) + 1))}
      className="w-12 h-12 rounded font-display text-2xl flex items-center justify-center"
      style={{ background: `${C.green}cc`, color: C.onColor, border: `1px solid ${C.greenLight}88` }}
    >+</button>
  </div>
);

export const StatField = ({ label, value, onChange, hint }: { label: string; value: number; onChange: (value:number) => void; hint?: string }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}aa` }}>
      {label}{hint && <span className="opacity-60 normal-case ml-1">{hint}</span>}
    </label>
    <BigNumberInput value={value} onChange={onChange} />
  </div>
);

export const ToggleField = ({ label, value, onChange }: { label: string; value: boolean; onChange: (value:boolean) => void }) => (
  <div>
    <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}aa` }}>{label}</label>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="w-full py-3 rounded font-heading tracking-wider text-sm"
      style={{
        background: value ? C.greenLight : `${C.navyDeep}`,
        color: value ? C.onColor : `${C.cream}77`,
        border: `1px solid ${value ? C.greenLight : C.navyLight}66`,
      }}
    >{value ? '✓ YES' : 'NO'}</button>
  </div>
);

export const StatLine = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-baseline px-2 py-1.5 rounded" style={{
    background: `${C.brandNavy}66`,
  }}>
    <span style={{ color: `${C.cream}77` }}>{label}</span>
    <span className="font-display text-sm" style={{ color: C.cream }}>{value}</span>
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

