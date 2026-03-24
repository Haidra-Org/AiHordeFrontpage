// server.ts
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const allowedHosts = (
  process.env['NG_ALLOWED_HOSTS'] ?? 'localhost,127.0.0.1,::1'
)
  .split(',')
  .map((host) => host.trim())
  .filter((host) => host.length > 0);

const angularApp = new AngularNodeAppEngine({ allowedHosts });

app.use(
  express.static(browserDistFolder, {
    index: false,
    maxAge: '1y',
  }),
);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/{*splat}', (req, res, next) => {
  void angularApp
    .handle(req)
    .then((response) => {
      if (response) {
        void writeResponseToNodeResponse(response, res);
      } else {
        next();
      }
    })
    .catch(next);
});
/**
 * The request handler used by the Angular CLI (dev-server and during build).
 */
export const reqHandler = createNodeRequestHandler(app);

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Allowed SSR hosts: ${allowedHosts.join(', ')}`);
    console.log(`Node Express server listening on http://0.0.0.0:${port}`);
  });
}
