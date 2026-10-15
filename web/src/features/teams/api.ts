import { optional,request,segment } from '../../api/http';
import type { TeamFieldsFragment } from '../../api/generated/graphql';
import type { Account } from '../accounts/models';
import type { Team, Transfer } from './models';
export const teams={
 getTeam:(id:string)=>optional<Team>(`/api/teams/${segment(id)}`),
 listTeams:()=>request<Team[]>('/api/teams'),
 createTeam:(team:Partial<Pick<Team,'id'|'name'|'tag'|'color'|'description'|'logoUrl'|'pendingMembers'|'seasons'|'formation'|'lineup'>>)=>request<Team>('/api/teams','POST',{id:team.id,name:team.name,tag:team.tag,color:team.color,description:team.description,logoUrl:team.logoUrl,pendingMembers:team.pendingMembers,seasons:team.seasons,formation:team.formation,lineup:team.lineup}),
 saveTeam:(team:Pick<Team,'id'|'name'|'tag'|'color'|'description'|'logoUrl'|'seasons'> & Partial<Pick<Team,'formation'|'lineup'>>)=>request<Team>(`/api/teams/${segment(team.id)}`,'PATCH',{name:team.name,tag:team.tag,color:team.color,description:team.description,logoUrl:team.logoUrl,seasons:team.seasons,formation:team.formation,lineup:team.lineup}),
 saveLineup:(id:string,formation:string,lineup:Record<string,string>)=>request<Team>(`/api/teams/${segment(id)}`,'PATCH',{formation,lineup}),
 deleteTeam:(id:string)=>request<void>(`/api/teams/${segment(id)}`,'DELETE'),
 reviewTeam:(id:string,status:'approved'|'rejected',reason='')=>request<Team>(`/api/teams/${segment(id)}/review`,'POST',{status,reason}),
 respondInvitation:(id:string,accept:boolean)=>request<void>(`/api/teams/${segment(id)}/invitation`,'POST',{accept}),
 changeMembership:(id:string,action:'join'|'leave',accountId?:string)=>request<Account>(`/api/teams/${segment(id)}/membership`,'POST',{action,accountId}),
 listTransfers:(season:string|null=null)=>request<Transfer[]>(`/api/transfers${season?`?season=${segment(season)}`:''}`),
 saveTransfer:(tx:Transfer)=>request<Transfer>(`/api/transfers/${segment(tx.id)}`,'PATCH',{windowType:tx.windowType}),
 deleteTransfer:(id:string)=>request<void>(`/api/transfers/${segment(id)}`,'DELETE'),
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const invalid = (): never => { throw new Error('Invalid GraphQL team lineup data.'); };

export function mapTeam(row: TeamFieldsFragment): Team {
  if (!isRecord(row.lineup) || Object.values(row.lineup).some(value => typeof value !== 'string')) return invalid();
  return {
    ...row,
    color: row.color ?? '', description: row.description ?? '', createdAt: row.createdAt ?? 0,
    lineup: row.lineup as Record<string, string>,
  };
}
