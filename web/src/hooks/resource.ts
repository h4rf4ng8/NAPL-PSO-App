export interface ResourceState<T> {
  data: T | undefined;
  loading: boolean;
  error: string;
}

export function createResource<T>(publish: (state: ResourceState<T>) => void) {
  let version = 0;
  let state: ResourceState<T> = { data: undefined, loading: true, error: '' };
  return {
    async load(fetch: () => Promise<T>, reset = false): Promise<void> {
      const request = ++version;
      state = { data: reset ? undefined : state.data, loading: true, error: '' };
      publish(state);
      try {
        const data = await fetch();
        if (request !== version) return;
        state = { data, loading: false, error: '' };
      } catch (error) {
        if (request !== version) return;
        state = { ...state, loading: false, error: error instanceof Error ? error.message : 'Could not load data.' };
      }
      publish(state);
    },
    invalidate() { version++; },
  };
}
