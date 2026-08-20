// API payload types shared by the server and the client. The server constructs
// these; the client consumes them. Content formats stay owned by the skill
// references - these are transport shapes only.
import type { InsightsReport, Rate } from '../../lib/insights.ts';
import type { CostSnapshot, CourseCost, CostNoDataEntry, SharedOrchestration, CostTotals } from '../../lib/cost.ts';
import type { GlossaryBacklink, GlossaryCourse, GlossaryEntry } from '../../lib/terms.ts';

// Re-exported (not duplicated) so the client can import it like every other
// response type below, via a plain `import type { InsightsReport } from
// '../../../shared/types.ts'` - lib/insights.ts stays the one place the shape
// is defined. Unlike ProgressResponse.mastery (kept as `unknown` on purpose,
// since mastery.yml is also read from disk elsewhere), InsightsReport has no
// second producer to reconcile against, so a direct type import is safe.
export type { InsightsReport, Rate };

// Same rule for the cost snapshot: lib/cost.ts is the one place the shape is
// defined, and this file re-exports rather than duplicates (docs/specs/cost.md,
// "Types").
export type { CostSnapshot, CourseCost, CostNoDataEntry, SharedOrchestration, CostTotals };

export interface TenantInfo {
  id: string;
  courses: number;
}

export interface LessonEntry {
  file: string;
  title: string;
  concept: string;
  status: string;
}

export interface ModuleNode {
  slug: string;
  title: string;
  status: string;
  est_hours: number;
  serves: string[];
  prerequisites: string[];
  concepts: string[];
  lessons: LessonEntry[];
}

export interface CourseNode {
  dir: string; // vault-relative course dir, "<domain>/<slug>"; may differ from slug in hand-made courses
  slug: string;
  title: string;
  status: string;
  hub: string;
  objectives: { id: string; text: string; bloom: string; assessed_by?: string }[];
  modules: ModuleNode[];
}

export interface TreeResponse {
  tenant: string;
  courses: CourseNode[];
  warnings: string[];
}

// Course groups, already resolved server-side so the client never has to diff
// the registry against the walk. `groups` holds the explicit groups from
// groups.yml first, then one derived section per domain directory for the
// courses no group claimed - `source` says which. `ungrouped` is only the
// remainder that has neither: a course still sitting at the vault root.
export interface CourseGroup {
  id: string; // a group id, or "domain:<slug>" for a derived section
  title: string;
  courses: string[]; // course slugs, resolvable against TreeResponse.courses
  source: 'explicit' | 'domain';
}

export interface GroupsResponse {
  groups: CourseGroup[];
  ungrouped: string[];
  warnings: string[];
  raw_sha256: string;
}

// answer and explain are deliberately absent: grading is server-side and the
// answer returns only in the submit response.
export interface PublicCheck {
  id: string;
  type: 'mcq' | 'cloze' | 'flashcard';
  concept: string;
  prompt: string;
  options?: string[];
}

export interface LessonResponse {
  frontmatter: Record<string, unknown>;
  html: string;
  checks: PublicCheck[];
  transfers: { title: string }[];
  links: { resolved: Record<string, string>; broken: string[] };
  warnings: string[];
  sections: LessonSection[];
}

// --- personal notes ---------------------------------------------------------
//
// Named CourseNote* rather than Note* because NoteResponse already means a
// rendered vault note and the two must not be confused. Owned end to end by
// docs/specs/notes.md; see that file for the file format, the anchoring
// model, and the HTTP surface these types serve.

export type NotePage = 'course' | 'lesson';

export interface CourseNoteBlock {
  page: NotePage;
  module: string | null; // null when page === 'course'
  lesson: string | null; // null when page === 'course'
  section: string; // 'whole-course' | 'whole-lesson' | an anatomy key | 'h-<slug>'
  text: string; // '' for an empty note
}

