// The single insights implementation: honest, deterministic usage metrics over
// the ledger, the vault graph, todos, and manifests. Pure by contract: asOf is
// always a parameter, never Date.now(), so the whole report is snapshot-testable.
// The governing rule (docs/specs/insights.md): counts and dates are honest,
// rates ship with their denominator attached, and anything needing a
// distribution returns null below min_n rather than fabricating a trend.
// The study-insights skill QUOTES this output; it never computes a number.
import { deriveMastery, type LedgerEvent, type Mastery } from './mastery.ts';
import type { VaultGraph } from './vault.ts';
// type-only, so it is erased before Node ever sees it (same reasoning as
// insights-io.ts's parseTodos import) - app/shared/types.ts is the one place
// the two todo axes are defined, and TodoCounts' keys must match them exactly
import type { TodoAudience, TodoKind } from '../app/shared/types.ts';

export interface Rate {
  value: number | null;
  n: number;
  of: number;
  reason?: 'insufficient_data';
}

const rate = (n: number, of: number): Rate =>
  of === 0 ? { value: null, n, of, reason: 'insufficient_data' } : { value: Math.round((n / of) * 100) / 100, n, of };

export interface TodoCounts {
  byKind: Record<TodoKind, number>; // open count per kind, every key present (0 when none)
  byAudience: Record<TodoAudience, number>; // open count per audience, every key present
  done: number; // all done lines
  open: number; // all open lines, including untyped ones - not guaranteed to equal
  // the sum of either record above
}

export interface ManifestInfo {
  course: string;
  moduleSlug: string;
  lessons: { file: string; status: string }[];
  checkIds: string[]; // fully qualified <lesson id>#<check id>
  concepts: string[];
}

export interface InsightsReport {
  as_of: string;
  basis: { ledger_lines: number };
  sessions: {
    n: number;
    first: string | null;
    last: string | null;
    days_since_last: number | null;
    median_gap_days: number | null; // null below min_n 4
    active_days: number;
  };
  reviews: {
    overdue: { course: string; concept: string; next_review: string; days_overdue: number }[];
    due_coverage: Rate;
  };
  gates: {
    outcomes: { pass: number; fail: number; 'insufficient-evidence': number };
    override_rate: Rate;
    unrepaid_overrides: { course: string; concept: string; gate_ts: string; reinject_after: string }[];
  };
  evidence: {
    transfer_coverage: Rate;
    recognition_only_concepts: string[];
    mastered_on_old_evidence: { course: string; concept: string; days_since_transfer: number }[];
    weak_concepts: { course: string; concept: string; first_score: number; latest_score: number; n_transfer: number }[];
  };
  usage: {
    check_usage: Rate;
    lessons_never_opened: string[];
    planned_debt: { course: string; module: string; planned: number }[];
    surface_mix: { ui_recognition: number; agent_recognition: number; agent_transfer: number; reads: number };
    todos: TodoCounts;
  };
  vault: {
    orphaned_notes: string[];
    broken_links: { from: string; targets: string[] }[];
    ambiguous_basenames: string[];
    referenced_but_untaught: string[];
  };
  limits: string[]; // what this report could not measure, and why
}

const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);

