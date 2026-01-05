import { Hono } from 'hono';

import { initDb } from './lib/db';
import { hmacAuth } from './middleware/hmac';
import { requestIdMiddleware } from './middleware/request_id';
import { registerAnalyticsSinksRoutes } from './modules/analytics-sinks';
import { registerConfigRoutes } from './modules/config';
import { registerEtlRoutes } from './modules/etl';
import { registerEventsRoutes } from './modules/events';
import { registerPackagesModule } from './modules/packages';
import type { AppContext } from './types/hono';

const app = new Hono<AppContext>();

app.use('*', requestIdMiddleware);
app.use('*', async (c, next) => {
  c.set('db', initDb(c.env.DB));
  await next();
});

app.use('/v1/sdk/*', async (c, next) => {
  const rawBody = await c.req.raw.clone().arrayBuffer();
  c.set('rawBody', rawBody);
  await next();
});
app.use('/v1/sdk/*', hmacAuth);

app.get('/healthz', (c) =>
  c.json({
    status: 'ok',
    request_id: c.get('requestId')
  })
);

registerConfigRoutes(app);
registerEtlRoutes(app);
registerEventsRoutes(app);
registerAnalyticsSinksRoutes(app);
registerPackagesModule(app);

app.onError((error, c) => {
  console.error('Unhandled error', error);
  return c.json(
    {
      message: error instanceof Error ? error.message : 'internal_server_error',
      request_id: c.get('requestId')
    },
    500
  );
});

export default app;
