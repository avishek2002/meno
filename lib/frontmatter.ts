// The single frontmatter implementation in this repo. The app server, validate,
// and eval all import this; nothing else may parse a `---` block. One YAML
// implementation in the process (the `yaml` package), period.
import { parse } from 'yaml';

export interface ParsedDoc {
  // null when the file has no frontmatter block or its YAML is invalid
  frontmatter: Record<string, unknown> | null;
  body: string;
  // populated instead of throwing: consumers render permissively and report
  warnings: string[];
}

export function parseFrontmatter(text: string): ParsedDoc {
  const warnings: string[] = [];
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { frontmatter: null, body: text, warnings: ['no frontmatter block'] };
  }
  const end = text.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: null, body: text, warnings: ['unterminated frontmatter block'] };
  }
  const raw = text.slice(text.indexOf('\n') + 1, end);
  const body = text.slice(text.indexOf('\n', end + 1) + 1);
  try {
    const parsed = parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { frontmatter: null, body, warnings: ['frontmatter is not a YAML mapping'] };
    }
    return { frontmatter: parsed as Record<string, unknown>, body, warnings };
  } catch (e) {
    return { frontmatter: null, body, warnings: [`invalid frontmatter YAML: ${(e as Error).message}`] };
  }
}
