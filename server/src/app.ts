import express, { Express, Request, Response } from 'express';

import { errorHandler } from './middleware/error_handler';
import { requestIdMiddleware } from './middleware/request_id';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);

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

function registerModules(_app: Express): void {
  // Register business routes here.
}
