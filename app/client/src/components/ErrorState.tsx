// Every failure the learner can land on, in one shape (UI-04): a heading so
// the page has a document outline, one plain-language sentence saying what
// likely happened, and at least one way back into the app. The old
// `<p className="status-line status-error">` had none of the three, so a stale
// bookmark or an ungenerated lesson was a dead end with no heading at all.
//
// `message` is written in the app's own vocabulary - "this lesson has not been
// generated yet" - not the server's. The server string goes in `detail`, where
// it stays available for a bug report without being the first thing read.
//
// role="alert" on the wrapper, so the swap is announced. Assertive is right
// here and wrong for AsyncStatus: a dead end interrupts, a fetch does not.

export interface RecoveryLink {
  label: string;
  href: string;
}

export interface ErrorStateProps {
  /** the <h1>: what failed, e.g. "Lesson not found" */
  title: string;
  /** one sentence of likely cause, in the learner's vocabulary */
  message: string;
  /** route-appropriate ways out; at least one, or the page is still a dead end */
  links?: RecoveryLink[];
  /** the raw server string, kept as muted detail rather than as the message */
  detail?: string;
}

export function ErrorState({ title, message, links = [], detail }: ErrorStateProps) {
  return (
    <section className="error-state" role="alert">
      <h1>{title}</h1>
      <p>{message}</p>
      {detail && <p className="error-detail">{detail}</p>}
      {links.length > 0 && (
        <ul className="recovery-links">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{l.label}</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
