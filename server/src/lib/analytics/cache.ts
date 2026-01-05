import { Pool } from 'pg';

import {
  type AnalyticsSink,
  type AnalyticsSinkRow,
  normalizeAnalyticsSinkRow
} from '../../modules/analytics-sinks/types';

export type SinkCacheState = {
  sinks: AnalyticsSink[];
  hasAny: boolean;
};

const sinkCache = new Map<
  string,
  SinkCacheState & { expireAt: number }
>();
const CACHE_TTL = 5 * 60 * 1000;

const SINK_COLUMNS =
  'id, app_id, type, config, enabled, created_at, updated_at';

export async function getSinksForApp(
  db: Pool,
  appId: string
): Promise<SinkCacheState> {
  const cached = sinkCache.get(appId);

  if (cached && Date.now() < cached.expireAt) {
    return { sinks: cached.sinks, hasAny: cached.hasAny };
  }

  const state = await queryEnabledSinks(db, appId);
  sinkCache.set(appId, { ...state, expireAt: Date.now() + CACHE_TTL });
  return state;
}

export function invalidateSinkCache(appId: string): void {
  sinkCache.delete(appId);
}

async function queryEnabledSinks(db: Pool, appId: string): Promise<SinkCacheState> {
  const result = await db.query<AnalyticsSinkRow>(
    `select ${SINK_COLUMNS} from analytics_sinks where app_id = $1 and enabled = true`,
    [appId]
  );

  const sinks: AnalyticsSink[] = [];

  for (const row of result.rows) {
    const normalized = normalizeAnalyticsSinkRow(row);
    if (normalized) {
      sinks.push(normalized);
    }
  }

  if (sinks.length > 0) {
    return { sinks, hasAny: true };
  }

  const presence = await db.query<{ exists: number }>(
    'select 1 as exists from analytics_sinks where app_id = $1 limit 1',
    [appId]
  );

  const hasAny = (presence.rowCount ?? 0) > 0;
  return { sinks, hasAny };
}
