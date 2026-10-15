import { CheckCircle, User, XCircle } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from '../accounts/api';
import type { Account } from '../accounts/models';
import { C } from '../../theme/theme';






// Pictures Manager
export const PicturesManager = ({ allPlayers, onRefresh }: { allPlayers: Account[]; onRefresh: () => void }) => {
  const [busy, setBusy] = useState('');
  const [info, setInfo] = useState('');

  // Players who have a picture waiting for review
  const pending = allPlayers.filter(p => p.pendingImageUrl);

  const approve = async (player: Account) => {
    setBusy(player.username); setInfo('');
    try {
      // The pending picture becomes the live picture
      await accountApi.patchAccount(player.id,{imageUrl: player.pendingImageUrl, pendingImageUrl: null});
      setInfo(`✓ ${player.username}'s picture approved`);
      onRefresh?.();
    } catch (error) {
      setInfo('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  const reject = async (player: Account) => {
    if (!confirm(`Reject ${player.username}'s new picture? Their current picture stays unchanged.`)) return;
    setBusy(player.username); setInfo('');
    try {
      // Discard the pending picture; live imageUrl untouched
      await accountApi.patchAccount(player.id,{pendingImageUrl: null});
      setInfo(`${player.username}'s picture rejected`);
      onRefresh?.();
    } catch (error) {
      setInfo('Error: ' + (error instanceof Error ? error.message : String(error)));
    }
    setBusy('');
    setTimeout(() => setInfo(''), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl p-4" style={{
        background: `linear-gradient(135deg, ${C.gold}11 0%, ${C.white} 100%)`,
        border: `1px solid ${C.gold}55`,
      }}>
        <div className="flex items-center gap-2 mb-1">
          <User size={14} style={{ color: C.goldLight }} />
          <span className="font-display text-xl tracking-wider" style={{ color: C.brandNavy }}>PICTURE REVIEW</span>
        </div>
        <p className="font-body text-sm" style={{ color: `${C.brandNavy}aa` }}>
          When a player uploads a new profile picture, it waits here for approval. Their old picture stays on their card until you approve the new one.
        </p>
      </div>

      {info && (
        <div className="font-mono text-xs px-3 py-2 rounded" style={{ background: `${C.green}22`, color: C.green, border: `1px solid ${C.green}44` }}>{info}</div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-lg p-6 text-center" style={{ background: `${C.navyDeep}66`, border: `1px dashed ${C.navyLight}55` }}>
          <CheckCircle size={36} style={{ color: `${C.cream}44`, margin: '0 auto 8px' }} />
          <p className="font-mono text-xs tracking-wider" style={{ color: `${C.cream}66` }}>
            NO PICTURES WAITING FOR REVIEW
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map(p => (
            <div key={p.username} className="rounded-xl p-4" style={{ background: C.white, border: `1px solid ${C.navyLight}` }}>
              <div className="font-display text-lg tracking-wider mb-3" style={{ color: C.brandNavy }}>
                {p.username.toUpperCase()} <span className="font-mono text-[11px]" style={{ color: `${C.brandNavy}66` }}>• {p.position}</span>
              </div>
              <div className="flex gap-4 flex-wrap">
                {/* Current picture */}
                <div className="text-center">
                  <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: `${C.brandNavy}66` }}>CURRENT</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: 10, overflow: 'hidden',
                    background: `${C.navyDeep}22`, border: `1px solid ${C.navyLight}`,
                  }}>
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="current" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={36} style={{ color: `${C.brandNavy}33` }} />
                      </div>
                    )}
                  </div>
                </div>
                {/* Pending picture */}
                <div className="text-center">
                  <div className="font-mono text-[10px] tracking-[0.2em] mb-1" style={{ color: C.goldLight }}>NEW (PENDING)</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: 10, overflow: 'hidden',
                    background: `${C.navyDeep}22`, border: `2px solid ${C.goldLight}`,
                  }}>
                    <img src={p.pendingImageUrl || undefined} alt="pending" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                </div>
                {/* Actions */}
                <div className="flex flex-col gap-2 justify-center flex-1 min-w-[140px]">
                  <button
                    onClick={() => approve(p)}
                    disabled={busy === p.username}
                    className="py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{
                      background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
                      color: C.onColor, boxShadow: `0 2px 8px ${C.green}66`,
                    }}
                  ><CheckCircle size={14} /> {busy === p.username ? 'WORKING…' : 'APPROVE'}</button>
                  <button
                    onClick={() => reject(p)}
                    disabled={busy === p.username}
                    className="py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: `${C.red}22`, color: C.red, border: `1px solid ${C.red}44` }}
                  ><XCircle size={14} /> REJECT</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Lets super admins tune the per-position stat weights used for rankings.
// Manages the Discord webhook URL for #roster-transactions auto-posts.
// Every signing / transfer / release logged via db.logTransfer fires a
// POST to this URL with a formatted embed. Clear the field to disable.
