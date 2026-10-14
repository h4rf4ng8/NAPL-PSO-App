import { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { GatewayError } from '../auth/errors.js';
import type { Admission, AuthLimit, AuthStore } from './store.js';

type ValueRow = { value: boolean | string | null };
type AdmissionRow = { result: Admission };

// PostgreSQL shared auth state accepts only digests or sealed credential blobs.
export class PostgresAuthStore implements AuthStore {
  constructor(private readonly db: PrismaClient) {}

  private async query<T>(sql: Prisma.Sql): Promise<T[]> {
    try {
      return await this.db.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`SET LOCAL statement_timeout = '3s'`);
        await tx.$executeRaw(Prisma.sql`SET LOCAL lock_timeout = '2s'`);
        return tx.$queryRaw<T[]>(sql);
      }, { maxWait: 1000, timeout: 4500 });
    } catch {
      throw new GatewayError(503, 'auth_state_unavailable', 1);
    }
  }

  async consumeLogin(digest: string): Promise<boolean> {
    const [row] = await this.query<ValueRow>(Prisma.sql`
      SELECT auth_gateway.auth_consume_login(${digest}) AS value
    `);
    return row?.value === true;
  }

  async readRefresh(key: string): Promise<string | null> {
    const [row] = await this.query<ValueRow>(Prisma.sql`
      SELECT auth_gateway.auth_read_refresh(${key}) AS value
    `);
    return typeof row?.value === 'string' ? row.value : null;
  }

  async claimRefresh(sessionId: string, owner: string): Promise<boolean> {
    const [row] = await this.query<ValueRow>(Prisma.sql`
      SELECT auth_gateway.auth_claim_refresh(${sessionId}::uuid, ${owner}) AS value
    `);
    return row?.value === true;
  }

  async publishRefresh(sessionId: string, owner: string, key: string, sealed: string): Promise<boolean> {
    const [row] = await this.query<ValueRow>(Prisma.sql`
      SELECT auth_gateway.auth_publish_refresh(${sessionId}::uuid, ${owner}, ${key}, ${sealed}) AS value
    `);
    return row?.value === true;
  }

  async releaseRefresh(sessionId: string, owner: string): Promise<void> {
    await this.query(Prisma.sql`
      SELECT auth_gateway.auth_release_refresh(${sessionId}::uuid, ${owner})
    `);
  }

  async admit(limits: readonly AuthLimit[]): Promise<Admission> {
    const json = JSON.stringify(limits.map(({ key, count, windowMs }) => ({ key, count, windowMs })));
    const [row] = await this.query<AdmissionRow>(Prisma.sql`
      SELECT auth_gateway.auth_admit(${json}::jsonb) AS result
    `);
    return row?.result ?? { status: 'capacity', retryAfter: 1 };
  }
}
