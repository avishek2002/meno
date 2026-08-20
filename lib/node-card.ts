// The graph node card model: everything a node card shows that `GraphNode`
// does not already carry, for exactly one node. `buildNodeCard` is the pure
// join layer `lib/graph.ts` deliberately does not grow a second output shape
// for (docs/specs/graph.md, "Architecture"); the two files answer different
// requests over the same producers and share no code, because the join each
// one performs is small enough that sharing it would cost more readability
// than it saves.
//
// Pure over the same in-memory inputs `buildGraph` takes minus `groups` (a
// card never shows the fill-colour legend): no filesystem, no clock, no
// network, so every kind and the ghost case unit-test over synthetic file
// maps with no fixture (tools/test/node-card.test.ts).
//
// The card's own leak boundary (invariant 18) is the entire reason this file
// exists rather than three more fields on GraphNode: a lesson's `summary`
// comes from its course hub note's `meno:derived` block and NEVER from the
// lesson file itself, so `NodeCardInput` does not even carry lesson bodies -
// only `files` (every note's raw text, hub notes and home.md included) and
// the manifests. There is no `answer`, `explain`, or `checks` anywhere in this
// file's inputs or outputs to leak in the first place.
import type {
  CourseNode,
  ModuleNode,
  LessonEntry,
  GraphNodeKind,
  GraphNodeState,
  NodeCardResponse,
  NodeCardAction,
  NodeCardProgress,
  NodeCardObjective,
  NodeCardSummarySource,
  TreeResponse,
} from '../app/shared/types.ts';
import type { VaultFile, VaultGraph } from './vault.ts';
import type { Mastery } from './mastery.ts';
import { DERIVED_START, DERIVED_END, derivedDescriptionFor } from './hub-derived.ts';
import { CONNECTS_START, CONNECTS_END } from './connects.ts';
import { parseFrontmatter } from './frontmatter.ts';
import { courseHref, lessonHref, noteHref } from '../app/shared/routeHrefs.ts';

/**
 * Everything `buildNodeCard` needs, already computed by the existing single
 * implementations - the same producers `GraphInput` takes, minus `groups`.
 * `vault` is accepted for that parity (routes.ts assembles both endpoints'
 * inputs from one identical set of loaders, docs/specs/graph.md's
 * architecture section) even though this file's own lookups resolve by
 * basename rather than through `vault.index` - see `derivedDescriptionFor`'s
 * own comment for why a basename match is exact here.
 */
export interface NodeCardInput {
  tenant: string;
  /** The requested `GraphNode.id` - resolution is against the node set this
   * input describes, never against the filesystem (invariant 19). */
  id: string;
  files: VaultFile[];
  vault: VaultGraph;
  tree: TreeResponse;
  mastery: Mastery;
}

// A lesson manifest entry, wherever it lives, joined back to its course and
// module - the same join `lib/graph.ts`'s own `LessonRef` performs, kept as a
// private duplicate rather than a shared export: the two files' node
// resolution is close enough to look shareable but small enough that sharing
// it would cost a coupling between two files the architecture note
// deliberately keeps independent.
interface LessonRef {
  id: string;
  course: CourseNode;
  module: ModuleNode;
  lesson: LessonEntry;
}

const hubIdOf = (course: CourseNode): string | null =>
  course.hub ? `${course.dir}/${course.hub.replace(/^\.\//, '')}` : null;

/** One line, honestly said - never invented for a kind the design does not answer for. */
const NO_LESSON_ACTION_REASON = 'This lesson is planned but not written yet.';

/** How long a `note-intro` summary may run before truncation - a card corner, not a lesson page. */
const SUMMARY_MAX_CHARS = 240;

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = text.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

/**
 * True when a `meno:derived` (or, by the same shape, `meno:connects`) marker
 * pair is PRESENT but not exactly one start and one end - a real content
 * problem worth a warning, as opposed to no markers at all, which is simply a
 * hub or `home.md` that has not been swept yet and is the ordinary state of a
 * brand-new course. `parseDerivedBullets` itself collapses both cases to `[]`
 * (its own file's contract: no diagnostics), so this file is where the two
 * are told apart for the one caller - `buildNodeCard` - that has a `warnings`
 * array to put the difference in.
 */
