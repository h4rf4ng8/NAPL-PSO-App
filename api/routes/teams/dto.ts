import type { Team } from '../../generated/prisma/client.js';
import { DEFAULT_FORMATION } from '@napl/contracts';
import { array, object, string, timestamp } from '../../plugins/db/records.js';

export function teamDto(row: Team) {
  const invitations = array(row.pending_members).map(entry => typeof entry === 'string'
    ? { username: entry, status: 'pending', respondedAt: null }
    : { username: string(object(entry).username), status: string(object(entry).status) || 'pending', respondedAt: object(entry).respondedAt ?? null });
  return {
    id: row.id, name: row.name, tag: row.tag, color: row.color, description: row.description,
    ownerUsername: row.owner_username, members: row.members, totw: row.totw, totwSetAt: timestamp(row.totw_set_at),
    status: row.status, logoUrl: row.logo_url, createdAt: timestamp(row.created_at), reviewedAt: timestamp(row.reviewed_at),
    reviewedBy: row.reviewed_by, rejectionReason: row.rejection_reason,
    invitations, pendingMembers: invitations.map(entry => entry.username), seasons: array(row.seasons),
    formation: row.formation || DEFAULT_FORMATION, lineup: object(row.lineup),
  };
}
