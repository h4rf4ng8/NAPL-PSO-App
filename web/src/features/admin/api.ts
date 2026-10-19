import { readFields, readValue, pagePath, type Page } from '../../api/page';
import { sessionVersion } from '../../auth/client';
import { ApiError, request } from '../../api/http';
import type { Champions, RoleAssignment, Weightings } from './models';
export const settings={
 getSeason:()=>request<string>('/api/settings/current_season'),
 setSeason:(value:string)=>request<void>('/api/settings/current_season','PUT',{value}),
 getChampions:async()=>await readFields('/api/settings/season_champions') as Champions,
 setChampions:(value:Champions)=>request<void>('/api/settings/season_champions','PUT',{value}),
 getWeightings:async()=>await readValue('/api/settings/position_weights') as Weightings|null,
 setWeightings:(value:Weightings)=>request<void>('/api/settings/position_weights','PUT',{value}),
 getAdminList:async()=>{
  const version=sessionVersion();
  const check=()=>{if(version!==sessionVersion())throw new ApiError(401,'login_required','Please sign in again.');};
  const roles: RoleAssignment[]=[]; let after: string|null=null;
  do { check(); const page:Page<RoleAssignment>=await request(pagePath('/api/roles',after)); check(); roles.push(...page.nodes); after=page.pageInfo.hasNextPage?page.pageInfo.endCursor:null; } while(after);
  return roles;
 },
 setAdminList:(roles:RoleAssignment[])=>request<void>('/api/roles','PUT',{userIds:roles.filter(r=>r.role==='admin').map(r=>r.userId)}),
 getDiscordStatus:()=>request<{configured:boolean}>('/api/integrations/discord'),
};
