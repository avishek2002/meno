// The single mastery-derivation implementation. The app, validate, and eval all
// import this; nothing else may compute mastery. Pure by contract: a function of
// the ledger lines in file order and nothing else - no clock, no filesystem, no
// lesson frontmatter - so `serialize(derive(lines))` is byte-identical across
// runs and machines (docs/specs/progress.md owns the rules).
import { stringify } from 'yaml';

export interface LedgerEvent {
  v: number;
  ts: string;
  event: string;
  source: 'agent' | 'ui';
  course: string;
  [key: string]: unknown;
}

interface ConceptState {
  module: string | null;
  generated: boolean;
  recognition: Map<string, boolean>;
  transfer: Map<string, number>;
  lastTransferTs: string | null;
  lastWeakTs: string | null;
  weak_until: string | null;
  next_review: string | null;
  stale: boolean;
}

interface ModuleState {
  gate: 'none' | 'pass' | 'fail' | 'insufficient-evidence';
  gateTs: string | null;
  overridden: boolean;
}

export interface Mastery {
  schema_version: number;
  courses: Record<string, {
    concepts: Record<string, {
      level: 'introduced' | 'practiced' | 'mastered' | 'shaky';
      module: string | null;
      n_transfer: number;
      transfer_score: number | null;
      recognition_rate: number | null;
      next_review: string | null;
      stale: boolean;
      weak_until: string | null;
    }>;
    modules: Record<string, {
      gate: 'none' | 'pass' | 'fail' | 'insufficient-evidence';
      score: number | null;
      locked: boolean;
      overridden: boolean;
    }>;
  }>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function parseLedger(text: string): { events: LedgerEvent[]; warnings: string[] } {
  const events: LedgerEvent[] = [];
  const warnings: string[] = [];
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    try {
      events.push(JSON.parse(line) as LedgerEvent);
    } catch {
      warnings.push(`line ${i + 1}: not valid JSON, skipped`);
    }
  }
  return { events, warnings };
}

