import { useState } from 'react';
import { useRestPage } from '../../hooks/use-rest-page';
import { PageButtons } from '../../components/PageButtons';
import { segment } from '../../api/http';
import type { TeamSummary } from './models';
export function TeamSelect({ value, onChange, label, onSelected }: { value: string; onChange: (id: string) => void; label: string; onSelected?: (team: TeamSummary) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const page = useRestPage<TeamSummary>(`/api/teams?status=approved&search=${segment(search)}`);
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
