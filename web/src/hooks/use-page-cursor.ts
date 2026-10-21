import { useState } from 'react';

// Pagination state only; callers own their native query and its result.
export function usePageCursor(key: string) {
  const initial = { key, after: null as string | null, previous: [] as (string | null)[] };
  const [saved, setSaved] = useState(initial);
  const current = saved.key === key ? saved : initial;
  if (saved.key !== key) setSaved(initial);
  return {
    after: current.after, canPrevious: current.previous.length > 0,
    restart: () => setSaved(initial),
    next: (after: string | null) => setSaved({ key, after, previous: [...current.previous, current.after] }),
    previous: () => setSaved({ key, after: current.previous.at(-1) ?? null, previous: current.previous.slice(0, -1) }),
  };
}
