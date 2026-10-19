import type { Role } from '../admin/models';
import type { TeamSummary } from '../teams/models';
import type { AccountCardStats, AccountRanking, AccountStats, Championship, Match, PlayerAward, SeasonStats } from '@napl/contracts/accounts';

export type { PlayerAward } from '@napl/contracts/accounts';

export type Stats = AccountStats;
export interface Account {
  id: string; username: string; position: string; teamId: string | null; imageUrl: string | null; pendingImageUrl?: string | null;
  email?: string | null; country: string | null; stats: Stats; seasonStats?: SeasonStats; ranking: AccountRanking; cardStats: AccountCardStats; matches?: Match[]; awards?: PlayerAward[]; championships?: Championship[]; awardPreview?: PlayerAward[]; championshipPreview?: Championship[]; awardCount?: number; championshipCount?: number;
  totwUntil: number | null; cheater: boolean; strikersId: string | null; steamUrl: string | null; createdAt: number; roles?: Role[];
  _team?: TeamSummary; _seasonStats?: Stats; _cardSeason?: string; _overall?: number; _unranked?: boolean;
}
export interface PositionRequest { id: string; accountId: string; username: string; fromPos: string; toPos: string; reason: string; status: string; reviewedBy: string | null; reviewedAt: number | null; reviewNote: string; createdAt: number | null; }

export type AdminPlayer = Pick<Account, 'id' | 'username' | 'position' | 'teamId' | 'stats' | 'strikersId' | 'country' | 'pendingImageUrl' | 'imageUrl' | 'cheater'> & { team?: TeamSummary };
