// Source-grep coverage for reducedMotion.tsx's one job: being the single
// `window.matchMedia('(prefers-reduced-motion: reduce)')` call site in the
// client. No DOM, no import of the helper itself (it names `window`, which
// this file's DOM-free tsconfig cannot typecheck) - the same style as
// course-list.test.ts's localStorage source grep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

test('matchMedia(\'(prefers-reduced-motion: reduce)\') appears in exactly one file', () => {
  const clientSrcDir = fileURLToPath(new URL('../client/src', import.meta.url));

  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  })(clientSrcDir);

  const query = 'prefers-reduced-motion: reduce';
  const usingMatchMedia = files
    .filter((f) => readFileSync(f, 'utf8').includes(`matchMedia('(${query})')`))
    .sort();
  const expected = [fileURLToPath(new URL('../client/src/reducedMotion.tsx', import.meta.url))];
  assert.deepEqual(
    usingMatchMedia,
    expected,
    `expected only reducedMotion.tsx to call matchMedia for ${query}, got: ${usingMatchMedia.join(', ')}`,
  );
});
