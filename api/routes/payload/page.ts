import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../plugins/auth/identity.js';
import type { FastifyRequest } from 'fastify';

export const RESPONSE_BYTES = 10_000;
// Leave room for the GraphQL envelope and its selected __typename fields.
export const PAGE_BYTES = 7000;
export type Page<T> = { nodes: T[]; pageInfo: { endCursor: string | null; hasNextPage: boolean }; totalCount: number };
export const bytes = (value: unknown): number => Buffer.byteLength(JSON.stringify(value), 'utf8');
export function pathSegment(value: string): string {
  // Keep Unicode literal in JSON while retaining URI escaping for reserved ASCII characters.
  return encodeURIComponent(value).replaceAll(/(?:%[C-F][\dA-F])(?:%[89AB][\dA-F])+/g, encoded => decodeURIComponent(encoded));
}
export const revision = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 16);
export const detailUrl = (path: string, value: unknown): string => `${path}?revision=${revision(value)}`;
export function requireRevision(value: unknown, request: FastifyRequest): void {
  const expected = z.object({ revision: z.string().length(16) }).parse(request.query).revision;
  if (expected !== revision(value)) throw new HttpError(409, 'stale_cursor');
}
export function pageInput(request: FastifyRequest): { first?: number; after?: string } {
  return z.object({ first: z.coerce.number().int().min(1).max(50).optional(), after: z.string().max(100).optional() }).parse(request.query);
}

export function page<T>(rows: T[], scope: string, args: { first?: number | null; after?: string | null } = {}): Page<T> {
  const first = z.int().min(1).max(50).parse(args.first ?? 10);
  const version = createHash('sha256').update(scope).update(JSON.stringify(rows)).digest('base64url').slice(0, 16);
  let start = 0;
  if (args.after) {
    const match = /^([\w-]{16}):(\d+)$/.exec(args.after);
    if (!match) throw new HttpError(400, 'invalid_cursor');
    if (match[1] !== version) throw new HttpError(409, 'stale_cursor');
    start = Number(match[2]);
    if (!Number.isSafeInteger(start) || start < 0 || start > rows.length) throw new HttpError(400, 'invalid_cursor');
  }
  const result: Page<T> = { nodes: [], pageInfo: { endCursor: null, hasNextPage: start < rows.length }, totalCount: rows.length };
  for (let index = start; index < rows.length && result.nodes.length < first; index++) {
    const previous = result.pageInfo;
    result.nodes.push(rows[index]!);
    result.pageInfo = { endCursor: `${version}:${index + 1}`, hasNextPage: index + 1 < rows.length };
    if (bytes(result) > PAGE_BYTES) {
      result.nodes.pop();
      result.pageInfo = previous;
      break;
    }
  }
  if (result.nodes.length === 0 && start < rows.length) throw new HttpError(503, 'record_requires_detail');
  return result;
}

export function textPage(text: string, scope: string, after?: string): Page<string> {
  const chunks: string[] = [];
  let chunk = '';
  let size = 2;
  for (const character of text) {
    const characterBytes = bytes(character) - 2;
    if (size + characterBytes > 4000) { chunks.push(chunk); chunk = ''; size = 2; }
    chunk += character;
    size += characterBytes;
  }
  if (chunk || chunks.length === 0) chunks.push(chunk);
  return page(chunks, scope, { first: 1, after });
}

export function storedImage(value: unknown, path: string): unknown {
  if (typeof value === 'string' && value.startsWith(`${path}?v=`) && /^[\w-]{12}$/.test(value.slice(path.length + 3))) return value;
  return typeof value === 'string' && value.length > 0 ? `${path}?v=${createHash('sha256').update(value).digest('base64url').slice(0, 12)}` : value;
}
