import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { teamInput, teamPatch } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import type { Account, Team } from '../../generated/prisma/client.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { string, array, object } from '../../plugins/db/records.js';
import { accountDto } from '../accounts/dto.js';
import { teamDto } from './dto.js';
import { listTeams, getTeam, needTeam, getAccount, needAccount, findAccount, hasOwnedTeam, createTeam, updateTeam, removeTeam, teamAccounts, updateAccountTeam, currentSeason, createTransfer, teamFields } from './queries.js';
import { checkBlockedName } from '../name-validation.js';
const same = (a: unknown, b: unknown) => string(a).toLowerCase() === string(b).toLowerCase();
const invited = (team:Row,name:unknown) => Boolean(name) && array(team.pending_members).some(entry=>same(typeof entry==='string'?entry:object(entry).username,name));
function validateTeamNames(name?: string, tag?: string): void {
    if ((name !== undefined && checkBlockedName(name)) || (tag !== undefined && checkBlockedName(tag)))
        throw new HttpError(400, 'name_not_allowed', 'That team name or tag isn\'t allowed. Please choose something else.');
}
export async function moveMember(database: Database, player: Account, target: Team | null, reviewer: string): Promise<Account> {
    const from = string(player.team_id) || null, to = target ? string(target.id) : null, name = string(player.username);
    if (from === to)
        return player;
    if (target) {
        if (target.status !== 'approved')
            throw new HttpError(409, 'team_not_approved');
        if (!player.strikers_id)
            throw new HttpError(409, 'strikers_id_required');
        const members = array(target.members).filter(v => !same(v, name));
        if (members.length >= 15)
            throw new HttpError(409, 'roster_full');
        await updateTeam(database, to!, {
            members: [...members, name]
        });
    }
    if (from) {
        const old = await needTeam(database, from, true);
        await updateTeam(database, from, {
            members: array(old.members).filter(v => !same(v, name)), lineup: Object.fromEntries(Object.entries(object(old.lineup)).filter(([, v]) => !same(v, name)))
        });
    }
    const saved = await updateAccountTeam(database, player.id, to);
    const season = await currentSeason(database);
    await createTransfer(database, {
        id: crypto.randomUUID(), season, player_username: name, from_team_id: from, to_team_id: to, kind: from ? (to ? 'transfer' : 'release') : 'signing', created_by: reviewer
    });
    return saved;
}
async function notify(url: string | undefined, teamId: string, log: FastifyRequest['log']): Promise<void> {
    if (!url)
        return;
    try {
        const response = await fetch(url, {
            method: 'POST', headers: {
                'Content-Type': 'application/json'
            }, body: JSON.stringify({
                content: `League roster updated for team ${teamId}`, allowed_mentions: {
                    parse: []
                }
            }), signal: AbortSignal.timeout(5000)
        });
        if (!response.ok)
            throw new Error(`Discord status ${response.status}`);
    }
    catch {
        log.warn({
            teamId
        }, 'Roster saved, Discord notification failed');
    }
}
export function registerTeams(app: FastifyInstance, { db, webhookUrl }: Dependencies): void {
    app.get('/api/teams', {
        config: {
            public: true
        }
    }, async (request) => {
        const self = request.identity ? await getAccount(db, request.identity.id) : null;
        return listTeams(db, { username: self?.username, admin: isAdmin(request) });
    });
    app.get('/api/teams/:id', {
        config: {
            public: true
        }
    }, async (request) => {
        const row = await getTeam(db, parameters(request).id!);
        if (!row)
            return null;
        const self = request.identity ? await getAccount(db, request.identity.id) : null;
        if (row.status !== 'approved' && !isAdmin(request) && !same(row.owner_username, self?.username) && !invited(row,self?.username))
            throw new HttpError(404, 'not_found');
        return teamDto(row);
    });
    app.post('/api/teams', async (request) => {
        const input = teamInput.parse(request.body);
        validateTeamNames(input.name, input.tag);
        const name = await actorName(db, request);
        return db.transaction(async (tx) => {
            const self = await needAccount(tx, actor(request).id, true);
            if (!self.strikers_id)
                throw new HttpError(409, 'strikers_id_required');
            if (self.team_id)
                throw new HttpError(409, 'already_on_team');
            if (await hasOwnedTeam(tx, name))
                throw new HttpError(409, 'team_exists');
            const invitations = [];
            const pendingMembers = input.pendingMembers ?? [];
            if(new Set(pendingMembers.map(value=>value.toLowerCase())).size!==pendingMembers.length)throw new HttpError(400,'duplicate_invitation');
            for (const user of pendingMembers) {
                const invited = await findAccount(tx, user.toLowerCase());
                if (!invited || invited.team_id || !invited.strikers_id)
                    throw new HttpError(409, 'invitation_ineligible');
                if (!same(user, name))
                    invitations.push({
                        username: invited.username, status: 'pending', respondedAt: null
                    });
            }
            const lineup=Object.values(input.lineup??{});
            if(lineup.length>1||lineup.some(value=>!same(value,name)))throw new HttpError(400,'invalid_lineup');
            return teamDto(await createTeam(tx, {
                id: input.id, ...teamFields(input), name: input.name, tag: input.tag, seasons:isAdmin(request)?input.seasons??[]:[], owner_username: name, members: [name], pending_members: invitations, status: 'pending'
            }));
        });
    });
    app.patch('/api/teams/:id', async (request) => {
        const input = teamPatch.parse(request.body);
        validateTeamNames(input.name, input.tag);
        const name = await actorName(db, request);
        return db.transaction(async (tx) => {
            const row = await needTeam(tx, parameters(request).id!, true);
            if (!isAdmin(request) && !same(row.owner_username, name))
                throw new HttpError(403, 'captain_required');
            if (!isAdmin(request) && (input.totw !== undefined || input.totwSetAt !== undefined || input.seasons !== undefined))
                throw new HttpError(403, 'admin_required');
            if (input.lineup) {
                const members = new Set(array(row.members).map(v => string(v).toLowerCase()));
                const lineup = Object.values(input.lineup).map(v => v.toLowerCase());
                if (new Set(lineup).size !== lineup.length || lineup.some(v => !members.has(v)))
                    throw new HttpError(400, 'invalid_lineup');
            }
            return teamDto(await updateTeam(tx, row.id, teamFields(input)));
        });
    });
    app.post('/api/teams/:id/review', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = z.strictObject({
            status: z.enum(['approved', 'rejected']), reason: z.string().max(2000).optional()
        }).parse(request.body), reviewer = await actorName(db, request);
        const result = await db.transaction(async (tx) => {
            let row = await needTeam(tx, parameters(request).id!, true);
            if (row.status === input.status)
                return teamDto(row);
            if (row.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            row = await updateTeam(tx, row.id, {
                status: input.status, reviewed_by: reviewer, reviewed_at: new Date(), rejection_reason: input.reason ?? null
            });
            if (input.status === 'approved') {
                const owner = await findAccount(tx, row.owner_username.toLowerCase(), true);
                if (!owner || !owner.strikers_id || owner.team_id)
                    throw new HttpError(409, 'captain_ineligible');
                await moveMember(tx, owner, row, reviewer);
                for (const entry of array(row.pending_members)) {
                    const invitation = typeof entry === 'string' ? {
                        username: entry, status: 'pending'
                    } : object(entry);
                    if (invitation.status !== 'accepted')
                        continue;
                    const member = await findAccount(tx, string(invitation.username).toLowerCase(), true);
                    row = await needTeam(tx, row.id, true);
                    if (member && !member.team_id && member.strikers_id && array(row.members).length < 15)
                        await moveMember(tx, member, row, reviewer);
                }
            }
            return teamDto(await needTeam(tx, row.id));
        });
        await notify(webhookUrl, parameters(request).id!, request.log);
        return result;
    });
    app.post('/api/teams/:id/membership', async (request) => {
        const input = z.strictObject({
            action: z.enum(['join', 'leave']), accountId: z.uuid().optional()
        }).parse(request.body);
        const userId = input.accountId ?? actor(request).id;
        if (userId !== actor(request).id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const reviewer = await actorName(db, request);
        const saved = await db.transaction(async (tx) => {
            const team = await needTeam(tx, parameters(request).id!, true), player = await needAccount(tx, userId, true);
            if (input.action === 'leave') {
                if (player.team_id !== team.id)
                    throw new HttpError(409, 'not_on_team');
                if (!isAdmin(request) && same(team.owner_username, player.username))
                    throw new HttpError(409, 'captain_cannot_leave');
                return moveMember(tx, player, null, reviewer);
            }
            if (!isAdmin(request)) {
                const invited = array(team.pending_members).some(e => typeof e === 'string' ? same(e, player.username) : same(object(e).username, player.username) && object(e).status !== 'declined');
                if (!invited)
                    throw new HttpError(403, 'invitation_required');
                if (player.team_id && player.team_id !== team.id)
                    throw new HttpError(409, 'already_on_team');
            }
            return moveMember(tx, player, team, reviewer);
        });
        await notify(webhookUrl, parameters(request).id!, request.log);
        return {...accountDto(saved, true), ...((actor(request).id === userId) && {roles:request.userRoles})};
    });
    app.post('/api/teams/:id/invitation', async (request) => {
        const { accept } = z.strictObject({
            accept: z.boolean()
        }).parse(request.body), name = await actorName(db, request);
        return db.transaction(async (tx) => {
            const row = await needTeam(tx, parameters(request).id!, true);
            let isFound = false;
            const invitations = array(row.pending_members).map(e => typeof e === 'string' ? {
                username: e, status: 'pending', respondedAt: null
            } : object(e)).map(e => {
                if (!same(e.username, name))
                    return e;
                isFound = true;
                return {
                    ...e, status: accept ? 'accepted' : 'declined', respondedAt: Date.now()
                };
            });
            if (!isFound)
                throw new HttpError(403, 'invitation_required');
            await updateTeam(tx, row.id, {
                pending_members: invitations
            });
            if (accept && row.status === 'approved') {
                const player = await needAccount(tx, actor(request).id, true);
                if (player.team_id)
                    throw new HttpError(409, 'already_on_team');
                await moveMember(tx, player, row, name);
            }
            return teamDto(await needTeam(tx, row.id));
        });
    });
    app.delete('/api/teams/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const reviewer = await actorName(db, request);
        await db.transaction(async (tx) => {
            const team = await needTeam(tx, parameters(request).id!, true);
            const members = await teamAccounts(tx, team.id);
            for (const player of members)
                await moveMember(tx, player, null, reviewer);
            await removeTeam(tx, team.id);
        });
        return {
            ok: true
        };
    });
}
