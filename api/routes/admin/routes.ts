import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencies } from '../../app.js';
import { actor } from '../../plugins/auth/identity.js';
import { listAdmins, adminUserIds, requireAdminAccounts, replaceAdmins, appendRoleAudit } from './queries.js';
import { page, pageInput } from '../payload/page.js';

export function registerAdmin(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/roles', { config: { role: 'super_admin' } }, async request => page(await listAdmins(db), 'roles', pageInput(request)));
    app.put('/api/roles', { config: { role: 'super_admin' } }, async (request) => {
        const { userIds } = z.strictObject({ userIds: z.array(z.uuid()).max(100) }).parse(request.body);
        await db.transaction(async (tx) => {
            const previousIds = await adminUserIds(tx);
            const uniqueIds = [...new Set(userIds.map(id => id.toLowerCase()))].toSorted((a, b) => a.localeCompare(b));
            await requireAdminAccounts(tx, uniqueIds);
            if (previousIds.length === uniqueIds.length && previousIds.every((id, index) => id === uniqueIds[index])) return;
            await replaceAdmins(tx, uniqueIds);
            await appendRoleAudit(tx, actor(request).id, previousIds, uniqueIds);
        });
        return { ok: true };
    });
}
