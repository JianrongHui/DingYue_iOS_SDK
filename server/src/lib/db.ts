import { createD1Adapter, type D1Adapter } from './db-d1';

let adapter: D1Adapter | undefined;

export type DbAdapter = D1Adapter;

export function initDb(d1: D1Database): D1Adapter {
  if (adapter) {
    return adapter;
  }

  adapter = createD1Adapter(d1);
  return adapter;
}

export function getDb(): D1Adapter {
  if (!adapter) {
    throw new Error('D1 adapter not initialized. Call initDb() before use.');
  }

  return adapter;
}
