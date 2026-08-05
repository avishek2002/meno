import { fileURLToPath } from 'node:url';
// Test harness: boot the real server on an ephemeral port against a throwaway
// copy of the committed example tenant. Never mutates examples/ itself.
import { createServer, request, type Server } from 'node:http';
import { mkdtempSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeHandler, type Ctx } from '../server/routes.ts';

export interface TestApp {
  root: string; // the content root (content/tenants in a real clone)
  tenantDir: string; // root/example-learner
  base: string; // http://127.0.0.1:<port>
  server: Server;
  close: () => Promise<void>;
}

const EXAMPLE = fileURLToPath(new URL('../../examples/example-learner', import.meta.url));

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

// A socket-level request, because `fetch` cannot express the one thing the
// rebinding guard is about: undici silently replaces a caller-supplied Host
// header with the connected authority, so a forged Host only reaches the
// server through node:http.
export function rawRequest(
  app: TestApp,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const url = new URL(app.base);
  return new Promise((resolve, reject) => {
    const req = request({ host: url.hostname, port: url.port, method, path, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
