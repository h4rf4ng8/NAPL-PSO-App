import { Activity, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Account } from '../accounts/models';
import { EmptyState, ResultBadge } from '../../components/Display';
import { C } from '../../theme/theme';
import { useQuery } from '@apollo/client/react';
import { AccountMatchesDocument } from '../../api/generated/graphql';
import { FullRecord } from '../../components/FullRecord';
import { mapAccountMatchPage } from '../accounts/api';

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

  return <div>
    <div className="flex items-center gap-2 mb-4">
      <Activity size={22} style={{ color: C.greenLight }} />
      <h3 className="font-display text-3xl tracking-wider">MATCH LOG</h3>
    </div>
    {error && <p role="alert" className="mb-3">{error.message} <button onClick={() => { setPageState({ key: filterKey, cursor: null, back: [] }); void refetch({ after: null }).catch(() => {}); }}>Retry from newest</button></p>}
    {loading && <p role="status">Loading match history…</p>}
    {!loading && !error && (!page || page.nodes.length === 0) && <EmptyState icon={<Activity size={40} />} text="No matches yet. Stats will appear here once an admin submits and approves your match data." />}
    {!loading && !error && page && page.nodes.length > 0 && (
      <>
        <div className="space-y-2">
          {page.nodes.map((m, i) => (
            <div key={m.id || i} className="rounded-lg p-3 flex items-center gap-3 transition-all hover:translate-x-1" style={{
              background: `${C.navyDeep}aa`, border: `1px solid ${C.navyLight}44`,
              borderLeft: `3px solid ${m.result === 'W' ? C.green : (m.result === 'L' ? C.red : C.gold)}`,
            }}>
              <ResultBadge result={m.result} />
              <div className="flex-1 min-w-0">
                <div className="font-heading tracking-wider truncate" style={{ color: C.cream }}>VS {(m.opponent || 'UNKNOWN').toUpperCase()}</div>
                <div className="font-mono text-[10px] tracking-wider" style={{ color: `${C.cream}66` }}>{new Date(m.date || 0).toLocaleDateString()} • {m.season || 'S1'}</div>
                {typeof m.detailUrl === 'string' && <FullRecord key={m.detailUrl} url={m.detailUrl} label="Full match details" />}
              </div>
              <div className="flex gap-3 font-mono text-xs items-center">
                <span><span style={{ color: C.greenLight }}>{m.goals}</span>G</span>
                <span><span style={{ color: C.goldLight }}>{m.assists}</span>A</span>
                {m.cleanSheet && <Shield size={14} style={{ color: C.greenLight }} />}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between">
          <button disabled={pageState.back.length === 0 || loading || !!error} onClick={goPrevious} className="px-3 py-2 flex items-center gap-1 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button>
          <button disabled={!page?.pageInfo.hasNextPage || loading || !!error} onClick={goNext} className="px-3 py-2 flex items-center gap-1 disabled:opacity-40">Next <ChevronRight size={16} /></button>
        </div>
      </>
    )}
  </div>;
}
