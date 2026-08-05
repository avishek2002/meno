// Test harness: boot the real server on an ephemeral port against a throwaway
// copy of the committed example tenant. Never mutates examples/ itself.
import { createServer, type Server } from 'node:http';
import { mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHandler, type Ctx } from '../server/routes.ts';

export interface TestApp {
  root: string; // the content root
  tenantDir: string; // root/example-learner
  base: string; // http://127.0.0.1:<port>
  server: Server;
  close: () => Promise<void>;
}

const EXAMPLE = new URL('../../examples/example-learner', import.meta.url).pathname;

export async function withTenant(opts: { empty?: boolean } = {}): Promise<TestApp> {
  const root = mkdtempSync(join(tmpdir(), 'meno-app-'));
  const tenantDir = join(root, 'example-learner');
  if (opts.empty) {
    // an empty content root - no tenant at all
  } else {
    mkdirSync(tenantDir, { recursive: true });
    cpSync(EXAMPLE, tenantDir, { recursive: true });
  }
  const ctx: Ctx = { root, clientDist: null, version: 1 };
  const server = createServer(makeHandler(ctx));
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    root,
    tenantDir,
    base: `http://127.0.0.1:${port}`,
    server,
    close: () => new Promise((res) => server.close(() => res())),
  };
}

export async function api(app: TestApp, method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(app.base + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}
