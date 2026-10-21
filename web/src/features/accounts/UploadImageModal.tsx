import { uploadImage } from '../../api/media';
import { auth } from '../../auth/session';
import { Clock, Plus, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Dialog';
import { C } from '../../theme/theme';
import { compressImage } from '../../utils/input';
import { MediaImage } from '../../components/MediaImage';


// UploadImage Modal
export const UploadImageModal = ({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (account:Account) => void }) => {
  // Show the pending image if there is one, else the live image
  const [preview, setPreview] = useState(account.pendingImageUrl || account.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file');
      return;
    }
    setError('');
    setBusy(true);
    try {
      const dataUrl = await compressImage(file, 400, 0.82);
      setPreview(dataUrl);
    } catch (error_) {
      setError('Could not process image: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const handleSave = async () => {
    setBusy(true);
    setError('');
    try {
      if (preview === null) {
        // Removing the picture entirely — this takes effect immediately
        // (removing isn't something that needs moderation)
        await accountApi.patchAccount(account.id,{imageUrl: null, pendingImageUrl: null});
        const updated = await auth.getCurrent();
        if (updated) onSave(updated);
      } else if (preview === account.imageUrl || preview === account.pendingImageUrl) {
        // No change
        onClose();
        setBusy(false);
        return;
      } else {
        // New picture — goes to pending, awaits admin approval.
        // The old imageUrl stays live until an admin approves.
        const sourceUrl = await uploadImage('account-image', account.id, preview);
        await accountApi.patchAccount(account.id,{pendingImageUrl: sourceUrl});
        const updated = await auth.getCurrent();
        if (updated) onSave(updated);
        setSubmitted(true);
        setBusy(false);
        return;
      }
      onClose();
    } catch (error_) {
      setError('Could not save: ' + (error_ instanceof Error ? error_.message : String(error_)));
    }
    setBusy(false);
  };

  const handleRemove = () => {
    setPreview(null);
  };

  // After submitting a new picture for review, show a confirmation instead
  if (submitted) {
    return (
      <ModalShell onClose={onClose} title="PLAYER IMAGE" maxWidth="max-w-md">
        <div className="text-center py-6 space-y-3">
          <div className="flex justify-center">
            <Clock size={48} style={{ color: C.goldLight }} />
          </div>
          <div className="font-display text-2xl tracking-wider" style={{ color: C.brandNavy }}>
            SUBMITTED FOR REVIEW
          </div>
          <p className="font-body text-sm max-w-xs mx-auto" style={{ color: `${C.brandNavy}aa` }}>
            Your new picture has been sent to the league admins. It will appear on your card once approved. Your current picture stays until then.
          </p>
          <button
            onClick={onClose}
            className="mt-2 px-6 py-2.5 font-heading tracking-wider text-sm rounded"
            style={{ background: C.brandNavy, color: C.onColor }}
          >GOT IT</button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell onClose={onClose} title="PLAYER IMAGE" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Pending notice if a picture is already awaiting review */}
        {account.pendingImageUrl && (
          <div className="rounded-lg px-3 py-2 flex items-center gap-2" style={{
            background: `${C.gold}18`, border: `1px solid ${C.gold}55`,
          }}>
            <Clock size={14} style={{ color: C.goldLight }} />
            <span className="font-mono text-[11px] tracking-wider" style={{ color: C.brandNavy }}>
              YOU HAVE A PICTURE AWAITING ADMIN REVIEW
            </span>
          </div>
        )}
        <div className="flex justify-center">
          <div className="relative" style={{
            width: 240, height: 240, overflow: 'hidden',
            borderRadius: 12,
            background: `${C.navyDeep}88`,
            border: `2px solid ${C.navyLight}66`,
          }}>
            {preview ? (
              <MediaImage src={preview} alt="preview" style={{
                width: '100%', height: '100%', objectFit: 'cover',
              }} />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center font-mono text-xs tracking-wider" style={{ color: `${C.cream}55` }}>
                <User size={48} className="mb-2" />
                NO IMAGE
              </div>
            )}
          </div>
        </div>

        {/* Hidden file input + tap to pick */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex-1 py-2.5 font-heading tracking-wider text-xs rounded transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 2px 8px ${C.green}66`,
            }}
          >
            <Plus size={12} /> {preview ? 'CHANGE IMAGE' : 'PICK IMAGE'}
          </button>
          {preview && (
            <button
              onClick={handleRemove}
              disabled={busy}
              className="px-3 py-2.5 font-heading tracking-wider text-xs rounded"
              style={{
                background: `${C.red}22`, color: C.redLight,
                border: `1px solid ${C.red}66`,
              }}
            >REMOVE</button>
          )}
        </div>

        {error && (
          <div className="font-mono text-xs px-3 py-2 rounded" style={{
            background: `${C.red}22`, color: C.redLight, border: `1px solid ${C.red}44`,
          }}>{error}</div>
        )}

        <div className="font-mono text-[10px] tracking-wider text-center" style={{ color: `${C.cream}55` }}>
          IMAGES ARE AUTO-RESIZED TO 400PX. ANY IMAGE WORKS.
        </div>

        <button
          onClick={handleSave}
          disabled={busy}
          className="w-full py-2.5 font-heading tracking-wider text-sm rounded disabled:opacity-50"
          style={{
            background: C.brandNavy, color: C.onColor,
            boxShadow: `0 2px 8px ${C.brandNavy}66`,
          }}
        >{busy ? 'SAVING...' : 'SAVE'}</button>
      </div>
    </ModalShell>
  );
};

