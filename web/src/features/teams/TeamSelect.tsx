import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useState } from 'react';
import { PageButtons } from '../../components/PageButtons';
import type { TeamSummary } from './models';
export function TeamSelect({ value, onChange, label, onSelected }: { value: string; onChange: (id: string) => void; label: string; onSelected?: (team: TeamSummary) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const cursor = usePageCursor(search);
  const teamQuery = useQuery(TeamSummariesDocument, { variables: { scope: null, status: 'approved', search, after: cursor.after } });
  const page = { data: teamQuery.data && { ...teamQuery.data.teamSummaries, nodes: teamQuery.data.teamSummaries.nodes.map(team => ({ ...team, color: team.color ?? '', createdAt: team.createdAt ?? 0 })) }, loading: teamQuery.loading, error: teamQuery.error?.message,
    restart: () => { cursor.restart(); if (!cursor.after) void teamQuery.refetch().catch(() => {}); },
    canPrevious: cursor.canPrevious, previous: cursor.previous,
    next: () => { if (teamQuery.data?.teamSummaries.pageInfo.hasNextPage) cursor.next(teamQuery.data.teamSummaries.pageInfo.endCursor); },
  };
  const teams = page.data?.nodes ?? [];
  return <div><input aria-label={`Search ${label}`} placeholder="Search teams" value={search} onChange={event => setSearch(event.target.value)} />
    <select aria-label={label} value={value} onChange={event => { const team = teams.find(team => team.id === event.target.value); if (team) { setSelected({ id: team.id, name: team.name }); onSelected?.(team); } onChange(event.target.value); }}>
      <option value="">— pick team —</option>
      {value && teams.every(team => team.id !== value) && <option value={value}>{selected?.id === value ? selected.name : `Selected team ${value}`}</option>}
      {teams.map(team => <option key={team.id} value={team.id}>{team.tag} — {team.name}</option>)}
    </select>
    {page.error && <p role="alert">{page.error}<button onClick={page.restart}>Restart teams</button></p>}
    <PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} />
  </div>;
}
