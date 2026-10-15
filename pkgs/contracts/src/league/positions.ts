export const POS = {
  GK: 'GK', CB: 'CB', LB: 'LB', RB: 'RB', DEF: 'DEF', CDM: 'CDM', CM: 'CM',
  CAM: 'CAM', LW: 'LW', RW: 'RW', WG: 'WG', ST: 'ST', FLEX: 'FLEX',
} as const;

export type Position = typeof POS[keyof typeof POS];

export const POSITIONS = [POS.ST, POS.WG, POS.CM, POS.DEF, POS.GK, POS.FLEX] as const;
export const ALL_POSITIONS: readonly Position[] = Object.values(POS);

export const POS_LABELS = {
  [POS.ST]: 'Striker',
  [POS.WG]: 'Winger',
  [POS.CM]: 'Midfielder',
  [POS.DEF]: 'Defender',
  [POS.GK]: 'Goalkeeper',
  [POS.FLEX]: 'Flexible',
} as const satisfies Record<typeof POSITIONS[number], string>;

// These uppercase values are persisted in team.lineup and must remain stable.
export const SLOT = {
  ST_L: 'ST_L', ST_R: 'ST_R', ST_C: 'ST_C', ST: POS.ST,
  CM: POS.CM, CM_L: 'CM_L', CM_C: 'CM_C', CM_R: 'CM_R',
  DEF_L: 'DEF_L', DEF_C: 'DEF_C', DEF_R: 'DEF_R', DEF: POS.DEF, GK: POS.GK,
} as const;
export type SlotId = typeof SLOT[keyof typeof SLOT];

export const VOTE_FIELDS = [
  { key: 'gk', pos: POS.GK, label: POS_LABELS[POS.GK].toUpperCase(), needed: 1 },
  { key: 'def', pos: POS.DEF, label: POS_LABELS[POS.DEF].toUpperCase(), needed: 2 },
  { key: 'cm', pos: POS.CM, label: POS_LABELS[POS.CM].toUpperCase(), needed: 1 },
  { key: 'st', pos: POS.ST, label: POS_LABELS[POS.ST].toUpperCase(), needed: 2 },
] as const;
export type VoteKey = typeof VOTE_FIELDS[number]['key'];
export type VotePosition = typeof VOTE_FIELDS[number]['pos'];
export const VOTE_POSITIONS: readonly VotePosition[] = VOTE_FIELDS.map(({ pos }) => pos);
