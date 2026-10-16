import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Ui';
import { C } from '../../theme/theme';


// EditName Modal
export const EditNameModal = ({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (account:Account) => void }) => {
  const [name, setName] = useState(account.username);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setError('');
    const trimmed = name.trim();
    if (trimmed === account.username) { onClose(); return; }
    if (trimmed.length < 3) { setError('Username must be at least 3 characters'); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) { setError('Letters, numbers, and underscores only'); return; }
    setBusy(true);
    try {
      await accountApi.renameAccount(account.id, trimmed);
      onSave({ ...account, username: trimmed });
      onClose();
    } catch (error_) {
      setError('Could not change name: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title="CHANGE USERNAME" maxWidth="max-w-sm">
      <div className="space-y-3">
        <p className="font-body text-sm" style={{ color: `${C.cream}aa` }}>
          This is the name shown on your card and across the league. Letters, numbers, and underscores only.
        </p>
        <input
          type="text"
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded px-3 py-3 text-base font-heading tracking-wider"
          style={{ background: C.navyDeep, border: `1px solid ${C.navyLight}66`, color: C.cream }}
        />
        {error && <div className="font-mono text-xs px-2 py-1 rounded" style={{ background: `${C.red}22`, color: C.redLight }}>{error}</div>}
        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full py-3 font-display tracking-widest text-lg rounded disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
            color: C.onColor,
            boxShadow: `0 4px 16px ${C.green}66`,
          }}
        >{busy ? 'SAVING…' : 'SAVE USERNAME'}</button>
      </div>
    </ModalShell>
  );
};
