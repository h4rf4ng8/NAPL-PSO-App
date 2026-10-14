import { request } from '../../api/http';
import type { Champions, RoleAssignment, Weightings } from './models';
export const settings={
 getSeason:()=>request<string>('/api/settings/current_season'),
 setSeason:(value:string)=>request<void>('/api/settings/current_season','PUT',{value}),
 getChampions:()=>request<Champions>('/api/settings/season_champions'),
 setChampions:(value:Champions)=>request<void>('/api/settings/season_champions','PUT',{value}),
 getWeightings:()=>request<Weightings|null>('/api/settings/position_weights'),
 setWeightings:(value:Weightings)=>request<void>('/api/settings/position_weights','PUT',{value}),
 getAdminList:()=>request<RoleAssignment[]>('/api/roles'),
 setAdminList:(roles:RoleAssignment[])=>request<void>('/api/roles','PUT',{userIds:roles.filter(r=>r.role==='admin').map(r=>r.userId)}),
 getDiscordStatus:()=>request<{configured:boolean}>('/api/integrations/discord'),
};
