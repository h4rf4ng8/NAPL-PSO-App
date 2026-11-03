import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Dialog';
import { C } from '../../theme/theme';

// EditName modal — players rename themselves. Admins can rename any player via
// the ADMIN → PLAYERS panel. This modal is for self-service only.
export const EditNameModal = ({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved?: (updated: Account) => void }) => {
  const [name, setName] = useState(account.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    const trimmed = name.trim();
    if (trimmed === account.username) { onClose(); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (trimmed.length > 64) { setError('Name must be at most 64 characters.'); return; }
    // Match server regex so admins see a clear message instead of a bare 400.
    if (!/^[\p{L}\p{N}_. -]+$/u.test(trimmed)) { setError('Only letters, numbers, spaces, dots, hyphens, and underscores.'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(account.id, { username: trimmed });
      // Hand the caller an updated snapshot so the UI reflects the new name
      // without a full refetch; the parent chooses whether to reload too.
      onSaved?.({ ...account, username: trimmed });
      onClose();
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Could not rename: ${detail}`);
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title="Change your username">
      <p className="font-mono text-xs mb-3" style={{ color: `${C.cream}aa` }}>
        Your old name will still show on past votes, transfers, and match results — those are historical records and never change.
      </p>
      <input
        type="text" value={name} autoFocus maxLength={64}
        onChange={event => setName(event.target.value)}
        className="w-full rounded px-3 py-2 font-mono mb-2 focus:outline-none"
        style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
      />
      {error && <p role="alert" className="font-mono text-xs mb-2" style={{ color: C.redLight }}>{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} disabled={busy} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: `${C.navyLight}66`, color: C.cream }}>CANCEL</button>
        <button onClick={() => { void handleSave(); }} disabled={busy || name.trim() === account.username} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: C.goldLight, color: C.brandNavy }}>{busy ? 'SAVING…' : 'SAVE'}</button>
      </div>
    </ModalShell>
  );
};
