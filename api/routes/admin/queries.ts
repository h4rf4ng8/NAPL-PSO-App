import type { Database } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';

export type AdminDto = { userId: string; username: string | null; role: string };

export async function listAdmins(database: Database): Promise<AdminDto[]> {
  // Keep the join until these scalar Prisma models need relation fields elsewhere.
  return database.query<AdminDto>(Prisma.sql `SELECT r.user_id::text AS "userId",a.username,r.role FROM auth_gateway.user_roles r JOIN public.accounts a ON a.id=r.user_id ORDER BY a.username`);
}

export async function adminUserIds(database: Database): Promise<string[]> {
  const roles = await database.client.userRole.findMany({ where: { role: 'admin' }, select: { user_id: true }, orderBy: { user_id: 'asc' } });
  return roles.map(row => row.user_id);
}

export async function requireAdminAccounts(database: Database, ids: string[]): Promise<void> {
  const accounts = await database.client.account.findMany({ where: { id: { in: ids } }, select: { id: true } });
  if (accounts.length !== ids.length) throw new HttpError(404, 'not_found');
}

export async function replaceAdmins(database: Database, ids: string[]): Promise<void> {
  await database.client.userRole.deleteMany({ where: { role: 'admin' } });
  if (ids.length > 0) await database.client.userRole.createMany({ data: ids.map(user_id => ({ user_id, role: 'admin' })), skipDuplicates: true });
}

export async function appendRoleAudit(database: Database, actorId: string, previousIds: string[], nextIds: string[]): Promise<void> {
  // app_runtime can INSERT audit events but cannot SELECT, including RETURNING.
  await database.execute(Prisma.sql `INSERT INTO auth_gateway.role_audit_events(actor_user_id,previous_admin_user_ids,next_admin_user_ids)
    VALUES(${actorId}::uuid,${JSON.stringify(previousIds)}::jsonb,${JSON.stringify(nextIds)}::jsonb)`);
}
