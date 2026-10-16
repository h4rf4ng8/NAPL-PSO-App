import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencies } from '../../app.js';
import { actor } from '../../plugins/auth/identity.js';
import { Prisma } from '../../plugins/db/client.js';
import { need } from '../../plugins/db/records.js';
import { listAdmins } from './queries.js';

export function registerAdmin(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/roles', { config: { role: 'super_admin' } }, async () => listAdmins(db));
    app.put('/api/roles', {
        config: {
            role: 'super_admin'
        }
    }, async (request) => {
        const { userIds } = z.strictObject({
            userIds: z.array(z.uuid()).max(100)
        }).parse(request.body);
        await db.transaction(async (tx) => {
            const previous = await tx.query<{ user_id: string }>(Prisma.sql `SELECT user_id::text FROM auth_gateway.user_roles WHERE role='admin' ORDER BY user_id`);
            const previousIds = previous.map(row => row.user_id);
            const uniqueIds = [...new Set(userIds.map(id => id.toLowerCase()))].toSorted((a, b) => a.localeCompare(b));
            for (const id of uniqueIds)
                await need(tx, 'accounts', id);
            if (previousIds.length === uniqueIds.length && previousIds.every((id, index) => id === uniqueIds[index])) return;
            await tx.execute(Prisma.sql `DELETE FROM auth_gateway.user_roles WHERE role='admin'`);
            for (const id of uniqueIds)
                await tx.execute(Prisma.sql `INSERT INTO auth_gateway.user_roles(user_id,role) VALUES(${id}::uuid,'admin') ON CONFLICT DO NOTHING`);
            await tx.execute(Prisma.sql `INSERT INTO auth_gateway.role_audit_events(actor_user_id,previous_admin_user_ids,next_admin_user_ids)
                VALUES(${actor(request).id}::uuid,${JSON.stringify(previousIds)}::jsonb,${JSON.stringify(uniqueIds)}::jsonb)`);
        });
        return {
            ok: true
        };
    });
}
