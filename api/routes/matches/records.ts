import { teamRecordsSchema, type TeamRecord } from '@napl/contracts/matches';
import type { Database } from '../../plugins/db/client.js';
import { Prisma } from '../../plugins/db/client.js';

type TeamRecordRow = Omit<TeamRecord, 'gf' | 'ga' | 'gd'> & { gf: number | string | Prisma.Decimal; ga: number | string | Prisma.Decimal; gd: number | string | Prisma.Decimal };

// JSON match expansion and first-record deduplication stay in one SQL aggregate.
export async function loadTeamRecords(database: Database): Promise<TeamRecord[]> {
  const rows = await database.query<TeamRecordRow>(Prisma.sql`WITH match_rows AS (
    SELECT a.created_at, a.id AS account_id, m.ordinality,
      m.value->>'ownTeamId' AS "teamId",
      COALESCE(NULLIF(m.value->>'season',''),'S1') AS season,
      m.value->>'strikersMatchId' AS match_id,
      m.value->>'result' AS result,
      CASE WHEN jsonb_typeof(m.value->'goalsFor')='number' THEN (m.value->>'goalsFor')::numeric ELSE 0 END AS gf,
      CASE WHEN jsonb_typeof(m.value->'goalsAgainst')='number' THEN (m.value->>'goalsAgainst')::numeric ELSE 0 END AS ga
    FROM asl.accounts a CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.matches)='array' THEN a.matches ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS m(value, ordinality)
    WHERE COALESCE(m.value->>'ownTeamId','')<>'' AND (
      jsonb_typeof(m.value->'strikersMatchId')='string' AND m.value->>'strikersMatchId'<>'' OR
      jsonb_typeof(m.value->'strikersMatchId')='number' AND m.value->'strikersMatchId'<>'0'::jsonb OR
      jsonb_typeof(m.value->'strikersMatchId')='boolean' AND m.value->'strikersMatchId'='true'::jsonb
    )
  ), first_records AS (
    SELECT *, row_number() OVER (PARTITION BY "teamId", match_id ORDER BY created_at, account_id, ordinality) AS first_record
    FROM match_rows
  ), unique_matches AS (
    SELECT * FROM first_records WHERE first_record=1
  ), forfeit_rows AS (
    -- Forfeited scheduled matches don't generate player match records (nobody
    -- played), but the team W/L still counts toward standings. Emit one row
    -- per team per forfeit so the UNION below sums W/L/GF/GA correctly.
    SELECT sm.home_team_id AS "teamId", sm.season_id AS season,
      CASE WHEN COALESCE(sm.home_score,0) > COALESCE(sm.away_score,0) THEN 'W'
           WHEN COALESCE(sm.home_score,0) < COALESCE(sm.away_score,0) THEN 'L'
           ELSE 'D' END AS result,
      COALESCE(sm.home_score,0)::numeric AS gf, COALESCE(sm.away_score,0)::numeric AS ga
    FROM asl.scheduled_matches sm WHERE sm.status = 'forfeit'
    UNION ALL
    SELECT sm.away_team_id AS "teamId", sm.season_id AS season,
      CASE WHEN COALESCE(sm.away_score,0) > COALESCE(sm.home_score,0) THEN 'W'
           WHEN COALESCE(sm.away_score,0) < COALESCE(sm.home_score,0) THEN 'L'
           ELSE 'D' END AS result,
      COALESCE(sm.away_score,0)::numeric AS gf, COALESCE(sm.home_score,0)::numeric AS ga
    FROM asl.scheduled_matches sm WHERE sm.status = 'forfeit'
  ), selected AS (
    SELECT "teamId", season, result, gf, ga FROM unique_matches
    UNION ALL
    SELECT "teamId", 'all' AS season, result, gf, ga FROM unique_matches
    UNION ALL
    SELECT "teamId", season, result, gf, ga FROM forfeit_rows
    UNION ALL
    SELECT "teamId", 'all' AS season, result, gf, ga FROM forfeit_rows
  )
  SELECT "teamId", season, count(*)::int AS played,
    count(*) FILTER (WHERE result='W')::int AS w,
    count(*) FILTER (WHERE result IS DISTINCT FROM 'W' AND result IS DISTINCT FROM 'L')::int AS d,
    count(*) FILTER (WHERE result='L')::int AS l,
    COALESCE(sum(gf),0) AS gf, COALESCE(sum(ga),0) AS ga,
    COALESCE(sum(gf)-sum(ga),0) AS gd,
    (count(*) FILTER (WHERE result='W')*3 + count(*) FILTER (WHERE result IS DISTINCT FROM 'W' AND result IS DISTINCT FROM 'L'))::int AS pts
  FROM selected GROUP BY "teamId", season ORDER BY "teamId", season`);
  return teamRecordsSchema.parse(rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'bigint' || typeof value === 'object' && value !== null ? Number(value) : value]))));
}
