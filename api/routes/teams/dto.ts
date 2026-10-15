import type { Row } from '../../plugins/db/client.js';
import { DEFAULT_FORMATION } from '@napl/contracts';
import { array, dto, object, string } from '../../plugins/db/records.js';

export function teamDto(row: Row): Row {
  const fields = ['id', 'name', 'tag', 'color', 'description', 'owner_username', 'members', 'totw', 'totw_set_at', 'status', 'logo_url', 'created_at', 'reviewed_at', 'reviewed_by', 'rejection_reason'];
  const result = dto(Object.fromEntries(fields.map(key => [key, row[key]])));
  const invitations = array(row.pending_members).map(entry => typeof entry === 'string'
    ? { username: entry, status: 'pending', respondedAt: null }
    : { username: string(object(entry).username), status: string(object(entry).status) || 'pending', respondedAt: object(entry).respondedAt ?? null });
  return {
    ...result,
    invitations,
    pendingMembers: invitations.map(entry => string(object(entry).username)),
    seasons: array(row.seasons),
    formation: row.formation || DEFAULT_FORMATION,
    lineup: object(row.lineup),
  };
}

export function transferDto(row: Row): Row {
  const fields = ['id', 'season', 'player_username', 'from_team_id', 'to_team_id', 'kind', 'window_type', 'created_at', 'created_by'];
  return dto(Object.fromEntries(fields.map(key => [key, row[key]])));
}
