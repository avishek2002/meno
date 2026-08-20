# Personal notes spec

*Status: contract written 2026-08-20, build not started (v1.18). This spec owns the personal-notes
subsystem end to end: the per-course notes file format, its parser and serializer, the two HTTP
routes, the shared transport types, heading ids in rendered lesson HTML, and the side panel that
edits it. Canonical formats owned elsewhere: the nine-part lesson anatomy in
[lessons.md](lessons.md) and
[lesson-format.md](../../.agents/skills/generate-module/references/lesson-format.md); vault and hub
conventions in
[vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md); the rest
of the app surface in [app.md](app.md); the write-authority seam in
[../architecture.md](../architecture.md).*

## Purpose

A learner reading a lesson has nowhere in Meno to put a thought about it. The thought goes into a
separate file, or nowhere. This adds a side panel, present on the course page and on every lesson
page, that writes plain markdown into one notes file per course, sectioned so a note stays attached
to the part of the lesson that provoked it.

**Notes are not evidence.** They append no ledger event, they are read by no gate, they change no
schema, and there is no `schema_version` bump and no `docs/migrations.md` entry for this feature.
The notes file joins `todos.md` in the learner-owned file class of the write-authority seam
([../architecture.md](../architecture.md), "The write-authority seam"): a file the learner owns,
that the app writes under the same atomic, `If-Match`-guarded discipline, and that nothing which
moves a gate ever reads. The agent reads a notes file when a person points it at one; it is
markdown in the vault, so that needs no mechanism.

**Notes anchor to a section, never to selected text.** There is no quote selector, no fuzzy
anchoring, and no re-anchoring pass. A note belongs to a page, and on a lesson page it belongs to
one anatomy part of that lesson. That is the whole addressing model.

## How it behaves

1. One notes file per course: `<course-slug>-notes.md`, in the course directory beside
   `<course-slug>-hub.md`. Nothing is created until the learner saves a first note.
2. The panel is available on `#/t/:t/c/:c` and on every `#/t/:t/c/:c/m/:m/l/:file`. On the course
   page it offers exactly one section, `whole-course`. On a lesson page it offers `whole-lesson`
   first, then one section per `##` heading the lesson actually has, in document order.
3. `whole-lesson` is selected by default, so the panel is usable with zero clicks. A small note
   button rendered beside each `##` heading opens the panel focused on that heading's section.
4. Geometry: at 1200 CSS pixels and above the panel **pushes**, taking the right margin the reading
   column already leaves empty, and `main.content`'s `max-width: 46rem` is unchanged in both
   states. Below 1200 pixels it **overlays** over a scrim. Default closed; open or closed is
   remembered per tenant in `localStorage`.
5. Saving is a debounce of about 2 seconds after the last keystroke, plus an immediate flush on
   blur, on panel close, on route change, and on `pagehide`. Every write carries an `If-Match`
   content hash of the whole file.
6. On hash mismatch the server refuses the write and answers 409 with the current file. The client
   keeps the unsaved text in `localStorage` and offers exactly two actions: **reload from disk**
   (discard the buffer, adopt the server's copy) and **overwrite** (re-send the same text with the
   hash from the conflict body). There is no auto-merge and no diff view.
7. Degraded paths, none of which is an error page: a notes file the parser only partly recognizes
   still renders every block it did recognize and returns warnings; a missing file reads as zero
   blocks; a browser that refuses `localStorage` degrades to a session-only panel that still saves
   to disk.

## Anchoring: anatomy part keys, never heading text

`lib/lesson.ts` already names the nine anatomy parts by key (`1-objective` through
`9-transfer-prompt`). Six of them are `##` headings in a generated lesson; the other three are not
headings at all (part 1 is a bold line, part 6 is a callout, part 8 is frontmatter). The mapping
below is the one place heading text and part key meet, and it is matched case-insensitively against
the **start** of the heading text, exactly as `anatomyOf`'s existing `has()` predicate does.

| Heading starts with | Section key |
|---|---|
| `Before you start` | `2-prerequisite-check` |
| `The idea` | `3-explanation` |
| `Worked example` | `4-worked-example` |
| `Your turn` | `5-faded-practice` |
| `Recall` | `7-retrieval-check` |
| `Apply it somewhere new` | `9-transfer-prompt` |

