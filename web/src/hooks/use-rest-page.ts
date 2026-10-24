import { useState } from 'react';
import { request } from '../api/http';
import { pagePath, type Page } from '../api/page';
import { useResource } from './use-resource';

export function useRestPage<T>(path: string | null) {
  const [cursor, setCursor] = useState<{ path: string | null; after: string | null; previous: (string | null)[] }>({ path, after: null, previous: [] });
  const current = cursor.path === path ? cursor : { path, after: null, previous: [] };
  if (cursor.path !== path) setCursor(current);
  const resource = useResource(() => path ? request<Page<T>>(pagePath(path, current.after)) : Promise.resolve(undefined), [path, current.after]);
  const restart = () => { setCursor({ path, after: null, previous: [] }); if (!current.after) void resource.reload(); };
  return { ...resource, loading: !!path && resource.loading, restart, canPrevious: current.previous.length > 0,
    next: () => { if (resource.data?.pageInfo.hasNextPage) setCursor({ path, after: resource.data.pageInfo.endCursor, previous: [...current.previous, current.after] }); },
    previous: () => setCursor({ path, after: current.previous.at(-1) ?? null, previous: current.previous.slice(0, -1) }),
  };
}