export interface CourseNotesResponse {
  course: string; // slug
  path: string; // vault-relative, e.g. software-engineering/rust-for-backend/rust-for-backend-notes.md
  exists: boolean; // false when nothing has been saved yet
  blocks: CourseNoteBlock[]; // file order
  raw_sha256: string; // hash of the file, or of the seed when exists === false
  warnings: string[];
}

export interface CourseNotePutRequest {
  page: NotePage;
  module?: string; // required iff page === 'lesson'
  lesson?: string; // required iff page === 'lesson', the file slug with no .md
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
  title: string; // the heading text as authored, or 'Whole lesson'
  anatomy_part: string | null; // the anatomy key when the heading matched a row, else null
}

export interface NoteResponse {
  path: string;
  html: string;
  links: { resolved: Record<string, string>; broken: string[] };
  /**
   * The course whose directory contains this note, resolved by the server from the
   * same walk that answers every other route - null for a note that sits outside
   * every course (home.md, insights/, sources/). The client links only what this
   * field confirms exists, so a breadcrumb can never point at a course that is not
   * there.
   */
  course: { slug: string; title: string } | null;
  /** The domain directory of `course`, or null when there is no course or it sits at the vault root. */
  domain: string | null;
}

export interface SubmitRequest {
  course: string;
  module: string;
  lesson: string; // lesson file slug without .md
  check_id: string;
  response: string;
}

export interface SubmitResponse {
  correct: boolean;
  answer: string;
  explain: string;
  event_ts: string;
}

// Two orthogonal axes replacing the old single-tag namespace (#gen/#repo/#note):
// kind is what the work is, audience is who can do it. See
// .agents/skills/second-brain/references/todo-format.md for the full contract,
// including the read-only back-compat aliases app/server/todos.ts still parses.
export type TodoKind = 'course' | 'content-fix' | 'vault' | 'feature' | 'bug' | 'study' | 'admin';
export type TodoAudience = 'for-agent' | 'for-me';

export interface Todo {
  line: number; // 0-based index into the raw file
  text: string;
  // field name deliberately unchanged - GET :tenant/todos is stable surface
  // (docs/integration-surface.md); only the value set changed, which is a
  // breaking change to that surface's payload shape, noted in docs/specs/app.md
  type: TodoKind | null;
  audience: TodoAudience | null;
  done: boolean;
  completedOn: string | null;
}

export interface TodosResponse {
  sections: { heading: string; todos: Todo[] }[];
  raw_sha256: string;
}

export interface DueConcept {
  course: string;
  concept: string;
  next_review: string;
}

export interface ProgressResponse {
  mastery: unknown; // lib/mastery.ts Mastery - derived live, never read from disk
  due: DueConcept[];
  recent: unknown[];
}

// InsightsReport plus narrative report files found under insights/ in the
// vault (see app/server/routes.ts getInsights) - the one field the endpoint
// adds that lib/insights.ts's pure computeInsights does not know about.
export interface InsightsResponse extends InsightsReport {
  notes: string[];
}

/**
 * GET /api/v1/:tenant/cost. A missing or unreadable snapshot is a normal state, not an error,
 * so the endpoint answers 200 with snapshot: null and a reason the page can render.
 */
export interface CostResponse {
  tenant: string;
  snapshot: CostSnapshot | null;
  reason: 'ok' | 'no-snapshot';
  /** The command that produces one, so the empty state can tell the learner what to run. */
  how_to_generate: string; // "npm run cost -- content/tenants/<tenant> --write"
}

// --- knowledge graph -------------------------------------------------------
//
// The one place the graph wire shapes are defined, and the one exception to the
// re-export rule InsightsReport and CostSnapshot follow. Those each have a
// single owning lib module; the graph does not. It is a join of four
// independent producers - lib/vault.ts's resolved link graph, the tree walk's
// manifests, lib/groups.ts's resolved sections, and lib/mastery.ts's derivation
// - and none of them owns the result, so the transport shape is defined here
// and lib/graph.ts imports it. Nothing imports back out of lib/graph.ts into
// this file.
//
// The whole subsystem is read-only: there is no POST counterpart and no field
// here is ever written back to a file (docs/specs/graph.md).

