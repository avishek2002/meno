// The one loading line, replacing the `<p className="status-line">Loading
// x...</p>` that all twelve pages repeat (UI-03). Same markup as before plus
// the two attributes that were missing: role="status" and aria-live="polite",
// so swapping this into the DOM tells assistive technology something is
// happening. Polite, never assertive - a fetch starting must not interrupt
// whatever the reader is being read.
//
// Loading only. A failure is ErrorState, which is a different announcement
// (role="alert") and needs a heading and a way out.

export function AsyncStatus({ message }: { message: string }) {
  return (
    <p className="status-line" role="status" aria-live="polite">
      {message}
    </p>
  );
}
