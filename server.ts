// server.ts
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
const app = express();
const angularApp = new AngularNodeAppEngine();
app.use('*', (req, res, next) => {
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
