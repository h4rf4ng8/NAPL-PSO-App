import { useEffect, useRef, useState } from 'react';
import { sessionVersion } from '../auth/client';
import { ApiError, request } from '../api/http';
import { pagePath, type Page } from '../api/page';
import { useResource } from './use-resource';

export function useRestPage<T>(path: string | null, pageSize?: number) {
  const initial = { path, pageSize, after: null as string | null, previous: [] as (string | null)[] };
  const [cursor, setCursor] = useState(initial);
  const current = cursor.path === path && cursor.pageSize === pageSize ? cursor : initial;
  if (current !== cursor) setCursor(current);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), [path, current.after, pageSize]);
  const resource = useResource(async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    if (!path) return;
    if (pageSize === undefined) return request<Page<T>>(pagePath(path, current.after), 'GET', undefined, controller.signal);
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error('Page size must be between 1 and 50.');
    const version = sessionVersion();
    const nodes: T[] = [];
    const cursors = new Set<string>();
    let after = current.after;
    if (after) cursors.add(after);
    for (;;) {
      controller.signal.throwIfAborted();
      if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.');
      const [base, search] = path.split('?', 2);
      const query = new URLSearchParams(search);
      query.set('first', String(pageSize - nodes.length));
      const chunk = await request<Page<T>>(pagePath(`${base}?${query}`, after), 'GET', undefined, controller.signal);
      controller.signal.throwIfAborted();
      if (version !== sessionVersion()) throw new ApiError(401, 'login_required', 'Please sign in again.');
      if (chunk.nodes.length > pageSize - nodes.length) throw new Error('The player page exceeded its requested size.');
      nodes.push(...chunk.nodes);
      if (chunk.pageInfo.hasNextPage && (chunk.nodes.length === 0 || !chunk.pageInfo.endCursor || cursors.has(chunk.pageInfo.endCursor))) throw new Error('The player page did not advance. Please restart the list.');
      if (!chunk.pageInfo.hasNextPage || nodes.length === pageSize) return { ...chunk, nodes };
      after = chunk.pageInfo.endCursor;
      cursors.add(after!);
    }
  }, [path, current.after, pageSize]);
  const restart = () => { setCursor(initial); if (!current.after) void resource.reload(); };
  return { ...resource, loading: !!path && resource.loading, restart, canPrevious: current.previous.length > 0,
    next: () => { if (!resource.loading && !resource.error && resource.data?.pageInfo.hasNextPage) setCursor({ path, pageSize, after: resource.data.pageInfo.endCursor, previous: [...current.previous, current.after] }); },
    previous: () => setCursor({ path, pageSize, after: current.previous.at(-1) ?? null, previous: current.previous.slice(0, -1) }),
  };
}
