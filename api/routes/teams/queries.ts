import type { FastifyRequest } from 'fastify';
import type { Database, Row } from '../../plugins/db/client.js';
import { get, list, array, object, string } from '../../plugins/db/records.js';
import { teamDto } from './dto.js';
import { isAdmin } from '../../plugins/auth/identity.js';

const same = (a: unknown, b: unknown) => string(a).toLowerCase() === string(b).toLowerCase();
const invited = (team: Row, name: unknown) => Boolean(name) && array(team.pending_members).some(entry => same(typeof entry === 'string' ? entry : object(entry).username, name));

export async function listTeams(database: Database, request: FastifyRequest) {
  const rows = await list(database, 'teams');
  const self = request.identity ? await get(database, 'accounts', 'id', request.identity.id) : null;
  return rows.filter(row => row.status === 'approved' || isAdmin(request) || same(row.owner_username, self?.username) || invited(row, self?.username))
    .map(row => teamDto(row));
}
