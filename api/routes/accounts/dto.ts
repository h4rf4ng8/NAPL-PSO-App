import type { Account, PositionChangeRequest } from '../../generated/prisma/client.js';
import type { Row } from '../../plugins/db/client.js';
import { object } from '../../plugins/db/records.js';

export function accountDto(row: Account, privateFields = false) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.team_id,
    imageUrl: row.image_url, country: row.country, stats: row.stats, matches: row.matches,
    awards: row.awards, championships: row.championships, totwUntil: row.totw_until?.getTime() ?? null,
    cheater: row.cheater, strikersId: row.strikers_id, steamUrl: row.steam_url, createdAt: row.created_at?.getTime() ?? null,
    ...(privateFields && { email: row.email ?? null, pendingImageUrl: row.pending_image_url ?? null }),
  };
}

export type AccountSummaryRow = Pick<Account,
  'id' | 'username' | 'position' | 'team_id' | 'image_url' | 'country' | 'stats' | 'awards' | 'championships' |
  'totw_until' | 'cheater' | 'strikers_id' | 'steam_url' | 'created_at'
> & { season_stats?: unknown };

export function summaryDto(row: AccountSummaryRow) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.team_id,
    imageUrl: row.image_url, country: row.country, stats: row.stats, matches: [],
    awards: row.awards, championships: row.championships, totwUntil: row.totw_until?.getTime() ?? null,
    cheater: row.cheater, strikersId: row.strikers_id == null ? null : String(row.strikers_id),
    steamUrl: row.steam_url, createdAt: row.created_at?.getTime() ?? null,
    seasonStats: row.season_stats ?? { all: object(row.stats) },
  };
}

function rankedAccountDto(row: Row) {
  return {
    id: row.id, username: row.username, position: row.position, teamId: row.teamId,
    imageUrl: row.imageUrl, country: row.country, stats: row.stats, matches: row.matches,
    awards: row.awards, championships: row.championships, totwUntil: row.totwUntil,
    cheater: row.cheater, strikersId: row.strikersId, steamUrl: row.steamUrl, createdAt: row.createdAt,
    seasonStats: row.seasonStats, ranking: row.ranking, cardStats: row.cardStats,
  };
}

export function rankedAccountsDto(rows: Row[], pending?: Pick<Account, 'id' | 'pending_image_url'>[]) {
  const byId = new Map(pending?.map(row => [row.id, row.pending_image_url]));
  return rows.map(row => ({
    ...rankedAccountDto(row), ...(pending && { pendingImageUrl: byId.get(String(row.id)) ?? null }),
  }));
}

export function currentAccountDto(result: {
  summary: Row; privateFields: Pick<Account, 'email' | 'pending_image_url'> | null;
} | null, roles: string[]) {
  if (!result) return null;
  return {
    ...rankedAccountDto(result.summary), email: result.privateFields?.email ?? null,
    pendingImageUrl: result.privateFields?.pending_image_url ?? null, roles,
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
