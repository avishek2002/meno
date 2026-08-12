// The content-cost subsystem: attributing coding-agent token spend to the
// courses it generated. docs/specs/cost.md is the governing spec; this file
// owns the adapter contract (CostSource, CostTranscript) and the one pure
// derivation, computeCost. Pure by contract, mirroring lib/insights.ts and
// lib/mastery.ts: no clock, no filesystem, no environment. generated_at is
// always a parameter.
//
// The subsystem is called "cost" everywhere. lib/insights.ts already owns the
// word "usage" for the authored-check usage rate; no identifier here may be
// named "usage".

/** USD per 1,000,000 tokens, one model tier. */
export interface TokenPrices {
  input: number;
  cache_write_1h: number;
  cache_write_5m: number;
  cache_read: number;
  output: number;
}

/**
 * A course directory a transcript wrote into. `dir` (not `course`) is the identity: two
 * courses in different domains can share a basename, and only `dir` disambiguates them - a
 * source must capture the full written path, not just its last segment.
 */
export interface CostCourseRef {
  tenant: string; // tenant directory name under content/tenants/
  course: string; // course directory basename, which is what a written path's last segment reveals
  dir: string; // vault-relative course directory, "<domain>/<course>" - the disambiguating identity
}

/** One transcript's evidence. The unit of attribution. */
export interface CostTranscript {
  /** Stable, source-scoped identifier. Claude Code uses the path relative to projects/. */
  id: string;
  /**
   * The orchestrating transcript this one ran under, derived structurally by the source.
   * Non-null does not mean present: computeCost only honours a parent_id that names another
   * transcript in the same list.
   */
  parent_id: string | null;
  /** Deduplicated cost of every model request in this transcript, unrounded USD. */
  cost_usd: number;
  /** Deduplicated request count: the cardinality of the dedupe key. */
  requests: number;
  /** Course directories written into, deduplicated by (tenant, dir), sorted by tenant then dir. */
  wrote: CostCourseRef[];
}

/** The result of one collect() call: the evidence found, plus what could not be read. */
export interface CostCollectResult {
  transcripts: CostTranscript[];
  /**
   * Directories or individual transcripts the source could not read (a permissions error, a
   * broken symlink, a malformed file) and skipped rather than counted. Not the same as "no
   * evidence": a skip means real evidence may exist and was missed, which is why computeCost
   * surfaces a nonzero count in `limits` rather than silently dropping it - it is what makes
   * "every figure is a floor" concrete instead of merely asserted.
   */
  skipped: number;
}

export interface CostSource {
  /** Machine name recorded in the snapshot, kebab-case. */
  readonly name: string;
  /** Human label for the page, for example "Claude Code transcripts". */
  readonly label: string;
  /** Date the price table was last checked against published rates, YYYY-MM-DD. */
  readonly prices_as_of: string;
  /** True when this machine holds records this source can read. Must never throw. */
  available(): boolean;
  /**
   * Every transcript this source can read on this machine, across every tenant and project -
   * not only the ones with course-write evidence. computeCost, not collect(), is what narrows
   * this list down to one tenant's attributed evidence. Must never throw; an empty result with
   * skipped: 0 when unavailable.
   */
  collect(): CostCollectResult;
}

export interface CourseCost {
  /** Course directory basename. Keyed by directory, not course.yml slug: a written file path
   *  reveals the directory, and for a hand-made course the two can differ. */
  course: string;
  /** Vault-relative directory, "<domain>/<course>" or "<course>", from findCourseDirs. */
  dir: string;
  /**
   * USD, rounded to cents. Floored to $0.01 when the unrounded cost is greater than zero but
   * rounds below a cent, so a course with real evidence never renders as $0.00 - that display
   * is reserved for a genuinely evidence-free course, which belongs in no_data instead. This
   * floor can overstate true spend in the (unrealistic at real-world magnitudes) case of many
   * sub-cent rows; see docs/specs/cost.md's limitations.
   */
  cost_usd: number;
  /** How many transcripts were credited to this course. */
  transcripts: number;
  /** Deduplicated model requests across those transcripts. */
  requests: number;
  /** "generation-only" when the crediting transcript ran under an orchestrating parent, so the
   *  interview and planning that happened in that parent are not in this number. */
  scope: 'full' | 'generation-only';
}

