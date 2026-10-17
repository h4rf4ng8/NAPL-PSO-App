import type { z } from 'zod';
import type { periodInput, periodPatch, voteInput } from '@napl/contracts';
import { VOTE_FIELDS } from '@napl/contracts';
import type { TotwVotingPeriod } from '../../generated/prisma/client.js';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { isCanonicalUuid } from '../../plugins/db/records.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { periodDto, voteDto } from './dto.js';

export async function listVotingPeriods(database: Database): Promise<ReturnType<typeof periodDto>[]> {
  const periods = await database.client.totwVotingPeriod.findMany();
  return periods.map(period => periodDto(period));
}

export async function needVotingPeriod(database: Database, id: string, lock = false): Promise<TotwVotingPeriod> {
  if (!isCanonicalUuid(id)) throw new HttpError(404, 'not_found');
  // Prisma has no row-lock API. Acquire the lock before reading the voting clock.
  const rows = lock
    ? await database.query<TotwVotingPeriod>(Prisma.sql `SELECT * FROM public.totw_voting_periods WHERE id=${id}::uuid FOR UPDATE`)
    : undefined;
  const period = rows === undefined ? await database.client.totwVotingPeriod.findUnique({ where: { id } }) : rows[0];
  if (!period) throw new HttpError(404, 'not_found');
  return period;
}

export async function databaseTime(database: Database): Promise<number> {
  const [clock] = await database.query<{ now: Date }>(Prisma.sql `SELECT clock_timestamp() AS now`);
  return clock!.now.getTime();
}

export async function createVotingPeriod(database: Database, input: z.infer<typeof periodInput>, createdBy: string): Promise<TotwVotingPeriod> {
  return database.client.totwVotingPeriod.create({ data: {
    closes_at: new Date(input.closesAt), eligible_players: input.eligiblePlayers, created_by: createdBy, status: 'open',
  } });
}

export async function updateVotingPeriod(database: Database, id: string, input: z.infer<typeof periodPatch>): Promise<TotwVotingPeriod> {
  if (!isCanonicalUuid(id)) throw new HttpError(404, 'not_found');
  if (Object.values(input).every(value => value === undefined)) return needVotingPeriod(database, id);
  const [period] = await database.client.totwVotingPeriod.updateManyAndReturn({ where: { id }, data: {
    closes_at: input.closesAt === undefined ? undefined : new Date(input.closesAt),
    eligible_players: input.eligiblePlayers, status: input.status,
    winners: input.winners === null ? Prisma.JsonNull : input.winners,
    resolved_at: input.resolvedAt === undefined ? undefined : (input.resolvedAt === null ? null : new Date(input.resolvedAt)),
  } });
  if (!period) throw new HttpError(404, 'not_found');
  return period;
}

export async function deleteVotingPeriod(database: Database, id: string): Promise<void> {
  if (isCanonicalUuid(id)) await database.client.totwVotingPeriod.deleteMany({ where: { id } });
}

export async function listVotes(database: Database, period: TotwVotingPeriod, ownUsername?: string): Promise<ReturnType<typeof voteDto>[]> {
  const votes = await database.client.totwVote.findMany({ where: { period_id: period.id, voter_username: ownUsername } });
  return votes.map(vote => voteDto(vote));
}

export async function votingWindowOpen(database: Database, id: string): Promise<boolean> {
  const [window] = await database.query<{ is_open: boolean }>(Prisma.sql `SELECT
    p.status='open' AND (p.opens_at IS NULL OR p.opens_at <= clock.now) AND p.closes_at > clock.now AS is_open
    FROM public.totw_voting_periods p CROSS JOIN (SELECT clock_timestamp() AS now) clock WHERE p.id=${id}::uuid`);
  return window?.is_open === true;
}

export async function voterPosition(database: Database, username: string): Promise<string | null> {
  const account = await database.client.account.findUnique({ where: { username_lower: username.toLowerCase() }, select: { position: true } });
  return account?.position ?? null;
}

export async function replaceVotes(database: Database, periodId: string, username: string, votes: z.infer<typeof voteInput>): Promise<void> {
  await database.client.totwVote.deleteMany({ where: { period_id: periodId, voter_username: username } });
  await database.client.totwVote.createMany({ data: VOTE_FIELDS.map(({ key, pos }) => ({
    period_id: periodId, voter_username: username, position: pos, voted_for_username: votes[key],
  })) });
}
