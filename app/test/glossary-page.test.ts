// Source-grep coverage for GlossaryPage.tsx (CONTRACT-glossary.md, "The
// client route"). No jsdom in this repository (see rendered-html.test.ts's
// comment for why), so these are source assertions aimed at the specific
// mistakes the contract calls out by name: re-sorting server order, a broken
// link on an unresolved see_also, a hand-written route URL, and an unlabeled
// search input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../client/src/pages/GlossaryPage.tsx', import.meta.url)), 'utf8');

test('fetches the glossary endpoint for the tenant', () => {
  assert.match(source, /useResource<GlossaryResponse>\(`\/api\/v1\/\$\{encodeURIComponent\(tenant\)\}\/glossary`\)/);
});

test('never sorts courses or entries - the server order is curriculum order', () => {
  assert.equal(/\.sort\(/.test(source), false, 'GlossaryPage must render courses and entries in the order the server sent them, never re-sorted');
});

test('every link is built through lessonHref, never a hand-written route URL', () => {
  assert.match(source, /import \{ tenantHref, lessonHref \} from '\.\.\/\.\.\/\.\.\/shared\/routeHrefs\.ts';/);
  assert.equal(/href=\{`#/.test(source), false, 'no hand-written hash route belongs in this page - every link goes through a routeHrefs.ts builder');
  assert.match(source, /lessonHref\(tenant, entry\.introduced_by\.course, entry\.introduced_by\.module, entry\.introduced_by\.file\)/);
  assert.match(source, /lessonHref\(tenant, b\.course, b\.module, b\.file\)/);
});

test('a see_also key with no entry in the same course renders as plain text, never a link', () => {
  // SeeAlso resolves through a Map of this course's own entries and falls
  // back to the raw key - it never wraps the result in an <a>.
  assert.match(source, /byKey\.get\(k\) \?\? k/);
  const seeAlsoBody = source.slice(source.indexOf('function SeeAlso'), source.indexOf('function GlossaryEntryCard'));
  assert.equal(seeAlsoBody.includes('<a '), false, 'SeeAlso must never render an <a> - there is no fragment-safe per-term anchor in this version');
});

test('the filter input is a plain substring match with a real accessible label', () => {
  assert.match(source, /aria-label="Filter glossary terms by term or definition"/);
  // Plain, case-insensitive substring - .includes() over .toLowerCase(), no
  // regex-based fuzzy matching and no new dependency.
  assert.match(source, /fold\(entry\.term\)\.includes\(foldedQuery\) \|\| fold\(entry\.definition\)\.includes\(foldedQuery\)/);
});

test('shows a match count while filtering', () => {
  assert.match(source, /'matches'\} for "\$\{query\}"/);
});

test('renders an honest warnings state and an empty state when no course has terms', () => {
  assert.match(source, /data\.warnings\.length > 0/);
  assert.match(source, /<EmptyState\s*\n\s*headingLevel="h1"\s*\n\s*title=\{`No glossary terms yet for \$\{tenant\}`\}/);
});

test('loading and error states reuse the shared AsyncStatus/ErrorState components', () => {
  assert.match(source, /return <AsyncStatus message="Loading glossary\.\.\." \/>;/);
  assert.match(source, /<ErrorState/);
});

// --- module grouping: the shape that makes curriculum order legible ---------

test('entries are grouped under a per-module h3 in teaching sequence, not flattened into one list per course', () => {
  // The course h2 alone would render every term of a seven-module course as
  // one undifferentiated run, which reads as an arbitrary sequence rather than
  // the order the course teaches. The module heading is what makes "not
  // alphabetical" visibly deliberate.
  assert.match(source, /className="glossary-module"/);
  assert.match(source, /<h3>\{run\.title\}<\/h3>/, 'each module run needs its manifest title as a heading');
  assert.match(source, /<h4>\{entry\.term\}<\/h4>/, 'the term drops to h4 so the module h3 sits above it without skipping a level');
});

test('module grouping walks consecutive runs rather than keying a Map, so it can never reorder the server', () => {
  // A Map-keyed group-by would re-order the moment its insertion order and the
  // server's disagreed. Runs preserve curriculum order by construction, which
  // is the one property this page must not lose.
  const body = source.slice(source.indexOf('function moduleRuns'), source.indexOf('function GlossaryEntryCard'));
  assert.ok(body.length > 0, 'moduleRuns must exist');
  assert.equal(body.includes('new Map'), false, 'moduleRuns must not group through a Map');
  assert.equal(body.includes('.sort('), false, 'moduleRuns must never sort');
  assert.match(body, /last && last\.module === entry\.introduced_by\.module/);
});
