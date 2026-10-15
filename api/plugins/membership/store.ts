import { PrismaClient } from '../../generated/prisma/client.js';

export interface MembershipStore {
  fresh(userId: string): Promise<boolean | null>;
  save(userId: string, discordUserId: string, eligible: boolean): Promise<void>;
}

/**
Gateway auth tables use snake_case in the merged API Prisma schema.
*/
export class PostgresMembershipStore implements MembershipStore {
  constructor(private readonly db: PrismaClient) {}

  async fresh(userId: string): Promise<boolean | null> {
    const membership = await this.db.membership.findFirst({
      where: { user_id: userId, valid_until: { gt: new Date() } },
      select: { eligible: true },
    });
    return membership?.eligible ?? null;
  }

  async save(userId: string, discordUserId: string, eligible: boolean): Promise<void> {
    const checkedAt = new Date();
    const data = {
      discord_user_id: discordUserId,
      eligible,
      checked_at: checkedAt,
      valid_until: new Date(checkedAt.getTime() + (eligible ? 300_000 : 30_000)),
    };
    await this.db.membership.upsert({
      where: { user_id: userId },
      create: { user_id: userId, ...data },
      update: data,
    });
  }
}
