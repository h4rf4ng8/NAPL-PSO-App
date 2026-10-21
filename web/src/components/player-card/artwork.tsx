import React from 'react';

export type CardSize = string;
export const cardDimensions = (size: CardSize) => size === 'lg'
  ? { w: 320, h: 510 }
  : (size === 'sm' ? { w: 175, h: 280 } : { w: 240, h: 384 });

export const cardPath = "M 22 4 L 298 4 Q 316 4 316 22 L 316 360 Q 316 380 308 396 Q 280 460 160 506 Q 40 460 12 396 Q 4 380 4 360 L 4 22 Q 4 4 22 4 Z";
export const cardPalette = (tierName: string) => {
  if (tierName === 'DIAMOND') return {
    lightest: '#f0f8ff', light: '#9ed0ef', mid: '#5a90c8', dark: '#2a5082', shadow: '#0e244a',
    panelLight: '#d8e8f8', panelMid: '#7098c8', panelDark: '#2a5082',
    text: '#061826', awardText: '#c8e4ff',
  };
  if (tierName === 'GOLD') return {
    lightest: '#fff5cc', light: '#fde583', mid: '#ecbd35', dark: '#a87a18', shadow: '#5a3e08',
    panelLight: '#fae27a', panelMid: '#ecbd35', panelDark: '#a87a18',
    text: '#1a1004', awardText: '#f5cc3e',
  };
  if (tierName === 'SILVER') return {
    lightest: '#fafbfc', light: '#dde2e8', mid: '#b8bdc4', dark: '#7a8088', shadow: '#3a3e44',
    panelLight: '#dde2e8', panelMid: '#b8bdc4', panelDark: '#7a8088',
    text: '#0e1014', awardText: '#dfe4e8',
  };
  return {
    lightest: '#f0d4a8', light: '#d49058', mid: '#a85a20', dark: '#6e3c10', shadow: '#3a1e08',
    panelLight: '#d49058', panelMid: '#a85a20', panelDark: '#6e3c10',
    text: '#0a0604', awardText: '#d99c5c',
  };
};

type ArtworkProps = { palette: ReturnType<typeof cardPalette>; uid: string; back?: boolean };

export const MetallicDefs = ({ palette, uid, back = false }: ArtworkProps) => {
  const id = (name: string) => `${back ? 'b-' : ''}${name}-${uid}`;
  return <React.Fragment>
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
  </React.Fragment>;
};

export const MetallicSurface = ({ uid, back = false }: Omit<ArtworkProps, 'palette'>) => {
  const prefix = back ? 'b-' : '';
  return <React.Fragment>
    <path d={cardPath} fill={`url(#${prefix}base-${uid})`} />
    <g clipPath={`url(#${prefix}cc-${uid})`}>
      <rect width="320" height="510" fill={`url(#${prefix}sheen-${uid})`} />
      <rect width="320" height="510" fill={`url(#${prefix}brush-${uid})`} />
      {back && <rect width="320" height="510" fill={`url(#${prefix}dots-${uid})`} opacity="0.4" />}
    </g>
  </React.Fragment>;
};

export const CardOutline = ({ palette }: Pick<ArtworkProps, 'palette'>) => <React.Fragment>
  <path d={cardPath} fill="none" stroke={palette.shadow} strokeWidth="1.8" strokeOpacity="0.8" />
  <path d={cardPath} fill="none" stroke={palette.lightest} strokeWidth="0.5" strokeOpacity="0.8" transform="translate(0 -0.5)" />
</React.Fragment>;
