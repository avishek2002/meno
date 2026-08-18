// Turns NoteResponse's path/course/domain into the clickable breadcrumb
// NotePage renders in a <nav aria-label="Breadcrumb"> above the note body
// (UI-15 makes the note's own heading the page's single <h1>, so the vault
// path moved out of the heading rather than out of the page - it is still
// what disambiguates a note from every other note that could share a
// heading text). Pure - no React, no DOM - so it unit-tests directly against
// the server contract shape (app/shared/types.ts) rather than through a
// rendered component.
import { tenantCourseHref, courseHref } from '../../shared/routeHrefs.ts';

export interface PathSegment {
  text: string;
  href: string | null;
}

export function noteBreadcrumb(input: {
  tenant: string;
  path: string;
  course: { slug: string; title: string } | null;
  domain: string | null;
}): PathSegment[] {
  const { tenant, path, course, domain } = input;
  const parts = path.split('/');

  // The course segment sits right after the domain segment when there is
  // one, otherwise at the front. Only that one index may ever become a
  // course link - a later segment that happens to repeat the slug (a
  // same-named notes/<slug>.md file, say) must stay plain text, so the
  // comparison is index-scoped rather than a bare text match against every
  // segment.
  const courseIndex = domain !== null ? 1 : 0;

  return parts.map((text, i) => {
    if (i === 0 && domain !== null && text === domain) {
      // The domain segment still reads as the domain (it is what a reader
      // reaches for to mean "show me where this lives"), but its link now
      // targets the course, not the domain: #/t/<tenant>#course-<slug>,
      // resolved by TenantCoursesPage's sectionForCourse against whichever
      // section actually claims the course - an explicit groups.yml group or
      // a derived domain section, whichever it is. A domain-keyed fragment
      // was tried first and retired: a domain only gets a derived section
      // for courses that fall back to it, so a domain where every course is
      // claimed by an explicit group has no section for #domain-<x> to open
      // - exactly the shape of the committed example tenant, where the link
      // would have been inert. Keying on the course instead always resolves,
      // because every course belongs to exactly one section by construction.
      const href = course !== null && /^[\w-]+$/.test(course.slug) ? tenantCourseHref(tenant, course.slug) : null;
      return { text, href };
    }
    if (i === courseIndex && course !== null && text === course.slug) {
      return { text, href: courseHref(tenant, course.slug) };
    }
    return { text, href: null };
  });
}
