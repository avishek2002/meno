// Small GET-resource hook: fetch on mount/url-change, expose a revalidate() to
// re-read the same url on demand. Files are the truth and there is no watcher,
// so "re-read" is always an explicit, user-triggered action (the header's
// refresh button), never a poll.
import { useCallback, useEffect, useState } from 'react';
import { getJson } from './api';

export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  revalidate: () => void;
}

export function useResource<T>(url: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(url !== null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getJson<T>(url)
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, tick]);

  const revalidate = useCallback((): void => setTick((t) => t + 1), []);

  return { data, error, loading, revalidate };
}
