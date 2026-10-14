import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_POSITIONS, DEFAULT_FORMATION, FORMATIONS, FORMATION_IDS, POS, POSITIONS, SLOT, VOTE_FIELDS, position, teamInput } from '../../../pkgs/contracts/src/index.ts';

test('central position IDs preserve every API-accepted value and primary order', () => {
  assert.deepEqual([...ALL_POSITIONS], ['GK', 'CB', 'LB', 'RB', 'DEF', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'WG', 'ST', 'FLEX']);
  assert.deepEqual([...POSITIONS], ['ST', 'WG', 'CM', 'DEF', 'GK', 'FLEX']);
  for (const id of ALL_POSITIONS) assert.equal(position.parse(id), id);
  assert.equal(position.safeParse('STRIKER').success, false);
  assert.equal(POS.GK, SLOT.GK);
  assert.equal(POS.DEF, SLOT.DEF);
  assert.equal(teamInput.safeParse({ id: 'team', name: 'Team', tag: 'T1', lineup: { [SLOT.ST_L]: 'Alice' } }).success, true);
  assert.equal(teamInput.safeParse({ id: 'team', name: 'Team', tag: 'T1', lineup: { UNKNOWN: 'Alice' } }).success, false);
  assert.deepEqual(VOTE_FIELDS.map(({ key, pos, needed }) => [key, pos, needed]), [
    ['gk', POS.GK, 1], ['def', POS.DEF, 2], ['cm', POS.CM, 1], ['st', POS.ST, 2],
  ]);
});

test('each formation has six unique stable slots including one goalkeeper', () => {
  assert.equal(DEFAULT_FORMATION, '2-1-2');
  assert.deepEqual(FORMATION_IDS, ['2-1-2', '2-2-1', '1-2-2', '1-3-1', '3-1-1', '1-1-3']);
  const legacySlots = {
    '2-1-2': [SLOT.ST_L, SLOT.ST_R, SLOT.CM, SLOT.DEF_L, SLOT.DEF_R, SLOT.GK],
    '2-2-1': [SLOT.ST, SLOT.CM_L, SLOT.CM_R, SLOT.DEF_L, SLOT.DEF_R, SLOT.GK],
    '1-2-2': [SLOT.ST_L, SLOT.ST_R, SLOT.CM_L, SLOT.CM_R, SLOT.DEF, SLOT.GK],
    '1-3-1': [SLOT.ST, SLOT.CM_L, SLOT.CM_C, SLOT.CM_R, SLOT.DEF, SLOT.GK],
    '3-1-1': [SLOT.ST_L, SLOT.ST_C, SLOT.ST_R, SLOT.CM, SLOT.DEF, SLOT.GK],
    '1-1-3': [SLOT.ST, SLOT.CM, SLOT.DEF_L, SLOT.DEF_C, SLOT.DEF_R, SLOT.GK],
  };
  for (const [id, expected] of Object.entries(legacySlots)) {
    assert.deepEqual(FORMATIONS[id]?.slots.map(slot => slot.id), expected, id);
  }
  for (const formation of Object.values(FORMATIONS)) {
    const ids = formation.slots.map(slot => slot.id);
    assert.equal(ids.length, 6, formation.id);
    assert.equal(new Set(ids).size, 6, formation.id);
    assert.equal(formation.slots.filter(slot => slot.pos === POS.GK).length, 1, formation.id);
    assert.ok(formation.slots.every(slot => ALL_POSITIONS.includes(slot.pos)), formation.id);
  }
});
