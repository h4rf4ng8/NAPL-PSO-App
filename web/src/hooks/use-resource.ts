import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { createResource, type ResourceState } from './resource';

// Keeps the latest request result; dependency changes discard the previous data.
export function useResource<T>(load: () => Promise<T>, deps: DependencyList) {
  const [state, setState] = useState<ResourceState<T>>({ data: undefined, loading: true, error: '' });
  const loadRef = useRef(load);
  loadRef.current = load;
  const enabled = useRef(false);
  const resource = useRef<ReturnType<typeof createResource<T>> | null>(null);
  resource.current ??= createResource(setState);

  const reload = useCallback(async () => {
    if (enabled.current) await resource.current!.load(() => loadRef.current());
  }, []);

  useEffect(() => {
    enabled.current = true;
    void resource.current!.load(() => loadRef.current(), true);
    return () => { enabled.current = false; resource.current!.invalidate(); };
  }, deps);

  return { ...state, reload };
}
