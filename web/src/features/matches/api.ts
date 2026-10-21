import { request,segment } from '../../api/http';
import type { TeamRecordsQuery } from '../../api/generated/graphql';
import { z } from 'zod';
import { teamRecordsSchema } from '@napl/contracts/matches';
import type { ImportResult, ScheduledMatch } from './models';
const scheduleFields=(m:Partial<ScheduledMatch>)=>({id:m.id,week:m.week,homeTeamId:m.homeTeamId,awayTeamId:m.awayTeamId,scheduledDate:m.scheduledDate,streamUrl:m.streamUrl,matchType:m.matchType,playoffRound:m.playoffRound,status:m.status,homeScore:m.homeScore,awayScore:m.awayScore,linkedMatchId:m.linkedMatchId,notes:m.notes});
export const matches={
 saveScheduledMatch:(match:Partial<ScheduledMatch>)=>request<void>('/api/schedule','POST',{...scheduleFields(match),season:match.season}),
 replaceScheduledSeason:(season:string,rows:(Pick<ScheduledMatch,'id'|'week'|'homeTeamId'|'awayTeamId'> & Partial<Omit<ScheduledMatch,'season'|'createdAt'|'updatedAt'>>)[])=>request<void>(`/api/schedule/season/${segment(season)}`,'PUT',{matches:rows.map(scheduleFields)}),
 deleteScheduledMatch:(id:string)=>request<void>(`/api/schedule/${segment(id)}`,'DELETE'),
 importMatch:(body:unknown)=>request<ImportResult>('/api/import-match','POST',body),
};

export function mapTeamRecords(data: TeamRecordsQuery) {
  const parsed = z.object({ nodes: teamRecordsSchema, pageInfo: z.object({ endCursor: z.string().nullable(), hasNextPage: z.boolean() }), totalCount: z.number() }).safeParse(data.teamRecords);
  if (!parsed.success) throw new Error('Invalid GraphQL team records data.');
  return parsed.data;
}
