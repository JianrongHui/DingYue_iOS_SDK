import type { Hono } from 'hono';

import type { D1Adapter } from '../lib/db';
import type { Env } from './env';

export type AppBindings = Env;

export type AppVariables = {
  requestId: string;
  db: D1Adapter;
  rawBody?: ArrayBuffer;
  appId?: string;
  appKey?: string;
};

export type AppContext = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

export type HonoApp = Hono<AppContext>;
