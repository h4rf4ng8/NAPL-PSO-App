import { useEffect, useState } from 'react';
import { settings as adminApi } from './api';



import { C } from '../../theme/theme';






// Integrations Manager
export const IntegrationsManager = () => {
  const [status,setStatus]=useState('Loading Discord integration…');
  useEffect(()=>{void (async()=>{try { const {configured}=await adminApi.getDiscordStatus(); setStatus(configured?'Discord transfer notifications are enabled.':'Discord transfer notifications are disabled.'); } catch { setStatus('Could not load integration status.'); } })();},[]);
  return <div className="rounded-xl p-5" style={{background:C.white,color:C.cream}}>{status}</div>;
};

