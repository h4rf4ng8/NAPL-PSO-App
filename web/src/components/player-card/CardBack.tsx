import React from 'react';
import type { Account, TeamSummary as Team } from '../../api/models';
import { cardTier } from '../../utils/rankings';
import { cardDimensions, cardPalette, cardPath, MetallicDefs, MetallicSurface, CardOutline } from './artwork';

import { AWARD_BY_ID, ChampionTrophy } from '../Icons';
export const CardBack = ({ account, team, size }: { account: Account; team: Team | null; size: string }) => {
  const tier = cardTier(account.ranking.tier);
  const palette = cardPalette(tier.name);
  const dims = cardDimensions(size);
  const uid = React.useId().replaceAll(':', '');
  const displayOverall = account.ranking.ranked ? account.ranking.score : 'NR';
  const isTotw = !!team?.totw;
  const joinDate = account.createdAt
    ? new Date(account.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : 'Unknown';
  const cabinetItems = [
    ...(account.awardPreview ?? account.awards ?? []).map(a => ({ kind: 'award' as const, awardId: a.awardId, season: a.season })),
    ...(account.championshipPreview ?? account.championships ?? []).map(c => ({
      kind: 'champ' as const,
      placement: c.placement,             // 'winner' | 'runner_up'
      season: c.season,
    })),
  ].slice(0, 10);
  return (
    <svg
      viewBox={`0 0 320 510`}
      width={dims.w}
      height={dims.h}
      style={{ display: 'block' }}
    >
      <defs>
        <MetallicDefs palette={palette} uid={uid} back />
        <clipPath id={`b-cc-${uid}`}><path d={cardPath} /></clipPath>
      </defs>
      <MetallicSurface uid={uid} back />
      <g clipPath={`url(#b-cc-${uid})`}>
        <rect x="0" y="0" width="320" height="80" fill="#000000" opacity="0.78" />
        <line x1="0" y1="80" x2="320" y2="80" stroke={palette.awardText} strokeWidth="0.8" opacity="0.5" />
      </g>
      <text x="160" y="38" fontFamily="Anton, sans-serif" fontSize="22" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5">{(account.username || '').toUpperCase().slice(0, 16)}</text>
      <text x="160" y="60" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.awardText} textAnchor="middle" letterSpacing="2.5" opacity="0.85">
        {account.position} · {displayOverall === 'NR' ? 'NOT RANKED' : `${displayOverall} OVR`}{isTotw ? ' · TOTW' : ''}
      </text>
      <text x="22" y="106" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} letterSpacing="2.5">TROPHY CABINET</text>
      <line x1="22" y1="112" x2="298" y2="112" stroke={palette.shadow} strokeWidth="0.6" opacity="0.55" />
      {cabinetItems.length === 0 ? (
        <text x="160" y="180" fontFamily="Russo One, sans-serif" fontSize="11" fill={palette.text} textAnchor="middle" opacity="0.55" letterSpacing="1.5">NO TROPHIES YET</text>
      ) : cabinetItems.map((item, i) => {
        const y = 130 + i * 22;
        if (item.kind === 'champ') {
          const { label, tone } = item.placement === 'runner_up'
            ? { label: 'RUNNER-UP', tone: 'silver' }
            : { label: 'CHAMPION', tone: 'gold' };
          return (
            <g key={`item-${i}`} transform={`translate(22 ${y})`}>
              <g transform="translate(0 -16)"><ChampionTrophy size={14} tone={tone} /></g>
              <text x="22" y="0" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="13" fill={palette.text}>{label}</text>
              {item.season && (
                <text x="276" y="0" fontFamily="Russo One, sans-serif" fontSize="10" fill={palette.text} opacity="0.8" textAnchor="end">{item.season}</text>
              )}
            </g>
          );
        }
        const fullName = (AWARD_BY_ID[item.awardId]?.name || item.awardId || '').toUpperCase();
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
      <line x1="80" y1="445" x2="240" y2="445" stroke={palette.shadow} strokeWidth="0.5" opacity="0.4" />
      <text x="160" y="460" fontFamily="Russo One, sans-serif" fontSize="9" fill={palette.text} textAnchor="middle" opacity="0.65" letterSpacing="2">MEMBER SINCE</text>
      <text x="160" y="476" fontFamily="Anton, sans-serif" fontSize="14" fill={palette.text} textAnchor="middle" letterSpacing="2">{joinDate}</text>
      <CardOutline palette={palette} />
    </svg>
  );
};
