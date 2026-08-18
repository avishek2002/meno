// Small GET-resource hook: fetch on mount/url-change, expose a revalidate() to
// re-read the same url on demand. Files are the truth and there is no watcher,
// so "re-read" is always an explicit, user-triggered action (the header's
// refresh button), never a poll.
//
// UI-05: fetches go through resourceCache's cached(), so a second mount of the
// same url - back-navigation, or a sibling hook wanting the same resource -
// is served from cache instead of refetching. revalidate() is the only way a
// url's entry is ever dropped; there is no TTL.
import { useCallback, useEffect, useState } from 'react';
import { ApiError, getJson } from './api';
import { cached, invalidate } from './resourceCache.ts';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  /**
   * HTTP status of the last failed fetch, when the failure was an ApiError -
   * lets a page phrase a 404 in its own vocabulary (UI-04) without every
   * page importing ApiError itself. Null while loading, on success, or when
   * the failure was not an ApiError (e.g. a network error).
   */
  status: number | null;
  loading: boolean;
  revalidate: () => void;
}

export function useResource<T>(url: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setStatus(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setStatus(null);
    cached<T>(url, getJson)
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setStatus(e instanceof ApiError ? e.status : null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  // Re-reading a file has to mean a real fetch, not another cache hit - drop
  // this url's cached entry before bumping tick so the effect above misses
  // the cache exactly once.
  const revalidate = useCallback((): void => {
    if (url) invalidate(url);
    setTick((t) => t + 1);
  }, [url]);

  return { data, error, status, loading, revalidate };
}