/** A course directory on disk with no credited evidence. `dir` is the unique identity - two
 *  directories with the same basename in different domains are two separate entries here. */
export interface CostNoDataEntry {
  /** Course directory basename, for display. */
  course: string;
  /** Vault-relative directory - the field validate and every consumer must compare on. */
  dir: string;
}

export interface SharedOrchestration {
  /** USD, rounded to cents. Never divided between the courses below. */
  cost_usd: number;
  transcripts: number;
  requests: number;
  /** Course directory basenames this orchestration covered, sorted. */
  courses: string[];
  /** Transcript ids on this line, so a figure can be traced back. */
  transcript_ids: string[];
}

export interface CostTotals {
  /** Sum of the rounded courses[].cost_usd, so the page always adds up. */
  attributed_usd: number;
  /** shared_orchestration.cost_usd, repeated here for convenience. Never added to the above. */
  shared_orchestration_usd: number;
  courses_with_data: number;
  courses_without_data: number;
  /**
   * Deduplicated transcripts that carry evidence for THIS tenant - the union of every credited
   * transcript and every transcript on the shared line. Not every transcript collect() returned:
   * a cost source's records typically span every project on the machine, and echoing that whole
   * count here under a "cost for <tenant>" heading would overstate this tenant's activity by
   * orders of magnitude.
   */
  transcripts_scanned: number;
  /** Deduplicated requests across the same tenant-scoped transcript set as transcripts_scanned. */
  requests: number;
}

export interface CostSnapshot {
  schema_version: 1;
  type: 'cost';
  tenant: string;
  /** ISO 8601 with a local offset, same convention as ledger ts. A parameter, never the clock. */
  generated_at: string;
  /** YYYY-MM-DD, from the source that produced this snapshot. Empty string when source is null. */
  prices_as_of: string;
  /** Machine name of the source, or null when no source was available on this machine. */
  source: string | null;
  /** Human label of the source, or null. */
  source_label: string | null;
  totals: CostTotals;
  /** Descending by cost_usd, then ascending by course, then ascending by dir. */
  courses: CourseCost[];
  /** Course directories on disk with zero credited evidence, sorted by dir. Never $0 rows. */
  no_data: CostNoDataEntry[];
  shared_orchestration: SharedOrchestration;
  /** The disclosures the page renders verbatim. See docs/specs/cost.md, "Disclosures". */
  limits: string[];
}

export interface CostMeta {
  tenant: string;
  source: string | null;
  source_label: string | null;
  prices_as_of: string;
  generated_at: string;
  /** Transcripts the source could not read (see CostCollectResult.skipped). Surfaced in limits
   *  when nonzero. Zero when there is no source, or the source reported none. */
  skipped: number;
}

/**
 * The written-path shape every adapter matches against a Write/Edit/NotebookEdit tool_use's
 * file_path, trailing slash appended: content/tenants/<tenant>/<group>/<course>/. `group` is a
 * course's domain, or one of NON_GROUP's reserved directory names, which is not a course.
 * Exported so a second cost source shares this logic rather than hand-copying it.
 */
export const COURSE_PATH = /content\/tenants\/([^/]+)\/([a-z0-9][a-z0-9-]*)\/([a-z0-9][a-z0-9-]*)\//;
/** Reserved directories directly under a tenant that COURSE_PATH's second group must reject. */
export const NON_GROUP = new Set(['progress', 'sources', 'notes', '.obsidian', '.git']);

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A course row always shows real money: floor a nonzero-but-sub-cent cost up to $0.01 rather
 *  than rounding it down to a display of $0.00, which schemas/cost.schema.json's
 *  exclusiveMinimum on courses[].cost_usd also requires. */