function derivedBlockMalformed(text: string, start: string, end: string): boolean {
  const starts = countOccurrences(text, start);
  const ends = countOccurrences(text, end);
  if (starts === 0 && ends === 0) return false;
  return starts !== 1 || ends !== 1;
}

/** Removes a `start`..`end` marker pair and everything between, markers
 * included. A no-op when the pair is not present or not well-formed, which is
 * safe here: `noteIntro` only needs this to keep derived/connects content out
 * of a note's ordinary prose, never to validate the block. */
function stripMarkerBlock(text: string, start: string, end: string): string {
  const s = text.indexOf(start);
  const e = text.indexOf(end);
  if (s === -1 || e === -1 || e < s) return text;
  return text.slice(0, s) + text.slice(e + end.length);
}

const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;
const WIKILINK = /\[\[[^\]]*\]\]/g;
const ATX_HEADING = /^#{1,6}\s+/;
const COMMENT_ONLY_LINE = /^<!--.*-->$/;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  const base = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return `${base}...`;
}

/**
 * First ordinary paragraph: no heading, no derived/connects block, no
 * wikilink-only line. Frontmatter is stripped first through the repo's one
 * frontmatter implementation (`lib/frontmatter.ts`) rather than a second
 * hand-rolled `---` scan, so a note like `insights/2026-08-08-insights.md`
 * (a YAML block, then its narrative) does not read its own frontmatter block
 * as one giant "paragraph". Fenced code blocks are blanked for the same
 * reason `lib/connects.ts` and `lib/hub-derived.ts` blank them: a code sample
 * must never read as prose. Returns null when nothing qualifies - an empty
 * note, or one that is only a heading and a wikilink.
 */
export function noteIntro(markdown: string, maxChars: number): string | null {
  const { body } = parseFrontmatter(markdown);
  let text = body.replace(/\r\n?/g, '\n');
  text = text.replace(FENCED_CODE_BLOCK, (m) => m.replace(/[^\n]/g, ' '));
  text = stripMarkerBlock(text, DERIVED_START, DERIVED_END);
  text = stripMarkerBlock(text, CONNECTS_START, CONNECTS_END);

  const lines = text.split('\n').map((line) => {
    const trimmed = line.trim();
    if (trimmed === '') return '';
    if (ATX_HEADING.test(trimmed)) return ''; // a heading is never the intro itself
    if (COMMENT_ONLY_LINE.test(trimmed)) return ''; // a stray marker line left over from a no-op strip
    return line;
  });

  const paragraphs = lines.join('\n').split(/\n\s*\n+/);
  for (const para of paragraphs) {
    const joined = para
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .join(' ')
      .trim();
    if (joined === '') continue;
    if (joined.replace(WIKILINK, '').trim() === '') continue; // wikilink-only line
    return truncate(joined, maxChars);
  }
  return null;
}

/**
 * Lessons-done-over-total, counted over manifest entries rather than files on
 * disk, so a planned lesson counts toward `lessons_total` exactly the way a
 * ghost node counts in the graph. `courses` may be one course (a `hub` card's
 * scope) or every course in the tenant (a `home` card's scope) - the caller
 * decides, this function only counts.
 */
export function courseLessonProgress(
  courses: readonly CourseNode[],
  fileIds: ReadonlySet<string>,
  mastery: Mastery,
): NodeCardProgress {
  let total = 0;
  let generated = 0;
  let mastered = 0;
  for (const course of courses) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        total++;
        const id = `${course.dir}/modules/${mod.slug}/${lesson.file}`;
        if (!fileIds.has(id)) continue;
        generated++;
        const level = mastery.courses[course.slug]?.concepts[lesson.concept]?.level;
        if (level === 'mastered') mastered++;
      }
    }
  }
  return { lessons_total: total, lessons_generated: generated, lessons_mastered: mastered, courses: courses.length };
}

export interface ActionTarget {
  tenant: string;
  kind: GraphNodeKind;
  state: GraphNodeState;
  /** vault path, for `noteHref` */
  id: string;
  /** slug, for `courseHref` on a hub */
  course: string | null;
  /** for `lessonHref` */
  lesson: { course: string; module: string; file: string } | null;
}

