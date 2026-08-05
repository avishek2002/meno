// Tenant discovery and the path guard. Every filesystem path derived from a
// request goes through safePath - `..` is rejected before resolution, the
// resolved path must stay under the root, and an existing path must not escape
// via symlink.
import { readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export function listTenants(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((e) => !e.startsWith('.'))
    .filter((e) => {
      try {
        return statSync(join(root, e)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

export function safePath(root: string, ...segments: string[]): string {
  for (const s of segments) {
    if (s.split(/[\\/]/).some((part) => part === '..' || part.includes('\0'))) {
      throw Object.assign(new Error('path traversal rejected'), { status: 400 });
    }
  }
  const rootResolved = resolve(root);
  const p = resolve(rootResolved, ...segments);
  if (p !== rootResolved && !p.startsWith(rootResolved + sep)) {
    throw Object.assign(new Error('path escapes the content root'), { status: 400 });
  }
  if (existsSync(p)) {
    const real = realpathSync(p);
    const realRoot = realpathSync(rootResolved);
    if (real !== realRoot && !real.startsWith(realRoot + sep)) {
      throw Object.assign(new Error('symlink escapes the content root'), { status: 400 });
    }
  }
  return p;
}
