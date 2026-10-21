import { auth } from '../../auth/session';
import { XCircle } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ASLCrest } from '../../components/Branding';
import { useDialog } from '../../components/Dialog';
import { C } from '../../theme/theme';

import { POSITIONS } from '../../utils/league';
import { POS } from '@napl/contracts/league';

// Onboarding Modal
export const OnboardingModal = ({ account, onComplete }: { account: Account; onComplete: (account:Account) => void }) => {
  const dialogRef = useDialog();
  const [strikersId, setStrikersId] = useState('');
  const [position, setPosition] = useState(account.position || POS.CM);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const handleSave = async () => {
    setErr('');
    const sid = strikersId.trim();
    if (!sid) { setErr('Strikers Club Player ID is required.'); return; }
    if (!/^\d{2,15}$/.test(sid)) { setErr('Strikers Club Player ID must be 2-15 digits.'); return; }
    if (!position) { setErr('Please choose your primary position.'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(account.id,{strikersId: sid, position});
      const updated = await auth.getCurrent();
      if (updated) onComplete?.(updated);
    } catch (error) {
      setErr('Could not save: ' + (error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  };

  return (
    // No close button — this modal MUST be completed. User can sign out from
    // the top-right if they really need to escape.
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Welcome to ASL" tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{
      background: `${C.black}dd`, backdropFilter: 'blur(10px)',
    }}>
      <div className="w-full max-w-md rounded-xl p-7 fade-in" style={{
        background: C.white,
        border: `1px solid ${C.navyLight}`,
        boxShadow: `0 20px 60px ${C.brandNavy}44`,
      }}>
        <div className="text-center mb-5">
          <div className="flex justify-center mb-3">
            <ASLCrest size={70} />
          </div>
          <h2 className="font-display text-2xl tracking-[0.15em]" style={{ color: C.cream }}>WELCOME TO ASL</h2>
          <p className="font-mono text-[11px] tracking-wider mt-2 leading-relaxed" style={{ color: `${C.cream}99` }}>
            TWO QUICK THINGS BEFORE YOU GET STARTED —
            <br />
            REQUIRED TO JOIN ANY TEAM.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}99` }}>
              STRIKERS CLUB PLAYER ID *
            </label>
            <input
              type="text"
              value={strikersId}
              onChange={(e) => setStrikersId(e.target.value.replaceAll(/\D/g, ''))}
              placeholder="e.g. 365702"
              className="w-full px-3 py-2 font-mono text-sm focus:outline-none rounded"
              style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
              autoFocus
            />
            <div className="font-mono text-[9px] mt-1 leading-relaxed" style={{ color: `${C.cream}77` }}>
              Numbers only. Find it in-game on your profile. Once set, only an admin can change it.
            </div>
          </div>

          <div>
            <label className="font-mono text-[10px] tracking-[0.2em] block mb-1" style={{ color: `${C.cream}99` }}>
              PRIMARY POSITION *
            </label>
            <div className="grid grid-cols-5 gap-1">
              {POSITIONS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className="py-2 font-heading tracking-wider text-xs rounded"
                  style={position === p
                    ? { background: C.green, color: C.onColor }
                    : { background: C.navyDeep, color: `${C.cream}99`, border: `1px solid ${C.navyLight}66` }
                  }
                >{p}</button>
              ))}
            </div>
            {/* FLEX hint — explains why someone might pick FLEX over a specific role */}
            <div className="font-body text-sm mt-2 leading-relaxed" style={{ color: `${C.cream}cc` }}>
              Select <b style={{ color: C.goldLight }}>FLEX</b> if you regularly play both forward and defense — your stats will be tracked more accurately.
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 px-3 py-2 rounded font-mono text-xs" style={{
              background: `${C.red}22`, border: `1px solid ${C.red}66`, color: C.redLight,
            }}>
              <XCircle size={12} /> {err}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={busy}
            className="w-full py-3 font-display tracking-[0.15em] text-lg transition-all disabled:opacity-50 rounded"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 4px 16px ${C.green}66`,
            }}
          >{busy ? 'SAVING...' : 'COMPLETE PROFILE'}</button>
        </div>
      </div>
    </div>
  );
};
