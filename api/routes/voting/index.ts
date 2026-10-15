import type { FastifyInstance } from 'fastify';
import { periodInput, periodPatch, voteInput, VOTE_FIELDS } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError, actorName, isAdmin } from '../../plugins/auth/identity.js';
import { Prisma } from '../../plugins/db/client.js';
import { get, need, insert, patch, remove, dto, array, string, toColumns, timestamp } from '../../plugins/db/records.js';
import { periodDto } from './dto.js';
import { listVotingPeriods } from './queries.js';
export function registerVoting(app: FastifyInstance, { db }: Dependencies): void {
    app.get('/api/voting/periods', {
        config: {
            public: true
        }
    }, async () => listVotingPeriods(db));
    app.post('/api/voting/periods', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = periodInput.parse(request.body);
        const createdBy = await actorName(db, request);
        return db.transaction(async (tx) => {
            const [clock] = await tx.query(Prisma.sql `SELECT clock_timestamp() AS now`);
            if (input.closesAt <= Number(timestamp(clock?.now)))
                throw new HttpError(400, 'invalid_closes_at');
            return periodDto(await insert(tx, 'totw_voting_periods', {
                closes_at: new Date(input.closesAt), eligible_players: input.eligiblePlayers, created_by: createdBy, status: 'open'
            }));
        });
    });
    app.patch('/api/voting/periods/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = periodPatch.parse(request.body);
        return periodDto(await patch(db, 'totw_voting_periods', parameters(request).id!, toColumns(input, {
            closesAt: 'closes_at', eligiblePlayers: 'eligible_players', status: 'status', winners: 'winners', resolvedAt: 'resolved_at'
        })));
    });
    app.delete('/api/voting/periods/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        await remove(db, 'totw_voting_periods', parameters(request).id!);
        return {
            ok: true
        };
    });
    app.get('/api/voting/periods/:id/votes', async (request) => {
        const period = await need(db, 'totw_voting_periods', parameters(request).id!), name = await actorName(db, request);
        const rows = await db.query(Prisma.sql `SELECT * FROM public.totw_votes WHERE period_id::text=${parameters(request).id}`);
        return rows.filter(r => isAdmin(request) || period.status !== 'open' || r.voter_username === name).map(value => dto(value));
    });
    app.put('/api/voting/periods/:id/votes', async (request) => {
        const votes = voteInput.parse(request.body), name = await actorName(db, request);
        await db.transaction(async (tx) => {
            const period = await need(tx, 'totw_voting_periods', parameters(request).id!, true);
            const [window] = await tx.query(Prisma.sql `SELECT
                p.status='open'
                AND (p.opens_at IS NULL OR p.opens_at <= clock.now)
                AND p.closes_at > clock.now AS is_open
                FROM public.totw_voting_periods p
                CROSS JOIN (SELECT clock_timestamp() AS now) clock
                WHERE p.id::text=${parameters(request).id}`);
            if (period.status !== 'open' || window?.is_open !== true)
                throw new HttpError(409, 'voting_closed');
            const eligible = new Set(array(period.eligible_players).map(v => string(v).toLowerCase()));
            for (const { key, pos } of VOTE_FIELDS) {
                const chosen = votes[key];
                if (chosen.toLowerCase() === name.toLowerCase() || !eligible.has(chosen.toLowerCase()))
                    throw new HttpError(400, 'ineligible_vote');
                const player = await get(tx, 'accounts', 'username_lower', chosen.toLowerCase());
                if (!player || player.position !== pos)
                    throw new HttpError(400, 'vote_position_mismatch');
            }
            await tx.execute(Prisma.sql `DELETE FROM public.totw_votes WHERE period_id::text=${period.id} AND voter_username=${name}`);
            for (const { key, pos } of VOTE_FIELDS)
                await insert(tx, 'totw_votes', {
                    period_id: period.id, voter_username: name, position: pos, voted_for_username: votes[key]
                });
        });
        return {
            ok: true
        };
    });
}
