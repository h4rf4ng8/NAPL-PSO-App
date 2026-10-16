import type { z } from 'zod';
import type { articleInput, newsInput, ruleInput, scheduleInput, transferInput } from '@napl/contracts';
import { Prisma, type Database } from '../../plugins/db/client.js';
import { HttpError } from '../../plugins/auth/identity.js';

type NewsInput = z.infer<typeof newsInput>;
type RuleInput = z.infer<typeof ruleInput>;
type ArticleInput = z.infer<typeof articleInput>;
type ScheduleInput = z.infer<typeof scheduleInput>;
type TransferInput = z.infer<typeof transferInput>;

function newsData(input: Partial<Omit<NewsInput, 'id'>>) {
  return {
    type: input.type, title: input.title, body: input.body, pinned: input.pinned,
    home_team_id: input.homeTeamId, away_team_id: input.awayTeamId,
    home_score: input.homeScore, away_score: input.awayScore,
    event_date: input.date === undefined ? undefined : (input.date === null ? null : new Date(input.date)),
    notes: input.notes, auto_from_submission: input.autoFromSubmission,
  };
}

export function listNews(db: Database) {
  return db.client.news.findMany();
}

export async function upsertNews(db: Database, input: NewsInput, author: string) {
  // Preserve the original pre-update row lock inside the route transaction.
  const existing = await db.query<{ id: string }>(Prisma.sql`SELECT id FROM public.news WHERE id=${input.id} FOR UPDATE`);
  const data = { ...newsData(input), author };
  return existing.length > 0
    ? db.client.news.update({ where: { id: input.id }, data })
    : db.client.news.create({ data: { id: input.id, ...data, type: input.type } });
}