/**
 * The card's single bottom button. Per kind (types.ts's own `NodeCardAction`
 * doc carries the full reasoning; this is the implementation of it):
 *
 * - `hub`    `courseHref`, never the hub note's own `route` - CoursePage
 *            strictly dominates the raw hub markdown for the same node.
 * - `lesson` `lessonHref` when a file exists; a ghost gets `enabled: false`,
 *            `href: null`, and the one honest reason there is nothing to open.
 * - `home`   `noteHref(tenant, 'home.md')`, the same value `GraphNode.route` carries.
 * - `note`   `noteHref(tenant, id)`, likewise the same value `route` carries.
 */
export function nodeCardAction(target: ActionTarget): NodeCardAction {
  if (target.kind === 'hub') {
    // A node of kind 'hub' is only ever produced for a course whose hub file
    // exists (lib/graph.ts's own hubIdToCourse map), so `course` is never
    // null in practice; the fallback below is defensive, not expected to fire.
    return { href: courseHref(target.tenant, target.course ?? ''), label: 'Open course', enabled: true, disabled_reason: null };
  }
  if (target.kind === 'lesson') {
    if (target.state === 'ghost' || !target.lesson) {
      return { href: null, label: 'Open lesson', enabled: false, disabled_reason: NO_LESSON_ACTION_REASON };
    }
    const l = target.lesson;
    return { href: lessonHref(target.tenant, l.course, l.module, l.file), label: 'Open lesson', enabled: true, disabled_reason: null };
  }
  if (target.kind === 'home') {
    return { href: noteHref(target.tenant, 'home.md'), label: 'Open note', enabled: true, disabled_reason: null };
  }
  // note
  return { href: noteHref(target.tenant, target.id), label: 'Open note', enabled: true, disabled_reason: null };
}

/**
 * Build the whole card for one node, or `null` when `id` is not in this
 * input's node set - the route's 404 (invariant 19). Node identity, kind, and
 * state are derived exactly the way `lib/graph.ts`'s `buildGraph` derives
 * them (same file-existence and manifest join), because the two responses
 * must agree about what a given id IS even though they answer different
 * questions about it.
 */
