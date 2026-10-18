import type { z } from 'zod';
import type { periodInput, periodPatch, voteInput } from '@napl/contracts';
import { VOTE_FIELDS } from '@napl/contracts';
import type { TotwVotingPeriod } from '../../generated/prisma/client.js';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { isCanonicalUuid } from '../../plugins/db/records.js';
import { HttpError } from '../../plugins/auth/identity.js';
import { periodDto, voteDto } from './dto.js';

const winnerPositions = new Map<string, string>(VOTE_FIELDS.flatMap(({ key, pos, needed }) => {
  const slots: [string, string][] = [[key, pos]];
  if (needed > 1) for (let index = 1; index <= needed; index++) slots.push([`${key}${index}`, pos]);
  return slots;
}));

type Period = TotwVotingPeriod & { eligible_players: string[]; winners: Prisma.JsonValue | null };

export async function listVotingPeriods(database: Database): Promise<ReturnType<typeof periodDto>[]> {
  const periods = await database.client.totwVotingPeriod.findMany();
  return Promise.all(periods.map(async period => periodDto(await hydratePeriod(database, period))));
}

async function hydratePeriod(database: Database, period: TotwVotingPeriod): Promise<Period> {
  const candidates = await database.query<{ username: string }>(Prisma.sql`SELECT a.username FROM asl.totw_candidates c
    JOIN asl.accounts a ON a.id=c.account_id WHERE c.period_id=${period.id}::uuid ORDER BY a.username`);
  const winners = await database.query<{ username: string; position: string; details: Prisma.JsonObject }>(Prisma.sql`SELECT a.username,w.position,w.details FROM asl.totw_winners w
    JOIN asl.accounts a ON a.id=w.account_id WHERE w.period_id=${period.id}::uuid`);
  const [creator] = await database.query<{ username: string }>(Prisma.sql`SELECT username FROM asl.accounts WHERE id=${period.created_by_account_id}::uuid`);
  return { ...period, created_by: creator?.username ?? period.created_by,
    eligible_players: [...new Set(candidates.map(c => c.username))],
    winners: winners.length > 0 ? Object.fromEntries(winners.map(w => [typeof w.details.key === 'string' ? w.details.key : w.position.toLowerCase(), w.username])) : null };
}

export async function needVotingPeriod(database: Database, id: string, lock = false): Promise<Period> {
  if (!isCanonicalUuid(id)) throw new HttpError(404, 'not_found');
  const rows = lock
    ? await database.query<TotwVotingPeriod>(Prisma.sql`SELECT * FROM asl.totw_voting_periods WHERE id=${id}::uuid FOR UPDATE`)
    : undefined;
  const period = rows === undefined ? await database.client.totwVotingPeriod.findUnique({ where: { id } }) : rows[0];
  if (!period) throw new HttpError(404, 'not_found');
  return hydratePeriod(database, period);
}

export async function databaseTime(database: Database): Promise<number> {
  const [clock] = await database.query<{ now: Date }>(Prisma.sql`SELECT clock_timestamp() AS now`);
  return clock!.now.getTime();
}

async function setCandidates(database: Database, id: string, names: string[]): Promise<void> {
  const accounts = await database.client.account.findMany({ where: { username_lower: { in: names.map(name => name.toLowerCase()) } } });
  if (new Set(names.map(name => name.toLowerCase())).size !== accounts.length) throw new HttpError(400, 'ineligible_vote');
  const ids = accounts.map(a => a.id);
  // Referenced candidates cannot be removed while ballots or winners still use them.
  const used = await database.query(Prisma.sql`SELECT 1 FROM asl.totw_candidates c WHERE c.period_id=${id}::uuid
    AND NOT (c.account_id = ANY(${ids}::uuid[])) AND (EXISTS (SELECT 1 FROM asl.totw_votes v WHERE v.period_id=c.period_id AND v.voted_for_account_id=c.account_id AND v.position=c.position)
    OR EXISTS (SELECT 1 FROM asl.totw_winners w WHERE w.period_id=c.period_id AND w.account_id=c.account_id AND w.position=c.position)) LIMIT 1`);
  if (used.length > 0) throw new HttpError(409, 'candidate_in_use');
  await database.execute(Prisma.sql`DELETE FROM asl.totw_candidates WHERE period_id=${id}::uuid AND NOT (account_id=ANY(${ids}::uuid[]))`);
  for (const account of accounts) {
    // Existing candidates retain their position at the time they became eligible.
    await database.execute(Prisma.sql`INSERT INTO asl.totw_candidates(period_id,account_id,position)
      SELECT ${id}::uuid,${account.id}::uuid,${['CB', 'LB', 'RB'].includes(account.position) ? 'DEF' : account.position} WHERE NOT EXISTS
      (SELECT 1 FROM asl.totw_candidates WHERE period_id=${id}::uuid AND account_id=${account.id}::uuid)`);
  }
}

