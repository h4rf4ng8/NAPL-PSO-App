import type { Team } from '../../generated/prisma/client.js';
import { DEFAULT_FORMATION } from '@napl/contracts';
import { object, timestamp } from '../../plugins/db/records.js';

export type TeamRecord = Team & { owner_username: string; members: string[]; pending_members: { accountId: string; username: string; status: string; respondedAt: number | null }[]; seasons: string[] };

export function teamDto(row: TeamRecord) {
  const invitations = row.pending_members.map(({ username, status, respondedAt }) => ({ username, status, respondedAt }));
  return {
    id: row.id, name: row.name, tag: row.tag, color: row.color, description: row.description,
    ownerUsername: row.owner_username, members: row.status === 'pending' ? [...new Set([row.owner_username, ...row.members])] : row.members, totw: row.totw, totwSetAt: timestamp(row.totw_set_at),
    status: row.status, logoUrl: row.logo_url, createdAt: timestamp(row.created_at), reviewedAt: timestamp(row.reviewed_at),
    reviewedBy: row.reviewed_by, rejectionReason: row.rejection_reason,
    invitations, pendingMembers: invitations.map(entry => entry.username), seasons: row.seasons,
    formation: row.formation || DEFAULT_FORMATION, lineup: object(row.lineup),
  };
}