export function buildNodeCard(input: NodeCardInput): NodeCardResponse | null {
  const { tenant, id, files, tree, mastery } = input;

  const fileTextById = new Map<string, string>();
  const fileIds = new Set<string>();
  for (const f of files) {
    fileTextById.set(f.path, f.text);
    fileIds.add(f.path);
  }

  const lessonById = new Map<string, LessonRef>();
  for (const course of tree.courses) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        const lid = `${course.dir}/modules/${mod.slug}/${lesson.file}`;
        lessonById.set(lid, { id: lid, course, module: mod, lesson });
      }
    }
  }

  const hubIdToCourse = new Map<string, CourseNode>();
  for (const course of tree.courses) {
    const hubId = hubIdOf(course);
    if (hubId && fileIds.has(hubId)) hubIdToCourse.set(hubId, course);
  }

  const nodeIds = new Set<string>(fileIds);
  for (const lid of lessonById.keys()) nodeIds.add(lid);
  if (!nodeIds.has(id)) return null; // invariant 19: not a node in this graph at all - the 404 case

  const lessonInfo = lessonById.get(id);
  const owningCourseAsHub = hubIdToCourse.get(id);
  const isHome = id === 'home.md';
  const kind: GraphNodeKind = isHome ? 'home' : owningCourseAsHub ? 'hub' : lessonInfo ? 'lesson' : 'note';

  const coursesByDirDepth = [...tree.courses].sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (nid: string): CourseNode | undefined => coursesByDirDepth.find((c) => nid.startsWith(`${c.dir}/`));
  const owning = lessonInfo?.course ?? owningCourseAsHub ?? ownerOf(id);
  const courseSlug = owning?.slug ?? null;

  const fileExists = fileIds.has(id);
  let state: GraphNodeState;
  if (!fileExists) {
    state = 'ghost';
  } else if (lessonInfo) {
    const level = mastery.courses[lessonInfo.course.slug]?.concepts[lessonInfo.lesson.concept]?.level;
    state = level === 'mastered' ? 'mastered' : 'generated';
  } else {
    state = 'generated';
  }

  // invariant 18's closing clause, computed once and shared by both fields
  // that would otherwise read a file's own body: an id under a course's
  // modules/ directory but NOT a listed lesson (an orphaned file dropped next
  // to one, or every lesson in a module whose module.yml failed to parse -
  // tryYaml in app/server/tree.ts tolerates and silently drops the whole
  // module rather than 500ing) is still classified kind:'note', and a
  // note's file text is only safe to read when the note is NOT sitting
  // under modules/. Keeping one boolean here is what stops `title` and
  // `summary` from drifting the way they already did once: `summary` had
  // this guard, `title` did not, and title's fallback path (any note-kind id
  // whose file happens to exist) leaked full lesson bodies through their own
  // H1 heading.
  const underModules = id.includes('/modules/');

  let title: string;
  if (lessonInfo) {
    title = lessonInfo.lesson.title;
  } else if (owningCourseAsHub) {
    title = owningCourseAsHub.title;
  } else if (underModules) {
    // Never read the file body for a note-kind id living under modules/ - see
    // the `underModules` comment above. The basename is all this id owns that
    // is safe to show.
    title = (id.split('/').at(-1) ?? id).replace(/\.md$/, '');
  } else {
    const text = fileTextById.get(id) ?? '';
    const heading = text.match(/^#\s+(.+)$/m);
    title = heading ? heading[1].trim() : (id.split('/').at(-1) ?? id).replace(/\.md$/, '');
  }

  const warnings: string[] = [];
  let summary: string | null = null;
  let summary_source: NodeCardSummarySource = 'none';
  let objectives: NodeCardObjective[] = [];
  let progress: NodeCardProgress | null = null;

  if (lessonInfo) {
    // hub-derived: read the description out of the OWNING course's hub note.
    // The lesson body at `id` is never read here - that is the whole point of
    // invariant 18, and this branch never even looks its text up.
    const hubId = hubIdOf(lessonInfo.course);
    const hubText = hubId ? fileTextById.get(hubId) : undefined;
    if (hubText !== undefined) {
      const basename = id.split('/').at(-1)!.replace(/\.md$/, '');
      const desc = derivedDescriptionFor(hubText, basename);
      if (desc !== null) {
        summary = desc;
        summary_source = 'hub-derived';
      } else if (derivedBlockMalformed(hubText, DERIVED_START, DERIVED_END)) {
        warnings.push(`${hubId}: meno:derived block is malformed - no summary available for "${id}"`);
      }
      // else: no bullet for this lesson yet (the ordinary state for a
      // just-planned lesson, invariant 20) - summary stays null, no warning
    }
  } else if (owningCourseAsHub) {
    const course = owningCourseAsHub;
    const homeText = fileTextById.get('home.md');
    if (homeText !== undefined) {
      const basename = id.split('/').at(-1)!.replace(/\.md$/, '');
      const desc = derivedDescriptionFor(homeText, basename);
      if (desc !== null) {
        summary = desc;
        summary_source = 'home-derived';
      } else if (derivedBlockMalformed(homeText, DERIVED_START, DERIVED_END)) {
        warnings.push(`home.md: meno:derived block is malformed - no summary available for "${id}"`);
      }
    }
    objectives = course.objectives.map((o) => ({ id: o.id, text: o.text }));
    progress = courseLessonProgress([course], fileIds, mastery);
  } else {
    // home or note. Invariant 18's closing clause: never produce a
    // note-intro summary for an id under a course's modules/ directory, so a
    // stray file dropped next to a lesson - classified 'note' only because no
    // module.yml lists it - cannot become a hole in the leak rule. `title`
    // above shares this same `underModules` guard, on purpose.
    if (!underModules) {
      const text = fileTextById.get(id) ?? '';
      const intro = noteIntro(text, SUMMARY_MAX_CHARS);
      if (intro !== null) {
        summary = intro;
        summary_source = 'note-intro';
      }
    }
    if (isHome) progress = courseLessonProgress(tree.courses, fileIds, mastery);
  }

  const action = nodeCardAction({
    tenant,
    kind,
    state,
    id,
    course: courseSlug,
    lesson: lessonInfo ? { course: lessonInfo.course.slug, module: lessonInfo.module.slug, file: lessonInfo.lesson.file } : null,
  });

  return { tenant, id, title, kind, state, course: courseSlug, summary, summary_source, objectives, progress, action, warnings };
}
