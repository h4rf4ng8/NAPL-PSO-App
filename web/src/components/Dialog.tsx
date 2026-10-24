import { useRef, type HTMLAttributes, type ReactNode } from 'react';
import { ASLCrest } from './Branding';
import { Dialog as DialogRoot, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { cn } from '../lib/utils';

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  maxWidth?: string;
  closeOnOutside?: boolean;
};

export function ModalShell({ title, children, onClose, maxWidth = 'max-w-2xl', closeOnOutside = false }: ModalProps) {
  const opener = useRef<HTMLElement | null>(null);
  return <DialogRoot open onOpenChange={open => { if (!open) onClose?.(); }}>
    <DialogContent
      className={cn('gap-5 p-4 sm:p-6', maxWidth)}
      showCloseButton={!!onClose}
      onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => {
        // Programmatic dialogs have no Radix Trigger to restore focus to.
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus();
      }}
      onEscapeKeyDown={event => { if (!onClose) event.preventDefault(); }}
      onInteractOutside={event => { if (!onClose || !closeOnOutside) event.preventDefault(); }}
    >
      <DialogHeader className="pr-10">
        <DialogTitle className="flex items-center gap-3 text-xl">
          <ASLCrest size={28} />{title}
        </DialogTitle>
        <DialogDescription className="sr-only">{onClose ? 'Use Close or press Escape to return to the previous view.' : 'Complete this required step to continue.'}</DialogDescription>
      </DialogHeader>
      {children}
    </DialogContent>
  </DialogRoot>;
}

// Legacy callers supply backdrop styles; Radix now owns the overlay and focus lifecycle.
export function Dialog({ onClose, label, children, className: _className, style: _style, ...props }: HTMLAttributes<HTMLDivElement> & { onClose?: () => void; label: string }) {
  return <ModalShell title={label} onClose={onClose}><div {...props} className="[&>div]:mx-auto">{children}</div></ModalShell>;
}
