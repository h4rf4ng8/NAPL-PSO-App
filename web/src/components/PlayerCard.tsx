import React, {useState} from 'react';
import type { Account, TeamSummary as Team } from '../api/models';
import { CardFront } from './player-card/CardFront';
import { CardBack } from './player-card/CardBack';
import { cardDimensions } from './player-card/artwork';
export const PlayerCard = React.forwardRef<HTMLDivElement, {account:Account;size?:string;team?:Team|null;hideTeam?:boolean}>(({ account, size = 'md', team = null, hideTeam = false }, ref) => {
  const dims = cardDimensions(size);
  const canFlip = size === 'lg';
  const [flipped, setFlipped] = useState(false);
  if (!canFlip) {
    return (
      <div
        ref={ref}
        className="relative select-none transition-all hover:scale-[1.03] hover:-translate-y-1 duration-300"
        style={{
          width: dims.w, height: dims.h,
          filter: `drop-shadow(0 8px 20px rgba(0,0,0,0.35))`,
        }}
      >
        <CardFront account={account} team={team} hideTeam={hideTeam} size={size} />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      className={`flip-card ${flipped ? 'flipped' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${account.username} player card: show ${flipped ? 'front' : 'back'}`}
      aria-pressed={flipped}
      onClick={() => setFlipped(f => !f)}
      onKeyDown={event => {
        if (!(event.key === 'Enter' || event.key === ' ')) {
          return;
        }
        event.preventDefault(); setFlipped(f => !f);
      }}
      style={{
        width: dims.w, height: dims.h,
        filter: `drop-shadow(0 8px 20px rgba(0,0,0,0.35))`,
      }}
      title="Click, Enter, or Space to flip"
    >
      <div className="flip-card-inner">
        <div className="flip-card-face" aria-hidden={flipped}><CardFront account={account} team={team} hideTeam={hideTeam} size={size} /></div>
        <div className="flip-card-face flip-card-back" aria-hidden={!flipped}><CardBack account={account} team={team} size={size} /></div>
      </div>
    </div>
  );
});
PlayerCard.displayName = 'PlayerCard';
