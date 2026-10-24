import { Activity, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Account } from '../accounts/models';
import { EmptyState, ResultBadge } from '../../components/Display';

import { useQuery } from '@apollo/client/react';
import { AccountMatchesDocument } from '../../api/generated/graphql';
import { FullRecord } from '../../components/FullRecord';
import { mapAccountMatchPage } from '../accounts/api';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';


export function MatchLog({ account, season }: { account: Account; season: string }) {
  const filterKey = `${account.id}:${season}`;
  const [pageState, setPageState] = useState<{ key: string; cursor: string | null; back: (string | null)[] }>({ key: filterKey, cursor: null, back: [] });
  const cursor = pageState.key === filterKey ? pageState.cursor : null;
  const { data, loading, error, refetch } = useQuery(AccountMatchesDocument, {
    variables: { id: account.id, first: 25, after: cursor, season: season === 'all' ? null : season, opponent: null },
  });
  const page = data ? mapAccountMatchPage(data) : undefined;
  useEffect(() => { setPageState({ key: filterKey, cursor: null, back: [] }); }, [filterKey]);

  const goNext = () => {
    if (!page?.pageInfo.endCursor) return;
    setPageState(current => {
      const currentPage = current.key === filterKey ? current : { key: filterKey, cursor: null, back: [] };
      return { ...currentPage, cursor: page.pageInfo.endCursor, back: [...currentPage.back, currentPage.cursor] };
    });
  };
  const goPrevious = () => setPageState(current => {
    const currentPage = current.key === filterKey ? current : { key: filterKey, cursor: null, back: [] };
    return { ...currentPage, cursor: currentPage.back.at(-1) ?? null, back: currentPage.back.slice(0, -1) };
  });

  return <section className="space-y-4">
    <h3 className="flex items-center gap-2 text-xl font-semibold"><Activity className="size-5" aria-hidden="true" /> Match log</h3>
    {error && <Alert variant="destructive"><AlertDescription>{error.message} <Button variant="outline" onClick={() => { setPageState({ key: filterKey, cursor: null, back: [] }); void refetch({ after: null }).catch(() => {}); }}>Retry from newest</Button></AlertDescription></Alert>}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading match history…</p>}
    {!loading && !error && (!page || page.nodes.length === 0) && <EmptyState icon={<Activity size={40} />} text="No matches yet. Stats appear here after an admin imports your match data." />}
    {!loading && !error && page && page.nodes.length > 0 && <>
      <div className="space-y-3">{page.nodes.map((m, i) => <Card key={m.id || i}><CardContent className="flex flex-wrap items-center gap-3 p-4"><ResultBadge result={m.result} /><div className="min-w-0 flex-1"><p className="break-words font-medium">vs {m.opponent || 'Unknown'}</p><p className="text-xs text-muted-foreground">{new Date(m.date || 0).toLocaleDateString()} · {m.season || 'S1'}</p>{typeof m.detailUrl === 'string' && <FullRecord key={m.detailUrl} url={m.detailUrl} label="Full match details" />}</div><div className="flex w-full flex-wrap items-center gap-2 sm:w-auto"><Badge variant="secondary">{m.goals} goals</Badge><Badge variant="secondary">{m.assists} assists</Badge>{m.cleanSheet && <Badge variant="outline"><Shield className="mr-1 size-3" aria-hidden="true" /> Clean sheet</Badge>}</div></CardContent></Card>)}</div>
      <div className="flex justify-between gap-2"><Button variant="outline" disabled={pageState.back.length === 0 || loading || !!error} onClick={goPrevious}><ChevronLeft className="size-4" /> Previous</Button><Button variant="outline" disabled={!page.pageInfo.hasNextPage || loading || !!error} onClick={goNext}>Next <ChevronRight className="size-4" /></Button></div>
    </>}
  </section>;
}
