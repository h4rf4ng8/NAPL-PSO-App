import { settings as adminApi } from './api';
import { useResource } from '../../hooks/use-resource';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Skeleton } from '../../components/ui/skeleton';

export const IntegrationsManager = () => {
  const status = useResource(adminApi.getDiscordStatus, []);
  return <Card><CardHeader><CardTitle>Discord integration</CardTitle><CardDescription>Transfer notification status.</CardDescription></CardHeader><CardContent className="space-y-4">
    {status.loading && <div role="status"><span className="sr-only">Loading Discord integration…</span><Skeleton className="h-12" /></div>}
    {status.error && <Alert variant="destructive"><AlertDescription>{status.error} <Button variant="outline" onClick={() => { void status.reload(); }}>Retry</Button></AlertDescription></Alert>}
    {status.data && <div className="flex flex-wrap items-center gap-3"><Badge variant={status.data.configured ? 'default' : 'secondary'}>{status.data.configured ? 'Enabled' : 'Disabled'}</Badge><p>Discord transfer notifications are {status.data.configured ? 'enabled' : 'disabled'}.</p></div>}
  </CardContent></Card>;
};
