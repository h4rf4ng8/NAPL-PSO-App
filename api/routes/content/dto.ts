import type { Article, News, RuleSection, ScheduledMatch, Transfer } from '../../generated/prisma/client.js';

export function newsDto(row: News) {
  return {
    id: row.id, type: row.type, title: row.title ?? '', body: row.body ?? '', pinned: row.pinned,
    homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    homeScore: row.home_score, awayScore: row.away_score, date: row.event_date?.getTime() ?? null,
    notes: row.notes ?? '', author: row.author ?? '', createdAt: row.created_at?.getTime() ?? null,
    autoFromSubmission: row.auto_from_submission,
  };
}

export function ruleDto(row: RuleSection) {
  return {
    id: row.id, title: row.title, body: row.body, sortOrder: row.sort_order,
    createdAt: row.created_at?.getTime() ?? null, updatedAt: row.updated_at?.getTime() ?? null,
  };
}

export function articleDto(row: Article) {
  return {
    id: row.id, slug: row.slug, title: row.title, coverImageUrl: row.cover_image_url,
    author: row.author, body: row.body, excerpt: row.excerpt,
    publishedAt: row.published_at?.getTime() ?? null, updatedAt: row.updated_at?.getTime() ?? null,
  };
}

export function scheduleDto(row: ScheduledMatch) {
  return {
    id: row.id, season: row.season_id, week: row.week, homeTeamId: row.home_team_id, awayTeamId: row.away_team_id,
    scheduledDate: row.scheduled_date?.getTime() ?? null, streamUrl: row.stream_url, matchType: row.match_type,
    playoffRound: row.playoff_round, status: row.status, homeScore: row.home_score, awayScore: row.away_score,
    linkedMatchId: row.linked_match_id, notes: row.notes,
    createdAt: row.created_at?.getTime() ?? null, updatedAt: row.updated_at?.getTime() ?? null,
  };
}

export function transferDto(row: Transfer & { player_username: string }) {
  return {
    id: row.id, season: row.season_id, playerUsername: row.player_username,
    fromTeamId: row.from_team_id, toTeamId: row.to_team_id, kind: row.kind, windowType: row.window_type,
    createdAt: row.created_at?.getTime() ?? null, createdBy: row.created_by,
  };
}
