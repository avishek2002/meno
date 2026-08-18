// Whether the reader has asked the OS/browser to minimise motion - the one
// call site for `window.matchMedia('(prefers-reduced-motion: reduce)')`.
// TenantCoursesPage's deep-link scroll, GuidePage's #section scroll,
// CoursePage's #module scroll, and CoursePage's arrival highlight (new in
// this change) all gated the same check inline, once each - collapsed here
// so a fifth call site copies a function call, not the literal media query
// string.
//
// A `.tsx` file with no JSX in it, the same reason useCourseContext.tsx is:
// this needs `window`, and the root tsconfig (app/**/*.ts, no DOM lib) is
// what every DOM-free `.ts` file in app/client/src is written against - a
// plain `.ts` here would fail that typecheck. `.tsx` is picked up only by
// app/client/tsconfig.json, which has the DOM lib, so it is the one
// extension that can name `window` at all. Untested by node --test for the
// same reason: it has no pure branch, only the DOM call itself.
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
