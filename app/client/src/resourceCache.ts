// The pure half of useResource's cross-mount cache (UI-05): keyed by request
// url, cleared only by invalidate() - never a TTL. Files are the source of
// truth and there is no watcher, so a cache that goes stale only when told to
// is the correct model; a timer competing with the header's "Re-read files"
// button would just be a second, worse notion of "still fresh".
//
// No React import, no browser global - node --test covers this directly, the
// same split as courseContext.ts / useCourseContext.tsx. The loader is
// injected so this file names no transport of its own.
const cache = new Map<string, Promise<unknown>>();

/**
 * Returns the in-flight or already-settled promise for `url`, calling `load`
 * only on a cache miss. Two callers requesting the same url before either has
 * resolved - e.g. CoursePage and a LessonPage's useCourseContext both wanting
 * the same course, UI-02's collision risk - share the one promise already in
 * the map instead of issuing a second request in flight.
 */
export function cached<T>(url: string, load: (url: string) => Promise<T>): Promise<T> {
  const existing = cache.get(url);
  if (existing) return existing as Promise<T>;
  const promise = load(url);
  cache.set(url, promise);
  // A failed fetch must not poison the cache forever - drop it so the next
  // reader, or the next revalidate, gets a real attempt rather than a
  // replayed rejection. Guarded against a race with an intervening
  // invalidate() already having replaced this entry.
  promise.catch(() => {
    if (cache.get(url) === promise) cache.delete(url);
  });
  return promise;
}

/** Drops one url's cached entry, or every entry when called with none. */
export function invalidate(url?: string): void {
  if (url) cache.delete(url);
  else cache.clear();
}

/** Test-only: how many distinct urls are currently cached. */
export function cacheSize(): number {
  return cache.size;
}
