// Line-precise todos.md operations. The format is owned by
// second-brain/references/todo-format.md: markdown checkboxes, two closed
// hashtag axes (kind, audience), completion via "✅ YYYY-MM-DD", lines never
// deleted - only checked off or moved to "## Parked". Every mutation is a
// whole-file atomic replace guarded by the caller's If-Match content hash.
//
// Back-compat: the old single-tag namespace (#gen/#repo/#note) still parses,
// read-only, via ALIASES below - never written again by any writer here.
import { createHash } from 'node:crypto';
import type { TodoAudience, TodoKind, TodosResponse } from '../shared/types.ts';

const TODO_LINE = /^- \[( |x)\] (.*)$/;
export const TODO_KINDS: TodoKind[] = ['course', 'content-fix', 'vault', 'feature', 'bug', 'study', 'admin'];
export const TODO_AUDIENCES: TodoAudience[] = ['for-agent', 'for-me'];
const KIND_TAG = /#(course|content-fix|vault|feature|bug|study|admin)\b/;
const AUDIENCE_TAG = /#(for-agent|for-me)\b/;
const ALIAS_TAG = /#(gen|repo|note)\b/;
// every tag string this parser recognizes, for stripping/preserving as a
// group - kept in sync with KIND_TAG | AUDIENCE_TAG | ALIAS_TAG above
const ALL_TAGS = /#(course|content-fix|vault|feature|bug|study|admin|for-agent|for-me|gen|repo|note)\b/g;
const ALIASES: Record<string, { kind: TodoKind; audience: TodoAudience }> = {
  gen: { kind: 'course', audience: 'for-agent' },
  repo: { kind: 'feature', audience: 'for-agent' },
  note: { kind: 'admin', audience: 'for-me' },
};
const COMPLETED = /✅\s*(\d{4}-\d{2}-\d{2})/;

export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function parseTodos(raw: string): TodosResponse {
  const lines = raw.split('\n');
  const sections: TodosResponse['sections'] = [];
  let current: TodosResponse['sections'][number] = { heading: '', todos: [] };
  sections.push(current);
  for (const [i, line] of lines.entries()) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      current = { heading: h[1].trim(), todos: [] };
      sections.push(current);
      continue;
    }
    const m = line.match(TODO_LINE);
    if (!m) continue;
    const body = m[2];
    // an explicit kind/audience tag wins over an alias on the same line;
    // each axis falls back to the alias's half only when that axis has no
    // explicit tag of its own
    const alias = ALIASES[body.match(ALIAS_TAG)?.[1] ?? ''];
    const kind = (body.match(KIND_TAG)?.[1] as TodoKind | undefined) ?? alias?.kind ?? null;
    const audience = (body.match(AUDIENCE_TAG)?.[1] as TodoAudience | undefined) ?? alias?.audience ?? null;
    current.todos.push({
      line: i,
      text: body.replace(ALL_TAGS, '').replace(COMPLETED, '').replace(/\s+/g, ' ').trim(),
      type: kind,
      audience,
      done: m[1] === 'x',
      completedOn: body.match(COMPLETED)?.[1] ?? null,
    });
  }
  return { sections: sections.filter((s) => s.heading !== '' || s.todos.length > 0), raw_sha256: sha256(raw) };
}

const DEFAULT_SECTION: Record<TodoKind, string> = {
  course: 'Content',
  'content-fix': 'Content',
  vault: 'Vault',
  feature: 'Setup',
  bug: 'Setup',
  study: 'Study',
  admin: 'Notes',
};

export function addTodo(raw: string, text: string, kind: TodoKind, audience: TodoAudience, section?: string): string {
  const heading = section ?? DEFAULT_SECTION[kind];
  const line = `- [ ] ${text} #${kind} #${audience}`;
  const lines = raw.split('\n');
  const idx = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (idx === -1) {
    const trimmed = raw.endsWith('\n') ? raw : raw + '\n';
    return `${trimmed}\n## ${heading}\n\n${line}\n`;
  }
  // insert after the last non-empty line of this section
  let end = idx + 1;
  for (let i = idx + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
    if (lines[i].trim() !== '') end = i + 1;
  }
  lines.splice(end, 0, line);
  return lines.join('\n');
}

export function patchTodo(
  raw: string,
  lineNo: number,
  patch: { done?: boolean; text?: string },
  today: string,
): string {
  const lines = raw.split('\n');
  const m = lines[lineNo]?.match(TODO_LINE);
  if (!m) throw Object.assign(new Error(`line ${lineNo} is not a todo`), { status: 400 });
  let body = m[2];
  let mark = m[1];
  if (patch.text !== undefined) {
    // preserve every recognized tag (kind, audience, or an old alias) in the
    // order it appeared, plus the completion marker - a text edit rewrites
    // only the text, same rule as the single-tag format did
    const tags = body.match(ALL_TAGS) ?? [];
    const done = body.match(COMPLETED)?.[0] ?? '';
    body = [patch.text.trim(), ...tags, done].filter(Boolean).join(' ');
  }
  if (patch.done !== undefined) {
    mark = patch.done ? 'x' : ' ';
    body = body.replace(COMPLETED, '').trimEnd();
    if (patch.done) body = `${body} ✅ ${today}`;
  }
  lines[lineNo] = `- [${mark}] ${body}`;
  return lines.join('\n');
}

export function parkTodo(raw: string, lineNo: number): string {
  const lines = raw.split('\n');
  if (!TODO_LINE.test(lines[lineNo] ?? '')) {
    throw Object.assign(new Error(`line ${lineNo} is not a todo`), { status: 400 });
  }
  const [line] = lines.splice(lineNo, 1);
  const idx = lines.findIndex((l) => l.trim() === '## Parked');
  if (idx === -1) {
    while (lines.length && lines.at(-1)!.trim() === '') lines.pop();
    lines.push('', '## Parked', '', line);
  } else {
    let end = idx + 1;
    for (let i = idx + 1; i < lines.length && !lines[i].startsWith('## '); i++) {
      if (lines[i].trim() !== '') end = i + 1;
    }
    lines.splice(end, 0, line);
  }
  return lines.join('\n') + (raw.endsWith('\n') && !lines.join('\n').endsWith('\n') ? '\n' : '');
}