Rules:

- The **first** heading matching a row claims that key. A second heading matching the same row
  falls through to the slug form below.
- A `##` heading matching no row gets `h-<slug>`, where the slug is the heading text lowercased,
  Unicode-normalized NFKD with combining marks stripped, non-alphanumerics collapsed to single
  hyphens, trimmed of leading and trailing hyphens, truncated to 48 characters, and `h-untitled`
  when that leaves nothing. A collision appends `-2`, `-3`, and so on, in document order.
- The reserved keys `whole-lesson` and `whole-course` are never derived from a heading.

**Rewording a heading must not detach a note**, which is the entire reason for this table. Renaming
`## Worked example` to `## Worked example: two moves` keeps the key `4-worked-example`, because the
match is a prefix match against the anatomy row, not an equality test against stored text. A
heading that carries an `h-<slug>` key does detach when reworded; its note block is preserved in
the file and reported by the panel as an unmatched section, never dropped.

New exports from `lib/lesson.ts`:

```ts
export const ANATOMY_HEADINGS: readonly (readonly [prefix: string, key: string])[];
export function anatomyPartForHeading(text: string): string | null;
export function sectionKeyForHeading(text: string, taken: ReadonlySet<string>): string;
export function lessonSections(headings: string[]): LessonSection[]; // whole-lesson first, then document order
```

`anatomyOf` must be refactored to read its parts 2, 3, 4, 5 and 7 predicates out of
`ANATOMY_HEADINGS` rather than repeating the literals, and its observable behavior must not change
(part 7 keeps its `checks.length > 0` conjunct, part 9 keeps its callout-based detector - the table
row for `9-transfer-prompt` is used for section keys only).

## The notes file format

Markdown a person can read and edit in Obsidian, with the app's editable regions marked by HTML
comments. The repository already uses this device for the hub's derived block
(`<!-- meno:derived:start -->`), so it is the house pattern rather than a new one.

A **note block** is an opening marker line, zero or more body lines, and a closing marker line:

```
<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=4-worked-example -->
The move happens at the call, not at the closing brace.
<!-- /meno:note -->
```

- Each marker sits alone on its line, with optional leading and trailing whitespace on that line.
- Attribute grammar: single spaces between `key=value` pairs, values matching
  `[A-Za-z0-9._/-]+`, no quotes, any order accepted, the order above always written.
  `page` is `course` or `lesson`. `lesson` is present if and only if `page=lesson`, and its value
  is `<module-slug>/<lesson-file-slug>` (no `.md`). `section` is a section key.
- The **body** is the lines strictly between the two marker lines, joined by `\n`. An empty note is
  a block with zero body lines. Note text may never contain either marker string; the write route
  rejects that with 400, which is what keeps the format unforgeable from the client.
- Everything outside a matched pair - the title, prose the learner typed directly in Obsidian, the
  `##` and `###` headings, blank lines, anything at all - is an **unrecognized region and is
  preserved byte for byte**. The parser never rewrites it and the serializer never regenerates it.

Parse is a single scan producing an ordered list of regions, each either `text` (raw bytes) or
`block` (marker attributes plus body). Serialization is the concatenation of those regions in
order, with only the edited block's body replaced. **Round-trip is therefore exact by
construction**: parse then serialize with no edit returns the input bytes, and an edit to one block
changes only that block's body bytes.

Recovery rules, each producing a warning rather than an error:

- An opening marker with no closing marker: everything from that marker to end of file is one
  unrecognized text region. Writes to other blocks still work; a write addressed to that key
  appends a new block at the end.
- A closing marker with no opening marker: unrecognized text.
- A malformed attribute list: unrecognized text.
- Two blocks with the same address: the first is authoritative for read and write; later ones are
  preserved untouched and reported.

### Creating a block

When a write addresses a key with no existing block, the server **inserts** rather than rewrites:

- Insertion point is immediately after the closing marker of the last block sharing the same
  `lesson` value, or at end of file when there is none. Course-page blocks go at end of file.
- The inserted region is a heading, a blank line, and the block. `## Course` for `page=course`;
  `## <module-slug> / <lesson-file-slug>` then `### <section title>` when this is the file's first
  block for that lesson, and `### <section title>` alone otherwise.
