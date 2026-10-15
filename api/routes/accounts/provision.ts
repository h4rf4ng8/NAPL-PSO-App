import { POS } from '@napl/contracts';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { get, insert, object, string } from '../../plugins/db/records.js';
import type { Identity } from '../../plugins/auth/identity.js';

export async function provisionAccount(database: Database, identity: Identity) {
    return database.transaction(async (tx) => {
        await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id},0))`);
        const existing = await get(tx, 'accounts', 'id', identity.id);
        if (existing) return existing;
        const metadata = object(identity.claims.user_metadata);
        const candidate = string(metadata.preferred_username || metadata.user_name || metadata.name || metadata.username)
            .replaceAll(/[^\p{L}\p{N}_. -]/gu, '').trim().slice(0, 20);
        const base = candidate.length >= 2 ? candidate : 'Player';
        await tx.execute(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'username:' + base.toLowerCase()},0))`);
        let name = base;
        if (await get(tx, 'accounts', 'username_lower', name.toLowerCase()))
            name = `${base}_${identity.id.replaceAll('-', '')}`;
        if (await get(tx, 'accounts', 'username_lower', name.toLowerCase()))
            name = `${base}_${crypto.randomUUID().replaceAll('-', '')}`;
        return insert(tx, 'accounts', {
            id: identity.id, username: name, username_lower: name.toLowerCase(), position: POS.CM,
            email: typeof identity.claims.email === 'string' ? identity.claims.email : null,
            stats: {}, matches: [], awards: [], championships: [],
        });
    });
}
