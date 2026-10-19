import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { periodInput, periodPatch, voteInput } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { page, pageInput } from '../payload/page.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { periodDto } from './dto.js';
import { listVotingPeriods, databaseTime, createVotingPeriod, updateVotingPeriod, deleteVotingPeriod,
    needVotingPeriod, listVotes, voteTally, votingWindowOpen, replaceVotes } from './queries.js';

export function registerVoting(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/voting/periods', { config: { public: true } }, async request => {
      const { status } = z.object({ status: z.enum(['open', 'closed', 'resolved']).optional() }).parse(request.query);
      const periods = await listVotingPeriods(db);
      return page(periods.filter(period => !status || period.status === status).map(({ eligiblePlayers, winners, ...summary }) => ({ ...summary,
        eligiblePlayerCount: eligiblePlayers.length, winnerCount: winners && typeof winners === 'object' ? Object.keys(winners).length : 0,
      })), `voting-periods:${status ?? ''}`, pageInput(request));
    });
    app.get('/api/voting/periods/:id/:collection', { config: { public: true } }, async request => {
        const collection = z.enum(['candidates', 'winners']).parse(parameters(request).collection);
        const period = await needVotingPeriod(db, parameters(request).id!);
        request.resource = { type: 'voting_period', id: period.id };
        return page<unknown>(collection === 'candidates' ? period.eligible_players : Object.entries(period.winners && typeof period.winners === 'object' ? period.winners : {}).map(([position, username]) => ({ position, username })), `voting:${period.id}:${collection}`, pageInput(request));
    });
    app.post('/api/voting/periods', { config: { role: 'admin' } }, async (request) => {
        const input = periodInput.parse(request.body);
        const createdBy = await actorName(db, request);
        return db.transaction(async (tx) => {
            if (input.closesAt <= await databaseTime(tx)) throw new HttpError(400, 'invalid_closes_at');
            return periodDto(await createVotingPeriod(tx, input, createdBy, actor(request).id));
        });
    });
    app.patch('/api/voting/periods/:id', { config: { role: 'admin' } }, async (request) => {
        const input = periodPatch.parse(request.body);
        return periodDto(await updateVotingPeriod(db, parameters(request).id!, input));
    });
    app.delete('/api/voting/periods/:id', { config: { role: 'admin' } }, async (request) => {
        await deleteVotingPeriod(db, parameters(request).id!);
        return { ok: true };
    });
    app.get('/api/voting/periods/:id/votes', async (request) => {
        const period = await needVotingPeriod(db, parameters(request).id!);
        request.resource = { type: 'voting_period', id: period.id };
        await actorName(db, request);
        return page(await listVotes(db, period, !isAdmin(request) && period.status === 'open' ? actor(request).id : undefined), `votes:${period.id}:${actor(request).id}`, pageInput(request));
    });
    app.get('/api/voting/periods/:id/votes/me', async request => {
        const period = await needVotingPeriod(db, parameters(request).id!);
        request.resource = { type: 'voting_period', id: period.id };
        await actorName(db, request);
        return listVotes(db, period, actor(request).id);
    });
    app.get('/api/voting/periods/:id/tally', { config: { role: 'admin' } }, async request => {
        const period = await needVotingPeriod(db, parameters(request).id!);
        request.resource = { type: 'voting_period', id: period.id };
        return voteTally(db, period.id);
    });
    app.put('/api/voting/periods/:id/votes', async (request) => {
        const votes = voteInput.parse(request.body);
        await actorName(db, request);
        await db.transaction(async (tx) => {
            const period = await needVotingPeriod(tx, parameters(request).id!, true);
            request.resource = { type: 'voting_period', id: period.id };
            if (period.status !== 'open' || !await votingWindowOpen(tx, period.id)) throw new HttpError(409, 'voting_closed');
            await replaceVotes(tx, period.id, actor(request).id, votes);
        });
        return { ok: true };
    });
}
