// Wordmark linking home, tenant name + nav when inside a tenant, the guidebook
// link, a guarded back button, and the "Re-read files" button - files are the
// truth and there is no watcher, so re-reading is always an explicit action.
//
// The guidebook link is always reachable, since the screen you need help on
// may be the one with no tenant yet - but "always reachable" and "always the
// same URL" are not the same claim (UI-18). Inside a tenant it links the
// tenant-scoped form (#/t/<tenant>/guide) so the other six nav links do not
// have to vanish just because the reader asked for help; with no tenant open
// it links the plain #/guide the guarantee above is actually about.
// headerNav.ts's buildNavEntries owns which form and the rest of the nav's
// shape - see its own doc comment for why the plain form used to make the
// whole block disappear.
//
// Real anchors with aria-current, not tabs: each of these has its own URL and
// answers the back button, which makes them navigation.
import { useEffect, useState } from 'react';
import { InfoTip } from './InfoTip';
import { nextDepth, stampedState } from '../historyDepth.ts';
import { homeHref } from '../../../shared/routeHrefs.ts';
import { buildNavEntries } from '../headerNav.ts';

// Tracks how many in-app entries back the reader can go, so the back button
// can hide itself entirely rather than ever ejecting someone out of Meno -
// a fresh deep-link load or a bookmark starts at depth 0 with nothing behind
// it. Depth is read off history.state on hashchange, not incremented in
// place; see historyDepth.ts for why a naive counter is wrong.
//
// Links in this app are plain <a href="#..."> anchors (see router.tsx's
// comment on why there is no route library) that never route through a
// shared navigate() call - wikilinks.tsx and GraphPage.tsx are the only
// callers of navigate(), and even those just assign location.hash the same
// way a plain anchor click would. hashchange is the one event that fires for
// every one of those transitions regardless of how the hash changed, which
// is why the stamping happens there instead of at a navigation call site.
function useBackDepth(): number {
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    let current = -1; // sentinel: an unstamped entry at mount adopts depth 0, not "current + 1"
    const adopt = (): void => {
      const decision = nextDepth(history.state, current);
      if (decision.stamp) {
        try {
          history.replaceState(stampedState(history.state, decision.depth), '');
        } catch {
          // Safari throttles history.replaceState (roughly 100 calls per 30
          // seconds) and throws once exceeded. The same degrade instinct as
          // readOpenState/writeOpenState treating a throwing store as
          // session-only, not an error: keep the depth this render adopted
          // in memory (the two lines below still run) even though it never
          // reached the entry's actual state, rather than letting the throw
          // abort adopt() here and leave `current` stale for the next
          // hashchange.
        }
      }
      current = decision.depth;
      setDepth(decision.depth);
    };
    adopt();
    window.addEventListener('hashchange', adopt);
    return () => window.removeEventListener('hashchange', adopt);
  }, []);
  return depth;
}

/**
 * Publishes the header's own height as `--header-height` on the document
 * root, so `--scroll-clearance` (styles.css) can be the header plus a gap
 * rather than a guess.
 *
 * Why a measurement and not a constant: the header wraps at narrow widths, so
 * it is 60.17px tall on a laptop and 100.95px at 360px wide (measured before
 * v1.16 added the Glossary link; the observer is what makes the exact figure
 * not matter, which is the whole argument for measuring). Every in-page
 * scroll target - the guidebook's `#section` anchors, the module anchor on a
 * course page, the course-list deep link - has to clear whichever of those is
 * current, and `scroll-margin-top` cannot reference another element's height,
 * so CSS alone cannot express it. The old fixed 4.5rem was right for the
 * unwrapped case only: at 360px the anchored module card landed 28.5px
 * underneath the header, with `elementsFromPoint` returning `.app-header`
 * over the top of the card the navigation had just been asked to reveal.
 *
 * ResizeObserver rather than a resize listener because the header's height
 * changes when its own content wraps, which a viewport-width listener would
 * only approximate, and because it fires once with the initial size - so the
 * first paint is corrected without a separate measure-on-mount path.
 */
function useHeaderHeightVar(el: HTMLElement | null): void {
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const publish = (): void => {
      document.documentElement.style.setProperty('--header-height', `${el.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      // Back to the stylesheet's fallback rather than a stale pixel value, so
      // a header that unmounts cannot leave every scroll target offset by the
      // height it happened to have last.
      document.documentElement.style.removeProperty('--header-height');
    };
  }, [el]);
}

export function Header({
  tenant,
  route,
  onRefresh,
}: {
  tenant?: string;
  route: string;
  onRefresh: () => void;
}) {
  const navEntries = buildNavEntries(route, tenant);
  const backDepth = useBackDepth();
  // Callback ref: the effect has to re-run if the element identity ever
  // changes, which a plain useRef would not report.
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  useHeaderHeightVar(headerEl);

  return (
    <header className="app-header" ref={setHeaderEl}>
      <div className="app-header-left">
        {backDepth > 0 && (
          <button type="button" className="back-btn" aria-label="Back" onClick={() => history.back()}>
            ←
          </button>
        )}
        <a href={homeHref()} className="wordmark">
          meno
        </a>
        {tenant && <span className="tenant-name">{tenant}</span>}
      </div>
      {/* aria-label "Primary" rather than "Main" (UI-18). Renamed rather than
          dropped: an unnamed nav landmark would be announced as a bare
          "navigation" among the page's other labelled ones (Breadcrumb,
          Lesson navigation, Guidebook sections), which is worse than a
          slightly redundant name. "Main" was the wrong word twice over - it
          duplicates what <main> already carries, and it is the wording this
          rename exists to remove.
          Not "Sections" either: GuidePage's own table of contents is labelled
          "Guidebook sections", and on that one page - the screen a reader who
          needs help is most likely to be on - a landmark list would show
          "Sections" and "Guidebook sections" side by side, one a substring of
          the other, with nothing saying which is the site-wide chrome.
          "Primary" alone, not "Primary navigation": a <nav> landmark is
          already announced with its role, so the longer form reads as
          "Primary navigation navigation".
          The main-nav class name stays - it is a CSS hook (styles.css,
          styles/nav.css), not the wording this rename is about. */}
      <nav className="main-nav" aria-label="Primary">
        {navEntries.map((entry) => (
          <a key={entry.href} href={entry.href} className={entry.className} aria-current={entry.current}>
            {entry.label}
          </a>
        ))}
      </nav>
      <span className="header-refresh">
        <button type="button" className="refresh-btn" onClick={onRefresh}>
          Re-read files
        </button>
        <InfoTip entry="reReadFiles" />
      </span>
    </header>
  );
}