export function deriveMastery(events: LedgerEvent[]): Mastery {
  const concepts = new Map<string, Map<string, ConceptState>>(); // course -> concept -> state
  const modules = new Map<string, Map<string, ModuleState>>(); // course -> module -> state

  const conceptState = (course: string, concept: string): ConceptState => {
    let byCourse = concepts.get(course);
    if (!byCourse) concepts.set(course, (byCourse = new Map()));
    let st = byCourse.get(concept);
    if (!st) {
      byCourse.set(concept, (st = {
        module: null,
        generated: false,
        recognition: new Map(),
        transfer: new Map(),
        lastTransferTs: null,
        lastWeakTs: null,
        weak_until: null,
        next_review: null,
        stale: false,
      }));
    }
    return st;
  };
  const moduleState = (course: string, module: string): ModuleState => {
    let byCourse = modules.get(course);
    if (!byCourse) modules.set(course, (byCourse = new Map()));
    let st = byCourse.get(module);
    if (!st) byCourse.set(module, (st = { gate: 'none', gateTs: null, overridden: false }));
    return st;
  };

  // fold in the given (file) order - never re-sort; ts is a join key, not an ordering key
  for (const e of events) {
    const eventConcepts = (e.concepts as string[] | undefined) ?? [];
    switch (e.event) {
      case 'generated': {
        for (const c of eventConcepts) {
          const st = conceptState(e.course, c);
          st.generated = true;
          st.module = (e.module as string) ?? st.module;
          st.next_review = (e.review_after as string) ?? st.next_review;
        }
        if (e.module) moduleState(e.course, e.module as string);
        break;
      }
      case 'scored': {
        for (const c of eventConcepts) {
          const st = conceptState(e.course, c);
          // a concept belongs to the module that TAUGHT it (its generated event);
          // scored events carry the quizzing lesson's module, which differs under
          // interleaving and must never reattribute the concept
          if (st.module === null) st.module = (e.module as string) ?? null;
          const item = e.item as string;
          if (e.level === 'transfer' && e.source === 'agent') {
            // the single most important line: only agent-graded transfer moves gates
            st.transfer.set(item, e.score as number);
            st.lastTransferTs = e.ts;
          } else if (e.level === 'recognition') {
            st.recognition.set(item, e.correct as boolean);
          }
        }
        break;
      }
      case 'reviewed': {
        const nr = (e.next_review as Record<string, string>) ?? {};
        for (const [c, date] of Object.entries(nr)) {
          conceptState(e.course, c).next_review = date;
        }
        break;
      }
      case 'gated': {
        const st = moduleState(e.course, e.module as string);
        st.gate = e.result as ModuleState['gate'];
        st.gateTs = e.ts;
        st.overridden = false;
        break;
      }
      case 'overridden': {
        const st = moduleState(e.course, e.module as string);
        if (st.gateTs === (e.gate_ts as string)) st.overridden = true;
        for (const c of (e.weak_concepts as string[]) ?? []) {
          const st2 = conceptState(e.course, c);
          st2.weak_until = e.reinject_after as string;
          st2.lastWeakTs = e.ts;
          st2.next_review = e.reinject_after as string;
        }
        break;
      }
      case 'noted': {
        for (const c of eventConcepts) {
          const st = conceptState(e.course, c);
          if (e.kind === 'stale') st.stale = true;
          if (e.kind === 'refreshed') st.stale = false;
          if (e.review_after) st.next_review = e.review_after as string;
        }
        break;
      }
      // read and rescoped carry no mastery consequences
    }
  }

  const out: Mastery = { schema_version: 1, courses: {} };
  for (const [course, byCourse] of concepts) {
    const courseOut: Mastery['courses'][string] = { concepts: {}, modules: {} };
    for (const [concept, st] of byCourse) {
      const nTransfer = st.transfer.size;
      const transferScore = nTransfer > 0 ? round2([...st.transfer.values()].reduce((a, b) => a + b, 0) / nTransfer) : null;
      const nRec = st.recognition.size;
      const recognitionRate = nRec > 0 ? round2([...st.recognition.values()].filter(Boolean).length / nRec) : null;
      // weakness stays active until a transfer score lands after the override
      const weakActive = st.lastWeakTs !== null && (st.lastTransferTs === null || st.lastTransferTs <= st.lastWeakTs);
      let level: 'introduced' | 'practiced' | 'mastered' | 'shaky';
      if (nTransfer > 0) level = transferScore! >= 0.8 && !weakActive ? 'mastered' : 'shaky';
      else if (nRec > 0) level = 'practiced';
      else level = 'introduced';
      courseOut.concepts[concept] = {
        level,
        module: st.module,
        n_transfer: nTransfer,
        transfer_score: transferScore,
        recognition_rate: recognitionRate,
        next_review: st.next_review,
        stale: st.stale,
        weak_until: weakActive ? st.weak_until : null,
      };
    }
    const byModule = modules.get(course) ?? new Map<string, ModuleState>();
    for (const [module, st] of byModule) {
      const moduleConcepts = [...byCourse.entries()].filter(([, c]) => c.module === module);
      const unproved = moduleConcepts.some(([, c]) => c.transfer.size === 0);
      const proved = moduleConcepts.filter(([, c]) => c.transfer.size > 0);
      const score = proved.length > 0
        ? round2(proved.reduce((a, [, c]) => a + [...c.transfer.values()].reduce((x, y) => x + y, 0) / c.transfer.size, 0) / proved.length)
        : null;
      courseOut.modules[module] = {
        gate: st.gate,
        score: unproved ? null : score,
        locked: st.gate === 'fail' && !st.overridden,
        overridden: st.overridden,
      };
    }
    out.courses[course] = courseOut;
  }
  return out;
}

// Deterministic serialization: keys sorted, no timestamp anywhere. Rebuild-identical
// means the bytes of this function's output match the committed mastery.yml exactly.
export function serializeMastery(m: Mastery): string {
  return stringify(m, { sortMapEntries: true });
}
