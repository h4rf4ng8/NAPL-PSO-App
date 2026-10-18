/* eslint-disable unicorn/prefer-structured-clone -- JSON serialization must match stored JSON, including omitted undefined fields. */
import type { Account, Submission, Team } from '../../generated/prisma/client.js';
import { Prisma, type Database, type Row } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';

export function listSubmissions(database: Database, submittedByAccountId?: string): Promise<Submission[]> {
  return database.query<Submission>(Prisma.sql`SELECT s.*,COALESCE(a.username,s.submitted_by) AS submitted_by,COALESCE(r.username,s.reviewed_by) AS reviewed_by
    FROM asl.submissions s LEFT JOIN asl.accounts a ON a.id=s.submitted_by_account_id LEFT JOIN asl.accounts r ON r.id=s.reviewed_by_account_id
    ${submittedByAccountId ? Prisma.sql`WHERE s.submitted_by_account_id=${submittedByAccountId}::uuid` : Prisma.empty}`);
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
export async function saveResultNews(database: Database, id: string, data: Omit<Prisma.NewsCreateInput, 'id'>) {
  // Retain the old upsert lock against simultaneous news edits.
  const rows = await database.query<{ id: string }>(Prisma.sql`SELECT id FROM asl.news WHERE id=${id} FOR UPDATE`);
  return rows.length > 0
    ? database.client.news.update({ where: { id }, data })
    : database.client.news.create({ data: { ...data, id } });
}
