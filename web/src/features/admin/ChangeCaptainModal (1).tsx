import { useState } from 'react';
import { ModalShell } from '../../components/Dialog';
import { teams as teamApi } from '../teams/api';
import type { Team } from '../teams/models';
import { Crown } from 'lucide-react';
import { C } from '../../theme/theme';

// Admin-only modal for transferring team captaincy. Lists the team's members,
// marks the current captain, lets admin pick someone else and submit.
export const ChangeCaptainModal = ({ team, onClose, onSaved }: { team: Team; onClose: () => void; onSaved: () => void }) => {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const current = team.ownerUsername;
  const candidates = team.members.filter(username => username !== current);

  const handleTransfer = async () => {
    if (!picked) return;
    setBusy(true); setError('');
    try {
      await teamApi.changeOwner(team.id, picked);
      onSaved();
    } catch (transferError) {
      const detail = transferError instanceof Error ? transferError.message : String(transferError);
      setError(`Could not transfer captaincy: ${detail}`);
    }
    setBusy(false);
  };

  return (
    <ModalShell onClose={onClose} title={`Change captain · ${team.name}`}>
      <p className="font-mono text-xs mb-3" style={{ color: `${C.cream}aa` }}>
        Current captain: <span style={{ color: C.goldLight }}>{current}</span>
      </p>
      {candidates.length === 0 ? (
        <p className="font-mono text-xs mb-3" style={{ color: `${C.cream}aa` }}>
          No other members on this roster. Add a player to the team first, then come back to transfer captaincy.
        </p>
      ) : (
        <div className="space-y-1 mb-3 max-h-64 overflow-y-auto">
          {candidates.map(username => (
            <button
              key={username}
              onClick={() => setPicked(username)}
              className="w-full text-left px-3 py-2 rounded flex items-center justify-between transition-colors"
              style={{
                background: picked === username ? `${C.gold}33` : C.navyDeep,
                border: `1px solid ${picked === username ? C.gold : C.navyLight}`,
                color: C.cream,
              }}
            >
              <span className="font-mono text-sm">{username}</span>
              {picked === username && <Crown size={14} style={{ color: C.goldLight }} />}
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="font-mono text-xs mb-2" style={{ color: C.redLight }}>{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} disabled={busy} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: `${C.navyLight}66`, color: C.cream }}>CANCEL</button>
        <button onClick={() => { void handleTransfer(); }} disabled={busy || !picked} className="flex-1 py-2 font-heading tracking-wider text-xs rounded disabled:opacity-50" style={{ background: C.goldLight, color: C.brandNavy }}>{busy ? 'TRANSFERRING…' : 'TRANSFER'}</button>
      </div>
    </ModalShell>
  );
};
