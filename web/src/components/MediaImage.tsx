import React, { useEffect, useState, useSyncExternalStore, type ComponentProps } from 'react';
import { apiOrigin, sessionVersion, supabase } from '../auth/client';
import { z } from 'zod';
import { request } from '../api/http';

export function mediaUrl(src: string): string {
  return src.startsWith('/api/') ? `${apiOrigin}${src}` : src;
}

const subscribeIdentity = (changed: () => void) => {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { queueMicrotask(changed); });
  return () => subscription.unsubscribe();
};

export function MediaImage({ src, ...props }: ComponentProps<'img'>) {
  const version = useSyncExternalStore(subscribeIdentity, sessionVersion, sessionVersion);
  const path = typeof src === 'string' && src.startsWith(`${apiOrigin}/api/media/`) ? src.slice(apiOrigin.length) : src;
  const pathname = typeof path === 'string' ? path.split('?', 1)[0]! : '';
  const protectedPath = typeof path === 'string' && pathname.startsWith('/api/media/') && (pathname.endsWith('/pending-image') || pathname.startsWith('/api/media/teams/') || pathname.startsWith('/api/media/articles/')) ? path : null;
  const [loaded, setLoaded] = useState<{ path: string; url: string; version: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!protectedPath) return;
    const controller = new AbortController();
    let url: string | undefined;
    void request<Blob | { externalUrl: string }>(`${protectedPath}${protectedPath.includes('?') ? '&' : '?'}descriptor=1`, 'GET', undefined, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result instanceof Blob) {
        url = URL.createObjectURL(result);
        setLoaded({ path: protectedPath, url, version });
      } else {
        setLoaded({ path: protectedPath, url: z.object({ externalUrl: z.url() }).parse(result).externalUrl, version });
      }
    }).catch(() => { if (!controller.signal.aborted) setFailed(protectedPath); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [protectedPath, version]);
  if (protectedPath && (loaded?.path !== protectedPath || loaded.version !== version)) {
    return React.createElement('span', { role: failed === protectedPath ? 'alert' : 'status' }, failed === protectedPath ? 'Image unavailable' : 'Loading image…');
  }
  return React.createElement('img', { ...props, src: protectedPath ? loaded?.url : (typeof src === 'string' ? mediaUrl(src) : src) });
}
