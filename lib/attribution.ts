// Pack attribution: who made what inside a pack, resolved by nearest ancestor.
// The one implementation, shared by tools/validate.ts's pack-attribution check
// and tools/packs.ts's INDEX.md roll-up.
//
// The design in one line: a record can name any unit of real work inside a pack
// - the pack, a course objective, a module, a planned lesson, an anchor source,
// a reference note - and every unit without a record of its own inherits the
// nearest ancestor that has one. A pack written by one person therefore needs
// exactly one record, and finer records exist only where authorship actually
// differs. Cheap at the small end, exact at the fine end.
//
// What this is not: proof. Every `by` is self-declared at write time with
// nothing binding it to the person named. See docs/specs/community.md.
import { parse as parseYaml } from 'yaml';

export type ContributionAction = 'created' | 'amended' | 'removed';

export interface Contribution {
  unit: string;
  by: string;
  date: string;
  action: ContributionAction;
  note?: string;
}

export interface ContributorsDoc {
  schema_version: number;
  contributions: Contribution[];
}

export interface Attribution {
  /** every handle recorded on the resolved unit, in first-seen order */
  by: string[];
  /** the subset that created it, rather than amending it */
  authors: string[];
  /** which unit the attribution actually came from - the unit itself, or an ancestor */
  inherited_from: string | null;
}

export type UnitKind = 'pack' | 'objective' | 'module' | 'lesson' | 'source' | 'note';

export interface ParsedUnit {
  kind: UnitKind;
  /** module slug, for module/lesson/source units */
  module?: string;
  /** lesson file name, source url, note file name, or objective id */
  key?: string;
}

export const SCHEMA_VERSION = 1;

/** Split a unit id into what it points at. Returns null for a shape we do not define. */
export function parseUnit(unit: string): ParsedUnit | null {
  if (unit === 'pack') return { kind: 'pack' };
  const parts = unit.split('/');
  if (parts[0] === 'objectives' && parts.length === 2 && parts[1] !== '') return { kind: 'objective', key: parts[1] };
  if (parts[0] === 'notes' && parts.length === 2 && parts[1].endsWith('.md')) return { kind: 'note', key: parts[1] };
  if (parts[0] === 'modules' && parts.length >= 2 && parts[1] !== '') {
    const module = parts[1];
    if (parts.length === 2) return { kind: 'module', module };
    if (parts[2] === 'lessons' && parts.length === 4 && parts[3].endsWith('.md')) {
      return { kind: 'lesson', module, key: parts[3] };
    }
    // a url contains slashes, so everything after sources/ is the key
    if (parts[2] === 'sources' && parts.length >= 4) {
      return { kind: 'source', module, key: parts.slice(3).join('/') };
    }
  }
  return null;
}

/** The unit itself, then each ancestor, ending at `pack`. */
export function ancestorsOf(unit: string): string[] {
  const parsed = parseUnit(unit);
  if (!parsed) return ['pack'];
  switch (parsed.kind) {
    case 'pack':
      return ['pack'];
    case 'lesson':
    case 'source':
      return [unit, `modules/${parsed.module}`, 'pack'];
    default:
      return [unit, 'pack'];
  }
}

/** Permissive read, matching every other parser here: a broken file is inert, not fatal. */
export function parseContributors(raw: string): { doc: ContributorsDoc; warnings: string[] } {
  const empty: ContributorsDoc = { schema_version: SCHEMA_VERSION, contributions: [] };
  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    return { doc: empty, warnings: [`CONTRIBUTORS.yml: ${(e as Error).message}`] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { doc: empty, warnings: ['CONTRIBUTORS.yml: not a YAML mapping'] };
  }
  const list = (parsed as { contributions?: unknown }).contributions;
  if (!Array.isArray(list)) return { doc: empty, warnings: ['CONTRIBUTORS.yml: "contributions" is not a list'] };
  // both fields are required by the schema, but this parser is also the one
  // tools/packs.ts uses without a schema check first - a record missing either
  // one would otherwise reach the generated index as an empty contributor name
  const contributions = list.filter(
    (c): c is Contribution =>
      !!c &&
      typeof c === 'object' &&
      !Array.isArray(c) &&
      typeof (c as Contribution).unit === 'string' &&
      typeof (c as Contribution).by === 'string' &&
      (c as Contribution).by !== '',
  );
  return {
    doc: {
      schema_version: Number((parsed as { schema_version?: unknown }).schema_version ?? SCHEMA_VERSION),
      contributions,
    },
    warnings: [],
  };
}

/**
 * Who a unit is attributed to. Walks the unit and then its ancestors, stopping
 * at the first level anyone claimed; a `removed` record documents history and
 * does not claim anything, so a unit whose only record is `removed` keeps
 * inheriting from above.
 */
export function attributionFor(unit: string, doc: ContributorsDoc): Attribution {
  for (const level of ancestorsOf(unit)) {
    const records = doc.contributions.filter((c) => c.unit === level && c.action !== 'removed');
    if (records.length === 0) continue;
    const by: string[] = [];
    for (const r of records) if (!by.includes(r.by)) by.push(r.by);
    const authors: string[] = [];
    for (const r of records) if (r.action === 'created' && !authors.includes(r.by)) authors.push(r.by);
    return { by, authors, inherited_from: level };
  }
  return { by: [], authors: [], inherited_from: null };
}

/** Every distinct handle in the pack, in first-seen order - the INDEX.md roll-up. */
export function contributorsOf(doc: ContributorsDoc): string[] {
  const out: string[] = [];
  for (const c of doc.contributions) if (!out.includes(c.by)) out.push(c.by);
  return out;
}
