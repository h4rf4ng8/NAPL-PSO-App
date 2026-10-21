import { PRIVATE_BUCKET } from '@napl/contracts/storage';
import { GatewayError } from '../../plugins/auth/errors.js';
import { diagnose } from '../../plugins/logging.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { teamInput, teamPatch } from '@napl/contracts';
import type { Dependencies } from '../../app.js';
import { params as parameters } from '../../plugins/request.js';
import { HttpError, actor, actorName, isAdmin } from '../../plugins/auth/identity.js';
import type { Account } from '../../generated/prisma/client.js';
import type { Database } from '../../plugins/db/client.js';
import { string, array, object } from '../../plugins/db/records.js';
import { accountDto } from '../accounts/dto.js';
import { teamDto, type TeamRecord } from './dto.js';
import { getTeam, needTeam, getAccount, needAccount, findAccount, hasOwnedTeam, createTeam, updateTeam, removeTeam, teamAccounts, updateAccountTeam, currentSeason, createTransfer, teamFields, setTeamSeasons, createInvitation, respondInvitation } from './queries.js';
import { ensureSeason } from '../settings/queries.js';
import { checkBlockedName } from '../name-validation.js';
import { pathSegment, detailUrl, page, pageInput, requireRevision, textPage } from '../payload/page.js';
import { type ImageStorage } from '../../plugins/storage/client.js';
import { prepareImage, removeUnusedImages } from '../payload/storage.js';
import { fieldPage, fieldValue } from '../payload/details.js';
const same = (a: unknown, b: unknown) => string(a).toLowerCase() === string(b).toLowerCase();
function validateTeamNames(name?: string, tag?: string): void {
    if ((name !== undefined && checkBlockedName(name)) || (tag !== undefined && checkBlockedName(tag)))
        throw new HttpError(400, 'name_not_allowed', 'That team name or tag isn\'t allowed. Please choose something else.');
}
export async function moveMember(database: Database, player: Account, target: TeamRecord | null, reviewer: { id: string; username: string }): Promise<Account> {
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
    }
    if (from) {
        const old = await needTeam(database, from, true);
        await updateTeam(database, from, {
            lineup: Object.fromEntries(Object.entries(object(old.lineup)).filter(([, v]) => !same(v, name)))
        });
    }
    const saved = await updateAccountTeam(database, player.id, to);
    const season = await currentSeason(database);
    await ensureSeason(database, season);
    await createTransfer(database, {
        id: crypto.randomUUID(), season_id: season, player_account_id: player.id, player_username_snapshot: name, from_team_id: from, to_team_id: to, kind: from ? (to ? 'transfer' : 'release') : 'signing', created_by: reviewer.username, created_by_account_id: reviewer.id
    });
    return saved;
}
async function notify(url: string | undefined, teamId: string, request: FastifyRequest): Promise<void> {
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
            throw new GatewayError(503, 'discord_notification_failed', undefined, { dependency: 'discord', operation: 'notification', failure: 'http', status: response.status });
    }
    catch (error) {
        diagnose(request, error instanceof GatewayError ? error : new GatewayError(503, 'discord_notification_failed', undefined, { dependency: 'discord', operation: 'notification', failure: error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'network' }), 'discord_notification_failed', 'warn');
        request.diagnostic!.team_id = teamId;
    }
}

