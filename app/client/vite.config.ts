// Vite config for the meno study app. `root` is pinned to this file's own
// directory (not process.cwd()) so `vite build --config app/client/vite.config.ts`
// works the same from the repo root as it does from app/client/ itself.
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
});
