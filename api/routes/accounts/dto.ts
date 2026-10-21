import { accountStatsSchema } from '@napl/contracts/accounts';
import type { Account, PositionChangeRequest } from '../../generated/prisma/client.js';
import type { Row } from '../../plugins/db/client.js';
import { object, string } from '../../plugins/db/records.js';
import { bytes, detailUrl, storedImage } from '../payload/page.js';

export function accountDto(row: Account, privateFields = false) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.team_id,
    imageUrl: storedImage(row.image_url, `/api/media/accounts/${row.id}/image`), country: row.country, stats: row.stats, matches: row.matches,
    awards: row.awards, championships: row.championships, totwUntil: row.totw_until?.getTime() ?? null,
    cheater: row.cheater, strikersId: row.strikers_id, steamUrl: row.steam_url, createdAt: row.created_at?.getTime() ?? null,
    ...(privateFields && { email: row.email ?? null, pendingImageUrl: storedImage(row.pending_image_url ?? null, `/api/media/accounts/${row.id}/pending-image`, false) }),
  };
}

export type AccountSummaryRow = Pick<Account,
  'id' | 'username' | 'position' | 'team_id' | 'image_url' | 'country' | 'stats' | 'awards' | 'championships' |
  'totw_until' | 'cheater' | 'strikers_id' | 'steam_url' | 'created_at'
> & { season_stats?: unknown };

export function summaryDto(row: AccountSummaryRow) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.team_id,
    imageUrl: storedImage(row.image_url, `/api/media/accounts/${row.id}/image`), country: row.country, stats: row.stats, matches: [],
    awards: row.awards, championships: row.championships, totwUntil: row.totw_until?.getTime() ?? null,
    cheater: row.cheater, strikersId: row.strikers_id == null ? null : String(row.strikers_id),
    steamUrl: row.steam_url, createdAt: row.created_at?.getTime() ?? null,
    seasonStats: row.season_stats ?? { all: object(row.stats) },
  };
}

function rankedAccountDto(row: Row) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: storedImage(row.imageUrl, `/api/media/accounts/${String(row.id)}/image`), country: row.country, stats: row.stats, matches: row.matches,
    awards: row.awards, championships: row.championships, totwUntil: row.totwUntil,
    cheater: row.cheater, strikersId: row.strikersId, steamUrl: row.steamUrl, createdAt: row.createdAt,
    seasonStats: row.seasonStats, ranking: row.ranking, cardStats: row.cardStats, team: row.team ?? null,
  };
}

export function rankedAccountsDto(rows: Row[], pending?: Pick<Account, 'id' | 'pending_image_url'>[]) {
  const byId = new Map(pending?.map(row => [row.id, row.pending_image_url]));
  return rows.map(row => ({
    ...rankedAccountDto(row), ...(pending && { pendingImageUrl: storedImage(byId.get(String(row.id)) ?? null, `/api/media/accounts/${String(row.id)}/pending-image`, false) }),
  }));
}

export function currentAccountDto(result: {
  summary: Row; privateFields: Pick<Account, 'email' | 'pending_image_url'> | null;
} | null, roles: string[]) {
  if (!result) return null;
  return {
    ...rankedAccountDto(result.summary), email: result.privateFields?.email ?? null,
    pendingImageUrl: storedImage(result.privateFields?.pending_image_url ?? null, `/api/media/accounts/${String(result.summary.id)}/pending-image`, false), roles,
  };
}

export function positionRequestDto(row: PositionChangeRequest) {
  return {
    id: row.id, accountId: row.account_id, username: row.username, fromPos: row.from_pos,
    toPos: row.to_pos, reason: row.reason, status: row.status, reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.getTime() ?? null, reviewNote: row.review_note,
    createdAt: row.created_at?.getTime() ?? null,
  };
}

const emptyStats = Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key => [key, 0]));
export function playerSummary(row: Row, season = 'all') {
  const source = object(season === 'all' ? row.stats : object(row.seasonStats)[season]);
  const stats = accountStatsSchema.parse(Object.fromEntries(Object.keys(emptyStats).map(key => [key, source[key] ?? 0])));
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: storedImage(row.imageUrl, `/api/media/accounts/${String(row.id)}/image`), country: row.country,
    stats, ranking: row.ranking, team: row.team ?? null,
  };
}
export function playerCard(row: Row, season = 'all') {
  const cards = Array.isArray(row.cardStats) ? row.cardStats.map(value => object(value)) : [];
  const selected = cards.find(card => card.season === season) ?? cards.find(card => card.season === null);
  const awards = Array.isArray(row.awards) ? row.awards : [];
  const championships = Array.isArray(row.championships) ? row.championships : [];
  const awardPreview: ReturnType<typeof trophySummary>[] = [], championshipPreview: ReturnType<typeof trophySummary>[] = [];
  for (const [index, value] of awards.entries()) {
    const item = trophySummary(value, String(row.id), 'awards', index);
    if (awardPreview.length >= 10 || bytes([...awardPreview, item]) > 2000) break;
    awardPreview.push(item);
  }
  if (awardPreview.length === awards.length) for (const [index, value] of championships.entries()) {
    const item = trophySummary(value, String(row.id), 'championships', index);
    if (awardPreview.length + championshipPreview.length >= 10 || bytes([...awardPreview, ...championshipPreview, item]) > 2000) break;
    championshipPreview.push(item);
  }
  return { ...playerSummary(row, season), statsUrl: `/api/accounts/${String(row.id)}/stats`, season, cardStats: selected?.cells ?? [], awardPreview, championshipPreview,
    previewHasMore: awardPreview.length < awards.length || championshipPreview.length < championships.length,
    totwUntil: row.totwUntil, cheater: row.cheater, strikersId: row.strikersId,
    steamUrl: row.steamUrl ? `/api/media/accounts/${String(row.id)}/steam` : row.steamUrl, createdAt: row.createdAt,
    awardCount: Array.isArray(row.awards) ? row.awards.length : 0,
    championshipCount: Array.isArray(row.championships) ? row.championships.length : 0,
  };
}

export function trophySummary(value: unknown, id: string, collection: string, index: number) {
  const row = object(value);
  return { awardId: string(row.awardId).slice(0, 160), season: string(row.season).slice(0, 160),
    ...(collection === 'championships' && { placement: string(row.placement).slice(0, 40), teamId: row.teamId, awardedAt: row.awardedAt }),
    previewTruncated: string(row.awardId).length > 160 || string(row.season).length > 160 || string(row.placement).length > 40,
    detailUrl: detailUrl(`/api/accounts/${id}/history/${collection}/${index}`, value),
  };
}
