import type { MiddlewareHandler } from 'hono';

import type { AppContext } from '../types/hono';

const REQUEST_ID_HEADER = 'x-request-id';

export const requestIdMiddleware: MiddlewareHandler<AppContext> = async (c, next) => {
  const incomingId = c.req.header(REQUEST_ID_HEADER);
  const requestId =
    incomingId && incomingId.trim().length > 0 ? incomingId.trim() : crypto.randomUUID();

  c.set('requestId', requestId);
  c.header(REQUEST_ID_HEADER, requestId);

  await next();
};
