import type { JWTPayload } from 'jose';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Prisma, type Database } from '../db/client.js';
export interface Identity {
    id: string;
    sessionId: string;
    claims: JWTPayload;
}
export type VerifyToken = (token: string) => Promise<Identity>;
export class HttpError extends Error {
    constructor(public status: number, public code: string, message = code, public retryAfter?: number) {
        super(message);
    }
}
export function actor(request: FastifyRequest): Identity {
    if (!request.identity) throw new HttpError(401, 'authentication_required');
    return request.identity;
}
export function isAdmin(request: FastifyRequest): boolean {
    return request.userRoles.includes('admin') || request.userRoles.includes('super_admin');
}
export async function actorName(database: Database, request: FastifyRequest): Promise<string> {
    const [row] = await database.query(Prisma.sql`SELECT username FROM asl.accounts WHERE id=${actor(request).id}::uuid`);
    if (!row || typeof row.username !== 'string') throw new HttpError(409, 'profile_required');
    return row.username;
}
export async function roles(database: Database, userId: string): Promise<('admin' | 'super_admin')[]> {
    const rows = await database.query(Prisma.sql `SELECT role FROM auth_gateway.user_roles WHERE user_id=${userId}::uuid`);
    return rows.map(r => z.enum(['admin', 'super_admin']).parse(r.role));
}
export async function requireMember(database: Database, userId: string): Promise<void> {
    const [record] = await database.query(Prisma.sql `SELECT eligible, valid_until > now() AS fresh FROM auth_gateway.memberships WHERE user_id=${userId}::uuid`);
    if (!record || !record.fresh)
        throw new HttpError(401, 'membership_refresh_required');
    if (!record.eligible)
        throw new HttpError(403, 'membership_required');
}
export async function requireActiveSession(database: Database, sessionId: string): Promise<void> {
    const [row] = await database.query(Prisma.sql `SELECT auth_gateway.session_active(${sessionId}::uuid) AS active`);
    if (!row?.active)
        throw new HttpError(401, 'session_expired');
}