- The section title is derived server-side and never taken from the request:
  `whole-course` -> `Course`, `whole-lesson` -> `Whole lesson`, an anatomy key -> the heading text
  from the `ANATOMY_HEADINGS` row it anchors to (`4-worked-example` -> `Worked example`,
  `7-retrieval-check` -> `Recall`), so the written heading matches the heading the learner actually
  sees in the lesson, `h-<slug>` -> the slug with hyphens replaced by spaces and the first letter
  capitalized (there is no lesson heading to match, so this one stays a prettified form of the
  key). The learner may retitle any of these headings afterwards; the app never reads them back and
  never rewrites them.
- A file that does not exist yet is created from the **seed**, one exported function so the read
  route and the write route compute identical bytes:

```
# <Course title> - notes

Personal notes for [[<course-slug>-hub|<Course title>]].
```

  (title line, blank line, backlink line, trailing newline). A blocks-empty read of a missing file
  returns `sha256(seed)` as its `raw_sha256`, so the client's first `If-Match` round-trips.

### Worked example of a complete file

```markdown
# Rust for backend - notes

Personal notes for [[rust-for-backend-hub|Rust for backend]].

Anything I type out here by hand stays exactly as I typed it.

## Course

<!-- meno:note page=course section=whole-course -->
The link-shortener is the thing I actually want at the end of this.
<!-- /meno:note -->

## 01-syntax-and-ownership-basics / 03-ownership

### Whole lesson

<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=whole-lesson -->
Read it twice. The second pass was the one that stuck.
<!-- /meno:note -->

### Worked example

<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=4-worked-example -->
The move happens at the call, not at the closing brace.

Worth re-deriving from scratch next review.
<!-- /meno:note -->

### Recall

<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=7-retrieval-check -->
<!-- /meno:note -->
```

The last block is an empty note: the learner cleared its text, and the block stays so the heading
and its place in the file survive. The app never deletes a block.

## HTTP surface

Two routes, both under the existing `/api/v1/:tenant/...` grammar, added to `ROUTES` in
`app/server/routes.ts` beside the todo routes they are modelled on.

### `GET /api/v1/:tenant/notes/:course`

200 with `CourseNotesResponse`. 404 when the course slug is not in the tree walk (through the
existing `resolveCourse`). A missing file is 200 with `blocks: []`, never 404.

### `PUT /api/v1/:tenant/notes/:course`

Header `If-Match: <sha256 hex of the whole file>`, **required**. Body `CourseNotePutRequest`. One
block per request.

| Status | When | Body |
|---|---|---|
| 200 | written | `CourseNotePutResponse` |
| 400 | bad `page`; `section` failing `^[a-z0-9][a-z0-9-]{0,63}$`; `module`/`lesson` missing when `page=lesson` or present when `page=course`; `module`/`lesson` failing `^[A-Za-z0-9._-]+$` (the same per-segment charset the file format requires, so a rejected value can never degrade a block into unmatchable text); `text` over 32768 characters; `text` containing `meno:note` | `{ error }` |
| 404 | unknown course, or `page=lesson` naming a lesson file that does not exist | `{ error }` |
| 409 | `If-Match` does not equal the current file hash | `CourseNotesConflict` |
| 413 | request body over 64 KB (existing `readBody` guard) | `{ error }` |
| 428 | `If-Match` absent or empty | `{ error }` |

The 409 body carries `code: 'notes-conflict'` and the whole current file, so a client can tell a
conflict from every other failure by one field and can offer both recovery actions with no second
round trip:

```json
{ "error": "notes file changed since you read it", "code": "notes-conflict", "current": { "...": "CourseNotesResponse" } }
```

"Reload from disk" adopts `current` and drops the buffer. "Overwrite" re-sends the same text with
`If-Match: current.raw_sha256`; because a write replaces one block's bytes and preserves every
other region, an overwrite loses only what was concurrently written to that same block. There is no
`force` flag, and adding one would be the wrong shape.

The write path is `writeFileAtomic` from `app/server/atomic.ts`, reached through a
`withNotesFile(ctx, tenant, course, req, mutate)` helper that mirrors `withTodosFile` line for line
(read, compare `If-Match`, mutate the string, atomic replace, return the new hash). No second write
mechanism is introduced.

