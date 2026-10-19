import { ApiError,request } from '../api/http';
import { resetClient } from '../api/client';
import { endSession, sessionVersion, storageKey, supabase } from './client';
import { mapCurrentCard, type CurrentCard } from '../features/accounts/api';
import type { Account,Result } from '../api/models';

const pending:{callback?:Promise<void>}={};
export const auth = {
  async getCurrent(signal?:AbortSignal):Promise<Account|null> {
    try { const row = await request<CurrentCard | null>('/api/users/me','GET',undefined,signal); return row ? mapCurrentCard(row) : null; }
    catch(error) {
      if(error instanceof ApiError && error.status===401) return null;
      if(error instanceof ApiError && error.status===404) {
        await request<void>('/api/users/me','POST',{},signal);
        const row = await request<CurrentCard | null>('/api/users/me','GET',undefined,signal);
        return row ? mapCurrentCard(row) : null;
      }
      throw error;
    }
  },
  async completeSignIn():Promise<void> {
    if(location.pathname!=='/auth/callback') return;
    pending.callback ??= (async () => {
      try {
        const params = new URL(location.href).searchParams;
        if(params.get('error')) throw new Error(params.get('error_description') || 'Discord sign-in was cancelled.');
        const code=params.get('code');
        if(!code) throw new Error('Sign-in code is missing. Please sign in again.');
        const {data,error}=await supabase.auth.exchangeCodeForSession(code);
        if(error) throw error;
        const providerToken=data.session?.provider_token;
        if(!providerToken) throw new Error('Discord profile is missing. Please sign in again.');
        await request<void>('/api/users/me','POST',{providerToken});
      } finally { history.replaceState(null,'','/'); }
    })();
    return pending.callback;
  },
  async signInWithDiscord():Promise<Result> {
    try {
      const {error}=await supabase.auth.signInWithOAuth({provider:'discord',options:{redirectTo:`${location.origin}/auth/callback`,scopes:'identify email'}});
      if(error) throw error;
      return {ok:true};
    } catch(error) { return {ok:false,reason:error instanceof Error ? error.message : 'Could not sign in.'}; }
  },
  async signOut():Promise<void> {
    endSession();
    const version=sessionVersion();
    await resetClient();
    const {error}=await supabase.auth.signOut({scope:'local'});
    if(!error)return;
    // SDK 2.118 can return before cleanup when loading an expired session fails.
    if(version===sessionVersion()) {
      localStorage.removeItem(storageKey);
      await supabase.auth.signOut({scope:'local'});
    }
    throw error;
  },
};
