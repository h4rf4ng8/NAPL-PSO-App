import { uploadImage } from '../../api/media';
import { auth } from '../../auth/session';
import { Clock, User } from 'lucide-react';
import { useState } from 'react';
import { accounts as accountApi } from './api';
import type { Account } from './models';
import { ModalShell } from '../../components/Dialog';

import { compressImage } from '../../utils/input';
import { MediaImage } from '../../components/MediaImage';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '../../components/ui/alert';
import { Label } from '../../components/ui/label';
import { Input } from '../../components/ui/input';



// UploadImage Modal
export const UploadImageModal = ({ account, onClose, onSave }: { account: Account; onClose: () => void; onSave: (account:Account) => void }) => {
  // Show the pending image if there is one, else the live image
  const [preview, setPreview] = useState(account.pendingImageUrl || account.imageUrl || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

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

  return <ModalShell onClose={onClose} title="Player image" maxWidth="max-w-md">
    {submitted ? <div className="space-y-4 py-4 text-center">
      <Clock className="mx-auto size-10 text-warning" aria-hidden="true" />
      <h3 className="text-lg font-semibold">Submitted for review</h3>
      <p className="text-sm text-muted-foreground">Your new picture will appear on your card once a league admin approves it. Your current picture stays until then.</p>
      <Button onClick={onClose}>Got it</Button>
    </div> : <div className="space-y-5">
      {account.pendingImageUrl && <Alert><Clock className="size-4" /><AlertTitle>Awaiting review</AlertTitle><AlertDescription>You already have a picture awaiting admin review.</AlertDescription></Alert>}
      <div className="mx-auto aspect-square w-full max-w-60 overflow-hidden rounded-xl border bg-muted">
        {preview ? <MediaImage src={preview} alt="Player image preview" className="size-full object-cover" /> : <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground"><User className="size-12" /><span className="text-sm">No image</span></div>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="player-image">Choose a picture</Label>
        <Input id="player-image" type="file" accept="image/*" disabled={busy} onChange={event => handleFile(event.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">Images are resized automatically. New pictures require admin approval.</p>
      </div>
      {preview && <Button variant="outline" className="w-full" disabled={busy} onClick={handleRemove}>Remove picture</Button>}
      {!preview && (account.imageUrl || account.pendingImageUrl) && <p className="text-sm text-muted-foreground">Saving will remove your current and pending pictures immediately.</p>}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button className="w-full" onClick={handleSave} disabled={busy}>{busy ? 'Saving…' : 'Save picture'}</Button>
    </div>}
  </ModalShell>;
};
