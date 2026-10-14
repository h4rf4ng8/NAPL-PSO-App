import { useEffect,useState } from 'react';
import type { Account } from './api/models';
import { auth } from './auth/session';
import { resetClient } from './api/client';
import { Dashboard,PublicLeague } from './features/dashboard';

// ============ ROOT ============
export default function App() {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted=true;
    let latest=0;
    const load=async () => {
      const version=++latest;
      setLoading(true); setAccount(null); setError('');
      resetClient();
      try { const current=await auth.getCurrent(); if(mounted&&version===latest) setAccount(current); }
      catch(error) { if(mounted&&version===latest) setError(error instanceof Error ? error.message : 'Could not load session.'); }
      finally { if(mounted&&version===latest) setLoading(false); }
    };
    void load();
    const changed=(event: StorageEvent) => { if(event.key==='napl-session-change') void load(); };
    addEventListener('storage',changed);
    return () => { mounted=false;removeEventListener('storage',changed); };
  }, []);
  if (loading) return <div className="min-h-screen pitch-bg flex items-center justify-center">Loading league…</div>;
  if(error) return <div role="alert" className="min-h-screen pitch-bg p-8">{error}<button onClick={()=>location.reload()}>Try again</button></div>;
  const handleLogout=async()=>{try{await auth.signOut();setAccount(null);}catch(error){setError(error instanceof Error?error.message:'Could not sign out.');}};
  const handleLogin=async()=>{const result=await auth.signInWithDiscord();if(!result.ok)setError(result.reason);};
  return account
    ? <Dashboard key={account.id} account={account} onLogout={handleLogout} onUpdate={setAccount} />
    : <PublicLeague onLogin={()=>{void handleLogin();}} />;
}