export async function patchNews(db: Database, id: string, input: Partial<Omit<NewsInput, 'id'>>) {
  // An empty news patch only reads; unlike the other content types it has no updated_at.
  if (Object.values(input).every(value => value === undefined)) {
    const row = await db.client.news.findUnique({ where: { id } });
    if (!row) throw new HttpError(404, 'not_found');
    return row;
  }
  const [row] = await db.client.news.updateManyAndReturn({ where: { id }, data: newsData(input) });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deleteNews(db: Database, id: string): Promise<void> {
  await db.client.news.deleteMany({ where: { id } });
}

function ruleData(input: Partial<Omit<RuleInput, 'id'>>) {
  return { title: input.title, body: input.body, sort_order: input.sortOrder, updated_at: new Date() };
}

export function listRules(db: Database) {
  return db.client.ruleSection.findMany({ orderBy: { sort_order: 'asc' } });
}

export async function upsertRule(db: Database, input: RuleInput) {
  // Keep the existing row locked through the surrounding route transaction.
  const existing = await db.query<{ id: string }>(Prisma.sql`SELECT id FROM public.rules_sections WHERE id=${input.id} FOR UPDATE`);
  const data = ruleData(input);
  return existing.length > 0
    ? db.client.ruleSection.update({ where: { id: input.id }, data })
    : db.client.ruleSection.create({ data: { id: input.id, ...data, title: input.title } });
}

export async function patchRule(db: Database, id: string, input: Partial<Omit<RuleInput, 'id'>>) {
  const [row] = await db.client.ruleSection.updateManyAndReturn({ where: { id }, data: ruleData(input) });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deleteRule(db: Database, id: string): Promise<void> {
  await db.client.ruleSection.deleteMany({ where: { id } });
}

function articleData(input: Partial<Omit<ArticleInput, 'id'>>) {
  return {
    slug: input.slug, title: input.title, cover_image_url: input.coverImageUrl,
    body: input.body, excerpt: input.excerpt,
    published_at: input.publishedAt === undefined ? undefined : (input.publishedAt === null ? null : new Date(input.publishedAt)),
    updated_at: new Date(),
  };
}

export function listArticles(db: Database) {
  return db.client.article.findMany();
}

export function articleBySlug(db: Database, slug: string) {
  return db.client.article.findUnique({ where: { slug } });
}

export async function upsertArticle(db: Database, input: ArticleInput, author: string) {
  // Keep the existing row locked through the surrounding route transaction.
  const existing = await db.query<{ id: string }>(Prisma.sql`SELECT id FROM public.articles WHERE id=${input.id} FOR UPDATE`);
  const data = { ...articleData(input), author };
  return existing.length > 0
    ? db.client.article.update({ where: { id: input.id }, data })
    : db.client.article.create({ data: { id: input.id, ...data, slug: input.slug, title: input.title } });
}

export async function patchArticle(db: Database, id: string, input: Partial<Omit<ArticleInput, 'id'>>) {
  const [row] = await db.client.article.updateManyAndReturn({ where: { id }, data: articleData(input) });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deleteArticle(db: Database, id: string): Promise<void> {
  await db.client.article.deleteMany({ where: { id } });
}

function scheduleData(input: Partial<Omit<ScheduleInput, 'id'>>) {
  return {
    season: input.season, week: input.week, home_team_id: input.homeTeamId, away_team_id: input.awayTeamId,
    scheduled_date: input.scheduledDate === undefined ? undefined : (input.scheduledDate === null ? null : new Date(input.scheduledDate)),
    stream_url: input.streamUrl, match_type: input.matchType, playoff_round: input.playoffRound,
    status: input.status, home_score: input.homeScore, away_score: input.awayScore,
    linked_match_id: input.linkedMatchId, notes: input.notes,
  };
}

export function listSchedule(db: Database, season?: string) {
  return db.client.scheduledMatch.findMany({ where: season ? { season } : undefined });
}

export async function upsertScheduledMatch(db: Database, input: ScheduleInput, updatedAt?: Date) {
  // Keep the existing row locked through the surrounding route transaction.
  const existing = await db.query<{ id: string }>(Prisma.sql`SELECT id FROM public.scheduled_matches WHERE id=${input.id} FOR UPDATE`);
  const data = { ...scheduleData(input), updated_at: updatedAt };
  return existing.length > 0
    ? db.client.scheduledMatch.update({ where: { id: input.id }, data })
    : db.client.scheduledMatch.create({ data: { id: input.id, ...data } });
}

export function createScheduledMatch(db: Database, input: ScheduleInput) {
  return db.client.scheduledMatch.create({ data: { id: input.id, ...scheduleData(input) } });
}

export async function patchScheduledMatch(db: Database, id: string, input: Partial<Omit<ScheduleInput, 'id'>>) {
  const [row] = await db.client.scheduledMatch.updateManyAndReturn({ where: { id }, data: { ...scheduleData(input), updated_at: new Date() } });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deleteScheduledMatch(db: Database, id: string): Promise<void> {
  await db.client.scheduledMatch.deleteMany({ where: { id } });
}

export async function deleteScheduleSeason(db: Database, season: string): Promise<void> {
  await db.client.scheduledMatch.deleteMany({ where: { season } });
}

export function listTransfers(db: Database, season?: string) {
  return db.client.transfer.findMany({ where: season ? { season } : undefined });
}

export async function upsertTransfer(db: Database, input: TransferInput & { id: string }, createdBy: string) {
  // Keep the existing row locked through the surrounding route transaction.
  const existing = await db.query<{ id: string }>(Prisma.sql`SELECT id FROM public.transfers WHERE id=${input.id} FOR UPDATE`);
  const data = {
    season: input.season, player_username: input.playerUsername, from_team_id: input.fromTeamId,
    to_team_id: input.toTeamId, kind: input.kind, window_type: input.windowType, created_by: createdBy,
  };
  return existing.length > 0
    ? db.client.transfer.update({ where: { id: input.id }, data })
    : db.client.transfer.create({ data: { id: input.id, ...data } });
}

export async function patchTransfer(db: Database, id: string, windowType: 'league' | 'cross_league' | null) {
  const [row] = await db.client.transfer.updateManyAndReturn({ where: { id }, data: { window_type: windowType } });
  if (!row) throw new HttpError(404, 'not_found');
  return row;
}

export async function deleteTransfer(db: Database, id: string): Promise<void> {
  await db.client.transfer.deleteMany({ where: { id } });
}
