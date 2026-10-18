import {
Check,
Copy,
Download,
Share2,
Sparkles
} from 'lucide-react';
import React,{ useRef,useState } from 'react';
import { settings as adminApi } from '../features/admin/api';
import type { Account,Team } from '../api/models';
import type { Weightings } from '../features/admin/models';
import { C } from '../theme/theme';
import { flagUrl } from '../utils/league';
import { cardTier,getCardStatsForSeason } from '../utils/rankings';
import { mapAccountCardPreviews, mapDefaultPositionWeights } from '../features/accounts/api';
import { useResource } from '../hooks/use-resource';
import { skipToken, useQuery } from '@apollo/client/react';
import { AccountCardPreviewsDocument, DefaultPositionWeightsDocument } from '../api/generated/graphql';
import { ASL_LOGO_DIAMOND } from './Icons';
import { useDialog } from './Ui';
import { POS, POS_LABELS } from '@napl/contracts/league';

export const PlayerCard = React.forwardRef<HTMLDivElement, {account:Account;size?:string;team?:Team|null;hideTeam?:boolean}>(({ account, size = 'md', team = null, hideTeam = false }, ref) => {
  const ranking = account.ranking;
  const overall = ranking.score;
  const tierName = ranking.tier;
  const tier = cardTier(tierName);
  const isUnranked = !ranking.ranked;
  const dims = size === 'lg'
    ? { w: 320, h: 510, fontScale: 1 }
    : (size === 'sm'
    ? { w: 175, h: 280, fontScale: 0.55 }
    : { w: 240, h: 384, fontScale: 0.75 });

  const awards = account?.awards || [];
  const hasAwards = awards.length > 0;
  const canFlip = size === 'lg'; // only the large card flips
  const [flipped, setFlipped] = useState(false);
  const uid = React.useId().replaceAll(':', '');

  const displayCells = getCardStatsForSeason(account, account._cardSeason || 'all');
  const displayOverall = isUnranked ? 'NR' : overall;

  // v33 palette — metallic body with light/mid/dark/shadow stops for the
  // brushed-metal gradient, plus a separate panel palette for the stats area
  // and awardText (used when an award winner gets a black name label).
  const palette = (() => {
    if (tier.name === 'DIAMOND') return {
      // Richer, prismatic diamond — cyan highlight through blue mid into
      // navy shadow, with a cool-lavender twist in the mid so the whole
      // thing reads clearly as a gem (not just "shinier silver").
      lightest: '#f0f8ff', light: '#9ed0ef', mid: '#5a90c8', dark: '#2a5082', shadow: '#0e244a',
      panelLight: '#d8e8f8', panelMid: '#7098c8', panelDark: '#2a5082',
      text: '#061826', awardText: '#c8e4ff',
      stroke: '#0e244a',
    };
    if (tier.name === 'GOLD') return {
      lightest: '#fff5cc', light: '#fde583', mid: '#ecbd35', dark: '#a87a18', shadow: '#5a3e08',
      panelLight: '#fae27a', panelMid: '#ecbd35', panelDark: '#a87a18',
      text: '#1a1004', awardText: '#f5cc3e',
      stroke: '#5a3e08',
    };
    if (tier.name === 'SILVER') return {
      lightest: '#fafbfc', light: '#dde2e8', mid: '#b8bdc4', dark: '#7a8088', shadow: '#3a3e44',
      panelLight: '#dde2e8', panelMid: '#b8bdc4', panelDark: '#7a8088',
      text: '#0e1014', awardText: '#dfe4e8',
      stroke: '#3a3e44',
    };
    return {
      lightest: '#f0d4a8', light: '#d49058', mid: '#a85a20', dark: '#6e3c10', shadow: '#3a1e08',
      panelLight: '#d49058', panelMid: '#a85a20', panelDark: '#6e3c10',
      text: '#0a0604', awardText: '#d99c5c',
      stroke: '#3a1e08',
    };
  })();

  const VB_W = 320, VB_H = 510; // Internal SVG viewBox so coordinates stay consistent

  // v33 coat-of-arms card outline. Curved shoulders at top, slight inward
  // curve at the sides, pointed bottom.
  const cardPath = "M 22 4 L 298 4 Q 316 4 316 22 L 316 360 Q 316 380 308 396 Q 280 460 160 506 Q 40 460 12 396 Q 4 380 4 360 L 4 22 Q 4 4 22 4 Z";

  // TOTW flag flows from the team to all its members.
  const isTotw = !!(team && team.totw);
  const isCheater = !!account.cheater;
  // Captain star: team owner of an APPROVED team gets the ★ next to their name
  const isCaptain = !!(team && team.status === 'approved' &&
    team.ownerUsername && team.ownerUsername.toLowerCase() === account.username.toLowerCase());

  // Award winners get a black label across the name; TOTW marker (above OVR)
  // is independent of awards, so a player can have both.
  const ovrY = isTotw ? 132 : 118;
  const posY = isTotw ? 160 : 146;

  // A unique id suffix so multiple cards on the same page get unique <defs>
  const metallicDefs = (back = false) => {
    const id = (name: string) => `${back ? 'b-' : ''}${name}-${uid}`;
    return <>
      <linearGradient id={id('base')} x1="0" y1="0" x2="0.5" y2="1">
        <stop offset="0%" stopColor={palette.lightest} />
        <stop offset="25%" stopColor={palette.light} />
        <stop offset="55%" stopColor={palette.mid} />
        <stop offset="85%" stopColor={palette.dark} />
        <stop offset="100%" stopColor={palette.shadow} />
      </linearGradient>
      <linearGradient id={id('sheen')} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={palette.shadow} stopOpacity="0.25" />
        <stop offset="20%" stopColor={palette.lightest} stopOpacity="0.35" />
        <stop offset="50%" stopColor={palette.mid} stopOpacity="0" />
        <stop offset="80%" stopColor={palette.light} stopOpacity="0.18" />
        <stop offset="100%" stopColor={palette.shadow} stopOpacity="0.3" />
      </linearGradient>
      {!back && <linearGradient id={id('panel')} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={palette.panelLight} />
        <stop offset="50%" stopColor={palette.panelMid} />
        <stop offset="100%" stopColor={palette.panelDark} />
      </linearGradient>}
      <pattern id={id('brush')} x="0" y="0" width="3" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(-12)">
        <line x1="0" y1="0" x2="0" y2="80" stroke={palette.shadow} strokeWidth="0.18" opacity="0.18" />
      </pattern>
      <pattern id={id('dots')} x="0" y="0" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="0.7" fill={palette.shadow} opacity="0.35" />
      </pattern>
    </>;
  };
  const metallicSurface = (back = false) => {
    const prefix = back ? 'b-' : '';
    return <>
      <path d={cardPath} fill={`url(#${prefix}base-${uid})`} />
      <g clipPath={`url(#${prefix}cc-${uid})`}>
        <rect width="320" height="510" fill={`url(#${prefix}sheen-${uid})`} />
        <rect width="320" height="510" fill={`url(#${prefix}brush-${uid})`} />
        {back && <rect width="320" height="510" fill={`url(#${prefix}dots-${uid})`} opacity="0.4" />}
      </g>
    </>;
  };

  const cardFrontSvg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        {metallicDefs()}
        {/* Player photo soft feather: photo blends into the gold body */}
        <radialGradient id={`ph-fade-${uid}`} cx="0.5" cy="0.45" r="0.55">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="80%" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`ph-mask-${uid}`}>
          <rect width="320" height="510" fill="black" />
          <rect x="50" y="-10" width="290" height="310" fill={`url(#ph-fade-${uid})`} />
        </mask>
        <clipPath id={`cc-${uid}`}><path d={cardPath} /></clipPath>
        <clipPath id={`top-clip-${uid}`}><rect x="0" y="0" width="320" height="293" /></clipPath>
      </defs>

      {/* 1. METALLIC CARD BASE + sheen + brushed hairlines */}
      {metallicSurface()}

      {/* 2. TOP HALF: halftone dots + player photo */}
      <g clipPath={`url(#top-clip-${uid})`}>
        <g clipPath={`url(#cc-${uid})`}>
          <rect x="0" y="0" width="320" height="293" fill={`url(#dots-${uid})`} opacity="0.5" />
          {account.imageUrl && (
            <g mask={`url(#ph-mask-${uid})`} opacity="0.62">
              <image href={account.imageUrl} x="50" y="-10" width="290" height="310" preserveAspectRatio="xMidYMid slice" />
            </g>
          )}
        </g>
      </g>

      {/* 3. DIVIDER LINE between photo area and stats panel */}
      <g clipPath={`url(#cc-${uid})`}>
        <line x1="20" y1="293" x2="300" y2="293" stroke={palette.shadow} strokeWidth="1" opacity="0.45" />
        <line x1="20" y1="294" x2="300" y2="294" stroke={palette.lightest} strokeWidth="0.4" opacity="0.6" />
        <rect x="0" y="293" width="320" height="217" fill={`url(#panel-${uid})`} />
        <line x1="20" y1="295" x2="300" y2="295" stroke={palette.lightest} strokeWidth="0.5" opacity="0.6" />
      </g>

      {/* 4. TOTW MARKER (above OVR, big and prominent) */}
      {isTotw && (
        <text x="47" y="78" fontFamily="Anton, sans-serif" fontSize="22" fill="#2196f3" textAnchor="middle" letterSpacing="2.5" style={{ paintOrder: 'stroke', stroke: '#0d47a1', strokeWidth: 0.9 }}>TOTW</text>
      )}

      {/* 5. OVR + POS + FLAG + TEAM (left column, centered at x=47).
          NR (not ranked) uses a smaller font size since it's text, not a 2-digit number. */}
      <text x="47" y={ovrY} fontFamily="Anton, sans-serif" fontSize={displayOverall === 'NR' ? 28 : 42} fill={palette.text} textAnchor="middle" letterSpacing="-0.5">{displayOverall}</text>
      <text x="47" y={posY} fontFamily="Anton, sans-serif" fontSize="18" fill={palette.text} textAnchor="middle" letterSpacing="2">{account.position}</text>

      {account.country && flagUrl(account.country) && (
        <g>
          <rect x="32" y="177" width="30" height="20" rx="2" fill={palette.text} fillOpacity="0.18" stroke={palette.shadow} strokeWidth="0.5" strokeOpacity="0.5" />
          <image href={flagUrl(account.country) || undefined} x="33" y="178" width="28" height="18" preserveAspectRatio="xMidYMid slice" />
        </g>
      )}

      {!hideTeam && (team ? (
        team.logoUrl ? (
          <g>
            <circle cx="47" cy="222" r="14" fill="#ffffff" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" />
            <image href={team.logoUrl} x="33" y="208" width="28" height="28" preserveAspectRatio="xMidYMid meet" clipPath={`circle(13px at 14px 14px)`} />
          </g>
        ) : (
          <g>
            <circle cx="47" cy="222" r="14" fill={team.color || '#1a5c2c'} stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" />
            <text x="47" y="226" fontFamily="Russo One, sans-serif" fontSize="10" fill="#fff" textAnchor="middle" letterSpacing="0.3">{team.tag}</text>
          </g>
        )
      ) : (
        <g transform="translate(47 222)">
          <circle r="14" fill={palette.lightest} fillOpacity="0.25" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.55" strokeDasharray="2 2" />
          <text y="-2" fontFamily="Russo One, sans-serif" fontSize="6" fill={palette.text} textAnchor="middle">FREE</text>
          <text y="6" fontFamily="Russo One, sans-serif" fontSize="6" fill={palette.text} textAnchor="middle">AGENT</text>
        </g>
      ))}

      {/* 6. NAME — full-width black label if player has awards */}
      {hasAwards ? (
        <g>
          <g clipPath={`url(#cc-${uid})`}>
            <rect x="0" y="305" width="320" height="34" fill="#000000" opacity="0.94" />
            <line x1="0" y1="305" x2="320" y2="305" stroke={palette.awardText} strokeWidth="0.6" opacity="0.55" />
            <line x1="0" y1="339" x2="320" y2="339" stroke={palette.awardText} strokeWidth="0.6" opacity="0.55" />
          </g>
          <text x="160" y="328" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 14)}</text>
          {isCaptain && (
            <text x="46" y="328" fontSize="20" textAnchor="middle" fill="#000"
              stroke="#fff" strokeWidth="1" style={{ paintOrder: 'stroke' }}
              aria-label="Captain">★</text>
          )}
        </g>
      ) : (
        <g>
          <text x="160" y="326" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.text} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 14)}</text>
          <line x1="55" y1="338" x2="265" y2="338" stroke={palette.shadow} strokeWidth="0.8" strokeOpacity="0.6" />
          {isCaptain && (
            <text x="46" y="326" fontSize="20" textAnchor="middle" fill="#000"
              stroke="#fff" strokeWidth="1" style={{ paintOrder: 'stroke' }}
              aria-label="Captain">★</text>
          )}
        </g>
      )}

      {/* 7. STATS GRID 3x2 — center-anchored numbers, symmetric around x=160.
          Discrete events (goals, assists, clean sheets) show as TOTALS.
          Volume stats (passes, tackles, deflects, catches) show as PER-GAME
          averages — that's what the OVR actually ranks on and it's more
          meaningful (e.g. "2.5 passes/game" tells you more than "10 total"). */}
      <g fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fill={palette.text}>
        {displayCells.map((cell, i) => {
          const row = Math.floor(i / 2);
          const right = i % 2 === 1;
          const y = 364 + row * 26;
          return <g key={`${cell.label}-${i}`}>
            <text x={right ? 220 : 62} y={y} fontSize="20" textAnchor="middle">{cell.value}</text>
            <text x={right ? 256 : 100} y={y} fontSize="11" letterSpacing="1.5">{cell.label}</text>
          </g>;
        })}
      </g>
      <line x1="160" y1="348" x2="160" y2="422" stroke={palette.shadow} strokeWidth="0.7" strokeOpacity="0.55" />

      {/* 8. ASL logo at bottom center */}
      <image href={ASL_LOGO_DIAMOND} x="139" y="431" width="42" height="42" preserveAspectRatio="xMidYMid meet" opacity="0.9" />

      {/* CHEATER STAMP — giant diagonal red text overlaying the whole card,
          bottom-left to top-right. Clipped to the card shape so it doesn't
          escape the outline. Uses dominantBaseline="central" so the text
          centers vertically on the rotation point. */}
      {isCheater && (
        <g clipPath={`url(#cc-${uid})`}>
          {/* darker dimming layer so the red really pops */}
          <rect width="320" height="510" fill="#000" opacity="0.5" />
          <g transform="translate(160 255) rotate(-32)">
            {/* outer red glow halo for prominence */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#ff0000" opacity="0.35"
              style={{ filter: 'blur(4px)' }}
            >CHEATER</text>
            {/* main stamp text — thick dark stroke for stamped-on look */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#e60000"
              style={{ paintOrder: 'stroke', stroke: '#400000', strokeWidth: 4 }}
            >CHEATER</text>
            {/* inner highlight stroke for definition */}
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="none" stroke="#ff8888" strokeWidth="0.8" opacity="0.85"
            >CHEATER</text>
          </g>
        </g>
      )}

      {/* 9. Outer stroke + inner highlight */}
      <path d={cardPath} fill="none" stroke={palette.shadow} strokeWidth="1.8" strokeOpacity="0.8" />
      <path d={cardPath} fill="none" stroke={palette.lightest} strokeWidth="0.5" strokeOpacity="0.8" transform="translate(0 -0.5)" />

      {/* 10. TIER LETTER BADGE — single-letter material-tinted square in the
          top-right. B/S/G/D for Bronze/Silver/Gold/Diamond. Uses the palette's
          shadow for background + lightest for the letter so it reads as
          embossed into the tier material. Hidden for unranked (NR) cards. */}
      {displayOverall !== 'NR' && (
        <g transform="translate(272 18)">
          <rect x="0" y="0" width="34" height="34" rx="6" ry="6"
            fill={palette.shadow} stroke={palette.lightest} strokeWidth="0.8" strokeOpacity="0.6" />
          <rect x="1.5" y="1.5" width="31" height="4" rx="3" ry="3"
            fill={palette.lightest} opacity="0.3" />
          <text x="17" y="25" textAnchor="middle"
            fontFamily="Anton, sans-serif" fontSize="21" fontWeight="700"
            fill={palette.lightest} letterSpacing="0.5">
            {tier.name.charAt(0)}
          </text>
        </g>
      )}
    </svg>
  );

  // ---- BACK OF THE CARD: trophies + join date ----
  const AWARD_FULL_NAMES:Record<string,string> = {
    glove: 'Golden Glove',
    striker: 'Golden Boot',
    defender: 'Golden Defender',
    playmaker: 'Golden Playmaker',
  };
  // Force en-US locale + short month so the label fits inside the card width
  // regardless of the viewer's browser locale.
  const joinDate = account.createdAt
    ? new Date(account.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';
  // Combined cabinet items: individual awards + team championships. Each is
  // tagged with a kind so the renderer picks the right icon.
  const cabinetItems = [
    ...awards.map(a => ({ kind: 'award' as const, awardId: a.awardId, season: a.season })),
    ...(account.championships || []).map(c => ({
      kind: 'champ' as const,
      placement: c.placement,             // 'winner' | 'runner_up'
      season: c.season,
    })),
  ].slice(0, 10);

  const cardBackSvg = (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        {metallicDefs(true)}
        <clipPath id={`b-cc-${uid}`}><path d={cardPath} /></clipPath>
      </defs>

      {/* Metallic body (same as front, no photo) */}
      {metallicSurface(true)}

      {/* Header band at top — black bar with player name + position + OVR */}
      <g clipPath={`url(#b-cc-${uid})`}>
        <rect x="0" y="0" width="320" height="80" fill="#000000" opacity="0.78" />
        <line x1="0" y1="80" x2="320" y2="80" stroke={palette.awardText} strokeWidth="0.8" opacity="0.5" />
      </g>
      <text x="160" y="38" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 16)}</text>
      <text x="160" y="60" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5" opacity="0.85">
        {account.position} · {displayOverall === 'NR' ? 'NOT RANKED' : `${displayOverall} OVR`}{isTotw ? ' · TOTW' : ''}
      </text>

      {/* TROPHY CABINET section */}
      <text x="22" y="106" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} letterSpacing="2.5">TROPHY CABINET</text>
      <line x1="22" y1="112" x2="298" y2="112" stroke={palette.shadow} strokeWidth="0.6" opacity="0.55" />

      {cabinetItems.length === 0 ? (
        <text x="160" y="180" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} textAnchor="middle" opacity="0.55" letterSpacing="1.5">NO TROPHIES YET</text>
      ) : cabinetItems.map((item, i) => {
        const y = 130 + i * 22;
        if (item.kind === 'champ') {
          const label = item.placement === 'runner_up' ? 'RUNNER-UP' : 'CHAMPION';
          return (
            <g key={`item-${i}`} transform={`translate(22 ${y})`}>
              <text x="0" y="0" fontSize="14" fill={palette.awardText}>🏆</text>
              <text x="22" y="0" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="13" fill={palette.text}>{label}</text>
              {item.season && (
                <text x="276" y="0" fontFamily="Russo One, sans-serif" fontSize="10" fill={palette.text} opacity="0.8" textAnchor="end">{item.season}</text>
              )}
            </g>
          );
        }
        // award
        const fullName = (AWARD_FULL_NAMES[item.awardId] || item.awardId || '').toUpperCase();
        return (
          <g key={`item-${i}`} transform={`translate(22 ${y})`}>
            <circle cx="6" cy="-4" r="3" fill={palette.awardText} />
            <text x="20" y="0" fontFamily="Barlow Condensed, sans-serif" fontWeight="600" fontSize="13" fill={palette.text}>{fullName}</text>
            {item.season && (
              <text x="276" y="0" fontFamily="Russo One, sans-serif" fontSize="10" fill={palette.text} opacity="0.65" textAnchor="end">{item.season}</text>
            )}
          </g>
        );
      })}

      {/* MEMBER SINCE footer */}
      <line x1="80" y1="445" x2="240" y2="445" stroke={palette.shadow} strokeWidth="0.5" opacity="0.4" />
      <text x="160" y="460" fontFamily="Russo One, sans-serif" fontSize="9" fill={palette.text} textAnchor="middle" opacity="0.65" letterSpacing="2">MEMBER SINCE</text>
      <text x="160" y="476" fontFamily="Anton, sans-serif" fontSize="14" fill={palette.text} textAnchor="middle" letterSpacing="2">{joinDate}</text>

      {/* Outer + inner edge */}
      <path d={cardPath} fill="none" stroke={palette.shadow} strokeWidth="1.8" strokeOpacity="0.8" />
      <path d={cardPath} fill="none" stroke={palette.lightest} strokeWidth="0.5" strokeOpacity="0.8" transform="translate(0 -0.5)" />
    </svg>
  );

  // Non-flippable (small/medium cards): just show the front
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
        {cardFrontSvg}
      </div>
    );
  }

  // Flippable large card
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
        <div className="flip-card-face" aria-hidden={flipped}>{cardFrontSvg}</div>
        <div className="flip-card-face flip-card-back" aria-hidden={!flipped}>{cardBackSvg}</div>
      </div>
    </div>
  );
});

