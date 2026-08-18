// "Where am I" for the two routes a session is actually spent on: a lesson
// (UI-06) and a note under a course (UI-15). Real anchors in a landmark, not a
// decorative path string - each segment has its own URL and answers the back
// button, which is what makes this navigation.
//
// The last segment is the current page: it renders as text and carries
// aria-current="page", so a screen reader hears where the trail ends even when
// the caller passes an href for it.

export interface BreadcrumbSegment {
  label: string;
  /** omit on the current page, or on a step with no route of its own */
  href?: string;
}

export function Breadcrumb({ segments }: { segments: BreadcrumbSegment[] }) {
  if (segments.length === 0) return null;
  const last = segments.length - 1;

  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {segments.map((s, i) => (
          <li key={`${i}-${s.label}`}>
            {s.href && i !== last ? (
              <a href={s.href}>{s.label}</a>
            ) : (
              <span aria-current={i === last ? 'page' : undefined}>{s.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
