import { useEffect,useRef,useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Account } from './api/models';
import { auth } from './auth/session';
import { sessionVersion, supabase } from './auth/client';
import { resetClient } from './api/client';
import { Dashboard,PublicLeague } from './features/dashboard';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Skeleton } from './components/ui/skeleton';

export default function App() {
  const [session,setSession] = useState<Session|null>();
  const [ready,setReady] = useState(false);
  const [account,setAccount] = useState<Account|null>(null);
  const [loadedFor,setLoadedFor] = useState<string|null>();
  const [error,setError] = useState('');
  const loggingOut=useRef(false);
  const activeUser=useRef<string|null>(null);
  const renderVersion=sessionVersion();
  const initialized=session!==undefined;
  const previousUser = useRef<string|null>();
  const userId=session?.user.id ?? null;
  useEffect(() => {
    let mounted=true;
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,current) => {if(loggingOut.current)return;activeUser.current=current?.user.id??null;setSession(current);});
    void auth.completeSignIn().catch((error:unknown) => {
      if(mounted)setError(error instanceof Error?error.message:'Could not finish sign-in.');
    }).finally(() => {if(mounted)setReady(true);});
    return () => {mounted=false;subscription.unsubscribe();};
  },[]);
  useEffect(() => {
    if(!ready||!initialized)return;
    const controller=new AbortController();
    const changed=previousUser.current!==undefined&&previousUser.current!==userId;
    previousUser.current=userId;
    setAccount(null);
    const load=async () => {
      try {
        if(changed)await resetClient();
        controller.signal.throwIfAborted();
        const current=userId?await auth.getCurrent(controller.signal):null;
        controller.signal.throwIfAborted();
        setAccount(current);setLoadedFor(userId);
      } catch(error) {
        if(!controller.signal.aborted){setError(error instanceof Error?error.message:'Could not load session.');setLoadedFor(userId);}
      }
    };
    void load();
    return () => controller.abort();
    // Token refreshes keep account state and Apollo reads intact.
  },[ready,userId,initialized]);
  const handleLogout=async()=>{
    loggingOut.current=true;activeUser.current=null;
    setSession(undefined);setAccount(null);setLoadedFor(undefined);setError('');
    try {await auth.signOut();}
    catch(error) {setError(error instanceof Error?error.message:'Could not revoke the session.');}
    finally {loggingOut.current=false;setSession(null);}
  };
  const handleLogin=async()=>{if(loggingOut.current)return;const result=await auth.signInWithDiscord();if(!result.ok)setError(result.reason);};
  const loading=!ready||session===undefined||loadedFor!==userId;
  return <>
    {error&&<Alert variant="destructive" className="relative z-30 rounded-none"><AlertDescription className="flex flex-wrap items-center gap-3"><span className="min-w-0 flex-1">{error}</span><Button variant="outline" onClick={()=>{setError('');location.reload();}}>Try again</Button><Button variant="ghost" onClick={()=>setError('')}>Dismiss</Button></AlertDescription></Alert>}
    {loading?<div className="min-h-screen bg-background flex items-center justify-center p-6"><div role="status" className="w-full max-w-sm space-y-4"><p className="text-lg font-semibold">Loading league…</p><Skeleton className="h-6 w-3/4" /><Skeleton className="h-32 w-full" /></div></div>
      :(account&&account.id===userId?<Dashboard key={account.id} account={account} onLogout={handleLogout} onUpdate={current=>{if(renderVersion===sessionVersion()&&activeUser.current===userId&&current.id===userId)setAccount(current);}}/>
        :<PublicLeague onLogin={()=>{void handleLogin();}}/>)}
  </>;
}
