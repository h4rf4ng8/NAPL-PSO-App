import { createClient, type Session } from '@supabase/supabase-js';

const env = import.meta.env;
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY || !env.VITE_API_URL) {
  throw new Error('Missing public API or Supabase configuration.');
}
const apiUrl=new URL(env.VITE_API_URL);
if(apiUrl.username||apiUrl.password||apiUrl.search||apiUrl.hash||apiUrl.pathname!=='/'
  ||(apiUrl.protocol!=='https:'&&!(apiUrl.protocol==='http:'&&(env.MODE==='test'||['localhost','127.0.0.1','[::1]'].includes(apiUrl.hostname))))) {
  throw new Error('API URL must be an absolute HTTPS origin (HTTP is allowed for local development).');
}
export const apiOrigin=apiUrl.origin;
export const storageKey='napl-auth';
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey, storage:localStorage, flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

const identity={version:0,current:null as Session|null};
export const sessionVersion = () => identity.version;
export const sessionUserId = () => identity.current?.user.id ?? null;
export function endSession() { identity.version++; }
// Track identity boundaries without treating token renewal as a new identity.
// eslint-disable-next-line unicorn/no-top-level-side-effects -- The singleton tracks identity boundaries for pending requests.
supabase.auth.onAuthStateChange((event,session) => {
  if(event==='SIGNED_OUT'||session?.user.id!==identity.current?.user.id
    ||(event==='SIGNED_IN'&&identity.current&&session?.access_token!==identity.current.access_token)) identity.version++;
  identity.current=session;
});
