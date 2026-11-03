import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VERIFY_EMAIL_WEB_PATH } from '@party-finder/shared';
import { defineConfig, type Connect, type Plugin } from 'vite';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const srcDir = fileURLToPath(new URL('./src', import.meta.url));

const noReferrerOnVerifyPage: Connect.NextHandleFunction = (req, res, next) => {
  if (req.url?.startsWith(VERIFY_EMAIL_WEB_PATH)) {
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  next();
};

function verifyPageReferrerPolicy(): Plugin {
  return {
    name: 'verify-page-referrer-policy',
    configureServer: (server) => void server.middlewares.use(noReferrerOnVerifyPage),
    configurePreviewServer: (server) => void server.middlewares.use(noReferrerOnVerifyPage),
  };
}

function serveMockServiceWorker(): Plugin {
  const mswRoot = dirname(createRequire(import.meta.url).resolve('msw/package.json'));
  return {
    name: 'serve-mock-service-worker',
    apply: (_config, { mode }) => mode === 'mocks',
    configureServer: (server) =>
      void server.middlewares.use('/mockServiceWorker.js', (_req, res, next) => {
        readFile(join(mswRoot, 'lib/mockServiceWorker.js'))
          .then((script) => {
            res.setHeader('Content-Type', 'text/javascript');
            res.end(script);
          })
          .catch(next);
      }),
  };
}

export default defineConfig({
  envDir: repoRoot,
  plugins: [react(), tailwindcss(), verifyPageReferrerPolicy(), serveMockServiceWorker()],
  resolve: { alias: { '@': srcDir } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