const roundCourseCost = (raw: number): number => {
  const rounded = round2(raw);
  return rounded > 0 ? rounded : 0.01;
};

const LIMIT_NOT_A_BILL =
  'These are API-list-equivalent dollars over subscription usage, not a bill: nothing here was ' +
  'charged to you. Use them as relative weight between courses, never as an amount.';
const LIMIT_FLOOR =
  'Every figure is a floor. Only records still on this machine are counted, and any spend the ' +
  'cost source cannot see is missing from these numbers.';

interface CourseAgg {
  course: string;
  dir: string;
  cost: number;
  transcripts: number;
  requests: number;
  scope: 'full' | 'generation-only';
}

/**
 * Resolve, bottom-up over the credit-candidate forest, which candidates must be demoted (never
 * credited, wholly shared - see computeCost's doc comment). `childrenOf` maps a candidate id to
 * the ids of other candidates whose parent_id names it. A candidate is demoted exactly when it
 * has at least one child that stays credited - because that child staying credited is what makes
 * this candidate an orchestrating parent (case 7 below), and a candidate that is both credited
 * AND an orchestrating parent double-counts its own money. A leaf (no children) is never demoted
 * by this rule. Memoized so a chain of any depth resolves in one pass per node, not a fixpoint
 * loop with hidden convergence order.
 *
 * The `visiting` guard is a defensive cycle break only, not a correctness feature: a correct
 * source's `parentIdOf` always yields a strictly shorter id (docs/specs/cost.md's "constraint a
 * cost source must respect"), so a real `parent_id` chain can never cycle back on itself, and this
 * branch is unreachable from any transcript the shipped Claude Code adapter can produce. IF a
 * future source ever emitted a cycle, `visiting.has(id)` returning an unmemoized `false` here
 * means whichever node in the cycle is VISITED FIRST resolves as credited - an artifact of
 * traversal order, not of the input data, which would technically break invariant 1's
 * byte-identical-JSON claim for that pathological input (money still conserves; only which course
 * gets the credit becomes order-dependent). This is a documented constraint on future sources, not
 * a bug to fix here.
 */
function resolveDemoted(
  id: string,
  childrenOf: Map<string, string[]>,
  memo: Map<string, boolean>,
  visiting: Set<string>,
): boolean {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;
  if (visiting.has(id)) return false; // malformed cycle guard
  visiting.add(id);
  const children = childrenOf.get(id) ?? [];
  const demoted = children.some((childId) => !resolveDemoted(childId, childrenOf, memo, visiting));
  visiting.delete(id);
  memo.set(id, demoted);
  return demoted;
}

/**
 * The one pure derivation. No clock, no filesystem, no environment. A faithful port of the
 * validated reference implementation (docs/specs/cost.md, "The aggregation algorithm"), with
 * three corrections over that oracle: the shared line dedupes by transcript id (a transcript
 * that qualifies as both a multi-course writer and an orchestrating parent contributes its cost
 * exactly once); the cross-tenant rule (a transcript that wrote one course in this tenant and
 * one in another tenant is shared, never credited); and a transcript that is both a course
 * writer AND the structural parent of another still-credited transcript is never credited
 * itself - crediting it would double-count money the shared line already carries, so the shared
 * line always wins and the course it would have credited reports as no-data instead. That
 * demotion is resolved bottom-up over the whole parent chain (resolveDemoted above), not just one
 * level, so a multi-generation chain of orchestrating parents demotes exactly the parents that
 * are actually double-counted, not every ancestor indiscriminately.
 */
