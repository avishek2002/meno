// Pure unit coverage for app/client/src/notePath.ts - no server, no DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteBreadcrumb } from '../client/src/notePath.ts';

test('the full <domain>/<course>/notes/<file>.md case links the domain segment to the course fragment, and the course segment to the course page', () => {
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'software-engineering/git-fundamentals/notes/branching.md',
    course: { slug: 'git-fundamentals', title: 'Git Fundamentals' },
    domain: 'software-engineering',
  });

  assert.deepEqual(segments, [
    { text: 'software-engineering', href: '#/t/alice#course-git-fundamentals' },
    { text: 'git-fundamentals', href: '#/t/alice/c/git-fundamentals' },
    { text: 'notes', href: null },
    { text: 'branching.md', href: null },
  ]);
});

test('course: null yields every segment plain, including a single-segment path', () => {
  const multi = noteBreadcrumb({
    tenant: 'alice',
    path: 'sources/some-reference.md',
    course: null,
    domain: null,
  });
  assert.deepEqual(multi, [
    { text: 'sources', href: null },
    { text: 'some-reference.md', href: null },
  ]);

  const single = noteBreadcrumb({ tenant: 'alice', path: 'home.md', course: null, domain: null });
  assert.deepEqual(single, [{ text: 'home.md', href: null }]);
});

test('course: null with a domain still present yields no domain link either - the fragment keys on the course, and there is none', () => {
  // per the NoteResponse contract domain is only ever non-null alongside a
  // course, but the guard is defensive: no course, no course.slug, no link.
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'software-engineering/orphan.md',
    course: null,
    domain: 'software-engineering',
  });
  assert.equal(segments[0].href, null);
});

test('a later segment that merely repeats the course slug is not linked twice', () => {
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'software-engineering/git-fundamentals/notes/git-fundamentals.md',
    course: { slug: 'git-fundamentals', title: 'Git Fundamentals' },
    domain: 'software-engineering',
  });
  // index 1 (the real course segment) links; index 3, which repeats the same
  // text by coincidence, must stay plain - the comparison is index-scoped,
  // not "does this text equal the slug anywhere in the path".
  assert.equal(segments[1].href, '#/t/alice/c/git-fundamentals');
  assert.equal(segments[3].text, 'git-fundamentals.md');
  assert.equal(segments[3].href, null);
});

test('a course slug that is not a legal route fragment gets no domain link, but still renders as text', () => {
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'software engineering/rag & search/home.md',
    // "rag & search" fails /^[\w-]+$/ - the same class the tenant route's
    // section group enforces - so #course-rag & search could never match
    course: { slug: 'rag & search', title: 'RAG and search' },
    domain: 'software engineering',
  });
  assert.deepEqual(segments[0], { text: 'software engineering', href: null });
});

test('the domain segment links even when the domain text itself has a character the old scheme would have rejected, as long as the course slug is legal', () => {
  // this is the point of keying on the course rather than the domain: the
  // domain directory name never has to be route-safe, only the slug does
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'software engineering/git-fundamentals/home.md',
    course: { slug: 'git-fundamentals', title: 'Git Fundamentals' },
    domain: 'software engineering',
  });
  assert.equal(segments[0].href, '#/t/alice#course-git-fundamentals');
});

test('the domain segment is only linked when it is present at index 0 and equals domain, never as a coincidental match', () => {
  const segments = noteBreadcrumb({
    tenant: 'alice',
    // index 0 does not equal the domain; index 1 does, by coincidence -
    // domain-matching is scoped to index 0 only, same discipline as the
    // course-index scoping above, so index 1 must stay plain either way.
    path: 'other-domain/software-engineering/home.md',
    course: null,
    domain: 'software-engineering',
  });
  assert.equal(segments[0].href, null, 'index 0 does not equal the domain, so it must not link');
  assert.equal(segments[1].href, null, 'a domain match outside index 0 must never link');
});

test('tenant is percent-encoded in both the domain-fragment href and the course-page href', () => {
  const segments = noteBreadcrumb({
    tenant: 'ali ce',
    path: 'ai-and-agents/llm-cost-and-token-engineering/home.md',
    course: { slug: 'llm-cost-and-token-engineering', title: 'LLM Cost and Token Engineering' },
    domain: 'ai-and-agents',
  });
  assert.equal(segments[0].href, `#/t/${encodeURIComponent('ali ce')}#course-llm-cost-and-token-engineering`);
  assert.equal(
    segments[1].href,
    `#/t/${encodeURIComponent('ali ce')}/c/llm-cost-and-token-engineering`,
  );
});

test('the course-page href still percent-encodes a slug the domain fragment guard would have rejected', () => {
  const segments = noteBreadcrumb({
    tenant: 'alice',
    path: 'ai-and-agents/rag & search/home.md',
    course: { slug: 'rag & search', title: 'RAG and search' },
    domain: 'ai-and-agents',
  });
  assert.equal(segments[0].href, null, 'the domain fragment guard rejects this slug');
  assert.equal(segments[1].href, `#/t/alice/c/${encodeURIComponent('rag & search')}`, 'the course link is unaffected by the fragment guard');
});