/**
 * What a node is in the vault. A file can look like more than one of these
 * (a hub is also a note), so the precedence is fixed and total:
 * `home` > `hub` > `lesson` > `note`.
 */
export type GraphNodeKind = 'home' | 'hub' | 'lesson' | 'note';

/**
 * The node-style channel (docs/specs/graph.md, "How it behaves"):
 * - `ghost`     a lesson a module manifest plans, with no file on disk yet
 * - `generated` the file exists and its concept is not mastered
 * - `mastered`  a lesson whose concept `deriveMastery()` puts at level
 *               `mastered` in that course
 *
 * Only a lesson node is ever `mastered`. Every node with a file on disk that is
 * not a mastered lesson is `generated`.
 */
export type GraphNodeState = 'ghost' | 'generated' | 'mastered';

export interface GraphNode {
  /**
   * Vault-relative posix path including the `.md` suffix, and the node's
   * identity. A ghost lesson uses the path its file would occupy
   * (`<course.dir>/modules/<module>/<lessons[].file>`), so a node keeps the
   * same id when the body is finally generated.
   */
  id: string;
  title: string;
  kind: GraphNodeKind;
  /**
   * The fill-colour channel: the resolved group section id from
   * `lib/groups.ts` (a `groups.yml` id, or `domain:<slug>` for a derived
   * section), or null for a node that sits in no course - `home.md`,
   * `todos.md`, anything under `insights/`.
   */
  group: string | null;
  /** Course slug the node belongs to; null for the same nodes `group` is null for. */
  course: string | null;
  state: GraphNodeState;
  /**
   * The size channel: how many distinct other nodes point at this one, counted
   * over the deduplicated edge list (docs/specs/graph.md, invariant 7).
   */
  in_degree: number;
  /**
   * The client hash route this node opens, server-constructed and already
   * percent-encoded - `#/t/<tenant>/c/<course>/m/<module>/l/<file>` for a
   * lesson, `#/t/<tenant>/n/<vault-path>` for everything else. Null for a ghost:
   * there is no file to open.
   */
  route: string | null;
}

/**
 * - `reference`  a resolved wikilink (`buildVaultGraph().resolved`)
 * - `membership` a lesson to its course hub, from `module.yml lessons[]`,
 *                planned or generated - what keeps ghost nodes attached
 * - `connection` an authored cross-course edge from a hub's `meno:connects`
 *                block, the only kind drawn with weight
 *
 * Module `prerequisites` are deliberately not an edge kind: they are already a
 * mermaid DAG inside each hub, and a third semantics in one undifferentiated
 * picture reads as noise.
 */
export type GraphEdgeKind = 'reference' | 'membership' | 'connection';

export interface GraphEdge {
  /** node id; for `membership` the lesson, for `connection` the declaring hub */
  source: string;
  /** node id; for `membership` the course hub, for `connection` the named hub */
  target: string;
  kind: GraphEdgeKind;
  /**
   * The authored one-line why. Present only on a `connection` edge, and only
   * when the block supplied one - never set on the other two kinds.
   */
  reason?: string;
}

/** Legend entry for the fill-colour channel, in `resolveGroups` order. */
export interface GraphGroup {
  id: string;
  title: string;
}

/**
 * GET /api/v1/:tenant/graph. Read-only, walked fresh per request like every
 * other GET. Deterministic: nodes sorted by `id`, edges by
 * (`source`, `target`, `kind`).
 */
export interface GraphResponse {
  tenant: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  groups: GraphGroup[];
  /** Degraded-path notes (malformed connects blocks, group warnings). Never an error. */
  warnings: string[];
}