export function computeInsights(
  events: LedgerEvent[],
  vault: VaultGraph,
  todos: TodoCounts,
  manifests: ManifestInfo[],
  asOf: string,
): InsightsReport {
  const mastery: Mastery = deriveMastery(events);
  const limits: string[] = [
    'todo ages are not measurable: the todo format carries no creation date',
    'time studied is not measured: dwell seconds cannot distinguish reading from an open tab',
    'no cross-learner comparison exists or can exist: this machine holds one learner',
  ];

  // sessions: distinct session ids from agent events, plus active days overall
  const sessionIds = new Map<string, string>(); // id -> first ts
  const activeDays = new Set<string>();
  for (const e of events) {
    activeDays.add(e.ts.slice(0, 10));
    const sid = (e as { session?: string | null }).session;
    if (typeof sid === 'string' && sid) {
      if (!sessionIds.has(sid)) sessionIds.set(sid, e.ts);
    }
  }
  const sessionStarts = [...sessionIds.values()].map((ts) => ts.slice(0, 10)).sort();
  const gaps: number[] = [];
  for (let i = 1; i < sessionStarts.length; i++) gaps.push(daysBetween(sessionStarts[i - 1], sessionStarts[i]));
  const medianGap =
    sessionStarts.length >= 4
      ? gaps.sort((a, b) => a - b)[Math.floor((gaps.length - 1) / 2)]
      : null;

  // reviews
  const overdue: InsightsReport['reviews']['overdue'] = [];
  for (const [course, c] of Object.entries(mastery.courses)) {
    for (const [concept, st] of Object.entries(c.concepts)) {
      if (st.next_review && st.next_review <= asOf) {
        overdue.push({ course, concept, next_review: st.next_review, days_overdue: daysBetween(st.next_review, asOf) });
      }
    }
  }
  let dueCovered = 0;
  let dueTotal = 0;
  for (const e of events) {
    if (e.event === 'reviewed') {
      dueCovered += (e.due_covered as number) ?? 0;
      dueTotal += ((e.due_covered as number) ?? 0) + ((e.due_skipped as number) ?? 0);
    }
  }

  // gates
  const outcomes = { pass: 0, fail: 0, 'insufficient-evidence': 0 };
  let nonPassGates = 0;
  let overrides = 0;
  const overriddenEvents = events.filter((e) => e.event === 'overridden');
  for (const e of events) {
    if (e.event === 'gated') {
      const r = e.result as keyof typeof outcomes;
      if (r in outcomes) outcomes[r]++;
      if (r !== 'pass') nonPassGates++;
    }
    if (e.event === 'overridden') overrides++;
  }
  // an override is repaid when the weak concept later gets agent transfer evidence
  const unrepaid: InsightsReport['gates']['unrepaid_overrides'] = [];
  for (const ov of overriddenEvents) {
    const ovIdx = events.indexOf(ov);
    for (const concept of (ov.weak_concepts as string[]) ?? []) {
      const repaid = events.some(
        (e, i) =>
          i > ovIdx &&
          e.event === 'scored' &&
          e.source === 'agent' &&
          e.level === 'transfer' &&
          ((e.concepts as string[]) ?? []).includes(concept),
      );
      if (!repaid) {
        unrepaid.push({
          course: ov.course,
          concept,
          gate_ts: ov.gate_ts as string,
          reinject_after: ov.reinject_after as string,
        });
      }
    }
  }

  // evidence
  const allConcepts: { course: string; concept: string; st: Mastery['courses'][string]['concepts'][string] }[] = [];
  for (const [course, c] of Object.entries(mastery.courses)) {
    for (const [concept, st] of Object.entries(c.concepts)) allConcepts.push({ course, concept, st });
  }
  const withTransfer = allConcepts.filter((c) => c.st.n_transfer > 0);
  const recognitionOnly = allConcepts
    .filter((c) => c.st.n_transfer === 0 && c.st.recognition_rate !== null)
    .map((c) => `${c.course}/${c.concept}`);
  const lastTransferByConcept = new Map<string, string>();
  const firstTransferScore = new Map<string, number>();
  for (const e of events) {
    if (e.event === 'scored' && e.source === 'agent' && e.level === 'transfer') {
      for (const concept of (e.concepts as string[]) ?? []) {
        const key = `${e.course}/${concept}`;
        lastTransferByConcept.set(key, e.ts);
        if (!firstTransferScore.has(key)) firstTransferScore.set(key, e.score as number);
      }
    }
  }
  const masteredOld: InsightsReport['evidence']['mastered_on_old_evidence'] = [];
  for (const c of allConcepts) {
    if (c.st.level === 'mastered') {
      const last = lastTransferByConcept.get(`${c.course}/${c.concept}`);
      if (last) {
        const age = daysBetween(last, asOf);
        if (age > 30) masteredOld.push({ course: c.course, concept: c.concept, days_since_transfer: age });
      }
    }
  }
  const weak: InsightsReport['evidence']['weak_concepts'] = allConcepts
    .filter((c) => c.st.level === 'shaky')
    .map((c) => ({
      course: c.course,
      concept: c.concept,
      first_score: firstTransferScore.get(`${c.course}/${c.concept}`) ?? 0,
      latest_score: c.st.transfer_score ?? 0,
      n_transfer: c.st.n_transfer,
    }));

  // usage
  const authoredChecks = new Set(manifests.flatMap((m) => m.checkIds));
  const attempted = new Set<string>();
  const surface = { ui_recognition: 0, agent_recognition: 0, agent_transfer: 0, reads: 0 };
  const openedLessons = new Set<string>();
  for (const e of events) {
    if (e.event === 'read') {
      surface.reads++;
      openedLessons.add(`${e.course}/${e.module}/${e.lesson}`);
    }
    if (e.event === 'scored') {
      if (e.level === 'recognition') {
        attempted.add(e.item as string);
        if (e.source === 'ui') surface.ui_recognition++;
        else surface.agent_recognition++;
        openedLessons.add(`${e.course}/${e.module}/${e.lesson}`);
      } else if (e.source === 'agent') {
        surface.agent_transfer++;
      }
    }
  }
  const attemptedAuthored = [...attempted].filter((id) => authoredChecks.has(id));
  const neverOpened: string[] = [];
  const plannedDebt: InsightsReport['usage']['planned_debt'] = [];
  for (const m of manifests) {
    const planned = m.lessons.filter((l) => l.status === 'planned').length;
    if (planned > 0) plannedDebt.push({ course: m.course, module: m.moduleSlug, planned });
    for (const l of m.lessons) {
      if (l.status !== 'planned') {
        const key = `${m.course}/${m.moduleSlug}/${l.file.replace(/\.md$/, '')}`;
        if (!openedLessons.has(key)) neverOpened.push(key);
      }
    }
  }

  // vault: taught concepts vs referenced names
  const taught = new Set(manifests.flatMap((m) => m.concepts));
  const noteBasenames = new Set([...vault.index.keys()]);
  const referencedUntaught = new Set<string>();
  for (const targets of vault.broken.values()) {
    for (const t of targets) {
      if (!taught.has(t) && !noteBasenames.has(t)) referencedUntaught.add(t);
    }
  }

  return {
    as_of: asOf,
    basis: { ledger_lines: events.length },
    sessions: {
      n: sessionStarts.length,
      first: sessionStarts[0] ?? null,
      last: sessionStarts.at(-1) ?? null,
      days_since_last: sessionStarts.length ? daysBetween(sessionStarts.at(-1)!, asOf) : null,
      median_gap_days: medianGap,
      active_days: activeDays.size,
    },
    reviews: { overdue, due_coverage: rate(dueCovered, dueTotal) },
    gates: { outcomes, override_rate: rate(overrides, nonPassGates), unrepaid_overrides: unrepaid },
    evidence: {
      transfer_coverage: rate(withTransfer.length, allConcepts.length),
      recognition_only_concepts: recognitionOnly,
      mastered_on_old_evidence: masteredOld,
      weak_concepts: weak,
    },
    usage: {
      check_usage: rate(attemptedAuthored.length, authoredChecks.size),
      lessons_never_opened: neverOpened,
      planned_debt: plannedDebt,
      surface_mix: surface,
      todos,
    },
    vault: {
      orphaned_notes: vault.orphans,
      broken_links: [...vault.broken.entries()].map(([from, targets]) => ({ from, targets })),
      ambiguous_basenames: vault.ambiguous,
      referenced_but_untaught: [...referencedUntaught].sort(),
    },
    limits,
  };
}
