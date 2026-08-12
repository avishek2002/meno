// API payload types shared by the server and the client. The server constructs
// these; the client consumes them. Content formats stay owned by the skill
// references - these are transport shapes only.
import type { InsightsReport, Rate } from '../../lib/insights.ts';
import type { CostSnapshot, CourseCost, CostNoDataEntry, SharedOrchestration, CostTotals } from '../../lib/cost.ts';

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
}

export interface NoteResponse {
  path: string;
  html: string;
  links: { resolved: Record<string, string>; broken: string[] };
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

export interface HealthResponse {
  ok: boolean;
  version: number;
  root: string;
  node: string;
}
