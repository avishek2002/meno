// Pure unit coverage for app/client/src/resourceCache.ts - no server, no DOM,
// no fetch (UI-05). The loader is a fake counting its own calls, so these
// tests prove the cache's contract directly rather than through the React
// hook that wraps it.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { cached, invalidate, cacheSize } from '../client/src/resourceCache.ts';

beforeEach(() => {
  invalidate();
});

test('two callers for the same url before it resolves share one load call (in-flight dedup)', async () => {
  let calls = 0;
  const load = (url: string): Promise<string> => {
    calls++;
    return Promise.resolve(`data:${url}`);
  };
  const [a, b] = await Promise.all([cached('/x', load), cached('/x', load)]);
  assert.equal(calls, 1);
  assert.equal(a, 'data:/x');
  assert.equal(b, 'data:/x');
});

test('a call after the first has resolved is served from cache, not a new load', async () => {
  let calls = 0;
  const load = (): Promise<string> => {
    calls++;
    return Promise.resolve('v');
  };
  await cached('/y', load);
  await cached('/y', load);
  assert.equal(calls, 1);
});

test('invalidate(url) forces the next call to load again; other urls stay cached', async () => {
  let calls = 0;
  const load = (url: string): Promise<string> => {
    calls++;
    return Promise.resolve(url);
  };
  await cached('/a', load);
  await cached('/b', load);
  invalidate('/a');
  await cached('/a', load);
  await cached('/b', load);
  assert.equal(calls, 3, '/a loaded twice, /b loaded once - the revalidate model this hook exists for');
});

test('a rejected load is not cached forever - the next call retries', async () => {
  let calls = 0;
  const load = (): Promise<string> => {
    calls++;
    return calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve('ok');
  };
  await assert.rejects(cached('/z', load));
  const result = await cached('/z', load);
  assert.equal(result, 'ok');
  assert.equal(calls, 2);
});

test('invalidate() with no url clears every entry', async () => {
  const load = (): Promise<string> => Promise.resolve('v');
  await cached('/p', load);
  await cached('/q', load);
  assert.equal(cacheSize(), 2);
  invalidate();
  assert.equal(cacheSize(), 0);
});
