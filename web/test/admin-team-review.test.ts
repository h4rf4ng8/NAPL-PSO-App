import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Team } from '../src/api/models';
import { partitionReviewTeams } from '../src/features/admin/team-review';

const team = (id: string, status: string): Team => ({
  id, status, name: id, tag: '', color: '', description: '', ownerUsername: '', members: [],
  invitations: [], pendingMembers: [], totw: false, totwSetAt: null, seasons: [], formation: '',
  lineup: {}, logoUrl: null, createdAt: 0, reviewedAt: null, reviewedBy: null, rejectionReason: null,
});

test('team review filters preserve order and exclude unrelated statuses', () => {
  const result = partitionReviewTeams([team('p1', 'pending'), team('a1', 'approved'), team('p2', 'pending'), team('archived', 'archived')]);
  assert.deepEqual(result.pending.map(row => row.id), ['p1', 'p2']);
  assert.deepEqual(result.approved.map(row => row.id), ['a1']);
  assert.deepEqual(result.rejected, []);
});
