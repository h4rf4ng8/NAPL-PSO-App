import { Prisma, type Database } from '../db/client.js';
import { GatewayError } from '../auth/errors.js';
import type { Admission, AuthLimit, AuthStore } from './store.js';

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly db: Database) {}

  async admit(limits: readonly AuthLimit[]): Promise<Admission> {
    const json = JSON.stringify(limits.map(({ key, count, windowMs }) => ({ key, count, windowMs })));
    try {
      return await this.db.transaction(async tx => {
        await tx.execute(Prisma.sql`SET LOCAL statement_timeout = '3s'`);
        await tx.execute(Prisma.sql`SET LOCAL lock_timeout = '2s'`);
        const [row] = await tx.query<{ result: Admission }>(Prisma.sql`SELECT auth_gateway.auth_admit(${json}::jsonb) AS result`);
        return row?.result ?? { status: 'capacity', retryAfter: 1 };
      }, { maxWait: 1000, timeout: 4500, isolationLevel: 'ReadCommitted' });
    } catch {
      throw new GatewayError(503, 'auth_state_unavailable', 1);
    }
  }
}