**Neither route accepts `event`, `source`, or `level`, and neither touches the ledger.** The
absence is the enforcement, exactly as it is for todos; `app/test/write-authority.test.ts` must
continue to pass with no edit.

`GET :tenant/notes/:course` is **not** added to the stable surface in
[../integration-surface.md](../integration-surface.md); that file needs no amendment.

## Types

All in `app/shared/types.ts`, alongside the existing response types. Named `CourseNote*` rather
than `Note*` because `NoteResponse` already means a rendered vault note and the two must not be
confused.

```ts
export type NotePage = 'course' | 'lesson';

export interface CourseNoteBlock {
  page: NotePage;
  module: string | null;   // null when page === 'course'
  lesson: string | null;   // null when page === 'course'
  section: string;         // 'whole-course' | 'whole-lesson' | an anatomy key | 'h-<slug>'
  text: string;            // '' for an empty note
}

export interface CourseNotesResponse {
  course: string;          // slug
  path: string;            // vault-relative, e.g. software-engineering/rust-for-backend/rust-for-backend-notes.md
  exists: boolean;         // false when nothing has been saved yet
  blocks: CourseNoteBlock[];   // file order
  raw_sha256: string;      // hash of the file, or of the seed when exists === false
  warnings: string[];
}

export interface CourseNotePutRequest {
  page: NotePage;
  module?: string;         // required iff page === 'lesson'
  lesson?: string;         // required iff page === 'lesson', the file slug with no .md
  section: string;
  text: string;
}

export interface CourseNotePutResponse {
  raw_sha256: string;
  block: CourseNoteBlock;
  warnings: string[];
}

export interface CourseNotesConflict {
  error: string;
  code: 'notes-conflict';
  current: CourseNotesResponse;
}

export interface LessonSection {
  key: string;
  title: string;                 // the heading text as authored, or 'Whole lesson'
  anatomy_part: string | null;   // the anatomy key when the heading matched a row, else null
}
```

`LessonResponse` gains one additive field, `sections: LessonSection[]`, always beginning with
`{ key: 'whole-lesson', title: 'Whole lesson', anatomy_part: null }`. The client reads section keys
from there and never parses HTML to discover them.

## Heading ids in rendered lesson HTML

`app/server/markdown.ts` emits no heading ids today. It gains an options argument:

```ts
export function renderMarkdown(text: string, index: Map<string, string | null>, opts?: { sectionIds?: boolean }): RenderResult;
```

Only `getLesson` passes `{ sectionIds: true }`. Hub rendering and `GET :tenant/note` are unchanged,
byte for byte.

With the option on, every **depth-2** heading (`##`, and only depth 2) is given
`id="sec-<key>"` and `data-meno-section="<key>"`, where `<key>` is the section key from the table
above. Depths 1 and 3 through 6 are untouched.

**The attributes are added after sanitization, not before.** The pipeline currently runs
`pipeline.runSync(tree)` (which applies `remark-rehype`, `rehype-raw` and `rehype-sanitize`) and
then `pipeline.stringify(hast)`; the id pass runs between those two calls. This is deliberate and
not a detail an implementer may reverse: `rehype-sanitize`'s default schema lists `id` in its
`clobber` set with `clobberPrefix: 'user-content-'`, so an id set before sanitization would reach
the browser as `user-content-sec-4-worked-example`. Adding it afterwards keeps the id exactly as
specified, leaves the sanitizer schema untouched, and carries no injection risk because the value
is derived server-side from a closed key set plus a slug of characters restricted to
`[a-z0-9-]`. Set `properties.id` and `properties.dataMenoSection` on the hast element; the
serialized form must be `data-meno-section="..."`, which is what the test asserts.

**Does this break `app/test/rendered-html.test.ts`?** No. That file is three source assertions
about `RenderedHtml.tsx` and `dangerouslySetInnerHTML`; it never reads rendered markup. No existing
test asserts on heading markup at all (`app/test/a11y-names-and-semantics.test.ts` asserts on
authored React headings in page components, not on pipeline output). The new assertions live in a
new file the backend owns, `app/test/section-ids.test.ts`.

The client must not use `document.getElementById`. It selects headings by
`[data-meno-section]` with `CSS.escape`, the same shape `useCheckMounts` already uses for
`div.meno-check[data-check-id]`.

## The panel

