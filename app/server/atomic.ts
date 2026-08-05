// The two write disciplines (docs/specs/app.md): whole-file replace via
// same-directory temp + fsync + rename, and single-write O_APPEND for the
// ledger. Nothing else in the server touches disk for writes.
import { openSync, writeSync, fsyncSync, closeSync, renameSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

export function writeFileAtomic(path: string, data: string): void {
  const dir = dirname(path);
  const tmpDir = mkdtempSync(join(dir, `.${basename(path)}.tmp-`));
  const tmp = join(tmpDir, 'w');
  try {
    const fd = openSync(tmp, 'w');
    writeSync(fd, data);
    fsyncSync(fd);
    closeSync(fd);
    renameSync(tmp, path);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// One write() call under PIPE_BUF keeps concurrent appenders (agent and server)
// from interleaving; no lockfile needed on the ledger - that is the payoff of
// append-only. An oversized event means a bug, not a big event.
export function appendLine(path: string, line: string): void {
  const data = line.endsWith('\n') ? line : line + '\n';
  if (Buffer.byteLength(data) > 4096) {
    throw new Error(`ledger line exceeds 4096 bytes (${Buffer.byteLength(data)})`);
  }
  const fd = openSync(path, 'a');
  try {
    writeSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
