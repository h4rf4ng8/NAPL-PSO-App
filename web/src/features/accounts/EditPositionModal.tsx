import { useEffect, useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account, PositionRequest } from './models';
import { ModalShell } from '../../components/Dialog';
import { request } from '../../api/http';
import type { Page } from '../../api/page';
import { C } from '../../theme/theme';

import { POSITIONS } from '../../utils/league';

// EditPosition Modal
export const EditPositionModal = ({ account, onClose }: { account: Account; onClose: () => void }) => {
  const [pos, setPos] = useState(account.position);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<Pick<PositionRequest, 'id' | 'toPos' | 'fromPos'> | null>(null);   // {toPos} if request is already pending
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Every self-service position change requires admin approval, no exceptions.
  // (Previously 0-game players could switch freely, but that let people
  // slip through — simpler and safer to route everyone through the queue.)
  // Admins can still change any player's position directly via ADMIN → PLAYERS.
  const games = account.stats?.games || 0;

  // Check if a pending request already exists for this account
  useEffect(() => {
    const controller = new AbortController();
    void request<Page<Pick<PositionRequest, 'id' | 'toPos' | 'fromPos'>>>('/api/position-requests?status=pending&scope=mine', 'GET', undefined, controller.signal).then(page => { setPending(page.nodes[0] ?? null); }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load current request.'); });
    return () => controller.abort();
  }, [account.id]);

  const handleSubmit = async () => {
    setError(''); setInfo('');
    if (pos === account.position) { onClose(); return; }
    setBusy(true);
    try {
      await accountApi.createPositionRequest({ toPos: pos, reason: reason.trim() });
      setInfo('✓ Request submitted — an admin will review it shortly.');
      setTimeout(() => onClose(), 1800);
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const withdrawRequest = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await accountApi.deletePositionRequest(pending.id);
      setPending(null);
      setInfo('Request withdrawn.');
    } catch (error_) {
      setError('Could not withdraw: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title="POSITION" maxWidth="max-w-sm">
      {/* Current pending request — show status + withdraw option */}
      {pending && (
        <div className="rounded-lg p-3 mb-3" style={{
          background: `${C.gold}22`, border: `1px solid ${C.gold}66`,
        }}>
          <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: C.goldLight }}>
            ◆ PENDING ADMIN REVIEW
          </div>
          <div className="font-body text-sm mb-2" style={{ color: C.cream }}>
            Your request to change from <b>{pending.fromPos}</b> → <b style={{ color: C.goldLight }}>{pending.toPos}</b> is awaiting approval.
          </div>
          <button
            onClick={withdrawRequest}
            disabled={busy}
            className="px-3 py-1.5 font-heading tracking-wider text-xs rounded disabled:opacity-50"
            style={{ background: `${C.red}66`, color: C.cream }}
          >{busy ? 'WITHDRAWING…' : 'WITHDRAW REQUEST'}</button>
        </div>
      )}

      {/* Approval notice — tells player what will happen */}
      {!pending && (
        <div className="rounded-lg p-3 mb-3" style={{
          background: `${C.brandNavy}44`, border: `1px solid ${C.navyLight}66`,
        }}>
          <div className="font-mono text-[10px] tracking-widest mb-1" style={{ color: C.goldLight }}>
            ◆ NEEDS APPROVAL
          </div>
          <div className="font-body text-sm" style={{ color: C.cream }}>
            You're currently <b>{account.position}</b>{games > 0 ? ` with ${games} game${games === 1 ? '' : 's'} played` : ''}.
            Position changes require admin approval to keep stats consistent and prevent abuse.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 mb-2">
        {POSITIONS.map(p => {
          const active = pos === p;
          const disabled = !!pending;
          return (
            <button
              key={p}
              disabled={disabled}
              onClick={() => setPos(p)}
              className="py-4 font-display text-2xl transition-all rounded disabled:opacity-40"
              style={{
                background: active ? C.green : `${C.navyDeep}`,
                color: active ? C.onColor : `${C.cream}88`,
                border: `1px solid ${active ? C.green : C.navyLight}66`,
                boxShadow: active ? `0 2px 8px ${C.green}66` : 'none',
              }}
            >{p}</button>
          );
        })}
      </div>
      {/* FLEX hint */}
      <div className="font-body text-sm mb-3 leading-relaxed px-1" style={{ color: C.cream }}>
        Select <b style={{ color: C.goldLight }}>FLEX</b> if you regularly play both forward and defense — your stats will be tracked more accurately.
      </div>

      {/* Reason field — shown whenever a change is being prepared */}
      {!pending && pos !== account.position && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, 200))}
          placeholder="Optional: why do you want to change position? (max 200 chars)"
          className="w-full px-3 py-2 font-body text-sm rounded mb-3"
          style={{ background: C.white, border: `1px solid ${C.navyLight}`, color: C.brandNavy, resize: 'vertical', minHeight: 60 }}
        />
      )}

      {error && <div className="font-mono text-xs mb-2 px-3 py-2 rounded" style={{ background: `${C.red}22`, color: C.red }}>{error}</div>}
      {info && <div className="font-mono text-xs mb-2 px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.greenLight }}>{info}</div>}

      {!pending && (
        <button
          onClick={handleSubmit}
          disabled={busy || pos === account.position}
          className="w-full py-3 font-display tracking-widest text-lg rounded disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66`,
          }}
        >{busy ? 'SAVING…' : 'SUBMIT REQUEST'}</button>
      )}
    </ModalShell>
  );
};