export function computeCost(transcripts: CostTranscript[], courseDirs: string[], meta: CostMeta): CostSnapshot {
  // last one wins on a duplicate id, which a correct source never emits
  const byId = new Map<string, CostTranscript>();
  for (const t of transcripts) byId.set(t.id, t);

  // pass 1: classify every transcript as a credit candidate (wrote exactly one course in this
  // tenant and nowhere else) or a multi-course sharer (case 4). A transcript touching no course
  // in this tenant is neither and is simply not part of this snapshot.
  const creditCandidates = new Map<string, CostCourseRef>();
  const sharedMultiTranscripts: CostTranscript[] = [];
  for (const t of byId.values()) {
    const hits = t.wrote.filter((w) => w.tenant === meta.tenant);
    const total = t.wrote.length;
    if (total === 1 && hits.length === 1) {
      creditCandidates.set(t.id, hits[0]);
    } else if (hits.length >= 1) {
      sharedMultiTranscripts.push(t);
    }
  }

  // the credit-candidate forest: which candidates are the direct parent of another candidate.
  // Only candidate-to-candidate edges matter here - a parent that is not itself a course-writing
  // candidate was never going to be double-credited, so it is not part of this computation.
  const childrenOf = new Map<string, string[]>();
  for (const [id] of creditCandidates) {
    const t = byId.get(id)!;
    if (t.parent_id !== null && creditCandidates.has(t.parent_id)) {
      const list = childrenOf.get(t.parent_id) ?? [];
      list.push(id);
      childrenOf.set(t.parent_id, list);
    }
  }
  const demotedMemo = new Map<string, boolean>();
  const visiting = new Set<string>();
  for (const id of creditCandidates.keys()) resolveDemoted(id, childrenOf, demotedMemo, visiting);

  const finalCredited = new Map<string, CostCourseRef>();
  for (const [id, ref] of creditCandidates) {
    if (!demotedMemo.get(id)) finalCredited.set(id, ref);
  }

  const sharedIds = new Set<string>();
  const sharedCourses = new Set<string>();
  let sharedCost = 0;
  let sharedRequests = 0;
  const addToShared = (t: CostTranscript): void => {
    if (sharedIds.has(t.id)) return; // dedupe by transcript id
    sharedIds.add(t.id);
    sharedCost += t.cost_usd;
    sharedRequests += t.requests;
  };

  for (const t of sharedMultiTranscripts) {
    addToShared(t);
    for (const h of t.wrote.filter((w) => w.tenant === meta.tenant)) sharedCourses.add(h.course);
  }
  for (const [id, ref] of creditCandidates) {
    if (demotedMemo.get(id)) {
      addToShared(byId.get(id)!);
      // the demoted candidate's own course, not just the child that triggered its demotion -
      // its cost is on this line, so a reader following the demotion disclosure to this course
      // list must find it here (a probe found alpha's $100 on the line with courses: ['beta'])
      sharedCourses.add(ref.course);
    }
  }

  // credited courses are keyed by dir, not by basename: two directories in different domains
  // can share a basename, and only the full path disambiguates which one a transcript wrote into
  const courseAgg = new Map<string, CourseAgg>();
  for (const [id, ref] of finalCredited) {
    const t = byId.get(id)!;
    const agg = courseAgg.get(ref.dir) ?? { course: ref.course, dir: ref.dir, cost: 0, transcripts: 0, requests: 0, scope: 'full' };
    agg.cost += t.cost_usd;
    agg.transcripts += 1;
    agg.requests += t.requests;
    courseAgg.set(ref.dir, agg);
  }

  // case 5: an orchestrating parent of a still-credited child joins the shared line, and that
  // child's course becomes generation-only. finalCredited already excludes every demoted
  // candidate, so a parent only reaches this loop via a child that truly stayed credited.
  for (const [id, ref] of finalCredited) {
    const t = byId.get(id)!;
    if (t.parent_id !== null && byId.has(t.parent_id)) {
      addToShared(byId.get(t.parent_id)!);
      sharedCourses.add(ref.course);
      const agg = courseAgg.get(ref.dir);
      if (agg) agg.scope = 'generation-only';
    }
  }

  const courses: CourseCost[] = [...courseAgg.values()].map((agg) => ({
    course: agg.course,
    dir: agg.dir,
    cost_usd: roundCourseCost(agg.cost),
    transcripts: agg.transcripts,
    requests: agg.requests,
    scope: agg.scope,
  }));
  courses.sort(
    (a, b) => b.cost_usd - a.cost_usd || a.course.localeCompare(b.course) || a.dir.localeCompare(b.dir),
  );

  // no_data is derived from the same identity (dir) as credited courses, so a course directory
  // that shares a basename with a credited one but has no evidence of its own is never lost, and
  // never wrongly rejected by a comparison keyed on the ambiguous basename instead
  const creditedDirs = new Set(courses.map((c) => c.dir));
  const noData: CostNoDataEntry[] = courseDirs
    .filter((d) => !creditedDirs.has(d))
    .map((d) => ({ course: d.split('/').at(-1)!, dir: d }))
    .sort((a, b) => a.dir.localeCompare(b.dir));

  const attributedUsd = round2(courses.reduce((acc, c) => acc + c.cost_usd, 0));

  // tenant-scoped totals: the union of every credited transcript and every transcript on the
  // shared line, deduplicated by id - never the full collect() result, which spans every
  // project on the machine (finding 4)
  const contributingIds = new Set<string>([...finalCredited.keys(), ...sharedIds]);
  let transcriptsScanned = 0;
  let requestsTotal = 0;
  for (const id of contributingIds) {
    transcriptsScanned++;
    requestsTotal += byId.get(id)!.requests;
  }

  // how many courses lost their only evidence to demotion specifically (as opposed to genuinely
  // having none) - counted by distinct dir, since more than one demoted candidate could in
  // principle name the same dir, and a dir that still ended up credited by some OTHER transcript
  // is not a loss at all
  const demotedDirs = new Set<string>();
  for (const [id, ref] of creditCandidates) {
    if (demotedMemo.get(id)) demotedDirs.add(ref.dir);
  }
  let demotedIntoNoData = 0;
  for (const dir of demotedDirs) {
    if (!creditedDirs.has(dir)) demotedIntoNoData++;
  }

  const generationOnlyCount = courses.filter((c) => c.scope === 'generation-only').length;
  const limits: string[] = [LIMIT_NOT_A_BILL, LIMIT_FLOOR];
  if (generationOnlyCount > 0) {
    limits.push(
      `${generationOnlyCount} of ${courses.length} course rows are generation-only: they cover the transcript ` +
        'that wrote the course and exclude the interview and planning that ran in the orchestrating session above it.',
    );
  }
  if (demotedIntoNoData > 0) {
    limits.push(
      `${demotedIntoNoData} course director${demotedIntoNoData === 1 ? 'y' : 'ies'} in no_data had its only evidence ` +
        'moved to the shared orchestration line rather than being genuinely absent: the transcript that would have ' +
        'credited it turned out to also be an orchestrating parent, and the shared line always wins.',
    );
  }
  if (meta.skipped > 0) {
    // "location", not "transcript": an unreadable directory counts as one skip event no matter
    // how many transcripts it held (its contents can never be listed to count them), so a count
    // of transcripts here would understate an unreadable subtree by an unknown factor
    limits.push(
      `${meta.skipped} location${meta.skipped === 1 ? '' : 's'} on this machine (a directory that could not be ` +
        'listed, or a transcript file that could not be read or parsed) were skipped, and any evidence they held ' +
        'is excluded from every figure above.',
    );
  }

  return {
    schema_version: 1,
    type: 'cost',
    tenant: meta.tenant,
    generated_at: meta.generated_at,
    prices_as_of: meta.prices_as_of,
    source: meta.source,
    source_label: meta.source_label,
    totals: {
      attributed_usd: attributedUsd,
      shared_orchestration_usd: round2(sharedCost),
      courses_with_data: courses.length,
      courses_without_data: noData.length,
      transcripts_scanned: transcriptsScanned,
      requests: requestsTotal,
    },
    courses,
    no_data: noData,
    shared_orchestration: {
      cost_usd: round2(sharedCost),
      transcripts: sharedIds.size,
      requests: sharedRequests,
      courses: [...sharedCourses].sort((a, b) => a.localeCompare(b)),
      transcript_ids: [...sharedIds].sort((a, b) => a.localeCompare(b)),
    },
    limits,
  };
}
