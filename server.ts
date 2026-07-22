import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const dirname = path.dirname(fileURLToPath(import.meta.url));
try { loadEnvFile(path.resolve(process.cwd(), '.env')); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const port = Number(process.env.PORT || 3000);

function runtimeConfig() {
  const groupId = process.env.VITE_STARDUST_GROUP_ID || '';
  const robotId = process.env.VITE_STARDUST_ROBOT_ID || '';
  const missingRequired: string[] = [];
  if (!groupId) missingRequired.push('VITE_STARDUST_GROUP_ID');
  if (!robotId) missingRequired.push('VITE_STARDUST_ROBOT_ID');
  return {
    baseUrl: process.env.VITE_STARDUST_BASE_URL || 'wss://stardust.ticos.cn',
    groupId,
    robotId,
    missingRequired,
  };
}

async function start() {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_request, response) => response.status(200).json({ ok: true }));
  app.get('/api/runtime-config', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json(runtimeConfig());
  });

  if (process.env.NODE_ENV === 'production') {
    const staticRoot = path.join(dirname, 'client');
    app.use(express.static(staticRoot, { index: false }));
    app.get('*', (_request, response) => response.sendFile(path.join(staticRoot, 'index.html')));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`mock-humanoid listening on http://0.0.0.0:${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
