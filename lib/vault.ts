// The single vault-graph implementation: basename index, wikilink extraction,
// reachability from home.md, broken and ambiguous links. The app server,
// insights, and validate's vault checks all import this - no parallel graph
// walks. Pure over an in-memory file map so it is testable without a disk.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface VaultFile {
  path: string; // vault-relative, posix separators
  text: string;
}

export interface VaultGraph {
  files: string[];
  // basename (no .md) -> vault-relative path, or null when ambiguous
  index: Map<string, string | null>;
  ambiguous: string[]; // basenames claimed by more than one file
  links: Map<string, string[]>; // path -> wikilink targets (raw)
  resolved: Map<string, string[]>; // path -> resolved target paths
  broken: Map<string, string[]>; // path -> unresolvable targets
  orphans: string[]; // .md files unreachable from home.md (excluding home itself)
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;

// sources/ and progress/ are excluded by convention (vault-conventions.md):
// they are data directories, not notes
const EXCLUDED = /^(sources|progress)\//;

export function loadVaultFiles(tenantDir: string): VaultFile[] {
  const out: VaultFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) {
        const rel = relative(tenantDir, p).split('\\').join('/');
        if (!EXCLUDED.test(rel)) out.push({ path: rel, text: readFileSync(p, 'utf8') });
      }
    }
  };
  if (existsSync(tenantDir)) walk(tenantDir);
  return out;
}

export function buildVaultGraph(files: VaultFile[]): VaultGraph {
  const index = new Map<string, string | null>();
  const ambiguous: string[] = [];
  for (const f of files) {
    const base = f.path.split('/').at(-1)!.slice(0, -3);
    if (index.has(base)) {
      if (index.get(base) !== null) ambiguous.push(base);
      index.set(base, null);
    } else {
      index.set(base, f.path);
    }
  }
  // Obsidian also resolves path-style targets ([[modules/01-x/01-y]]); vault
  // paths never collide with bare basenames (they contain '/'), so they are
  // never ambiguous
  for (const f of files) {
    index.set(f.path.slice(0, -3), f.path);
  }

  const links = new Map<string, string[]>();
  const resolved = new Map<string, string[]>();
  const broken = new Map<string, string[]>();
  for (const f of files) {
    const targets: string[] = [];
    // strip fenced code blocks before link extraction - code samples may show
    // wikilink syntax without meaning it
    const withoutCode = f.text.replace(/```[\s\S]*?```/g, '');
    for (const m of withoutCode.matchAll(WIKILINK)) targets.push(m[1].trim());
    links.set(f.path, targets);
    const res: string[] = [];
    const bad: string[] = [];
    for (const t of targets) {
      const hit = index.get(t) ?? null;
      if (hit) res.push(hit);
      else bad.push(t);
    }
    resolved.set(f.path, res);
    if (bad.length) broken.set(f.path, bad);
  }

  // reachability from home.md
  const reachable = new Set<string>();
  const queue: string[] = [];
  if (index.get('home')) {
    reachable.add(index.get('home')!);
    queue.push(index.get('home')!);
  }
  while (queue.length) {
    const cur = queue.pop()!;
    for (const next of resolved.get(cur) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  const orphans = files
    .map((f) => f.path)
    .filter((p) => !reachable.has(p) && p !== index.get('home'));

  return { files: files.map((f) => f.path), index, ambiguous, links, resolved, broken, orphans };
}
