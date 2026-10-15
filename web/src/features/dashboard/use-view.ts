import { useEffect, useState } from 'react';
import { hashForView, viewFromHash } from './navigation';

export function useView(): [string, (view: string) => void] {
  const [view, update] = useState(() => viewFromHash(location.hash));
  useEffect(() => {
    const changed = () => update(viewFromHash(location.hash));
    addEventListener('hashchange', changed);
    return () => removeEventListener('hashchange', changed);
  }, []);
  return [view, next => {
    const hash = hashForView(next);
    if (location.hash !== hash) location.hash = hash;
    update(viewFromHash(hash));
  }];
}
