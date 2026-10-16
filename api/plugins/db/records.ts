import { Prisma, type Database, type Row } from './client.js';
import { HttpError } from '../auth/identity.js';
// Match the old id::text comparisons, including noncanonical UUIDs being absent.
export const isCanonicalUuid = (value: string): boolean => /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/.test(value);
// Identifiers are exclusively constants from route registration, never request input.
const identifier = (s: string) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s))
        throw new Error('Unsafe SQL identifier');
    return Prisma.raw(`"${s}"`);
};
const table = (name: string) => Prisma.sql `public.${identifier(name)}`;
export async function list(database: Database, name: string, filter?: {
    column: string;
    value: string;
}): Promise<Row[]> {
    return database.query(Prisma.sql `SELECT * FROM ${table(name)} ${filter ? Prisma.sql `WHERE ${identifier(filter.column)}=${filter.value}` : Prisma.empty}`);
}
export async function get(database: Database, name: string, key: string, value: string, lock = false): Promise<Row | null> {
    const [row = null] = await database.query(Prisma.sql `SELECT * FROM ${table(name)} WHERE ${identifier(key)}::text=${value} ${lock ? Prisma.sql `FOR UPDATE` : Prisma.empty}`);
    return row;
}
export async function need(database: Database, name: string, value: string, lock = false): Promise<Row> {
    const row = await get(database, name, 'id', value, lock);
    if (!row)
        throw new HttpError(404, 'not_found');
    return row;
}
const jsonColumns = new Set(['stats', 'matches', 'awards', 'championships', 'members', 'pending_members', 'seasons', 'lineup', 'match_info', 'player_stats', 'edits', 'eligible_players', 'winners']);
const parameter = (key: string, value: unknown) => jsonColumns.has(key) ? Prisma.sql `${JSON.stringify(value)}::jsonb` : Prisma.sql `${value}`;
export async function insert(database: Database, name: string, data: Row): Promise<Row> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    const [row] = await database.query(Prisma.sql `INSERT INTO ${table(name)} (${Prisma.join(entries.map(([k]) => identifier(k)))}) VALUES (${Prisma.join(entries.map(([k, v]) => parameter(k, v)))}) RETURNING *`);
    if (!row)
        throw new Error('Insert returned no row');
    return row;
}
export async function patch(database: Database, name: string, key: string, data: Row): Promise<Row> {
    const entries = Object.entries(data).filter(([, v]) => v !== undefined);
    if (entries.length === 0)
        return need(database, name, key);
    const [row] = await database.query(Prisma.sql `UPDATE ${table(name)} SET ${Prisma.join(entries.map(([k, v]) => Prisma.sql `${identifier(k)}=${parameter(k, v)}`))} WHERE id::text=${key} RETURNING *`);
    if (!row)
        throw new HttpError(404, 'not_found');
    return row;
}
export async function upsert(database: Database, table: string, key: string, fields: Row): Promise<Row> {
    return (await get(database, table, 'id', key, true)) ? patch(database, table, key, fields) : insert(database, table, {
        id: key, ...fields
    });
}
export async function remove(database: Database, name: string, key: string): Promise<void> {
    await database.execute(Prisma.sql `DELETE FROM ${table(name)} WHERE id::text=${key}`);
}
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const object = (value: unknown): Row => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {};
export const timestamp = (v: unknown): number | null => v instanceof Date ? v.getTime() : (typeof v === 'string' || typeof v === 'number' ? new Date(v).getTime() : null);
export function dto(row: Row): Row {
    const output: Row = {};
    for (const [key, value] of Object.entries(row)) {
        const camel = key.replaceAll(/_([a-z])/g, (_, c: string) => c.toUpperCase());
        output[camel] = key.endsWith('_at') || ['opens_at', 'closes_at', 'totw_until', 'event_date', 'scheduled_date'].includes(key) ? timestamp(value) : value;
    }
    return output;
}
export function toColumns(input: Row, mapping: Record<string, string>): Row {
    const output: Row = {};
    for (const [key, column] of Object.entries(mapping)) {
        if (input[key] !== undefined)
            output[column] = column.endsWith('_at') || ['totw_until', 'event_date', 'scheduled_date'].includes(column) ? (input[key] === null ? null : new Date(Number(input[key]))) : input[key];
    }
    return output;
}
