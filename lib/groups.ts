// Course groups: a tenant's own organization of their own courses, and the one
// implementation of it - the app server writes through these functions,
// tools/validate.ts checks with them, and an agent following second-brain reads
// the same file. Groups are display metadata and nothing else: a course's
// membership never changes a byte of course content.
//
// Two layers, and the second is why this file is not just a lookup. A course
// already has a place in the tree - it sits at <vault>/<domain>/<slug>/, from
// the closed vocabulary the community tier uses - so the domain is a perfectly
// good grouping that costs the learner nothing to get. groups.yml exists for
// what that cannot express: the learner's own words. "Version Control" and
// "Software Fundamentals" are not domains and never will be. So an explicit
// group always wins, and a course no group claims falls back to its domain
// rather than to a pile called Ungrouped. Ungrouped is left for the one case
// where there is genuinely nothing to fall back to: a course still sitting at
// the vault root, from before the domain layout.
//
// Everything here is pure. The file is parsed permissively (a hand-edited or
// half-written groups.yml renders inert with a warning, never throws - the same
// degraded-path rule the rest of the app follows) and serialized through the
// yaml package's stringify, never string concatenation, so no group title can
// inject structure into the document that holds it.
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export interface Group {
  id: string;
  title: string;
  courses: string[];
}

export interface GroupsDoc {
  schema_version: number;
  groups: Group[];
}

/** A rendered section: an explicit group, or one derived from a domain directory. */
export interface ResolvedGroup extends Group {
  source: 'explicit' | 'domain';
}

export interface ResolvedGroups {
  groups: ResolvedGroup[];
  ungrouped: string[];
  warnings: string[];
}

/** What the walk knows about a course: its slug, and where it sits in the vault. */
export interface WalkedCourse {
  slug: string;
  /** vault-relative course directory, "<domain>/<slug>" or bare "<slug>" */
  dir: string;
}

export const SCHEMA_VERSION = 1;
export const MAX_GROUPS = 100;
export const MAX_TITLE = 200;
export const EMPTY_GROUPS: GroupsDoc = Object.freeze({ schema_version: SCHEMA_VERSION, groups: [] }) as GroupsDoc;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// keys that mean something to Object.prototype are refused outright, so no
// caller can turn a group id into a prototype write however it keys its maps
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype']);

const bad = (message: string, status: number): Error => Object.assign(new Error(message), { status });

const clone = (doc: GroupsDoc): GroupsDoc => ({
  schema_version: doc.schema_version || SCHEMA_VERSION,
  groups: doc.groups.map((g) => ({ ...g, courses: [...g.courses] })),
});

/** Titles are one line: trimmed, inner whitespace collapsed, length-capped. */
export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw bad('missing or invalid "title"', 400);
  const title = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (title === '') throw bad('a group title cannot be empty', 400);
  if (title.length > MAX_TITLE) throw bad(`a group title cannot exceed ${MAX_TITLE} characters`, 400);
  return title;
}

/** Kebab-case id derived from the title once, at creation, then stable for life. */
export function slugifyGroupId(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ID.test(slug) && !RESERVED_IDS.has(slug) ? slug : 'group';
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Permissive read. Anything that does not match the shape is dropped with a
 * warning rather than rejected wholesale, so one bad hand edit costs one group
 * and not the whole page.
 */
export function parseGroups(raw: string): { doc: GroupsDoc; warnings: string[] } {
  const warnings: string[] = [];
  if (raw.trim() === '') return { doc: clone(EMPTY_GROUPS), warnings };

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    return { doc: clone(EMPTY_GROUPS), warnings: [`groups.yml: ${(e as Error).message}`] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { doc: clone(EMPTY_GROUPS), warnings: ['groups.yml: not a YAML mapping'] };
  }

  const rawGroups = (parsed as { groups?: unknown }).groups;
  if (rawGroups !== undefined && !Array.isArray(rawGroups)) {
    return { doc: clone(EMPTY_GROUPS), warnings: ['groups.yml: "groups" is not a list'] };
  }

  const groups: Group[] = [];
  const seenIds = new Set<string>();
  const claimedCourses = new Set<string>();
  for (const entry of (rawGroups as unknown[]) ?? []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push('groups.yml: a group entry is not a mapping - dropped');
      continue;
    }
    const { id, title, courses } = entry as { id?: unknown; title?: unknown; courses?: unknown };
    if (typeof id !== 'string' || !ID.test(id) || RESERVED_IDS.has(id)) {
      warnings.push(`groups.yml: group id ${JSON.stringify(id)} is not a kebab-case slug - dropped`);
      continue;
    }
    if (typeof title !== 'string' || title.trim() === '') {
      warnings.push(`groups.yml: group "${id}" has no title - dropped`);
      continue;
    }
    if (seenIds.has(id)) {
      warnings.push(`groups.yml: duplicate group id "${id}" - kept the first`);
      continue;
    }
    if (groups.length >= MAX_GROUPS) {
      warnings.push(`groups.yml: more than ${MAX_GROUPS} groups - the rest were dropped`);
      break;
    }
    seenIds.add(id);

    const kept: string[] = [];
    for (const slug of Array.isArray(courses) ? courses : []) {
      if (typeof slug !== 'string' || !ID.test(slug)) {
        warnings.push(`groups.yml: group "${id}" lists an invalid course slug - dropped`);
        continue;
      }
      if (claimedCourses.has(slug)) {
        warnings.push(`groups.yml: course "${slug}" is listed in more than one group - kept the first`);
        continue;
      }
      claimedCourses.add(slug);
      kept.push(slug);
    }
    groups.push({ id, title: title.normalize('NFC').replace(/\s+/g, ' ').trim(), courses: kept });
  }
  return { doc: { schema_version: SCHEMA_VERSION, groups }, warnings };
}

