import { X } from 'lucide-react';
import React, { useEffect, useRef } from 'react';
import { C } from '../theme/theme';
import { ASLCrest } from './Branding';

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const activeDialogs: HTMLDivElement[] = [];
const originalState = { overflow: '', opener: null as Element | null };

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
    if (activeDialogs.length === 0) {
      originalState.overflow = document.body.style.overflow;
      originalState.opener = opener;
    }
    activeDialogs.push(dialog);
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll<HTMLElement>(focusableSelector)].filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    (controls()[0] ?? dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      // Only the topmost dialog handles keys when a nested editor opens.
      if (activeDialogs.at(-1) !== dialog) return;
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
      const wasTop = activeDialogs.at(-1) === dialog;
      activeDialogs.splice(activeDialogs.indexOf(dialog), 1);
      if (activeDialogs.length === 0) {
        document.body.style.overflow = originalState.overflow;
        if (originalState.opener instanceof HTMLElement && originalState.opener.isConnected) originalState.opener.focus();
        originalState.opener = null;
      } else if (wasTop && opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
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
  return (
  <Dialog onClose={onClose} label={title} className="dialog-backdrop" style={{
    background: `${C.black}cc`,
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
  </Dialog>
);
};