// --- graph node card -------------------------------------------------------
//
// GET /api/v1/:tenant/graph/node?id=<node id>. The second, deliberately narrow
// GET of the graph subsystem: everything a node card shows that a GraphNode
// does not already carry, for exactly one node, fetched only when a card opens.
//
// Why a second endpoint and not three more fields on GraphNode: invariant 9
// pins a node to exactly eight keys and app/test/graph.test.ts greps the whole
// graph payload for "answer", "explain", "checks", "html" and "frontmatter".
// Widening the node would put per-node prose behind that grep for every node on
// every graph load, to serve one card at a time. This endpoint keeps the graph
// payload exactly as narrow as it is and inherits the same leak rule for itself
// (docs/specs/graph.md, invariant 18).
//
// Read-only like the rest of the subsystem: no POST counterpart, and nothing
// the card shows - zoom, pan, fullscreen, which card is open - is ever
// persisted (invariant 15).

/**
 * Where `NodeCardResponse.summary` came from, so the card can say "no
 * description yet" honestly instead of rendering an empty line:
 *
 * - `hub-derived`  a lesson's one-line description, read out of its course
 *                  hub note's `<!-- meno:derived -->` block. The lesson body
 *                  itself is never read - that is the whole point of the
 *                  choice (invariant 18).
 * - `home-derived` a course's one-line description, read out of `home.md`'s
 *                  own derived block, which uses the same bullet grammar one
 *                  level up (`- [[<hub>|Title]] - module 2 of 7, ...`).
 * - `note-intro`   the note's first ordinary paragraph, for the `home` and
 *                  `note` kinds only.
 * - `none`         no description exists. Always the case for a ghost lesson
 *                  (a planned lesson gets no derived bullet until it is
 *                  written) and for a hub whose home note has no bullet yet.
 */
export type NodeCardSummarySource = 'hub-derived' | 'home-derived' | 'note-intro' | 'none';

/** One `course.yml` `objectives[]` entry, identity and text only. */
export interface NodeCardObjective {
  /** The manifest's own id, e.g. "O1" - the card shows it, the client never parses it. */
  id: string;
  text: string;
}

/**
 * Lessons-done-over-total, counted over manifests rather than over files on
 * disk, so a planned lesson counts toward the denominator exactly the way a
 * ghost node counts in the graph. Scope is the one course for a `hub` node and
 * the whole tenant for the `home` node; `courses` says which, so the card can
 * label the numbers without a second field per scope.
 *
 * `lessons_mastered <= lessons_generated <= lessons_total` always: all three
 * count the same manifest entries.
 */
export interface NodeCardProgress {
  /** Every `lessons[]` entry in every `module.yml` in scope, written or not. */
  lessons_total: number;
  /** Of those, how many have a file on disk. */
  lessons_generated: number;
  /** Of those, how many `deriveMastery()` puts at level `mastered` in their course. */
  lessons_mastered: number;
  /** Courses counted: 1 for a `hub`, the tenant's course count for `home`. */
  courses: number;
}

/**
 * The card's single bottom button - the ONLY way out of the graph canvas now
 * that clicking a node opens a card instead of navigating (invariant 21).
 *
 * `href` is built server-side by the same `app/shared/routeHrefs.ts` builders
 * `GraphNode.route` is built with (lib/graph.ts), for the same reason: the
 * nodes are heterogeneous and only the server knows which route shape each one
 * needs. It is NOT an echo of `GraphNode.route`. Per kind:
 *
 * - `hub`    `courseHref(tenant, course)`, deliberately NOT the node's own
 *            `route`, which is the raw `noteHref` of the hub markdown.
 *            CoursePage renders gate state, concept mastery, the objectives
 *            AND the hub note itself (its `<details className="hub-note">`),
 *            so it strictly dominates the note view for the same node.
 * - `lesson` `lessonHref(...)`, the same value `route` already carries.
 * - `home`   `noteHref(tenant, 'home.md')`, the same value `route` carries.
 *            The tenant dashboard (`tenantHref`) was the alternative and was
 *            not taken: the header already links there, and home.md's
 *            hand-authored "Notes to self" renders nowhere else.
 * - `note`   `noteHref(tenant, id)`, the same value `route` carries.
 *
 * A ghost lesson has `enabled: false`, `href: null`, and a `disabled_reason`
 * ready to render: the button is drawn so the card keeps its shape, and says
 * why it does nothing.
 */
