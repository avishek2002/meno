// Decodes the named capture groups of a route match. Pulled out of
// router.tsx so it unit-tests without a DOM (root tsconfig compiles
// app/**/*.ts without the DOM lib) - the same reason courseList.ts sits next
// to TenantCoursesPage.tsx and graphLayout.ts sits next to GraphPage.tsx.
//
// A named group that did not participate in the match (an optional group,
// like `guide`'s `section` or `graph`'s `focus`, when the hash omits it) is
// `undefined`, and `decodeURIComponent(undefined)` coerces its argument to
// the string "undefined" rather than throwing - so a genuinely absent group
// must be skipped, not decoded, or callers see the literal string
// "undefined" instead of a missing param.
export function decodeParams(groups: Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(groups ?? {})) {
    if (v === undefined) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}
