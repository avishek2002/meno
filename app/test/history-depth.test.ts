// Pure unit coverage for app/client/src/historyDepth.ts - no window, no
// history, no DOM. Header.tsx owns the actual history/hashchange plumbing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDepth, stampedState } from '../client/src/historyDepth.ts';

test('stamping from unstamped state: adopts current + 1 and says the caller must replaceState', () => {
  assert.deepEqual(nextDepth(null, 0), { depth: 1, stamp: true });
  assert.deepEqual(nextDepth(undefined, 4), { depth: 5, stamp: true });
  assert.deepEqual(nextDepth({ someOtherKey: 'x' }, 2), { depth: 3, stamp: true }, 'a state object with no depth stamp is still unstamped');
});

test('a first-mount unstamped entry adopts depth 0, via the current: -1 sentinel', () => {
  assert.deepEqual(nextDepth(null, -1), { depth: 0, stamp: true });
});

test('adopting a stamped depth ignores current entirely, including a stamped 0', () => {
  const zero = stampedState(null, 0);
  assert.deepEqual(nextDepth(zero, 99), { depth: 0, stamp: false }, 'depth 0 must not be treated as "no stamp"');

  const three = stampedState(null, 3);
  assert.deepEqual(nextDepth(three, 0), { depth: 3, stamp: false });
  assert.deepEqual(nextDepth(three, 999), { depth: 3, stamp: false }, 'current is not consulted once a stamp exists');
});

// nextDepth only ever reads its `state` argument (readDepth), so a "never
// mutates its input" test against it would be vacuous - there is no write
// path to guard against. stampedState is the function that actually builds
// a new object, so the mutation guarantee is tested against it below instead.

test('stampedState preserves unrelated keys already on the entry, and never mutates its input', () => {
  const input = Object.freeze({ scrollY: 240, foo: 'bar' });
  const stamped = stampedState(input, 4);

  assert.deepEqual(input, { scrollY: 240, foo: 'bar' }, 'the original object must be untouched');
  assert.notEqual(stamped, input, 'a new object, never the same reference');
  assert.equal(stamped.scrollY, 240);
  assert.equal(stamped.foo, 'bar');
  // round-trip: nextDepth reads the depth stampedState just wrote, ignoring the unrelated keys
  assert.deepEqual(nextDepth(stamped, 0), { depth: 4, stamp: false });
});

test('stampedState on null or non-object state produces an object with only the depth key', () => {
  const stamped = stampedState(null, 0);
  // asserted directly against the object's own shape, not only through a
  // nextDepth round trip - a stampedState that leaked some other key past the
  // depth one would still pass a round trip test, since nextDepth reads only
  // the one key it knows about and ignores the rest. The key's own name is
  // this module's private detail, so this checks the count, not the name.
  assert.equal(Object.keys(stamped).length, 1, 'stamping an empty/absent state must add exactly one key');
  assert.deepEqual(nextDepth(stamped, 5), { depth: 0, stamp: false });
});
