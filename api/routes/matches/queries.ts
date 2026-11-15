/* eslint-disable unicorn/prefer-structured-clone -- JSON serialization must match stored JSON, including omitted undefined fields. */
import type { Account, Submission, Team } from '../../generated/prisma/client.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';

export function listSubmissions(database: Database, submittedByAccountId?: string): Promise<Submission[]> {
  return database.query<Submission>(Prisma.sql`SELECT s.*,COALESCE(a.username,s.submitted_by) AS submitted_by,COALESCE(r.username,s.reviewed_by) AS reviewed_by
    FROM asl.submissions s LEFT JOIN asl.accounts a ON a.id=s.submitted_by_account_id LEFT JOIN asl.accounts r ON r.id=s.reviewed_by_account_id
    ${submittedByAccountId ? Prisma.sql`WHERE s.submitted_by_account_id=${submittedByAccountId}::uuid` : Prisma.empty} ORDER BY s.id`);
}
export async function getSubmission(database: Database, id: string, lock = false): Promise<Submission | null> {
  // Approval/edit/reject must serialize against the same submission row.
  const rows = await database.query<Submission>(Prisma.sql`SELECT * FROM asl.submissions WHERE id=${id} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  return rows[0] ?? null;
}
export async function needSubmission(database: Database, id: string, lock = false): Promise<Submission> {
  const submission = await getSubmission(database, id, lock);
  if (!submission) throw new HttpError(404, 'not_found');
  return submission;
}
export function saveSubmission(database: Database, id: string, data: Omit<Prisma.SubmissionUncheckedCreateInput, 'id' | 'match_info' | 'edits'> & { match_info: Row; edits: Row[] }): Promise<Submission> {
  // Match JSON.stringify storage semantics for passthrough submission fields.
  const fields = { ...data, match_info: JSON.parse(JSON.stringify(data.match_info)) as Prisma.InputJsonValue, edits: JSON.parse(JSON.stringify(data.edits)) as Prisma.InputJsonValue };
  return database.client.submission.upsert({ where: { id }, create: { ...fields, id }, update: fields });
}
export function updateSubmission(database: Database, id: string, data: Omit<Prisma.SubmissionUncheckedUpdateInput, 'match_info' | 'edits'> & { match_info?: Row; edits?: Row[] }): Promise<Submission> {
  // Keep omitted patches omitted and normalize JSON just as the former SQL writer did.
  return database.client.submission.update({ where: { id }, data: {
    ...data,
    match_info: data.match_info === undefined ? undefined : JSON.parse(JSON.stringify(data.match_info)) as Prisma.InputJsonValue,
    edits: data.edits === undefined ? undefined : JSON.parse(JSON.stringify(data.edits)) as Prisma.InputJsonValue,
  } });
}
export async function deleteSubmission(database: Database, id: string): Promise<void> {
  await database.client.submission.deleteMany({ where: { id } });
}
export async function needMatchTeam(database: Database, id: string): Promise<Team> {
  const team = await database.client.team.findUnique({ where: { id } });
  if (!team) throw new HttpError(404, 'not_found');
  return team;
}
export async function findPlayer(database: Database, username: string): Promise<Account | null> {
  // Replaying imports/approvals must observe all previous match/stat writes.
  const rows = await database.query<Account>(Prisma.sql`SELECT * FROM asl.accounts WHERE username_lower=${username} FOR UPDATE`);
  return rows[0] ?? null;
}
export function savePlayerMatches(database: Database, id: string, data: { matches: Row[]; stats: Record<string, number>; strikers_id?: string }): Promise<Account> {
  // Existing match JSON can contain undefined after legacy record normalization.
  return database.client.account.update({ where: { id }, data: { ...data, matches: JSON.parse(JSON.stringify(data.matches)) as Prisma.InputJsonValue } });
}

// Row the UI needs for the VIEW MATCH modal: each player who was in a match
// identified by its strikersMatchId, with their stats pulled from the match
// entry on their own account record.
export type MatchParticipant = {
  username: string; position: string;
  teamId: string | null; opponent: string | null; result: string;
  goals: number; assists: number; passes: number; tackles: number;
  deflects: number; catches: number; cleanSheet: boolean;
  goalsFor: number | null; goalsAgainst: number | null;
  date: number | null; season: string | null;
};

// Find every player's stats from a specific match. The match is identified by
// its strikersMatchId (game-provided match id, shared across all participants).
export async function findMatchParticipants(database: Database, matchId: string): Promise<MatchParticipant[]> {
  const rows = await database.query<MatchParticipant>(Prisma.sql`
    SELECT
      COALESCE(a.username, '') AS username,
      COALESCE(a.position, '') AS position,
      m.value->>'ownTeamId' AS "teamId",
      m.value->>'opponent' AS opponent,
      COALESCE(m.value->>'result', '') AS result,
      COALESCE((m.value->>'goals')::numeric, 0) AS goals,
      COALESCE((m.value->>'assists')::numeric, 0) AS assists,
      COALESCE((m.value->>'passes')::numeric, 0) AS passes,
      COALESCE((m.value->>'tackles')::numeric, 0) AS tackles,
      COALESCE((m.value->>'deflects')::numeric, 0) AS deflects,
      COALESCE((m.value->>'catches')::numeric, 0) AS catches,
      COALESCE((m.value->>'cleanSheet')::boolean, false) AS "cleanSheet",
      CASE WHEN jsonb_typeof(m.value->'goalsFor')='number' THEN (m.value->>'goalsFor')::numeric ELSE NULL END AS "goalsFor",
      CASE WHEN jsonb_typeof(m.value->'goalsAgainst')='number' THEN (m.value->>'goalsAgainst')::numeric ELSE NULL END AS "goalsAgainst",
      CASE WHEN jsonb_typeof(m.value->'date')='number' THEN (m.value->>'date')::numeric ELSE NULL END AS date,
      m.value->>'season' AS season
    FROM asl.accounts a CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(a.matches)='array' THEN a.matches ELSE '[]'::jsonb END
    ) AS m(value)
    WHERE m.value->>'strikersMatchId' = ${matchId}
    ORDER BY a.username`);
  return rows.map(row => ({
    ...row,
    goals: Number(row.goals), assists: Number(row.assists), passes: Number(row.passes), tackles: Number(row.tackles),
    deflects: Number(row.deflects), catches: Number(row.catches),
    goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
    goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
    date: row.date === null ? null : Number(row.date),
  }));
}

// Remove a match from every player's record. Admin-only — for erasing a
// mis-entered match entirely. Updates every account that had the match on
// their matches array, filtering out the entry whose strikersMatchId matches.
export async function deleteMatchFromAllPlayers(database: Database, matchId: string): Promise<number> {
  const result = await database.query<{ id: string }>(Prisma.sql`
    UPDATE asl.accounts SET matches = (
      SELECT COALESCE(jsonb_agg(m.value), '[]'::jsonb)
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(matches)='array' THEN matches ELSE '[]'::jsonb END
      ) AS m(value)
      WHERE m.value->>'strikersMatchId' IS DISTINCT FROM ${matchId}
    )
    WHERE jsonb_typeof(matches)='array' AND matches @> jsonb_build_array(jsonb_build_object('strikersMatchId', ${matchId}::text))
    RETURNING id`);
  return result.length;
}
export async function saveResultNews(database: Database, id: string, data: Omit<Prisma.NewsCreateInput, 'id'>) {
  // Retain the old upsert lock against simultaneous news edits.
  const rows = await database.query<{ id: string }>(Prisma.sql`SELECT id FROM asl.news WHERE id=${id} FOR UPDATE`);
  return rows.length > 0
    ? database.client.news.update({ where: { id }, data })
    : database.client.news.create({ data: { ...data, id } });
}
