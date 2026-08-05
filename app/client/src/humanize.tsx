// Turns one raw ledger event (ProgressResponse.recent is `unknown[]` by design
// - see clientTypes.tsx) into a one-line, human-readable description for the
// progress page's activity feed. Unknown/future event shapes degrade to a
// generic line instead of throwing.
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function humanizeEvent(raw: unknown): string {
  const e = (raw ?? {}) as Record<string, unknown>;
  const course = str(e.course) ?? 'a course';
  const moduleOrCourse = str(e.module) ?? course;

  switch (e.event) {
    case 'read': {
      const seconds = typeof e.seconds === 'number' ? ` (${e.seconds}s)` : '';
      return `Read ${str(e.lesson) ?? 'a lesson'} in ${moduleOrCourse}${seconds}`;
    }
    case 'scored': {
      const isTransfer = e.level === 'transfer';
      const kind = str(e.item_type) ?? 'check';
      if (isTransfer) {
        const score = typeof e.score === 'number' ? ` - scored ${e.score}` : '';
        return `Graded a transfer ${kind} in ${course}${score}`;
      }
      return `Answered a ${kind} check in ${course} - ${e.correct ? 'correct' : 'incorrect'}`;
    }
    case 'generated':
      return `Generated ${str(e.lesson) ?? 'a lesson'} in ${moduleOrCourse}`;
    case 'reviewed': {
      const n = Array.isArray(e.items) ? e.items.length : 0;
      return `Completed a review session in ${course} (${n} item${n === 1 ? '' : 's'})`;
    }
    case 'gated':
      return `Module gate for ${moduleOrCourse} evaluated: ${str(e.result) ?? 'unknown'}`;
    case 'overridden': {
      const reason = str(e.reason);
      return `Proceeded past a failed gate in ${course}${reason ? ` (${reason})` : ''}`;
    }
    case 'rescoped':
      return `Learning contract changed in ${course}`;
    case 'noted':
      return `Note: ${str(e.kind) ?? 'update'} in ${course}`;
    default:
      return `${str(e.event) ?? 'Event'} in ${course}`;
  }
}