const summary = (team: ReturnType<typeof teamDto>) => ({ id: team.id, name: team.name, tag: team.tag, color: team.color,
    ownerUsername: team.ownerUsername, status: team.status, logoUrl: team.logoUrl, totw: team.totw, totwSetAt: team.totwSetAt,
    createdAt: team.createdAt, reviewedAt: team.reviewedAt, reviewedBy: team.reviewedBy,
    memberCount: team.members.length, invitationCount: team.invitations.length, seasonCount: team.seasons.length,
});
const editor = (row: TeamRecord, storage?: ImageStorage) => ({ ...teamDto(row, true),
    logoUrl: (row.logo_url?.startsWith('data:image/') || (row.logo_url && storage?.reference(row.logo_url)?.bucket === PRIVATE_BUCKET)) ? teamDto(row).logoUrl : row.logo_url,
    logoStoredImage: Boolean(row.logo_url?.startsWith('data:image/') || (row.logo_url && storage?.reference(row.logo_url))),
});
export function registerTeams(app: FastifyInstance, { db, webhookUrl, storage }: Dependencies): void {
    const visibleTeam = async (request: FastifyRequest) => {
        const row = await getTeam(db, parameters(request).id!);
        if (!row || (row.status !== 'approved' && !isAdmin(request) && row.owner_account_id !== request.identity?.id && row.pending_members.every(invitation => invitation.accountId !== request.identity?.id))) throw new HttpError(404, 'not_found');
        request.resource = { type: 'team', id: row.id };
        return row;
    };
    app.get('/api/teams/:id', {
        config: {
            public: true
        }
    }, async (request) => {
        const source = await visibleTeam(request);
        const privateFields = isAdmin(request) || source.owner_account_id === request.identity?.id;
        const team = teamDto(source, privateFields);
        return { ...summary(team), formation: team.formation, lineupUrl: detailUrl(`/api/teams/${pathSegment(team.id)}/lineup`, team.lineup),
            viewerInvitation: source.pending_members.find(invitation => invitation.accountId === request.identity?.id)?.status ?? null,
            ...((isAdmin(request) || source.owner_account_id === request.identity?.id) && { editorUrl: detailUrl(`/api/teams/${pathSegment(team.id)}/editor`, team) }),
            descriptionUrl: `/api/teams/${pathSegment(team.id)}/text/description`,
            ...(privateFields && { rejectionReasonUrl: `/api/teams/${pathSegment(team.id)}/text/rejectionReason` }),
        };
    });
    app.get('/api/teams/:id/editor', async request => {
        const row = await visibleTeam(request);
        if (!isAdmin(request) && row.owner_account_id !== actor(request).id) throw new HttpError(404, 'not_found');
        requireRevision(teamDto(row, true), request);
        return fieldPage(editor(row, storage), `/api/teams/${pathSegment(row.id)}/editor`, request);
    });
    app.get('/api/teams/:id/editor/fields/:field', async request => {
        const row = await visibleTeam(request);
        if (!isAdmin(request) && row.owner_account_id !== actor(request).id) throw new HttpError(404, 'not_found');
        return fieldValue(editor(row, storage), parameters(request).field!, `team-editor:${row.id}`, request);
    });
    app.get('/api/teams/:id/lineup', { config: { public: true } }, async request => {
        const team = teamDto(await visibleTeam(request));
        requireRevision(team.lineup, request);
        return fieldPage(team.lineup, `/api/teams/${pathSegment(team.id)}/lineup`, request);
    });
    app.get('/api/teams/:id/lineup/fields/:field', { config: { public: true } }, async request => {
        const team = teamDto(await visibleTeam(request));
        return fieldValue(team.lineup, parameters(request).field!, `team-lineup:${team.id}`, request);
    });
    app.get('/api/teams/:id/text/:field', { config: { public: true } }, async request => {
        const field = z.enum(['description', 'rejectionReason']).parse(parameters(request).field);
        const source = await visibleTeam(request);
        const privateFields = isAdmin(request) || source.owner_account_id === request.identity?.id;
        if (field === 'rejectionReason' && !privateFields) throw new HttpError(404, 'not_found');
        const team = teamDto(source, privateFields);
        return textPage(team[field] ?? '', `team:${team.id}:${field}`, pageInput(request).after);
    });
    app.get('/api/teams/:id/:collection', { config: { public: true } }, async request => {
        const collection = z.enum(['members', 'invitations', 'seasons']).parse(parameters(request).collection);
        const team = teamDto(await visibleTeam(request));
        return page<unknown>(team[collection], `team:${team.id}:${collection}`, pageInput(request));
    });
    app.post('/api/teams', async (request) => {
        const input = teamInput.parse(request.body);
        validateTeamNames(input.name, input.tag);
        const name = await actorName(db, request);
        const images: (string | null | undefined)[] = [];
        try { return await db.transaction(async (tx) => {
            const self = await needAccount(tx, actor(request).id, true);
            if (!self.strikers_id)
                throw new HttpError(409, 'strikers_id_required');
            if (self.team_id)
                throw new HttpError(409, 'already_on_team');
            if (await hasOwnedTeam(tx, self.id))
                throw new HttpError(409, 'team_exists');
            const invitations = [];
            const pendingMembers = input.pendingMembers ?? [];
            if(new Set(pendingMembers.map(value=>value.toLowerCase())).size!==pendingMembers.length)throw new HttpError(400,'duplicate_invitation');
            for (const user of pendingMembers) {
                const invited = await findAccount(tx, user.toLowerCase());
                if (!invited || invited.team_id || !invited.strikers_id)
                    throw new HttpError(409, 'invitation_ineligible');
                if (!same(user, name))
                    invitations.push(invited.id);
            }
            const lineup=Object.values(input.lineup??{});
            if(lineup.length>1||lineup.some(value=>!same(value,name)))throw new HttpError(400,'invalid_lineup');
            input.logoUrl = await prepareImage(storage, input.logoUrl, null, { kind: 'team-logo', entityId: input.id, actorId: actor(request).id, public: false });
            images.push(input.logoUrl);
            const team = await createTeam(tx, {
                id: input.id, ...teamFields(input), name: input.name, tag: input.tag, owner_account_id: self.id, status: 'pending'
            });
            await setTeamSeasons(tx, team.id, isAdmin(request) ? input.seasons ?? [] : []);
            for (const accountId of invitations) await createInvitation(tx, team.id, accountId);
            request.resource = { type: 'team', id: team.id };
            return teamDto(await needTeam(tx, team.id));
        }); } finally { await removeUnusedImages(db, storage, request, images); }
    });
    app.patch('/api/teams/:id', async (request) => {
        const input = teamPatch.parse(request.body);
        validateTeamNames(input.name, input.tag);
        const images: (string | null | undefined)[] = [];
        try { return await db.transaction(async (tx) => {
            const row = await needTeam(tx, parameters(request).id!, true);
            if (!isAdmin(request) && row.owner_account_id !== actor(request).id)
                throw new HttpError(403, 'captain_required');
            if (!isAdmin(request) && (input.totw !== undefined || input.totwSetAt !== undefined || input.seasons !== undefined))
                throw new HttpError(403, 'admin_required');
            request.resource = { type: 'team', id: row.id };
            if (input.lineup) {
                const members = new Set([...row.members, ...(row.status === 'pending' ? [row.owner_username] : [])].map(v => v.toLowerCase()));
                const lineup = Object.values(input.lineup).map(v => v.toLowerCase());
                if (new Set(lineup).size !== lineup.length || lineup.some(v => !members.has(v)))
                    throw new HttpError(400, 'invalid_lineup');
            }
            if (input.logoUrl !== undefined) {
                images.push(row.logo_url);
                input.logoUrl = await prepareImage(storage, input.logoUrl, row.logo_url, { kind: 'team-logo', entityId: row.id, actorId: actor(request).id, public: row.status === 'approved' });
                images.push(input.logoUrl);
            }
            await updateTeam(tx, row.id, teamFields(input));
            if (input.seasons !== undefined) await setTeamSeasons(tx, row.id, input.seasons);
            return teamDto(await needTeam(tx, row.id));
        }); } finally { await removeUnusedImages(db, storage, request, images); }
    });
    app.post('/api/teams/:id/review', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const input = z.strictObject({
            status: z.enum(['approved', 'rejected']), reason: z.string().max(2000).optional()
        }).parse(request.body), reviewer = { id: actor(request).id, username: await actorName(db, request) };
        const images: (string | null | undefined)[] = [];
        try {
        const result = await db.transaction(async (tx) => {
            let row = await needTeam(tx, parameters(request).id!, true);
            request.resource = { type: 'team', id: row.id };
            if (row.status === input.status)
                return teamDto(row);
            if (row.status !== 'pending')
                throw new HttpError(409, 'already_reviewed');
            images.push(row.logo_url);
            const logo = await prepareImage(storage, row.logo_url, row.logo_url, { kind: 'team-logo', entityId: row.id, actorId: actor(request).id, public: input.status === 'approved' });
            images.push(logo);
            row = await updateTeam(tx, row.id, { logo_url: logo,
                status: input.status, reviewed_by: reviewer.username, reviewed_by_account_id: reviewer.id, reviewed_at: new Date(), rejection_reason: input.reason ?? null
            });
            if (input.status === 'approved') {
                const owner = await getAccount(tx, row.owner_account_id, true);
                if (!owner || !owner.strikers_id || owner.team_id)
                    throw new HttpError(409, 'captain_ineligible');
                await moveMember(tx, owner, row, reviewer);
                for (const invitation of row.pending_members) {
                    if (invitation.status !== 'accepted')
                        continue;
                    const member = await getAccount(tx, invitation.accountId, true);
                    row = await needTeam(tx, row.id, true);
                    if (member && !member.team_id && member.strikers_id && array(row.members).length < 15)
                        await moveMember(tx, member, row, reviewer);
                }
            }
            return teamDto(await needTeam(tx, row.id));
        });
        await notify(webhookUrl, parameters(request).id!, request);
        return result;
        } finally { await removeUnusedImages(db, storage, request, images); }
    });
    app.post('/api/teams/:id/membership', async (request) => {
        const input = z.strictObject({
            action: z.enum(['join', 'leave']), accountId: z.uuid().optional()
        }).parse(request.body);
        const userId = input.accountId ?? actor(request).id;
        if (userId !== actor(request).id && !isAdmin(request))
            throw new HttpError(403, 'forbidden');
        const reviewer = { id: actor(request).id, username: await actorName(db, request) };
        const saved = await db.transaction(async (tx) => {
            const team = await needTeam(tx, parameters(request).id!, true), player = await needAccount(tx, userId, true);
            if (input.action === 'leave') {
                if (player.team_id !== team.id)
                    throw new HttpError(409, 'not_on_team');
                if (!isAdmin(request) && team.owner_account_id === player.id)
                    throw new HttpError(409, 'captain_cannot_leave');
                request.resource = { type: 'team', id: team.id };
                return moveMember(tx, player, null, reviewer);
            }
            if (!isAdmin(request)) {
                const invited = team.pending_members.some(invitation => invitation.accountId === player.id && invitation.status !== 'declined');
                if (!invited)
                    throw new HttpError(403, 'invitation_required');
                if (player.team_id && player.team_id !== team.id)
                    throw new HttpError(409, 'already_on_team');
            }
            request.resource = { type: 'team', id: team.id };
            return moveMember(tx, player, team, reviewer);
        });
        await notify(webhookUrl, parameters(request).id!, request);
        return {...accountDto(saved, true), ...((actor(request).id === userId) && {roles:request.userRoles})};
    });
    app.post('/api/teams/:id/invitation', async (request) => {
        const { accept } = z.strictObject({
            accept: z.boolean()
        }).parse(request.body), name = await actorName(db, request);
        return db.transaction(async (tx) => {
            const row = await needTeam(tx, parameters(request).id!, true);
            await respondInvitation(tx, row.id, actor(request).id, accept);
            request.resource = { type: 'team', id: row.id };
            if (accept && row.status === 'approved') {
                const player = await needAccount(tx, actor(request).id, true);
                if (player.team_id)
                    throw new HttpError(409, 'already_on_team');
                await moveMember(tx, player, row, { id: actor(request).id, username: name });
            }
            return teamDto(await needTeam(tx, row.id));
        });
    });
    app.delete('/api/teams/:id', {
        config: {
            role: 'admin'
        }
    }, async (request) => {
        const images: (string | null | undefined)[] = [];
        try { await db.transaction(async (tx) => {
            const team = await needTeam(tx, parameters(request).id!, true);
            request.resource = { type: 'team', id: team.id };
            images.push(team.logo_url);
            await teamAccounts(tx, team.id);
            await removeTeam(tx, team.id);
        }); } finally { await removeUnusedImages(db, storage, request, images); }
        return {
            ok: true
        };
    });
}
