import type { Submission } from '../../generated/prisma/client.js';
import { timestamp } from '../../plugins/db/records.js';

export function submissionDto(row: Submission) {
  return {
    id: row.id, matchInfo: row.match_info, playerStats: row.player_stats, edits: row.edits,
    status: row.status, submittedBy: row.submitted_by, submittedAt: timestamp(row.submitted_at),
    reviewedBy: row.reviewed_by, reviewedAt: timestamp(row.reviewed_at), rejectionReason: row.rejection_reason,
  };
}
