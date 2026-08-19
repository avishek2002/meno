// The onboarding empty state, reused by every page that has nothing to show
// yet: `data-meno-empty` marks the container (per the app spec) and the copy
// always points at the elicit-needs interview as the way to begin.
//
// `headingLevel` defaults to `h2` - the correct level when this is nested
// under a page that has already rendered its own `h1`. A full-page early
// return that renders nothing else passes `h1` instead, so the page always
// has exactly one `h1`.
//
// `children`, when given, replaces the default elicit-needs paragraph -
// callers that omit it get byte-identical output to before this prop
// existed.
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  body,
  headingLevel = 'h2',
  children,
}: {
  title: string;
  body?: string;
  headingLevel?: 'h1' | 'h2';
  children?: ReactNode;
}) {
  const Heading = headingLevel;
  return (
    <div className="empty-state" data-meno-empty>
      <Heading>{title}</Heading>
      <p>{body ?? 'No learner content exists here yet.'}</p>
      {children ?? (
        <p>
          To begin, ask your agent to start the interview - it runs the <code>elicit-needs</code> skill to
          turn what you want to learn into a confirmed course, generated right here.
        </p>
      )}
    </div>
  );
}
