import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Dependencies } from '../../app.js';
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
        const { userIds } = z.object({
            userIds: z.array(z.string().uuid()).max(100)
        }).strict().parse(request.body);
        await db.transaction(async (tx) => {
            const uniqueIds = [...new Set(userIds.map(id => id.toLowerCase()))].toSorted((a, b) => a.localeCompare(b));
            for (const id of uniqueIds)
                await need(tx, 'accounts', id);
            await tx.execute(Prisma.sql `DELETE FROM auth_gateway.user_roles WHERE role='admin'`);
            for (const id of uniqueIds)
                await tx.execute(Prisma.sql `INSERT INTO auth_gateway.user_roles(user_id,role) VALUES(${id}::uuid,'admin') ON CONFLICT DO NOTHING`);
        });
        return {
            ok: true
        };
    });
}
