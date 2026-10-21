import { mediaUrl } from '../MediaImage';
import React from 'react';
import type { Account, TeamSummary as Team } from '../../api/models';
import { cardTier, getCardStatsForSeason } from '../../utils/rankings';
import { cardDimensions, cardPalette, cardPath, MetallicDefs, MetallicSurface, CardOutline } from './artwork';
import { flagUrl, isTeamCaptain } from '../../utils/league';
import { ASL_LOGO_DIAMOND } from '../../assets/asl-logos';
export const CardFront = ({ account, team, hideTeam, size }: { account: Account; team: Team | null; hideTeam: boolean; size: string }) => {
  const tier = cardTier(account.ranking.tier);
  const palette = cardPalette(tier.name);
  const dims = cardDimensions(size);
  const uid = React.useId().replaceAll(':', '');
  const displayOverall = account.ranking.ranked ? account.ranking.score : 'NR';
  const isTotw = !!team?.totw;
  const hasAwards = (account.awardCount ?? account.awards?.length ?? 0) > 0;
  const isCheater = !!account.cheater;
  const isCaptain = isTeamCaptain(account, team);
  const displayCells = getCardStatsForSeason(account, account._cardSeason || 'all');
  const ovrY = isTotw ? 132 : 118;
  const posY = isTotw ? 160 : 146;
  return (
    <svg
      viewBox={`0 0 320 510`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        <MetallicDefs palette={palette} uid={uid} />
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
      <MetallicSurface uid={uid} />
      <g clipPath={`url(#top-clip-${uid})`}>
        <g clipPath={`url(#cc-${uid})`}>
          <rect x="0" y="0" width="320" height="293" fill={`url(#dots-${uid})`} opacity="0.5" />
          {account.imageUrl && (
            <g mask={`url(#ph-mask-${uid})`} opacity="0.62">
              <image href={mediaUrl(account.imageUrl)} x="50" y="-10" width="290" height="310" preserveAspectRatio="xMidYMid slice" />
            </g>
          )}
        </g>
      </g>
      <g clipPath={`url(#cc-${uid})`}>
        <line x1="20" y1="293" x2="300" y2="293" stroke={palette.shadow} strokeWidth="1" opacity="0.45" />
        <line x1="20" y1="294" x2="300" y2="294" stroke={palette.lightest} strokeWidth="0.4" opacity="0.6" />
        <rect x="0" y="293" width="320" height="217" fill={`url(#panel-${uid})`} />
        <line x1="20" y1="295" x2="300" y2="295" stroke={palette.lightest} strokeWidth="0.5" opacity="0.6" />
      </g>
      {isTotw && (
        <text x="47" y="78" fontFamily="Anton, sans-serif" fontSize="22" fill="#2196f3" textAnchor="middle" letterSpacing="2.5" style={{ paintOrder: 'stroke', stroke: '#0d47a1', strokeWidth: 0.9 }}>TOTW</text>
      )}
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
            <image href={mediaUrl(team.logoUrl)} x="33" y="208" width="28" height="28" preserveAspectRatio="xMidYMid meet" clipPath={`circle(13px at 14px 14px)`} />
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
      <image href={ASL_LOGO_DIAMOND} x="139" y="431" width="42" height="42" preserveAspectRatio="xMidYMid meet" opacity="0.9" />
      {isCheater && (
        <g clipPath={`url(#cc-${uid})`}>
          <rect width="320" height="510" fill="#000" opacity="0.5" />
          <g transform="translate(160 255) rotate(-32)">
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#ff0000" opacity="0.35"
              style={{ filter: 'blur(4px)' }}
            >CHEATER</text>
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="#e60000"
              style={{ paintOrder: 'stroke', stroke: '#400000', strokeWidth: 4 }}
            >CHEATER</text>
            <text x="0" y="0" textAnchor="middle" dominantBaseline="central"
              fontFamily="Anton, sans-serif"
              fontSize="72" letterSpacing="4"
              fill="none" stroke="#ff8888" strokeWidth="0.8" opacity="0.85"
            >CHEATER</text>
          </g>
        </g>
      )}
      <CardOutline palette={palette} />
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
};
