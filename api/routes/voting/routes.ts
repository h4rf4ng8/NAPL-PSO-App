import type { FastifyInstance } from 'fastify';
import { periodInput, periodPatch, voteInput } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { periodDto } from './dto.js';
import { listVotingPeriods, databaseTime, createVotingPeriod, updateVotingPeriod, deleteVotingPeriod,
    needVotingPeriod, listVotes, votingWindowOpen, replaceVotes } from './queries.js';

export function registerVoting(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/voting/periods', { config: { public: true } }, async () => listVotingPeriods(db));
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
        await actorName(db, request);
        return listVotes(db, period, !isAdmin(request) && period.status === 'open' ? actor(request).id : undefined);
    });
    app.put('/api/voting/periods/:id/votes', async (request) => {
        const votes = voteInput.parse(request.body);
        await actorName(db, request);
        await db.transaction(async (tx) => {
            const period = await needVotingPeriod(tx, parameters(request).id!, true);
            if (period.status !== 'open' || !await votingWindowOpen(tx, period.id)) throw new HttpError(409, 'voting_closed');
            await replaceVotes(tx, period.id, actor(request).id, votes);
        });
        return { ok: true };
    });
}
