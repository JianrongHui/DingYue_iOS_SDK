import { Hono } from 'hono';

import { initDb } from './lib/db';
import { hmacAuth } from './middleware/hmac';
import { requestIdMiddleware } from './middleware/request_id';
import { registerAnalyticsSinksRoutes } from './modules/analytics-sinks';
import { registerAppsRoutes } from './modules/apps';
import { registerAdminEventsRoutes } from './modules/admin-events';
import { registerConfigRoutes } from './modules/config';
import { registerEtlRoutes } from './modules/etl';
import { registerEventsRoutes } from './modules/events';
import { registerExperimentsRoutes } from './modules/experiments';
import { registerPackagesModule } from './modules/packages';
import { registerPlacementsRoutes } from './modules/placements';
import { registerRulesetsRoutes } from './modules/rulesets';
import { registerVariantsRoutes } from './modules/variants';
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
registerAppsRoutes(app);
registerPlacementsRoutes(app);
registerVariantsRoutes(app);
registerExperimentsRoutes(app);
registerRulesetsRoutes(app);
registerAdminEventsRoutes(app);

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
