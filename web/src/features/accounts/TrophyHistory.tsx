import { Alert, AlertDescription } from '../../components/ui/alert';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { EmptyState } from '../../components/Display';
import { useState } from 'react';
import { skipToken, useQuery } from '@apollo/client/react';
import { AccountAwardsDocument, AccountChampionshipsDocument } from '../../api/generated/graphql';
import { awardSchema, championshipSchema } from '@napl/contracts/accounts';
import { FullRecord } from '../../components/FullRecord';
import { AWARD_BY_ID } from '../../components/Icons';
import { Button } from '../../components/ui/button';


export function TrophyHistory({ accountId }: { accountId: string }) {
  const [kind, setKind] = useState<'awards' | 'championships' | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const variables = { id: accountId, after };
  const awards = useQuery(AccountAwardsDocument, kind === 'awards' ? { variables } : skipToken);
  const championships = useQuery(AccountChampionshipsDocument, kind === 'championships' ? { variables } : skipToken);
  const query = kind === 'awards' ? awards : championships;
  const page = kind === 'awards' ? awards.data?.accountAwards : championships.data?.accountChampionships;
  return <section className="space-y-3" aria-label="Complete trophy history">
    <h3 className="text-lg font-semibold">Trophy history</h3>
    <Tabs value={kind ?? ''} onValueChange={value => { setKind(value as 'awards' | 'championships'); setAfter(null); setPrevious([]); }}>
      <TabsList className="h-auto w-full flex-wrap sm:w-auto">
        <TabsTrigger value="awards" className="min-h-11 flex-1">Award history</TabsTrigger>
        <TabsTrigger value="championships" className="min-h-11 flex-1">Championship history</TabsTrigger>
      </TabsList>
      {kind && <TabsContent value={kind} className="space-y-3">
        {query.loading && <p role="status" className="text-sm text-muted-foreground">Loading trophy history…</p>}
        {query.error && <Alert variant="destructive"><AlertDescription>{query.error.message}</AlertDescription><Button variant="outline" className="mt-2" onClick={() => { setAfter(null); setPrevious([]); void query.refetch({ after: null }).catch(() => {}); }}>Retry</Button></Alert>}
        {page && <>
          <p className="text-sm text-muted-foreground">{page.totalCount} {kind}</p>
          <ul className="space-y-2">{page.nodes.map((node, index) => {
            const item = kind === 'awards' ? awardSchema.parse(node) : championshipSchema.parse(node);
            const title = 'awardId' in item && typeof item.awardId === 'string' ? AWARD_BY_ID[item.awardId]?.name ?? item.awardId : item.placement;
            return <li key={index}><Card className="space-y-2 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{String(title)}</strong><Badge variant="secondary">{item.season}</Badge></div>{typeof item.detailUrl === 'string' && <FullRecord key={item.detailUrl} url={item.detailUrl} label="Read full trophy" />}</Card></li>;
          })}</ul>
          {page.totalCount === 0 && <EmptyState text={`No ${kind} yet.`} />}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={query.loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous trophies</Button>
            <Button variant="outline" disabled={query.loading || !page.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(page.pageInfo.endCursor); }}>Next trophies</Button>
          </div>
        </>}
      </TabsContent>}
    </Tabs>
  </section>;
}
