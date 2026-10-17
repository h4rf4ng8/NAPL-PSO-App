import { ApiError,request,resetCsrf } from '../api/http';
import { resetClient } from '../api/client';
import type { Account,Result } from '../api/models';
export const auth = {
  async getCurrent():Promise<Account|null> {
    try { return await request<Account>('/api/users/me'); }
    catch(error) {
      if(error instanceof ApiError && error.status===401) return null;
      if(error instanceof ApiError && error.status===404) return request<Account>('/api/users/me','POST',{});
      throw error;
    }
  },
  async signInWithDiscord():Promise<Result> {
    try {
      const {url}=await request<{url:string}>('/auth/login/discord','POST',{returnTo:'/'});
      location.assign(url);
      return {ok:true};
    } catch(error) { return {ok:false,reason:error instanceof Error ? error.message : 'Could not sign in.'}; }
  },
  async signOut():Promise<void> {
    await request<void>('/auth/logout','POST',{});
    await resetClient();
    resetCsrf();
    localStorage.setItem('napl-session-change',String(Date.now()));
  },
};
