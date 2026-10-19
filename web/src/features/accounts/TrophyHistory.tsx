import { useState } from 'react';
import { skipToken, useQuery } from '@apollo/client/react';
import { AccountAwardsDocument, AccountChampionshipsDocument } from '../../api/generated/graphql';
import { awardSchema, championshipSchema } from '@napl/contracts/accounts';
import { FullRecord } from '../../components/FullRecord';
import { AWARD_BY_ID } from '../../components/Icons';

export function TrophyHistory({ accountId }: { accountId: string }) {
  const [kind, setKind] = useState<'awards' | 'championships' | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const variables = { id: accountId, after };
  const awards = useQuery(AccountAwardsDocument, kind === 'awards' ? { variables } : skipToken);
  const championships = useQuery(AccountChampionshipsDocument, kind === 'championships' ? { variables } : skipToken);
  const query = kind === 'awards' ? awards : championships;
  const page = kind === 'awards' ? awards.data?.accountAwards : championships.data?.accountChampionships;
  return <section className="mt-4 space-y-2" aria-label="Complete trophy history">
    <div className="flex gap-3">
      <button onClick={() => { setKind('awards'); setAfter(null); setPrevious([]); }}>Award history</button>
      <button onClick={() => { setKind('championships'); setAfter(null); setPrevious([]); }}>Championship history</button>
    </div>
    {kind && <>
      {query.loading && <p role="status">Loading trophy history…</p>}
      {query.error && <p role="alert">{query.error.message} <button onClick={() => { setAfter(null); setPrevious([]); void query.refetch({ after: null }).catch(() => {}); }}>Retry</button></p>}
      {page && <>
        <p>{page.totalCount} {kind}</p>
        <ul>{page.nodes.map((node, index) => {
          const item = kind === 'awards' ? awardSchema.parse(node) : championshipSchema.parse(node);
          const title = 'awardId' in item && typeof item.awardId === 'string' ? AWARD_BY_ID[item.awardId]?.name ?? item.awardId : item.placement;
          return <li key={index}><strong>{String(title)}</strong> · {item.season}{typeof item.detailUrl === 'string' && <FullRecord key={item.detailUrl} url={item.detailUrl} label="Read full trophy" />}</li>;
        })}</ul>
        {page.totalCount === 0 && <p>No {kind} yet.</p>}
        <div className="flex gap-3">
          <button disabled={query.loading || previous.length === 0} onClick={() => { setAfter(previous.at(-1) ?? null); setPrevious(previous.slice(0, -1)); }}>Previous trophies</button>
          <button disabled={query.loading || !page.pageInfo.hasNextPage} onClick={() => { setPrevious([...previous, after]); setAfter(page.pageInfo.endCursor); }}>Next trophies</button>
        </div>
      </>}
    </>}
  </section>;
}