- Container: `<aside class="notes-panel" role="complementary">` whose `aria-label` names the section
  currently selected (`Notes: Worked example`), falling back to the course title when no section is
  selected. The label is deliberately dynamic: pressing a section button while the panel is already
  open moves focus back into the panel, and a static name would leave a screen-reader user with no
  signal that the section changed. It carries a heading
  naming the course. The toggle is a button with `aria-expanded` and `aria-controls` pointing at
  the panel's id; the per-heading buttons are the same control repeated, each with an accessible
  name of the form `Notes: <section title>` (never the bare word "Notes", which would repeat across
  the page and name the widget rather than the section - the v1.15 rule).
- Section list order: `LessonResponse.sections` order on a lesson page, single `whole-course`
  section on the course page, then any block in the file that matches no current section, grouped
  under an "Unmatched sections" heading, editable, never deleted.
- **Revealing a lesson section from the panel** reuses the existing programmatic helper,
  `prefersReducedMotion()` from `app/client/src/reducedMotion.tsx`, in the same three-step shape
  `CoursePage.tsx`'s module-anchor effect uses: `scrollIntoView({ behavior: reduced ? 'auto' :
  'smooth', block: 'start' })`, `focus({ preventScroll: true })` on a `tabIndex={-1}` target, and a
  temporary highlight class removed after about 1.5 seconds. CSS `:target` cannot be used and must
  not appear in this feature: the browser treats everything after the first `#` as the fragment, so
  under this hash router no element id ever matches it. Scroll clearance comes from the existing
  `--scroll-clearance` custom property; no new constant.
- Mounting the per-heading buttons happens inside server-rendered HTML, so it follows
  `useCheckMounts`' arrangement exactly: one react-dom root per mount point, an effect keyed on the
  `html` string, and no change to the memoized `dangerouslySetInnerHTML` object that
  `app/test/rendered-html.test.ts` pins. Re-assigning `innerHTML` destroys mounted children, note
  buttons and check widgets alike.
- `localStorage`, two keys, both versioned and tenant-scoped like the existing ones:
  - `meno.notes.open.v1:<url-encoded tenant>` - one boolean, default closed. Disposable view state.
  - `meno.notes.buffer.v1:<url-encoded tenant>:<course-slug>` - one JSON object mapping a section
    key to `{ text, based_on_sha256, saved_at }`. **This is the one place the client holds learner
    content**, it exists only between a failed write and its resolution, and each entry is deleted
    the moment its write succeeds or the learner chooses "reload from disk". App spec invariant 13
    is amended for it rather than quietly broken.
- All pure logic - the section list assembly, the unmatched-section fold, both key schemes, the
  debounce and flush decision, and the conflict state machine - lives in
  `app/client/src/notesPanel.ts`, a DOM-free `.ts` file so `node --test` covers it, the same
  arrangement `courseList.ts` established.

## Hub wikilink, and who writes it

The vault's no-orphans rule is reachability **from `home.md`** (`lib/vault.ts`, `orphans`), so an
outbound link in the notes file does not save it; something already reachable has to link **to**
it, and the course hub is that thing.

**The app server may not write a hub note.** The write-authority table gives hub notes to the
agent, and this feature does not widen that seam by one byte. So:

- The **agent** writes the wikilink, under `## My notes` in `<course-slug>-hub.md`, as
  `- [[<course-slug>-notes|My notes]]`. `second-brain` owns the convention and its sweep is where
  it lands.
- The **app** instead does two things, both inside the learner-owned class. The notes file it
  creates carries the seed's `[[<course-slug>-hub|<Course title>]]` backlink, so the graph edge
  exists in one direction immediately. And on the first creation of a notes file for a course, the
  server appends one todo through the existing `addTodo` seam - text
  `Link <course-slug>-notes into the course hub`, `type: vault`, `audience: for-agent` - skipped
  when `todos.md` already contains that exact text, so it is filed once per course and never again.
- Between creation and that sweep the notes file is an orphan and shows up in
  `insights.orphaned_notes`. That is a visible, self-clearing state, and it is the correct trade:
  the alternative is the app editing a file the seam says it may not.

## Data touched

