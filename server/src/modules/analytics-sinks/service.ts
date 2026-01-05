import { v4 as uuidv4 } from 'uuid';

import {
  type AnalyticsSink,
  type AnalyticsSinkConfig,
  type AnalyticsSinkRow,
  type AnalyticsSinkType,
  normalizeAnalyticsSinkRow
} from './types';
import type { D1Adapter } from '../../lib/db';

export type CreateAnalyticsSinkInput = {
  app_id: string;
  type: AnalyticsSinkType;
  config: AnalyticsSinkConfig;
  enabled: boolean;
};

export type UpdateAnalyticsSinkInput = {
  app_id?: string;
  type?: AnalyticsSinkType;
  config?: AnalyticsSinkConfig;
  enabled?: boolean;
};

const SINK_COLUMNS =
  'id, app_id, type, config, enabled, created_at, updated_at';

export async function listAnalyticsSinks(
  db: D1Adapter,
  appId?: string
): Promise<AnalyticsSink[]> {
  const result = appId
    ? await db.query<AnalyticsSinkRow>(
        `select ${SINK_COLUMNS} from analytics_sinks where app_id = ? order by created_at desc`,
        [appId]
      )
    : await db.query<AnalyticsSinkRow>(
        `select ${SINK_COLUMNS} from analytics_sinks order by created_at desc`
      );

  return normalizeRows(result.rows);
}

export async function getAnalyticsSinkById(
  db: D1Adapter,
  sinkId: string
): Promise<AnalyticsSink | null> {
  const result = await db.query<AnalyticsSinkRow>(
    `select ${SINK_COLUMNS} from analytics_sinks where id = ?`,
    [sinkId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return normalizeAnalyticsSinkRow(result.rows[0]) ?? null;
}

export async function createAnalyticsSink(
  db: D1Adapter,
  input: CreateAnalyticsSinkInput
): Promise<AnalyticsSink> {
  const now = new Date().toISOString();
  const id = uuidv4();
  const configJson = serializeConfig(input.config);
  const enabledValue = input.enabled ? 1 : 0;

  const result = await db.query<AnalyticsSinkRow>(
    `insert into analytics_sinks (id, app_id, type, config, enabled, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?)
     returning ${SINK_COLUMNS}`,
    [id, input.app_id, input.type, configJson, enabledValue, now, now]
  );

  const row = result.rows[0];
  const sink = row ? normalizeAnalyticsSinkRow(row) : null;

  if (!sink) {
    throw new Error('Failed to create analytics sink');
  }

  return sink;
}

export async function updateAnalyticsSink(
  db: D1Adapter,
  sinkId: string,
  input: UpdateAnalyticsSinkInput,
  existing: AnalyticsSink
): Promise<AnalyticsSink> {
  const nextAppId = input.app_id ?? existing.app_id;
  const nextType = input.type ?? existing.type;
  const nextConfig = input.config ?? existing.config;
  const nextEnabled = input.enabled ?? existing.enabled;
  const now = new Date().toISOString();
  const configJson = serializeConfig(nextConfig);
  const enabledValue = nextEnabled ? 1 : 0;

  const result = await db.query<AnalyticsSinkRow>(
    `update analytics_sinks
       set app_id = ?,
           type = ?,
           config = ?,
           enabled = ?,
           updated_at = ?
     where id = ?
     returning ${SINK_COLUMNS}`,
    [nextAppId, nextType, configJson, enabledValue, now, sinkId]
  );

  const row = result.rows[0];
  const sink = row ? normalizeAnalyticsSinkRow(row) : null;

  if (!sink) {
    throw new Error('Failed to update analytics sink');
  }

  return sink;
}

export async function deleteAnalyticsSink(
  db: D1Adapter,
  sinkId: string
): Promise<string | null> {
  const result = await db.query<{ app_id: string }>(
    'delete from analytics_sinks where id = ? returning app_id',
    [sinkId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0]?.app_id ?? null;
}

function normalizeRows(rows: AnalyticsSinkRow[]): AnalyticsSink[] {
  const sinks: AnalyticsSink[] = [];

  for (const row of rows) {
    const normalized = normalizeAnalyticsSinkRow(row);
    if (normalized) {
      sinks.push(normalized);
    }
  }

  return sinks;
}

function serializeConfig(config: AnalyticsSinkConfig): string {
  return JSON.stringify(config);
}
