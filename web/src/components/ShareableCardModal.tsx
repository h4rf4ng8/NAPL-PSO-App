import React from 'react';
import { Check, Copy, Download, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {Account, TeamSummary as Team} from '../api/models';
import { C } from '../theme/theme';
import { PlayerCard } from './PlayerCard';
import { useDialog } from './Dialog';
import { renderCardToBlob, downloadCardBlob } from './player-card-image';
export const ShareableCardModal = ({ account, team, onClose, children }: { account: Account; team?: Team | null | undefined; onClose: () => void; children?: React.ReactNode }) => {
  const lifetime = React.useRef<AbortController | null>(null);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => { controller.abort(); clearTimeout(copiedTimer.current); };
  }, []);
  const close = () => { lifetime.current?.abort(); onClose(); };
  const dialogRef = useDialog(close);
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

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Share ${account.username} player card`} tabIndex={-1} className="dialog-backdrop" style={{
      background: `${C.black}dd`,
    }} onClick={close}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 fade-in">
        <PlayerCard ref={cardRef} account={account} size="lg" team={team} />

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={handleNativeShare}
            disabled={downloading}
            className="card-action disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${C.green} 0%, ${C.greenLight} 100%)`,
              color: C.onColor,
              boxShadow: `0 4px 12px ${C.green}66`,
            }}
          >
            <Share2 size={14} /> {downloading ? 'GENERATING...' : 'SHARE CARD'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="card-action card-action-neutral disabled:opacity-50"
          >
            <Download size={14} /> DOWNLOAD
          </button>
          <button
            onClick={handleCopyLink}
            className="card-action card-action-neutral"
          >
            {copied ? <><Check size={14} /> COPIED</> : <><Copy size={14} /> COPY LINK</>}
          </button>
          <button onClick={close} className="px-4 py-2 rounded font-mono text-xs tracking-wider" style={{
            background: `${C.navyLight}55`, color: C.white,
          }}>CLOSE</button>
        </div>

        {error && (
          <div className="font-mono text-xs px-3 py-1.5 rounded" style={{
            background: `${C.brandNavy}cc`, color: C.white, border: `1px solid ${C.navyLight}66`,
          }}>{error}</div>
        )}
        {info && !error && (
          <div className="font-mono text-xs px-3 py-1.5 rounded" style={{
            background: `${C.green}cc`, color: C.white, border: `1px solid ${C.greenLight}66`,
          }}>{info}</div>
        )}
        {children}
      </div>
    </div>
  );
};
