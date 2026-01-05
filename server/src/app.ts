import express, { Express, Request, Response } from 'express';

import { errorHandler } from './middleware/error_handler';
import { hmacAuth } from './middleware/hmac';
import { requestIdMiddleware } from './middleware/request_id';
import { registerConfigRoutes } from './modules/config';
import { registerEtlRoutes } from './modules/etl';
import { registerEventsRoutes } from './modules/events';
import { registerPackagesModule } from './modules/packages';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(
    express.json({
      limit: '1mb',
      verify: (req: Request, _res: Response, buf: Buffer) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(requestIdMiddleware);
  app.use('/v1/sdk', hmacAuth);

  app.get('/healthz', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      request_id: req.request_id
    });
  });

  registerModules(app);

  app.use(errorHandler);

  return app;
}

function registerModules(app: Express): void {
  registerConfigRoutes(app);
  registerEtlRoutes(app);
  registerEventsRoutes(app);
  registerPackagesModule(app);
}
