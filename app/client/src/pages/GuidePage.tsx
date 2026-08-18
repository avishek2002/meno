// #/guide - the in-app guidebook. Client-side content by design: the server
// serves tenant content only (app spec invariant 6 keeps every request-derived
// path under the content root), so shipping this as data avoids opening a route
// onto the repository's own files just to render help text.
import { useEffect } from 'react';
import { GUIDE, GUIDE_URL } from '../guide/content';
import { GLOSSARY } from '../guide/glossary';
import { guideHref } from '../../../shared/routeHrefs.ts';
import { prefersReducedMotion } from '../reducedMotion.tsx';

export function GuidePage({ tenant, section }: { tenant?: string; section?: string }) {
  // document.title is set centrally in App.tsx from the route table (UI-03) -
  // this page must not also set it, or the two fight over the tab title on
  // every mount/unmount.

  // Section links are real URLs (#/guide#glossary), so they bookmark and answer
  // the back button; the router tolerates the suffix and we scroll to it here,
  // because a nested fragment is not something the browser resolves itself.
  useEffect(() => {
    if (!section) return;
    const reduced = prefersReducedMotion();
    document.getElementById(section)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }, [section]);

  return (
    <section className="guide">
      <h1>Guidebook</h1>
      <p className="guide-lede">
        How this app works, what its controls mean, and where it stops. For the whole journey - setting
        up, backups, studying across two machines, privacy - see{' '}
        <a href={GUIDE_URL} target="_blank" rel="noreferrer">
          the full guide
        </a>
        .
      </p>

      <nav className="guide-toc" aria-label="Guidebook sections">
        <ul>
          {GUIDE.map((s) => (
            <li key={s.id}>
              <a href={guideHref(s.id)}>{s.title}</a>
            </li>
          ))}
          <li>
            <a href={guideHref('glossary')}>Glossary</a>
          </li>
        </ul>
      </nav>

      {GUIDE.map((s) => (
        <section key={s.id} id={s.id} className="guide-section">
          <h2>{s.title}</h2>
          {s.paras.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.list && (
            <dl className="guide-list">
              {s.list.map((item) => (
                <div key={item.label} className="guide-list-row">
                  <dt>{item.label}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}

      <section id="glossary" className="guide-section">
        <h2>Glossary</h2>
        <p>Every term the app explains in a tooltip, in one place.</p>
        <dl className="guide-list">
          {Object.entries(GLOSSARY).map(([key, e]) => (
            <div key={key} className="guide-list-row">
              <dt>{e.term}</dt>
              <dd>{e.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="guide-section">
        <h2>When you are stuck</h2>
        <p>
          Ask your agent. It can explain any lesson differently, re-run the interview if the course is
          aimed wrong, audit the citations behind a claim you doubt, or run a review session on demand.
          The app is the place you read and track; the agent is the place you ask.
        </p>
        {!tenant && (
          <p>
            No courses yet? Ask your agent to start the interview. It runs the <code>elicit-needs</code>{' '}
            skill and turns what you want to learn into a course, generated right here.
          </p>
        )}
      </section>
    </section>
  );
}