export async function createVotingPeriod(database: Database, input: z.infer<typeof periodInput>, createdBy: string, actorId: string): Promise<Period> {
  const period = await database.client.totwVotingPeriod.create({ data: {
    closes_at: new Date(input.closesAt), created_by: createdBy, created_by_account_id: actorId, status: 'open',
  } });
  await setCandidates(database, period.id, input.eligiblePlayers);
  return hydratePeriod(database, period);
}

export async function updateVotingPeriod(database: Database, id: string, input: z.infer<typeof periodPatch>): Promise<Period> {
  return database.transaction(async tx => {
    const old = await needVotingPeriod(tx, id, true);
    if (input.closesAt !== undefined && input.closesAt <= old.opens_at.getTime()) throw new HttpError(400, 'invalid_closes_at');
    if (input.winners !== undefined) {
      await tx.execute(Prisma.sql`DELETE FROM asl.totw_winners WHERE period_id=${id}::uuid`);
    }
    if (input.eligiblePlayers !== undefined) await setCandidates(tx, id, input.eligiblePlayers);
    if (input.winners !== undefined) {
      const winners = Object.entries(input.winners ?? {});
      const selected = new Set<string>();
      for (const [key, value] of winners) {
        const position = winnerPositions.get(key);
        if (!position) throw new HttpError(400, 'invalid_winner_position');
        if (typeof value !== 'string') throw new HttpError(400, 'ineligible_vote');
        const [candidate] = await tx.query<{ account_id: string; position: string }>(Prisma.sql`SELECT c.account_id,c.position FROM asl.totw_candidates c
          JOIN asl.accounts a ON a.id=c.account_id WHERE c.period_id=${id}::uuid AND a.username_lower=${value.toLowerCase()} AND c.position=${position}`);
        if (!candidate) throw new HttpError(400, 'ineligible_vote');
        const identity = `${candidate.account_id}:${position}`;
        if (selected.has(identity)) throw new HttpError(400, 'duplicate_winner');
        selected.add(identity);
        await tx.execute(Prisma.sql`INSERT INTO asl.totw_winners(period_id,account_id,position,details)
          VALUES(${id}::uuid,${candidate.account_id}::uuid,${candidate.position},${JSON.stringify({ key })}::jsonb)`);
      }
    }
    const period = await tx.client.totwVotingPeriod.update({ where: { id }, data: {
      closes_at: input.closesAt === undefined ? undefined : new Date(input.closesAt), status: input.status,
      resolved_at: input.resolvedAt === undefined ? undefined : (input.resolvedAt === null ? null : new Date(input.resolvedAt)),
    } });
    return hydratePeriod(tx, period);
  });
}

export async function deleteVotingPeriod(database: Database, id: string): Promise<void> {
  if (isCanonicalUuid(id)) await database.client.totwVotingPeriod.deleteMany({ where: { id } });
}

export async function listVotes(database: Database, period: TotwVotingPeriod, ownAccountId?: string): Promise<ReturnType<typeof voteDto>[]> {
  const votes = await database.query<Parameters<typeof voteDto>[0]>(Prisma.sql`SELECT v.*,a.username AS voter_username,c.username AS voted_for_username
    FROM asl.totw_votes v JOIN asl.accounts a ON a.id=v.voter_account_id JOIN asl.accounts c ON c.id=v.voted_for_account_id
    WHERE v.period_id=${period.id}::uuid ${ownAccountId ? Prisma.sql`AND v.voter_account_id=${ownAccountId}::uuid` : Prisma.empty}`);
  return votes.map(vote => voteDto(vote));
}

export async function votingWindowOpen(database: Database, id: string): Promise<boolean> {
  const [window] = await database.query<{ is_open: boolean }>(Prisma.sql`SELECT
    p.status='open' AND p.opens_at <= clock.now AND p.closes_at > clock.now AS is_open
    FROM asl.totw_voting_periods p CROSS JOIN (SELECT clock_timestamp() AS now) clock WHERE p.id=${id}::uuid`);
  return window?.is_open === true;
}

export async function replaceVotes(database: Database, periodId: string, accountId: string, votes: z.infer<typeof voteInput>): Promise<void> {
  const candidates = await database.query<{ account_id: string; username: string; position: string }>(Prisma.sql`SELECT c.account_id,a.username,c.position
    FROM asl.totw_candidates c JOIN asl.accounts a ON a.id=c.account_id WHERE c.period_id=${periodId}::uuid`);
  const choices = VOTE_FIELDS.map(({ key, pos }) => {
    const candidate = candidates.find(c => c.username.toLowerCase() === votes[key].toLowerCase() && c.position === pos)
      ?? candidates.find(c => c.username.toLowerCase() === votes[key].toLowerCase());
    if (!candidate || candidate.account_id === accountId) throw new HttpError(400, 'ineligible_vote');
    if (candidate.position !== pos) throw new HttpError(400, 'vote_position_mismatch');
    return candidate;
  });
  await database.client.totwVote.deleteMany({ where: { period_id: periodId, voter_account_id: accountId } });
  await database.client.totwVote.createMany({ data: choices.map(c => ({
    period_id: periodId, voter_account_id: accountId, position: c.position, voted_for_account_id: c.account_id,
  })) });
}
