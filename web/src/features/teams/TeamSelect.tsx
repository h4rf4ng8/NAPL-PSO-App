import { usePageCursor } from '../../hooks/use-page-cursor';
import { useQuery } from '@apollo/client/react';
import { TeamSummariesDocument } from '../../api/generated/graphql';
import { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { PageButtons } from '../../components/PageButtons';
import type { TeamSummary } from './models';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../../components/ui/command';
import { Alert, AlertDescription } from '../../components/ui/alert';

export function TeamSelect({ value, onChange, label, onSelected }: { value: string; onChange: (id: string) => void; label: string; onSelected?: (team: TeamSummary) => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
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
  const current = teams.find(team => team.id === value);
  return <div className="min-w-0 space-y-2">
    <Label htmlFor={id}>{label}</Label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} className="w-full justify-between gap-2 font-normal">
        <span className="truncate">{value ? current?.name ?? (selected?.id === value ? selected.name : `Selected team ${value}`) : 'Choose a team'}</span><ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label={`Search ${label}`} placeholder="Search teams…" value={search} onValueChange={setSearch} />
          <CommandList aria-busy={page.loading}>
            {page.loading && <p role="status" className="p-3 text-sm text-muted-foreground">Loading teams…</p>}
            {!page.loading && !page.error && <CommandEmpty>No teams found.</CommandEmpty>}
            <CommandGroup>
              {value && <CommandItem value="clear-team" onSelect={() => { onChange(''); setOpen(false); }}>Clear selection</CommandItem>}
              {teams.map(team => <CommandItem key={team.id} value={team.id} disabled={page.loading} onSelect={() => { setSelected({ id: team.id, name: team.name }); onSelected?.(team); onChange(team.id); setOpen(false); }}>
                <span className="min-w-0 flex-1 truncate">{team.tag} — {team.name}</span>{team.id === value && <Check className="size-4 shrink-0" />}
              </CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
        {page.error && <Alert variant="destructive" className="m-2 w-auto"><AlertDescription>{page.error}<Button type="button" variant="link" onClick={page.restart}>Restart teams</Button></AlertDescription></Alert>}
        <div className="border-t p-2"><PageButtons {...page} hasNextPage={page.data?.pageInfo.hasNextPage ?? false} /></div>
      </PopoverContent>
    </Popover>
  </div>;
}
