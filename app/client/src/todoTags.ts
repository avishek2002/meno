// One source of truth for the two todo-tag axes (see app/server/todos.ts and
// second-brain/references/todo-format.md): kind is what the work is,
// audience is who can do it. The create form's selects and the todo pills
// both read from here, so the two never drift apart.
//
// blurb is written for a learner filling in the create form, not a
// maintainer reading the code - it is the same wording the form shows as
// always-visible helper text under each select. The short version for
// tooltips lives in guide/glossary.ts; keep the two consistent (glossary.ts's
// header comment: a term is never explained two ways).
import type { TodoAudience, TodoKind } from '../../shared/types.ts';

export interface KindInfo {
  kind: TodoKind;
  tag: string;
  label: string;
  blurb: string;
}

export interface AudienceInfo {
  audience: TodoAudience;
  tag: string;
  label: string;
  blurb: string;
}

export const TODO_KIND_INFO: KindInfo[] = [
  { kind: 'course', tag: '#course', label: 'Course', blurb: 'New learning content to generate - a course, module, or lesson.' },
  {
    kind: 'content-fix',
    tag: '#content-fix',
    label: 'Content fix',
    blurb: 'Existing content is wrong or stale - a bad claim, a dead citation.',
  },
  { kind: 'vault', tag: '#vault', label: 'Vault', blurb: 'Vault work - wikilinks, hub notes, orphans, adding files to sources/.' },
  { kind: 'feature', tag: '#feature', label: 'Feature', blurb: 'Add or change how this Meno instance works.' },
  { kind: 'bug', tag: '#bug', label: 'Bug', blurb: 'Something in this Meno instance is broken.' },
  { kind: 'study', tag: '#study', label: 'Study', blurb: 'Learning or practice work to do yourself.' },
  { kind: 'admin', tag: '#admin', label: 'Admin', blurb: 'A personal reminder.' },
];

export const TODO_AUDIENCE_INFO: AudienceInfo[] = [
  {
    audience: 'for-agent',
    tag: '#for-agent',
    label: 'For agent',
    blurb: 'The agent may propose doing it. Proposing is still the ceiling - it always asks before acting.',
  },
  {
    audience: 'for-me',
    tag: '#for-me',
    label: 'For me',
    blurb: 'Yours. The agent reads it for context and may remind you, but never acts on it.',
  },
];

export const kindInfo = (kind: TodoKind): KindInfo => TODO_KIND_INFO.find((k) => k.kind === kind)!;
export const audienceInfo = (audience: TodoAudience): AudienceInfo => TODO_AUDIENCE_INFO.find((a) => a.audience === audience)!;
