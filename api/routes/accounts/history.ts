import { accountMatchPageSchema, accountOpponentsSchema, type AccountMatchPage, type AccountOpponent } from '@napl/contracts/accounts';
import { z } from 'zod';
import { HttpError } from '../../plugins/auth/identity.js';
import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';

export const accountIdSchema = z.uuid();
const cursorSchema = z.strictObject({
  id: z.uuid(), season: z.string().nullable(), opponent: z.string().nullable(), version: z.string().min(1), ordinal: z.int().positive().max(Number.MAX_SAFE_INTEGER),
});
type Cursor = z.infer<typeof cursorSchema>;

function decodeCursor(value: string): Cursor {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new HttpError(400, 'invalid_cursor');
  }
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export async function accountMatches(database: Database, args: {
  id: string; first?: number | null; after?: string | null; season?: string | null; opponent?: string | null;
}): Promise<AccountMatchPage> {
  const id = accountIdSchema.parse(args.id);
  const first = z.int().min(1).max(50).parse(args.first ?? 25);
  const season = args.season == null ? null : z.string().min(1).max(64).parse(args.season);
  const opponent = args.opponent == null ? null : z.string().min(1).max(160).parse(args.opponent);
  const afterValue = args.after == null ? null : z.string().min(1).max(512).parse(args.after);
  const after = afterValue === null ? null : decodeCursor(afterValue);
  if (after && (after.id !== id || after.season !== season || after.opponent !== opponent)) throw new HttpError(400, 'cursor_filter_mismatch');

  // JSON ordinality and xmin bind each page to the same stored history snapshot.
  const rows = await database.query<Row>(Prisma.sql`WITH target AS (
    SELECT id::text AS id, xmin::text AS version, matches FROM public.accounts WHERE id=${id}::uuid
  ), page AS (
    SELECT CASE WHEN jsonb_typeof(m.value)='object'
      THEN m.value || jsonb_build_object('opponent', COALESCE(NULLIF(m.value->>'opponent',''),'Unknown'),
        'season', COALESCE(NULLIF(m.value->>'season',''),'S1'))
      ELSE m.value END AS match, m.ordinality::int AS ordinality
    FROM target CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(target.matches)='array' THEN target.matches ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS m(value, ordinality)
    WHERE (${season}::text IS NULL OR COALESCE(NULLIF(m.value->>'season',''),'S1')=${season})
      AND (${opponent}::text IS NULL OR COALESCE(NULLIF(m.value->>'opponent',''),'Unknown')=${opponent})
      AND m.ordinality > ${after?.ordinal ?? 0}
    ORDER BY m.ordinality LIMIT ${first + 1}
  )
  SELECT target.version, page.match, page.ordinality
  FROM target LEFT JOIN page ON TRUE ORDER BY page.ordinality NULLS FIRST`);
  const version = rows[0]?.version;
  if (typeof version !== 'string') throw new HttpError(404, 'not_found');
  if (after && after.version !== version) throw new HttpError(409, 'stale_cursor');
  const matches = rows.filter(row => row.match !== null && row.match !== undefined);
  const hasNextPage = matches.length > first;
  const pageRows = matches.slice(0, first);
  const nodes = pageRows.map(row => row.match);
  const lastOrdinal = pageRows.at(-1)?.ordinality;
  const endCursor = typeof lastOrdinal === 'number' && nodes.length > 0
    ? encodeCursor({ id, season, opponent, version, ordinal: lastOrdinal }) : null;
  return accountMatchPageSchema.parse({ nodes, pageInfo: { endCursor, hasNextPage } });
}

export async function accountOpponents(database: Database, idValue: string): Promise<AccountOpponent[]> {
  const id = accountIdSchema.parse(idValue);
  // Aggregate historical JSON in PostgreSQL without returning the full match history.
  const rows = await database.query<Row>(Prisma.sql`SELECT
    COALESCE(NULLIF(m.value->>'opponent',''),'Unknown') AS opponent, count(*)::int AS games,
    count(*) FILTER (WHERE m.value->>'result'='W')::int AS w,
    count(*) FILTER (WHERE m.value->>'result' IS DISTINCT FROM 'W' AND m.value->>'result' IS DISTINCT FROM 'L')::int AS d,
    count(*) FILTER (WHERE m.value->>'result'='L')::int AS l,
    COALESCE(sum(CASE WHEN jsonb_typeof(m.value->'goals')='number' THEN (m.value->>'goals')::numeric ELSE 0 END),0) AS goals,
    COALESCE(sum(CASE WHEN jsonb_typeof(m.value->'assists')='number' THEN (m.value->>'assists')::numeric ELSE 0 END),0) AS assists,
    count(*) FILTER (WHERE CASE jsonb_typeof(m.value->'motm') WHEN 'boolean' THEN (m.value->>'motm')::boolean WHEN 'number' THEN (m.value->>'motm')::numeric<>0 WHEN 'string' THEN (m.value->>'motm')<>'' ELSE false END)::int AS motm
    FROM public.accounts a CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.matches)='array' THEN a.matches ELSE '[]'::jsonb END
    ) AS m(value)
    WHERE a.id=${id}::uuid
    GROUP BY COALESCE(NULLIF(m.value->>'opponent',''),'Unknown') ORDER BY games DESC, opponent`);
  return accountOpponentsSchema.parse(rows.map(row => ({
    ...row,
    games: Number(row.games), w: Number(row.w), d: Number(row.d), l: Number(row.l),
    goals: Number(row.goals), assists: Number(row.assists), motm: Number(row.motm),
  })));
}
