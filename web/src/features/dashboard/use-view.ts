import { useEffect, useState } from 'react';
import { hashForView, viewFromHash } from './navigation';

export function useView(defaultView = 'home'): [string, (view: string) => void] {
  const [view, update] = useState(() => viewFromHash(location.hash, defaultView));
  useEffect(() => {
    const changed = () => update(viewFromHash(location.hash, defaultView));
    addEventListener('hashchange', changed);
    return () => removeEventListener('hashchange', changed);
  }, [defaultView]);
  return [view, next => {
    const hash = hashForView(next);
    if (location.hash !== hash) location.hash = hash;
    update(viewFromHash(hash, defaultView));
  }];
}
