import type { Database } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';

export async function listAdmins(database: Database) {
  return database.query(Prisma.sql `SELECT r.user_id::text AS "userId",a.username,r.role FROM auth_gateway.user_roles r JOIN public.accounts a ON a.id=r.user_id ORDER BY a.username`);
}