| Path or endpoint | Access | Owner | Format |
|---|---|---|---|
| `content/tenants/<t>/<domain>/<course>/<course>-notes.md` | replace (atomic, If-Match) | server, and the learner in Obsidian | this spec |
| `content/tenants/<t>/todos.md` | append one todo on first creation | server via existing `addTodo` | todo-format.md |
| `content/tenants/<t>/<domain>/<course>/<course>-hub.md` | never | agent via second-brain | vault-conventions.md |
| browser `localStorage`, `meno.notes.open.v1:<tenant>` | replace | client | one boolean |
| browser `localStorage`, `meno.notes.buffer.v1:<tenant>:<course>` | replace | client | unsaved note text, cleared on success |

## Invariants

1. Parse then serialize with no edit is byte-identical to the input, for every input, including
   files containing no blocks, malformed markers, duplicate addresses, CRLF line endings, and no
   trailing newline.
2. A write to one block changes only that block's body bytes. Every other byte in the file,
   recognized or not, survives unchanged.
3. No block is ever deleted by the app. Clearing a note empties its body.
4. A note is addressed by anatomy part key. No stored heading text is ever compared to a lesson's
   current heading text to resolve a note.
5. Every write carries `If-Match`; a mismatch writes nothing and answers 409 with `code:
   'notes-conflict'`.
6. Neither notes route accepts `event`, `source`, or `level`, appends to the ledger, or reads or
   writes anything a gate consumes.
7. The app never writes a hub note, a manifest, a lesson, or `groups.yml` as part of this feature.
8. The reading column's `max-width` is `46rem` whether the panel is open or closed, in both push
   and overlay geometry, and no route scrolls horizontally at 320 CSS pixels.
9. Heading ids are added after sanitization and are drawn from a closed key set plus a
   `[a-z0-9-]` slug, so no lesson content can choose an id.
10. Nothing under `content/tenants/` is read or written by any test, fixture, or tool in this
    feature; `examples/` is the only content it touches.

## Module boundaries and path ownership

Two implementers, run in parallel, no shared path. This file is the contract and is owned by
neither: report a defect in it, do not edit it.

| Path | Owner | What it is |
|---|---|---|
| `app/server/notes.ts` | BACKEND | new: parse, serialize, upsert, seed, section-title derivation |
| `app/server/routes.ts` | BACKEND | `getCourseNotes`, `putCourseNotes`, `withNotesFile`, two `ROUTES` rows, `sections` on the lesson payload |
| `app/server/markdown.ts` | BACKEND | the `sectionIds` option and the post-sanitize id pass |
| `app/shared/types.ts` | BACKEND | every type in "Types" above |
| `lib/lesson.ts` | BACKEND | `ANATOMY_HEADINGS`, `anatomyPartForHeading`, `sectionKeyForHeading`, `lessonSections`, and the behavior-preserving `anatomyOf` refactor |
| `app/test/notes-format.test.ts` | BACKEND | round-trip and preservation properties |
| `app/test/notes-api.test.ts` | BACKEND | the two routes, every status code, the conflict path |
| `app/test/section-ids.test.ts` | BACKEND | rendered heading markup and key mapping |
| `examples/example-learner/.../rust-for-backend-notes.md` | BACKEND | one committed fixture file exercising the format |
| `examples/example-learner/.../rust-for-backend-hub.md` | BACKEND | one wikilink line under `## My notes` |
| any existing test needing a count fixup from that fixture edit | BACKEND | graph, insights and validate counts |
| `docs/architecture.md` | BACKEND | spec-index row, `app.md` amended-by cell, learner-owned class sentence |
| `docs/specs/app.md` | BACKEND | status line, behavior item, endpoint list, data table, invariants, verified-by |
| `AGENTS.md` | BACKEND | one clause in the format-owner list |
| `PROGRESS.md` | BACKEND | the Done entry |
| `.agents/skills/second-brain/SKILL.md` | BACKEND | the hub-link rule, in SKILL.md itself, not only in a reference |
| `.agents/skills/second-brain/references/vault-conventions.md` | BACKEND | the notes-file convention |
| `app/client/src/notesPanel.ts` | FRONTEND | new: all DOM-free panel logic |
| `app/client/src/components/NotesPanel.tsx` | FRONTEND | new: the panel |
| `app/client/src/sectionNoteButtons.tsx` | FRONTEND | new: mounts the per-heading buttons |
| `app/client/src/components/RenderedHtml.tsx` | FRONTEND | wiring the mount hook, memoization untouched |
| `app/client/src/pages/LessonPage.tsx` | FRONTEND | panel on the lesson page |
| `app/client/src/pages/CoursePage.tsx` | FRONTEND | panel on the course page |
| `app/client/src/api.tsx` | FRONTEND | one `putJson` helper |
| `app/client/src/styles.css`, `app/client/src/styles/notes.css` | FRONTEND | panel geometry, both modes |
| `app/test/notes-panel.test.ts` | FRONTEND | unit tests over `notesPanel.ts`, plus source assertions |

