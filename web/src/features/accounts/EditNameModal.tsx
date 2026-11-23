import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Dialog';
import { C } from '../../theme/theme';

// EditName modal — players request a rename. The request is stored as a
// pending change; an admin reviews and approves/denies it from the Admin →
// PLAYERS panel. Admins renaming someone else bypass this queue entirely.
export const EditNameModal = ({ account, onClose, onSaved }: { account: Account; onClose: () => void; onSaved?: (updated: Account) => void }) => {
  const [name, setName] = useState(account.pendingUsername ?? account.username);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hasPending = Boolean(account.pendingUsername);

  const handleSave = async () => {
    setError('');
    const trimmed = name.trim();
    if (trimmed === account.username) { onClose(); return; }
    if (trimmed.length < 2) { setError('Name must be at least 2 characters.'); return; }
    if (trimmed.length > 64) { setError('Name must be at most 64 characters.'); return; }
    if (!/^[\p{L}\p{N}_. -]+$/u.test(trimmed)) { setError('Only letters, numbers, spaces, dots, hyphens, and underscores.'); return; }
    setBusy(true);
    try {
      await accountApi.patchAccount(account.id, { username: trimmed });
      // Store the pending request on the local account snapshot so the UI
      // reflects it immediately without a full refetch. The real username
      // only changes after an admin approves the request.
      onSaved?.({ ...account, pendingUsername: trimmed });
      onClose();
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : String(saveError);
      setError(`Could not submit rename: ${detail}`);
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title="Request a new username">
      <p className="font-mono text-xs mb-3" style={{ color: `${C.cream}aa` }}>
        Rename requests require admin approval. Your current name stays until an admin reviews the request.
        Historical records (past votes, transfers, match results) will keep your old name.
      </p>
      {hasPending && (
        <p className="font-mono text-xs mb-3 px-2 py-1 rounded" style={{ background: `${C.gold}22`, color: C.goldLight, border: `1px solid ${C.gold}66` }}>
          Pending request: <strong>{account.pendingUsername}</strong>. Editing will replace it.
        </p>
      )}
      <input
        type="text" value={name} autoFocus maxLength={64}
        onChange={event => setName(event.target.value)}
        className="w-full rounded px-3 py-2 font-mono mb-2 focus:outline-none"
        style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}`, color: C.cream }}
      />
      {error && <p role="alert" className="font-mono text-xs mb-2" style={{ color: C.redLight }}>{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} disabled={busy} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: `${C.navyLight}66`, color: C.cream }}>CANCEL</button>
        <button onClick={() => { void handleSave(); }} disabled={busy || name.trim() === account.username} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: C.goldLight, color: C.brandNavy }}>{busy ? 'SUBMITTING…' : 'REQUEST'}</button>
      </div>
    </ModalShell>
  );
};
