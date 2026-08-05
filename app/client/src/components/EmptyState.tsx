// The onboarding empty state, reused by every page that has nothing to show
// yet: `data-meno-empty` marks the container (per the app spec) and the copy
// always points at the elicit-needs interview as the way to begin.
export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="empty-state" data-meno-empty>
      <h2>{title}</h2>
      <p>{body ?? 'No learner content exists here yet.'}</p>
      <p>
        To begin, ask your agent to start the interview - it runs the <code>elicit-needs</code> skill to
        turn what you want to learn into a confirmed course, generated right here.
      </p>
    </div>
  );
}
