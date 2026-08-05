// Line-precise todos.md operations. The format is owned by
// second-brain/references/todo-format.md: markdown checkboxes, one closed
// hashtag set, completion via "✅ YYYY-MM-DD", lines never deleted - only
// checked off or moved to "## Parked". Every mutation is a whole-file atomic
// replace guarded by the caller's If-Match content hash.
import { createHash } from 'node:crypto';
import type { Todo, TodosResponse } from '../shared/types.ts';

const TODO_LINE = /^- \[( |x)\] (.*)$/;
const TYPE_TAG = /#(gen|repo|note)\b/;
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
    current.todos.push({
      line: i,
      text: body.replace(TYPE_TAG, '').replace(COMPLETED, '').trim(),
      type: (body.match(TYPE_TAG)?.[1] as Todo['type']) ?? null,
      done: m[1] === 'x',
      completedOn: body.match(COMPLETED)?.[1] ?? null,
    });
  }
  return { sections: sections.filter((s) => s.heading !== '' || s.todos.length > 0), raw_sha256: sha256(raw) };
}

export function addTodo(raw: string, text: string, type: 'gen' | 'repo' | 'note', section?: string): string {
  const heading = section ?? (type === 'repo' ? 'Repo' : type === 'gen' ? 'Content' : 'Notes');
  const line = `- [ ] ${text} #${type}`;
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
    const type = body.match(TYPE_TAG)?.[0] ?? '';
    const done = body.match(COMPLETED)?.[0] ?? '';
    body = [patch.text.trim(), type, done].filter(Boolean).join(' ');
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
