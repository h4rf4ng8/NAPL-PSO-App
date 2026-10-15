import type { Database, Row } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';
import { dto, object } from '../../plugins/db/records.js';

const truthyJson = (value: Prisma.Sql) => Prisma.sql`CASE jsonb_typeof(${value})
  WHEN 'boolean' THEN (${value} #>> '{}')::boolean
  WHEN 'number' THEN (${value} #>> '{}')::numeric <> 0
  WHEN 'string' THEN (${value} #>> '{}') <> ''
  ELSE false END`;

const numericJson = (value: Prisma.Sql) => Prisma.sql`CASE WHEN jsonb_typeof(${value}) = 'number' THEN (${value} #>> '{}')::numeric ELSE 0 END`;

const statsDefaults = Prisma.sql`jsonb_build_object(
  'games',0,'wins',0,'draws',0,'losses',0,'goals',0,'assists',0,'passes',0,'tackles',0,
  'deflects',0,'catches',0,'cleanSheets',0,'motm',0
)`;

function seasonStats(matches: Prisma.Sql, stats: Prisma.Sql) {
  const goals = numericJson(Prisma.sql`m.value->'goals'`);
  const assists = numericJson(Prisma.sql`m.value->'assists'`);
  const passes = numericJson(Prisma.sql`m.value->'passes'`);
  const tackles = numericJson(Prisma.sql`m.value->'tackles'`);
  const deflects = numericJson(Prisma.sql`m.value->'deflects'`);
  const catches = numericJson(Prisma.sql`m.value->'catches'`);
  const cleanSheet = truthyJson(Prisma.sql`m.value->'cleanSheet'`);
  const motm = truthyJson(Prisma.sql`m.value->'motm'`);
  const result = Prisma.sql`COALESCE(NULLIF(m.value->>'season',''),'S1')`;
  const safeMatches = Prisma.sql`CASE WHEN jsonb_typeof(${matches}) = 'array' THEN ${matches} ELSE '[]'::jsonb END`;
  const aggregate = Prisma.sql`SELECT ${result} AS season,
    count(*) AS games,
    count(*) FILTER (WHERE m.value->>'result'='W') AS wins,
    count(*) FILTER (WHERE m.value->>'result'='L') AS losses,
    count(*) FILTER (WHERE m.value->>'result' IS DISTINCT FROM 'W' AND m.value->>'result' IS DISTINCT FROM 'L') AS draws,
    sum(${goals}) AS goals, sum(${assists}) AS assists, floor(sum(${passes}) / count(*) + 0.5) AS passes,
    sum(${tackles}) AS tackles, sum(${deflects}) AS deflects, sum(${catches}) AS catches,
    count(*) FILTER (WHERE ${cleanSheet}) AS "cleanSheets", count(*) FILTER (WHERE ${motm}) AS motm
    FROM jsonb_array_elements(${safeMatches}) AS m(value) GROUP BY ${result}`;
  return Prisma.sql`COALESCE((SELECT jsonb_object_agg(season, jsonb_build_object(
    'games',games,'wins',wins,'draws',draws,'losses',losses,'goals',goals,'assists',assists,'passes',passes,
    'tackles',tackles,'deflects',deflects,'catches',catches,'cleanSheets',"cleanSheets",'motm',motm
  )) FROM (${aggregate}) AS season_rows), '{}'::jsonb) || jsonb_build_object('all', ${statsDefaults} || COALESCE(${stats}, '{}'::jsonb))`;
}

const accountColumns = Prisma.sql`a.id, a.username, a.position, a.team_id, a.image_url, a.country,
  ${statsDefaults} || COALESCE(a.stats, '{}'::jsonb) AS stats, a.awards, a.championships, a.totw_until,
  a.cheater, a.strikers_id, a.steam_url, a.created_at`;

const publicDtoFields = [
  'id', 'username', 'position', 'team_id', 'image_url', 'country', 'stats', 'awards', 'championships',
  'totw_until', 'cheater', 'strikers_id', 'steam_url', 'created_at',
] as const;

function summaryDto(row: Row): Row {
  const projected = Object.fromEntries(publicDtoFields.map(key => [key, row[key]]));
  const summary = dto(projected);
  summary.strikersId = row.strikers_id == null ? null : String(row.strikers_id);
  summary.matches = [];
  summary.seasonStats = row.season_stats ?? { all: object(row.stats) };
  return summary;
}

export async function loadAccountSummaries(database: Database, accountId?: string): Promise<Row[]> {
  const accountFilter = accountId === undefined ? Prisma.empty : Prisma.sql` WHERE a.id=${accountId}::uuid`;
  const rows = await database.query(Prisma.sql`SELECT ${accountColumns},
    ${seasonStats(Prisma.sql`a.matches`, Prisma.sql`a.stats`)} AS season_stats
    FROM public.accounts a${accountFilter} ORDER BY a.created_at, a.id`);
  return rows.map(row => summaryDto(row));
}