Resolved overlaps, each deliberate:

- `app/shared/types.ts` is BACKEND-only. FRONTEND imports the types exactly as published above and
  does not add to that file; a type it finds missing is a defect to report, not to patch.
- `app/test/rendered-html.test.ts` belongs to neither. It must keep passing untouched, and so must
  `app/test/write-authority.test.ts`.
- The `examples/` fixture edits are BACKEND's alone, because they are what the format tests read;
  FRONTEND reads the same fixture through the running server and writes none of it.

Ordering: BACKEND's types must land before FRONTEND typechecks. If both run concurrently, FRONTEND
writes against the published shapes and its `npm run typecheck` goes green when BACKEND's file
lands. Sequencing BACKEND first is the safer read.

Not touched by anyone: `app/server/ledger.ts`, `app/server/atomic.ts` (imported, unchanged),
`app/server/todos.ts` (imported for `sha256` and `addTodo`, unchanged), `schemas/**` (no schema
change, by design), `docs/migrations.md` (no migration), `tools/validate.ts`. No new npm
dependency, by either owner.

## The done-checklist

Every item is a test that fails today and must pass when the feature lands. The owner is the
implementer who writes it.

1. **Round-trip.** For each of a set of fixture strings - the worked example above, a file with no
   blocks, a file with an unterminated opening marker, a file with duplicate addresses, a file with
   CRLF endings, and a file with no trailing newline - `serialize(parse(s))` equals `s` byte for
   byte. (BACKEND, `notes-format.test.ts`)
2. **Preservation under edit.** Editing one block of the worked example changes only the bytes
   between that block's markers: every other region, including hand-typed prose and every heading,
   is byte-identical, verified by diffing the regions rather than by eye. (BACKEND)
3. **Unrecognized content survives.** A file containing an unterminated marker and a stray closing
   marker parses with warnings, writes to a different section succeed, and both malformed regions
   are still present verbatim afterwards. (BACKEND)
4. **Empty notes.** Writing `text: ''` to an existing block leaves the block present with a
   zero-line body and returns it as `text: ''`; no block count changes. (BACKEND)
5. **Anatomy-key anchoring survives a rewording.** Given a lesson whose `## Worked example` heading
   is rewritten to `## Worked example: two moves`, the rendered heading still carries
   `data-meno-section="4-worked-example"`, `LessonResponse.sections` still contains that key, and a
   note previously saved under it is still returned for that section. This is the test that fails
   loudest under a text-keyed implementation. (BACKEND, `section-ids.test.ts` plus
   `notes-api.test.ts`)
6. **Heading ids.** Rendered lesson HTML carries `id="sec-<key>"` and `data-meno-section="<key>"` on
   every depth-2 heading and on no other depth; the ids carry no `user-content-` prefix; hub HTML
   and `GET :tenant/note` output are unchanged from before the feature. (BACKEND)
7. **If-Match conflict.** Read the file, mutate it out of band, then `PUT` with the stale hash:
   status is 409, the body carries `code: 'notes-conflict'` and a `current` matching a fresh `GET`,
   and the file on disk is byte-identical to the out-of-band version. Re-sending with
   `current.raw_sha256` then succeeds. (BACKEND)
8. **If-Match required.** A `PUT` with no `If-Match` header is 428 and writes nothing. (BACKEND)
9. **Status-code table.** One assertion per row of the `PUT` table: 400 for each rejected field
   shape including text containing `meno:note`, 404 for an unknown course and for a lesson that
   does not exist, 413 for an oversized body. (BACKEND)
10. **First write creates file, seed and todo.** A `PUT` against a course with no notes file creates
    it from the seed, and `GET :tenant/todos` then contains exactly one
    `Link <course>-notes into the course hub` todo; a second `PUT` adds no second todo. (BACKEND)
