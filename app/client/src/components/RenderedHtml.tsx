// The one component that renders server-produced HTML (lesson bodies, hub
// notes, vault notes) and layers on every client-side enhancement it needs:
// wikilink navigation, mermaid diagrams, transfer badges, and - only when
// check/course/module/lesson are supplied - interactive check widgets.
import { useCallback, useMemo, useRef } from 'react';
import type { LessonSection, PublicCheck } from '../../../shared/types.ts';
import { useWikilinkNav } from '../wikilinks';
import { useMermaidRender } from '../mermaid';
import { useTransferBadges } from '../transferBadges';
import { useCheckMounts } from '../checkMounts';
import { useSectionNoteButtons } from '../sectionNoteButtons';

interface RenderedHtmlProps {
  html: string;
  tenant: string;
  className?: string;
  checks?: PublicCheck[];
  course?: string;
  module?: string;
  lesson?: string;
  // Personal notes (docs/specs/notes.md): when both are given, one note
  // button is mounted beside every depth-2 heading a section resolves to.
  // Omitted for hub HTML (CoursePage's Map details) - a course page has no
  // anatomy headings to attach a button to.
  noteSections?: LessonSection[];
  onOpenNoteSection?: (sectionKey: string) => void;
}

const noop = (): void => {};

export function RenderedHtml({
  html,
  tenant,
  className,
  checks,
  course,
  module,
  lesson,
  noteSections,
  onOpenNoteSection,
}: RenderedHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);
  useWikilinkNav(ref, tenant, html);
  useMermaidRender(ref, html);
  useTransferBadges(ref, html);
  const ctx = course && module && lesson ? { tenant, course, module, lesson } : null;
  useCheckMounts(ref, checks, ctx, html);
  // Stable identity so the mount effect below does not re-run every render
  // when the caller passes an inline arrow function.
  const openNoteSection = useCallback((key: string) => (onOpenNoteSection ?? noop)(key), [onOpenNoteSection]);
  useSectionNoteButtons(ref, noteSections, openNoteSection, html);
  // Memoized, and that is load-bearing rather than an optimization. React
  // decides whether to re-apply `dangerouslySetInnerHTML` by comparing the
  // prop by object identity, not by comparing the HTML string inside it - so
  // a fresh `{__html: html}` literal on every render makes React re-assign
  // innerHTML on every render, even when the markup is byte-identical.
  //
  // Re-assigning innerHTML destroys and rebuilds every child of this element.
  // The interactive check widgets live in exactly those children: they are
  // mounted by useCheckMounts into `div.meno-check` placeholders that come
  // from this HTML, each with its own react-dom root. So one redundant
  // re-assignment silently deleted every check on the page. Measured on the
  // lesson route, where the second of two fetches landing is enough to
  // trigger it: the widgets mounted at 470ms and were gone at 473ms, with no
  // error, in development and in the production bundle alike. That is the
  // whole of the bug - `checks`, the mount points and the roots were all
  // correct and always had been.
  //
  // A stable object means React re-applies the HTML only when `html` itself
  // changes, which is also exactly when the checks genuinely need remounting
  // (`html` is a dependency of useCheckMounts above for that half).
  const inner = useMemo(() => ({ __html: html }), [html]);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={inner} />;
}
