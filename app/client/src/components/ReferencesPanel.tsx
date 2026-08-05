// The lesson references panel, sourced from LessonResponse.frontmatter.sources.
import type { Source } from '../clientTypes';

export function ReferencesPanel({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <aside className="references-panel">
      <h2>References</h2>
      <ul>
        {sources.map((s, i) => (
          <li key={i}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.title}
            </a>
            {s.archived_url && (
              <>
                {' '}
                (
                <a href={s.archived_url} target="_blank" rel="noreferrer">
                  archived
                </a>
                )
              </>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
