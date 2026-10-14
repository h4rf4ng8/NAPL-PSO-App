import { request,segment } from '../../api/http';
import { TeamRecordsDocument } from '../../api/generated/graphql';
import { graphql } from '../../api/graphql';
import { teamRecordsSchema } from '@napl/contracts/matches';
import type { ImportResult, MatchInfo, PlayerStat, ScheduledMatch, StatEdit, Submission } from './models';
const scheduleFields=(m:Partial<ScheduledMatch>)=>({id:m.id,week:m.week,homeTeamId:m.homeTeamId,awayTeamId:m.awayTeamId,scheduledDate:m.scheduledDate,streamUrl:m.streamUrl,matchType:m.matchType,playoffRound:m.playoffRound,status:m.status,homeScore:m.homeScore,awayScore:m.awayScore,linkedMatchId:m.linkedMatchId,notes:m.notes});
export const matches={
 listSubmissions:()=>request<Submission[]>('/api/submissions'),
 saveSubmission:(s:Pick<Submission,'id'|'matchInfo'|'playerStats'|'edits'>)=>request<Submission>('/api/submissions','POST',{id:s.id,matchInfo:s.matchInfo,playerStats:s.playerStats,edits:s.edits}),
 deleteSubmission:(id:string)=>request<void>(`/api/submissions/${segment(id)}`,'DELETE'),
 approveSubmission:(id:string,matchInfo:MatchInfo,playerStats:PlayerStat[],edits:StatEdit[])=>request<Submission>(`/api/submissions/${segment(id)}/approve`,'POST',{matchInfo,playerStats,edits}),
 rejectSubmission:(id:string,reason:string)=>request<Submission>(`/api/submissions/${segment(id)}/reject`,'POST',{reason}),
 listScheduledMatches:(season:string|null=null)=>request<ScheduledMatch[]>(`/api/schedule${season?`?season=${segment(season)}`:''}`),
 saveScheduledMatch:(match:Partial<ScheduledMatch>)=>request<ScheduledMatch>('/api/schedule','POST',{...scheduleFields(match),season:match.season}),
 replaceScheduledSeason:(season:string,rows:(Pick<ScheduledMatch,'id'|'week'|'homeTeamId'|'awayTeamId'> & Partial<Omit<ScheduledMatch,'season'|'createdAt'|'updatedAt'>>)[])=>request<ScheduledMatch[]>(`/api/schedule/season/${segment(season)}`,'PUT',{matches:rows.map(scheduleFields)}),
 deleteScheduledMatch:(id:string)=>request<void>(`/api/schedule/${segment(id)}`,'DELETE'),
 importMatch:(body:unknown)=>request<ImportResult>('/api/import-match','POST',body),
};

export async function loadTeamRecords(force = false) {
  const data = await graphql(TeamRecordsDocument, {}, { force });
  const parsed = teamRecordsSchema.safeParse(data.teamRecords);
  if (!parsed.success) throw new Error('Invalid GraphQL team records data.');
  return parsed.data;
}