export interface NodeCardAction {
  /** Null if and only if `enabled` is false. */
  href: string | null;
  /** Names the destination, never the node: "Open course", "Open lesson", "Open note". */
  label: string;
  enabled: boolean;
  /** One sentence, present only when `enabled` is false; null otherwise. */
  disabled_reason: string | null;
}

/**
 * GET /api/v1/:tenant/graph/node?id=<node id>, read-only, walked fresh per
 * request like every other GET.
 *
 * `id` is a `GraphNode.id` - a vault-relative posix path with the `.md`
 * suffix - passed as a query parameter rather than a path segment because it
 * contains `/`, matching `GET /api/v1/:tenant/note?path=`. Spelled `id` and
 * not `path` on purpose: a ghost lesson has an id and no file, and this
 * endpoint answers for it.
 *
 * Resolution is against the graph's own node set, never against the
 * filesystem: an id the current graph does not contain is a 404 and never
 * reaches `safePath` (docs/specs/graph.md, invariant 19).
 */
export interface NodeCardResponse {
  tenant: string;
  /** Echoed back verbatim, so a late response for a card the learner already swapped is discarded. */
  id: string;
  title: string;
  kind: GraphNodeKind;
  state: GraphNodeState;
  /** Course slug, null for the same nodes `GraphNode.course` is null for. */
  course: string | null;
  /** One line ABOUT the node. Null when none exists - see NodeCardSummarySource. */
  summary: string | null;
  summary_source: NodeCardSummarySource;
  /** `course.yml` objectives, in manifest order, for a `hub` node. Empty for every other kind. */
  objectives: NodeCardObjective[];
  /** Set for `hub` and `home`; null for `lesson` and `note`, whose progress is `state`. */
  progress: NodeCardProgress | null;
  action: NodeCardAction;
  /** Degraded-path notes (an unparseable derived block). Never an error. */
  warnings: string[];
}

// --- glossary --------------------------------------------------------------
//
// Same rule InsightsReport and CostSnapshot follow: lib/terms.ts is the one
// place the merged shape is defined, and this file re-exports rather than
// duplicates. Unlike the graph, the glossary has a single owning lib module -
// mergeTerms produces the whole payload bar the tenant id - so there is no
// second producer to reconcile a locally-declared copy against.
export type { GlossaryBacklink, GlossaryEntry, GlossaryCourse };

/**
 * GET /api/v1/:tenant/glossary. Read-only, walked fresh per request like every
 * other GET, with no POST counterpart: terms.yml has exactly two authors, an
 * agent following generate-module and the learner's own text editor.
 *
 * `courses` is in tree-walk order and each course's `entries` is in curriculum
 * order (module sequence, then lesson sequence), never alphabetical.
 *
 * A backlink carries identity only - course, module and lesson file - and no
 * `route` field, unlike GraphResponse.node.route. The graph's nodes are
 * heterogeneous and only the server knows which route shape each one needs;
 * every backlink here is a lesson, so the client builds the href itself with
 * routeHrefs.ts's lessonHref, which is where every other link it renders comes
 * from.
 *
 * The glossary reads no ledger and carries no read, due, or mastery state:
 * terms are display vocabulary, deliberately inert (lib/terms.ts).
 */
export interface GlossaryResponse {
  tenant: string;
  courses: GlossaryCourse[];
  /** Degraded-path notes (malformed terms.yml, divergent duplicates). Never an error. */
  warnings: string[];
}

export interface HealthResponse {
  ok: boolean;
  version: number;
  root: string;
  node: string;
}
