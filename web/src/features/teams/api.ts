import { z } from 'zod';
import { readFields } from '../../api/page';
import { sessionVersion } from '../../auth/client';
import { ApiError,request,segment } from '../../api/http';
import type { Team, Transfer } from './models';
export const teams={
 createTeam:(team:Partial<Pick<Team,'id'|'name'|'tag'|'color'|'description'|'logoUrl'|'pendingMembers'|'seasons'|'formation'|'lineup'>>)=>request<void>('/api/teams','POST',{id:team.id,name:team.name,tag:team.tag,color:team.color,description:team.description,logoUrl:team.logoUrl,pendingMembers:team.pendingMembers,seasons:team.seasons,formation:team.formation,lineup:team.lineup}),
 saveTeam:(team:Pick<Team,'id'|'name'|'tag'|'color'|'description'|'seasons'> & Partial<Pick<Team,'logoUrl'|'formation'|'lineup'>>)=>request<void>(`/api/teams/${segment(team.id)}`,'PATCH',{name:team.name,tag:team.tag,color:team.color,description:team.description,logoUrl:team.logoUrl,seasons:team.seasons,formation:team.formation,lineup:team.lineup}),
 saveLineup:(id:string,formation:string,lineup:Record<string,string>)=>request<void>(`/api/teams/${segment(id)}`,'PATCH',{formation,lineup}),
 deleteTeam:(id:string)=>request<void>(`/api/teams/${segment(id)}`,'DELETE'),
 reviewTeam:(id:string,status:'approved'|'rejected',reason='')=>request<void>(`/api/teams/${segment(id)}/review`,'POST',{status,reason}),
 respondInvitation:(id:string,accept:boolean)=>request<void>(`/api/teams/${segment(id)}/invitation`,'POST',{accept}),
 changeMembership:(id:string,action:'join'|'leave',accountId?:string)=>request<void>(`/api/teams/${segment(id)}/membership`,'POST',{action,accountId}),
 saveTransfer:(tx:Transfer)=>request<void>(`/api/transfers/${segment(tx.id)}`,'PATCH',{windowType:tx.windowType}),
 deleteTransfer:(id:string)=>request<void>(`/api/transfers/${segment(id)}`,'DELETE'),
};

// Explicit editor action: load the complete revision-bound saved values before replacement writes.
export async function loadTeamForEdit(id: string, signal?: AbortSignal): Promise<Team> {
  const version = sessionVersion();
  const check = () => { signal?.throwIfAborted(); if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.'); };
  const { editorUrl } = await request<{ editorUrl?: string }>(`/api/teams/${segment(id)}`, 'GET', undefined, signal);
  check();
  if (!editorUrl) throw new Error('Team editing is unavailable.');
  const row = teamEditorSchema.parse(await readFields(editorUrl, signal));
  check();
  return { ...row, color: row.color ?? '', description: row.description ?? '', createdAt: row.createdAt ?? 0 };
}
const teamEditorSchema = z.object({
  id: z.string(), name: z.string(), tag: z.string(), color: z.string().nullable(), description: z.string().nullable(),
  ownerUsername: z.string(), members: z.array(z.string()), invitations: z.array(z.object({ username: z.string(), status: z.string(), respondedAt: z.number().nullable() })),
  pendingMembers: z.array(z.string()), totw: z.boolean(), totwSetAt: z.number().nullable(), seasons: z.array(z.string()),
  formation: z.string(), lineup: z.record(z.string(), z.string()), status: z.string(), logoUrl: z.string().nullable(), createdAt: z.number().nullable(),
  reviewedAt: z.number().nullable(), reviewedBy: z.string().nullable(), rejectionReason: z.string().nullable(),
});