PlayerCard.displayName = 'PlayerCard';

// ============ SHAREABLE CARD MODAL ============
// Renders the player card (an SVG) to a PNG entirely in-browser, with no
// external libraries: serialize the SVG, draw it onto a <canvas>, export.
export const ShareableCardModal = ({ account, team, onClose }: { account: Account; team?: Team | null | undefined; onClose: () => void }) => {
  const dialogRef = useDialog(onClose);
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  // Core: turn the card's <svg> into a PNG blob via canvas.
  const renderCardToBlob = async () => {
    const container = cardRef.current;
    if (!container) throw new Error('Card not ready');
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('Card SVG not found');

    // Clone so we can safely set explicit width/height for rasterizing
    const clone = svg.cloneNode(true);
      if(!(clone instanceof SVGElement)) throw new TypeError('Card SVG unavailable');
    const vb = svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : (svg.clientWidth || 320);
    const h = vb && vb.height ? vb.height : (svg.clientHeight || 510);
    const scale = 3; // retina-quality export
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    // Any <image> pointing at an external URL (e.g. the country flag from
    // flagcdn) would taint the canvas and block PNG export. Convert those to
    // inline data URIs first. Data-URI images (logo, uploaded photo) are left
    // as-is.
    const toDataUri = async (src: string) => {
      const resp = await fetch(src, { mode: 'cors' });
      const blob = await resp.blob();
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.addEventListener('load', () => typeof r.result==='string'?resolve(r.result):reject(new Error('Image read failed')));
        r.addEventListener('error',reject,{once:true});
        r.readAsDataURL(blob);
      });
    };
    const imgEls = [...clone.querySelectorAll('image')];
    await Promise.all(imgEls.map(async (el) => {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (href && !href.startsWith('data:')) {
        try {
          const dataUri = await toDataUri(href);
          el.setAttribute('href', dataUri);
          el.removeAttribute('xlink:href');
        } catch {
          // If a flag fails to inline, drop it rather than break the whole export
          el.remove();
        }
      }
    }));

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve);
        img.addEventListener('error',() => reject(new Error('Could not load card image')),{once:true});
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      if(!ctx) throw new Error('Canvas is unavailable');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Export failed')), 'image/png');
      });
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(''); setInfo('');
    try {
      const blob = await renderCardToBlob();
      const link = document.createElement('a');
      link.download = `${account.username}-ASL-card.png`;
      link.href = URL.createObjectURL(blob);
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      setInfo('Card downloaded!');
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Could not generate image. Try again.');
    }
    setDownloading(false);
  };

  const handleCopyLink = async () => {
    setError(''); setInfo('');
    const url = `${location.origin}${location.pathname}?player=${encodeURIComponent(account.username)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy link.');
    }
  };

  const handleNativeShare = async () => {
    setError(''); setInfo('');
    // If the device supports native sharing of files, share the PNG directly.
    if (!navigator.share) {
      return handleDownload();
    }
    setDownloading(true);
    try {
      const blob = await renderCardToBlob();
      const file = new File([blob], `${account.username}-ASL-card.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${account.username} — ASL Player Card`,
          text: `Check out my ASL player card!`,
        });
      } else {
        await handleDownload();
      }
    } catch (error_) {
      if (!(error_ instanceof Error && error_.name === 'AbortError')) {
        setError('Could not share. Try downloading instead.');
      }
    }
    setDownloading(false);
  };

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Share ${account.username} player card`} tabIndex={-1} className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto" style={{
      background: `${C.black}dd`, backdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 fade-in">
        <PlayerCard ref={cardRef} account={account} size="lg" team={team} />

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={handleNativeShare}
            disabled={downloading}
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
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
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105 disabled:opacity-50"
            style={{
              background: C.white, color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.black}33`,
            }}
          >
            <Download size={14} /> DOWNLOAD
          </button>
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 rounded font-heading text-xs tracking-wider flex items-center gap-2 transition-all hover:scale-105"
            style={{
              background: C.white, color: C.brandNavy,
              boxShadow: `0 4px 12px ${C.black}33`,
            }}
          >
            {copied ? <><Check size={14} /> COPIED</> : <><Copy size={14} /> COPY LINK</>}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded font-mono text-xs tracking-wider" style={{
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
      </div>
    </div>
  );
};

// ============ TIER PREVIEW (debug/showcase) ============
export const TierPreview = () => {
  const { data, loading, error } = useQuery(AccountCardPreviewsDocument);
  const previews = data ? mapAccountCardPreviews(data) : [];
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={22} style={{ color: C.goldLight }} />
        <h3 className="font-display text-3xl tracking-wider" style={{ color: C.cream }}>TIER PREVIEW</h3>
      </div>
      <p className="font-body text-sm mb-6" style={{ color: `${C.cream}aa` }}>
        Each tier rendered with its material treatment. Award winners get a black name bar; the Gold card shows a country flag.
      </p>
      {loading && <p role="status">Loading card previews…</p>}
      {error && <p role="alert">{error.message}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 justify-items-center">
        {previews.map(({ account, label, description }) => (
          <div key={label} className="flex flex-col items-center gap-3">
            <PlayerCard account={account} size="md" hideTeam />
            <div className="text-center">
              <div className="font-display text-xl tracking-wider" style={{ color: C.cream }}>{label}</div>
              <div className="font-mono text-[10px] tracking-wider mt-0.5" style={{ color: `${C.cream}66` }}>{description}</div>
            </div>
          </div>
        ))}
      </div>
      <WeightingsPublicView />
    </div>
  );
};

// Public, read-only view of how each position's OVR is weighted. Pulls the
// current DB values (so admin changes show up here immediately for everyone).
// Admins still edit via ADMIN → WEIGHTINGS; this is the players' view.
const WeightingsPublicView = () => {
  const POSITION_NAMES: Record<string,string> = {
    [POS.ST]: POS_LABELS[POS.ST].toUpperCase(), [POS.WG]: POS_LABELS[POS.WG].toUpperCase(),
    [POS.CM]: POS_LABELS[POS.CM].toUpperCase(), [POS.DEF]: POS_LABELS[POS.DEF].toUpperCase(),
    [POS.GK]: 'GOALIE', [POS.FLEX]: POS_LABELS[POS.FLEX].toUpperCase(),
  };
  const STAT_LABELS: Record<string,string> = {
    goalsPerGame: 'GOALS',
    assistsPerGame: 'ASSISTS',
    passesPerGame: 'PASSES',
    tacklesPerGame: 'TACKLES',
    deflectsPerGame: 'DEFLECTIONS',
    cleanSheetPct: 'CLEAN SHEETS',
    catchesPerGame: 'CATCHES',
  };
  // Position accent colors — ST red, WG orange, CM gold, DEF blue, GK green, FLEX purple.
  const POS_COLOR:Record<string,string> = {
    [POS.ST]: '#ff6b4a', [POS.WG]: '#ff9a3c', [POS.CM]: '#f5cc3e', [POS.DEF]: '#4a90e2', [POS.GK]: '#4caf50', [POS.FLEX]: '#b887ff',
  };

  const saved = useResource(adminApi.getWeightings, []);
  const defaults = useQuery(DefaultPositionWeightsDocument, !saved.loading && !saved.error && saved.data === null ? {} : skipToken);
  const weights: Weightings = saved.data ?? (defaults.data ? mapDefaultPositionWeights(defaults.data) : {});

  return (
    <div className="mt-10 rounded-xl p-5" style={{
      background: `${C.navyDeep}aa`,
      border: `1px solid ${C.navyLight}66`,
    }}>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-display tracking-wider text-xl mb-1" style={{ color: C.cream }}>
            HOW OVR IS SCORED
          </h3>
          <p className="font-body text-sm max-w-xl" style={{ color: `${C.cream}aa`, lineHeight: 1.6 }}>
            Every player's OVR is a weighted blend of their per-game stat averages,
            compared to peers in their position. Weights differ per position so
            a defender isn't ranked by goals and a striker isn't ranked by tackles.
          </p>
        </div>
      </div>

      {(saved.loading || defaults.loading) && <p role="status">Loading weightings…</p>}
      {(saved.error || defaults.error) && <p role="alert">
        {saved.error || defaults.error?.message} <button onClick={() => {
          if (saved.error) void saved.reload();
          else void defaults.refetch().catch(() => { /* Apollo exposes the error above. */ });
        }}>Try again</button>
      </p>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(weights).map(([pos, value]) => {
          const posColor = POS_COLOR[pos];
          return (
            <div key={pos} className="rounded-lg p-4" style={{
              background: C.white,
              border: `1px solid ${C.navyLight}66`,
              borderTop: `3px solid ${posColor}`,
            }}>
              <div className="flex items-baseline gap-2 mb-3">
                <div className="font-display tracking-widest text-xl" style={{ color: C.brandNavyDeep }}>
                  {pos}
                </div>
                <div className="font-mono text-[10px] tracking-widest" style={{ color: `${C.brandNavy}77` }}>
                  {POSITION_NAMES[pos]}
                </div>
              </div>
              <div className="space-y-2">
                {Object.keys(value).map(stat => {
                  const w = weights?.[pos]?.[stat];
                  const pct = w === undefined || w === null ? null : Math.round(w * 100);
                  return (
                    <div key={stat}>
                      <div className="flex items-baseline justify-between mb-1">
                        <div className="font-body text-sm" style={{ color: C.brandNavy }}>
                          {STAT_LABELS[stat] || stat}
                        </div>
                        <div className="font-display text-base tracking-wider tabular-nums" style={{ color: posColor }}>
                          {pct === null ? '—' : `${pct}%`}
                        </div>
                      </div>
                      {/* Bar graph that fills proportional to weight */}
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${C.navyLight}22` }}>
                        <div className="h-full rounded-full" style={{
                          width: pct === null ? '0%' : `${pct}%`,
                          background: posColor,
                          transition: 'width 0.3s ease-out',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="font-mono text-[10px] tracking-wider mt-4 text-center" style={{ color: `${C.cream}66` }}>
        WEIGHTS SUM TO 100% PER POSITION · UPDATED BY LEAGUE ADMINS
      </div>
    </div>
  );
};
