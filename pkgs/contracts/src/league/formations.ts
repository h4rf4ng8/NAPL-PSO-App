import { POS, SLOT, type Position, type SlotId } from './positions.js';

export const DEFAULT_FORMATION = '2-1-2';
export interface FormationSlot { id: SlotId; label: Position; pos: Position; x: number; y: number }
export interface Formation { id: string; name: string; label: string; description: string; slots: readonly FormationSlot[] }

export const FORMATIONS = {
  '2-1-2': {
    id: '2-1-2', name: '2-1-2', label: 'Balanced',
    description: '2 defenders, 1 mid, 2 forwards. The default.',
    slots: [
      { id: SLOT.ST_L,  label: POS.ST,  pos: POS.ST,  x: 32, y: 10 },
      { id: SLOT.ST_R,  label: POS.ST,  pos: POS.ST,  x: 68, y: 10 },
      { id: SLOT.CM,    label: POS.CM,  pos: POS.CM,  x: 50, y: 38 },
      { id: SLOT.DEF_L, label: POS.DEF, pos: POS.DEF, x: 32, y: 62 },
      { id: SLOT.DEF_R, label: POS.DEF, pos: POS.DEF, x: 68, y: 62 },
      { id: SLOT.GK,    label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
  '2-2-1': {
    id: '2-2-1', name: '2-2-1', label: 'Defensive',
    description: '2 defenders, 2 mids, 1 forward. Solid shape.',
    slots: [
      { id: SLOT.ST,    label: POS.ST,  pos: POS.ST,  x: 50, y: 10 },
      { id: SLOT.CM_L,  label: POS.CM,  pos: POS.CM,  x: 32, y: 40 },
      { id: SLOT.CM_R,  label: POS.CM,  pos: POS.CM,  x: 68, y: 40 },
      { id: SLOT.DEF_L, label: POS.DEF, pos: POS.DEF, x: 32, y: 65 },
      { id: SLOT.DEF_R, label: POS.DEF, pos: POS.DEF, x: 68, y: 65 },
      { id: SLOT.GK,    label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
  '1-2-2': {
    id: '1-2-2', name: '1-2-2', label: 'Attacking',
    description: '1 defender, 2 mids, 2 forwards. Press and go.',
    slots: [
      { id: SLOT.ST_L, label: POS.ST,  pos: POS.ST,  x: 32, y: 10 },
      { id: SLOT.ST_R, label: POS.ST,  pos: POS.ST,  x: 68, y: 10 },
      { id: SLOT.CM_L, label: POS.CM,  pos: POS.CM,  x: 32, y: 40 },
      { id: SLOT.CM_R, label: POS.CM,  pos: POS.CM,  x: 68, y: 40 },
      { id: SLOT.DEF,  label: POS.DEF, pos: POS.DEF, x: 50, y: 65 },
      { id: SLOT.GK,   label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
  '1-3-1': {
    id: '1-3-1', name: '1-3-1', label: 'Midfield-heavy',
    description: '1 defender, 3 mids, 1 forward. Control the middle.',
    slots: [
      { id: SLOT.ST,   label: POS.ST,  pos: POS.ST,  x: 50, y: 10 },
      { id: SLOT.CM_L, label: POS.CM,  pos: POS.CM,  x: 22, y: 40 },
      { id: SLOT.CM_C, label: POS.CM,  pos: POS.CM,  x: 50, y: 40 },
      { id: SLOT.CM_R, label: POS.CM,  pos: POS.CM,  x: 78, y: 40 },
      { id: SLOT.DEF,  label: POS.DEF, pos: POS.DEF, x: 50, y: 65 },
      { id: SLOT.GK,   label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
  '3-1-1': {
    id: '3-1-1', name: '3-1-1', label: 'All-out attack',
    description: '3 forwards, 1 mid, 1 defender. Pure aggression.',
    slots: [
      { id: SLOT.ST_L, label: POS.ST,  pos: POS.ST,  x: 22, y: 12 },
      { id: SLOT.ST_C, label: POS.ST,  pos: POS.ST,  x: 50, y: 10 },
      { id: SLOT.ST_R, label: POS.ST,  pos: POS.ST,  x: 78, y: 12 },
      { id: SLOT.CM,   label: POS.CM,  pos: POS.CM,  x: 50, y: 42 },
      { id: SLOT.DEF,  label: POS.DEF, pos: POS.DEF, x: 50, y: 65 },
      { id: SLOT.GK,   label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
  '1-1-3': {
    id: '1-1-3', name: '1-1-3', label: 'Park the bus',
    description: '3 defenders, 1 mid, 1 forward. Shut it down.',
    slots: [
      { id: SLOT.ST,    label: POS.ST,  pos: POS.ST,  x: 50, y: 10 },
      { id: SLOT.CM,    label: POS.CM,  pos: POS.CM,  x: 50, y: 36 },
      { id: SLOT.DEF_L, label: POS.DEF, pos: POS.DEF, x: 22, y: 62 },
      { id: SLOT.DEF_C, label: POS.DEF, pos: POS.DEF, x: 50, y: 62 },
      { id: SLOT.DEF_R, label: POS.DEF, pos: POS.DEF, x: 78, y: 62 },
      { id: SLOT.GK,    label: POS.GK,  pos: POS.GK,  x: 50, y: 85 },
    ],
  },
} as const satisfies Record<string, Formation>;

export type FormationId = keyof typeof FORMATIONS;
export const FORMATION_IDS = Object.keys(FORMATIONS);
export const getFormation = (id: string): Formation => Object.entries(FORMATIONS).find(([key]) => key === id)?.[1] ?? FORMATIONS[DEFAULT_FORMATION];
