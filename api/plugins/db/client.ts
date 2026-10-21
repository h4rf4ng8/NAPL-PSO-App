import { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
export type Row = Record<string, unknown>;
export interface Database {
    readonly client: Prisma.TransactionClient;
    query<T extends Row = Row>(sql: Prisma.Sql): Promise<T[]>;
    execute(sql: Prisma.Sql): Promise<number>;
    transaction<T>(work: (database: Database) => Promise<T>, options?: { maxWait: number; timeout: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T>;
    close(): Promise<void>;
}
function wrap(client: PrismaClient | Prisma.TransactionClient): Database {
    return {
        client,
        query: <T extends Row>(sql: Prisma.Sql) => client.$queryRaw<T[]>(sql),
        execute: sql => client.$executeRaw(sql),
        transaction: (work, options) => '$transaction' in client ? client.$transaction(tx => work(wrap(tx)), {
            isolationLevel: 'Serializable', timeout: 15_000, ...options
        }) : work(wrap(client)),
        close: async () => {
            if ('$disconnect' in client)
                await client.$disconnect();
        },
    };
}
export function connectDatabase(url: string): Database {
    return wrap(new PrismaClient({
        adapter: new PrismaPg({
            connectionString: url, max: 1, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30_000
        })
    }));
}
export { Prisma } from '../../generated/prisma/client.js';
