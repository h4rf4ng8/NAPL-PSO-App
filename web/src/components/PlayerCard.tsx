import React, {useState} from 'react';
import type { Account, TeamSummary as Team } from '../api/models';
import { CardFront } from './player-card/CardFront';
import { CardBack } from './player-card/CardBack';
import { cardDimensions } from './player-card/artwork';
import { Button } from './ui/button';
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
      className={`flip-card relative [&_.flip-card-face]:[backface-visibility:visible] ${flipped ? 'flipped' : ''}`}
      style={{
        width: dims.w, height: dims.h,
        filter: `drop-shadow(0 8px 20px rgba(0,0,0,0.35))`,
      }}
    >
      <div className="flip-card-inner">
        {/* Explicit face visibility also handles WebKit's SVG backface rendering. */}
        <div className={`flip-card-face transition-[visibility] duration-0 delay-200 motion-reduce:delay-0 ${flipped ? 'invisible' : 'visible'}`} aria-hidden={true}><CardFront account={account} team={team} hideTeam={hideTeam} size={size} /></div>
        <div className={`flip-card-face flip-card-back transition-[visibility] duration-0 delay-200 motion-reduce:delay-0 ${flipped ? 'visible' : 'invisible'}`} aria-hidden={true}><CardBack account={account} team={team} size={size} /></div>
      </div>
      <Button
        variant="ghost"
        className="absolute inset-0 h-full w-full p-0 hover:bg-transparent"
        aria-label={`${account.username} player card: show ${flipped ? 'front' : 'back'}`}
        aria-pressed={flipped}
        onClick={() => setFlipped(f => !f)}
        title="Click, Enter, or Space to flip"
      />
    </div>
  );
});
PlayerCard.displayName = 'PlayerCard';
