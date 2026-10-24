import React from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {Account, TeamSummary as Team} from '../api/models';

import { PlayerCard } from './PlayerCard';
import { ModalShell } from './Dialog';
import { renderCardToBlob, downloadCardBlob } from './player-card-image';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';

type CardProps = { account: Account; team?: Team | null | undefined; onClose: () => void; children?: React.ReactNode };

export const ShareableCardModal = ({ account, onClose, ...props }: CardProps) => (
  <ModalShell title={`${account.username}'s player card`} onClose={onClose} maxWidth="max-w-xl" closeOnOutside>
    <ShareableCardContent account={account} onClose={onClose} {...props} />
  </ModalShell>
);

export const ShareableCardContent = ({ account, team, onClose, children }: CardProps) => {
  const lifetime = React.useRef<AbortController | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); clearTimeout(copiedTimer.current); };
  }, []);
  const close = () => { lifetime.current?.abort(); onClose(); };
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleDownload = async () => {
    const signal = lifetime.current?.signal;
    setDownloading(true);
    setError(''); setInfo('');
    try {
      const blob = await renderCardToBlob(cardRef.current, signal);
      if (signal?.aborted) return;
      downloadCardBlob(blob, account.username);
      setInfo('Card downloaded!');
    } catch (error_) {
      if (signal?.aborted) return;
      setError(error_ instanceof Error ? error_.message : 'Could not generate image. Try again.');
    }
    if (!signal?.aborted) setDownloading(false);
  };

  const handleCopyLink = async () => {
    const signal = lifetime.current?.signal;
    setError(''); setInfo('');
    const url = `${location.origin}${location.pathname}?player=${encodeURIComponent(account.username)}`;
    try {
      await navigator.clipboard.writeText(url);
      if (signal?.aborted) return;
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      if (!signal?.aborted) setError('Could not copy link.');
    }
  };

  const handleNativeShare = async () => {
    const signal = lifetime.current?.signal;
    setError(''); setInfo('');
    if (!navigator.share) {
      return handleDownload();
    }
    setDownloading(true);
    try {
      const blob = await renderCardToBlob(cardRef.current, signal);
      if (signal?.aborted) return;
      const file = new File([blob], `${account.username}-ASL-card.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${account.username} — ASL Player Card`,
          text: `Check out my ASL player card!`,
        });
      } else {
        downloadCardBlob(blob, account.username);
        setInfo('Card downloaded!');
      }
    } catch (error_) {
      if (!signal?.aborted && !(error_ instanceof Error && error_.name === 'AbortError')) {
        setError('Could not share. Try downloading instead.');
      }
    }
    if (!signal?.aborted) setDownloading(false);
  };

  return <div className="flex min-w-0 flex-col items-center gap-5">
    <div className="w-full max-w-[320px] [&>.flip-card]:aspect-[320/510] [&>.flip-card]:!h-auto [&>.flip-card]:!w-full [&_.flip-card-face>svg]:size-full"><PlayerCard ref={cardRef} account={account} size="lg" team={team} /></div>
    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-center">
      <Button onClick={handleNativeShare} disabled={downloading}><Share2 />{downloading ? 'Generating…' : 'Share card'}</Button>
      <Button variant="outline" onClick={handleDownload} disabled={downloading}><Download />Download</Button>
      <Button variant="outline" onClick={handleCopyLink}>{copied ? <><Check />Copied</> : <><Copy />Copy link</>}</Button>
      <Button variant="ghost" onClick={close}>Close</Button>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {info && !error && <p role="status" className="text-sm text-success">{info}</p>}
    <div className="w-full min-w-0 space-y-4">{children}</div>
  </div>;
};
