import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

import {
  type AnalyticsSink,
  type AnalyticsSinkConfig,
  type AnalyticsSinkRow,
  type AnalyticsSinkType,
  normalizeAnalyticsSinkRow
} from './types';

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
  pool: Pool,
  appId?: string
): Promise<AnalyticsSink[]> {
  const result = appId
    ? await pool.query<AnalyticsSinkRow>(
        `select ${SINK_COLUMNS} from analytics_sinks where app_id = $1 order by created_at desc`,
        [appId]
      )
    : await pool.query<AnalyticsSinkRow>(
        `select ${SINK_COLUMNS} from analytics_sinks order by created_at desc`
      );

  return normalizeRows(result.rows);
}

export async function getAnalyticsSinkById(
  pool: Pool,
  sinkId: string
): Promise<AnalyticsSink | null> {
  const result = await pool.query<AnalyticsSinkRow>(
    `select ${SINK_COLUMNS} from analytics_sinks where id = $1`,
    [sinkId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return normalizeAnalyticsSinkRow(result.rows[0]) ?? null;
}

export async function createAnalyticsSink(
  pool: Pool,
  input: CreateAnalyticsSinkInput
): Promise<AnalyticsSink> {
  const now = new Date().toISOString();
  const id = uuidv4();

  const result = await pool.query<AnalyticsSinkRow>(
    `insert into analytics_sinks (id, app_id, type, config, enabled, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${SINK_COLUMNS}`,
    [id, input.app_id, input.type, input.config, input.enabled, now, now]
  );

  const row = result.rows[0];
  const sink = row ? normalizeAnalyticsSinkRow(row) : null;

  if (!sink) {
    throw new Error('Failed to create analytics sink');
  }

  return sink;
}

export async function updateAnalyticsSink(
  pool: Pool,
  sinkId: string,
  input: UpdateAnalyticsSinkInput,
  existing: AnalyticsSink
): Promise<AnalyticsSink> {
  const nextAppId = input.app_id ?? existing.app_id;
  const nextType = input.type ?? existing.type;
  const nextConfig = input.config ?? existing.config;
  const nextEnabled = input.enabled ?? existing.enabled;
  const now = new Date().toISOString();

  const result = await pool.query<AnalyticsSinkRow>(
    `update analytics_sinks
       set app_id = $2,
           type = $3,
           config = $4,
           enabled = $5,
           updated_at = $6
     where id = $1
     returning ${SINK_COLUMNS}`,
    [sinkId, nextAppId, nextType, nextConfig, nextEnabled, now]
  );

  const row = result.rows[0];
  const sink = row ? normalizeAnalyticsSinkRow(row) : null;

  if (!sink) {
    throw new Error('Failed to update analytics sink');
  }

  return sink;
}

export async function deleteAnalyticsSink(
  pool: Pool,
  sinkId: string
): Promise<string | null> {
  const result = await pool.query<{ app_id: string }>(
    'delete from analytics_sinks where id = $1 returning app_id',
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