11. **Write authority holds.** `app/test/write-authority.test.ts` passes unmodified, and a new case
    in `notes-api.test.ts` sends `source`, `level` and `event` in a notes `PUT` body and asserts the
    ledger gained no line and the file gained no such text. (BACKEND)
12. **`anatomyOf` is unchanged.** The example fixture's lessons still score 9 of 9 and every part
    key resolves as before, after the refactor onto `ANATOMY_HEADINGS`. (BACKEND)
13. **Panel logic.** `notesPanel.ts` unit tests: section list assembly from a `sections` array plus a
    block list, unmatched-section folding, both `localStorage` key schemes, the debounce and flush
    decision (a keystroke schedules, blur and close flush immediately, an in-flight write is not
    duplicated), and the conflict state machine's two exits. (FRONTEND)
14. **No `:target`, no `getElementById`, one reduced-motion call site.** Source assertions over the
    feature's client files: no `:target` selector in the notes CSS, no `document.getElementById` in
    the panel, and reveal goes through `prefersReducedMotion()` rather than an inline `matchMedia`
    string. (FRONTEND)
15. **Memoization intact.** `app/test/rendered-html.test.ts` passes unmodified after the button
    mounting is added to `RenderedHtml.tsx`. (FRONTEND)
16. **The gate.** `npm run gate` (typecheck, `node --test`, validate) passes with the new fixture
    notes file and hub line committed. (both)

## Amendments to existing files

Exact content, so an implementer does not have to invent it.

- **`docs/architecture.md`**, spec index: add
  `| [specs/notes.md](specs/notes.md) | personal notes: per-course notes file format, the two If-Match-guarded routes, anatomy-key section anchors, the side panel | v1.18 | - |`,
  and append `, v1.18` to the `specs/app.md` row's amended-by cell.
- **`docs/architecture.md`**, the write-authority seam: after the `todos.md` sentence, add that
  `<course-slug>-notes.md` is the second member of the learner-owned class (written by the app
  under the same atomic, `If-Match`-guarded discipline, read by no gate, appending no ledger
  event), and that the hub wikilink pointing at it stays the agent's write, which is what keeps
  the seam the same width it was.
- **`docs/specs/app.md`**: add `v1.18 (the personal-notes side panel)` to the status line; add a
  numbered behavior item covering the panel, its two geometries, the debounce and flush rule, and
  the conflict choice, linking here for the format; add both routes to the HTTP-surface paragraph,
  changing "Writes (the entire write surface)" from five routes across two files to six routes
  across three files and naming the third file; add the two `localStorage` keys and the notes file
  to the data table; amend invariant 13 so it reads that the client persists disposable view state
  plus, only between a failed write and its resolution, unsaved note text under
  `meno.notes.buffer.v1`, cleared on success; add invariants for the round-trip property and for
  anatomy-key anchoring; add the new test files to "Verified by".
- **`AGENTS.md`**, the format-owner clause: add `personal notes file: docs/specs/notes.md` to the
  list of canonical formats and their owners. Nothing else in that file changes.
- **`.agents/skills/second-brain/SKILL.md`**: one rule, stated in SKILL.md itself rather than only
  in a reference - when a course directory contains `<course-slug>-notes.md`, the course hub must
  carry `- [[<course-slug>-notes|My notes]]` under `## My notes`; add it during any vault sweep and
  never edit the note blocks themselves.
- **`.agents/skills/second-brain/references/vault-conventions.md`**: the file naming convention, the
  marker grammar in one line, and the instruction that the region outside the markers is the
  learner's and the agent may read it but should not restructure it.
- **`PROGRESS.md`**: a dated Done entry for v1.18 naming what shipped, the one non-additive piece
  (invariant 13's amendment), and the accepted interval during which a new notes file is an orphan.

## Open questions

- Nothing surfaces a course's notes outside the panel. A "Notes" entry on the course page, or a
  count badge, is a natural follow-up and deliberately out of scope here.
- The panel offers no search across a tenant's notes files. Obsidian does that better today.
- A second learner-owned file class member makes the case for factoring `withTodosFile` and
  `withNotesFile` into one guarded-replace helper. Left alone here: two call sites is not yet a
  pattern, and the refactor would put both implementers in the same file.