const HEADER = `# Course groups for this tenant - how the study app lays out your course list.
# Purely organizational: a course's group never changes its content. A group here
# overrides the default, which is the course's own domain directory. Format owner:
# .agents/skills/second-brain/references/vault-conventions.md
`;

export function serializeGroups(doc: GroupsDoc): string {
  return HEADER + stringifyYaml({ schema_version: SCHEMA_VERSION, groups: doc.groups });
}

// --- mutations (each returns a new document; each throws an HTTP-shaped error) ---

export function addGroup(doc: GroupsDoc, rawTitle: unknown): GroupsDoc {
  const title = normalizeTitle(rawTitle);
  const next = clone(doc);
  if (next.groups.length >= MAX_GROUPS) throw bad(`a tenant cannot have more than ${MAX_GROUPS} groups`, 400);
  const id = uniqueId(slugifyGroupId(title), new Set(next.groups.map((g) => g.id)));
  next.groups.push({ id, title, courses: [] });
  return next;
}

function requireGroup(doc: GroupsDoc, id: string): Group {
  const group = doc.groups.find((g) => g.id === id);
  if (!group) throw bad(`no group "${id}"`, 404);
  return group;
}

export function renameGroup(doc: GroupsDoc, id: string, rawTitle: unknown): GroupsDoc {
  const title = normalizeTitle(rawTitle);
  const next = clone(doc);
  requireGroup(next, id).title = title;
  return next;
}

/** Deleting a group deletes the grouping, never the courses - they fall back to Ungrouped. */
export function removeGroup(doc: GroupsDoc, id: string): GroupsDoc {
  const next = clone(doc);
  requireGroup(next, id);
  next.groups = next.groups.filter((g) => g.id !== id);
  return next;
}

/** A course belongs to exactly one group, enforced here rather than hoped for. */
export function setCourseGroup(doc: GroupsDoc, slug: string, groupId: string | null): GroupsDoc {
  if (typeof slug !== 'string' || !ID.test(slug)) throw bad('missing or invalid course slug', 400);
  const next = clone(doc);
  if (groupId !== null) requireGroup(next, groupId);
  for (const g of next.groups) g.courses = g.courses.filter((c) => c !== slug);
  if (groupId !== null) requireGroup(next, groupId).courses.push(slug);
  return next;
}

/** A domain slug rendered for a human: "ai-and-agents" -> "AI and agents". */
export function domainTitle(domain: string): string {
  const words = domain.split('-').map((w) => (w === 'ai' ? 'AI' : w));
  const [first, ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(' ');
}

// derived sections are namespaced so they can never collide with a group id,
// which is always plain kebab-case
const domainSectionId = (domain: string): string => `domain:${domain}`;

/**
 * Join the registry to what the tree walk actually found. A slug the walk no
 * longer knows drops out with a warning (a course deleted in Obsidian must not
 * break the page). Everything no group claimed falls back to a section derived
 * from its domain directory, so a learner who has never opened the manage panel
 * still gets a grouped list; only a course with no domain at all is Ungrouped.
 */
export function resolveGroups(doc: GroupsDoc, courses: WalkedCourse[]): ResolvedGroups {
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const warnings: string[] = [];
  const placed = new Set<string>();

  const groups: ResolvedGroup[] = doc.groups.map((g) => {
    const kept: string[] = [];
    for (const slug of g.courses) {
      if (!bySlug.has(slug)) {
        warnings.push(`groups.yml: group "${g.id}" lists "${slug}", which is not a course here any more`);
        continue;
      }
      kept.push(slug);
      placed.add(slug);
    }
    return { id: g.id, title: g.title, courses: kept, source: 'explicit' };
  });

  // the fallback layer, in walk order so domains appear as the tree does
  const derived = new Map<string, ResolvedGroup>();
  const ungrouped: string[] = [];
  for (const course of courses) {
    if (placed.has(course.slug)) continue;
    const domain = course.dir.includes('/') ? course.dir.split('/')[0] : null;
    if (!domain) {
      ungrouped.push(course.slug);
      continue;
    }
    const existing = derived.get(domain);
    if (existing) existing.courses.push(course.slug);
    else derived.set(domain, { id: domainSectionId(domain), title: domainTitle(domain), courses: [course.slug], source: 'domain' });
  }

  return { groups: [...groups, ...derived.values()], ungrouped, warnings };
}
