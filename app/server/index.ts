import { fileURLToPath } from 'node:url';
// Bootstrap: bind 127.0.0.1 only (this serves a private vault), fail loudly if
// the port is taken, serve the built client statically. `--dev` lazily mounts
// Vite in middleware mode: one process, one port, no CORS.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeHandler, type Ctx } from './routes.ts';

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : undefined;
};

const port = Number(flag('--port') ?? 7373);
const root = resolve(flag('--root') ?? 'content/tenants');
const dev = args.includes('--dev');
const clientDist = fileURLToPath(new URL('../client/dist', import.meta.url));

const ctx: Ctx = {
  root,
  clientDist: existsSync(clientDist) ? clientDist : null,
  version: 1,
};

const handler = makeHandler(ctx);

async function main(): Promise<void> {
  type Middleware = (req: unknown, res: unknown, next: () => void) => void;
  let viteMiddleware: Middleware | null = null;
  // no built client (fresh clone): fall back to vite middleware automatically
  // so the documented `npm install && npm start` actually serves the app
  const needsFallback = !ctx.clientDist && !dev;
  if (needsFallback) console.log('no built client found - mounting vite middleware (run `npm run build` once to skip this)');
  if (dev || needsFallback) {
    try {
      const { createServer: createVite } = await import('vite');
      const vite = await createVite({
        configFile: fileURLToPath(new URL('../client/vite.config.ts', import.meta.url)),
        server: { middlewareMode: true },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares as unknown as Middleware;
      console.log('dev mode: vite middleware mounted (hot reload on)');
    } catch (e) {
      console.error(`dev mode unavailable (${(e as Error).message}); serving the built client`);
    }
  }

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    if (viteMiddleware && !url.startsWith('/api/')) {
      viteMiddleware(req, res, () => void handler(req, res));
      return;
    }
    void handler(req, res);
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`port ${port} is already in use - is another meno app running? (--port to override)`);
      process.exit(1);
    }
    throw e;
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`meno app on http://127.0.0.1:${port} (content root: ${root})`);
    if (!ctx.clientDist && !viteMiddleware) {
      console.log('no built client found - run `npm run build` once, or start with --dev');
    }
  });
}

void main();
