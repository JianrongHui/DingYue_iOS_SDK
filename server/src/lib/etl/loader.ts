import type { FactEvent } from './types';
import type { D1Adapter } from '../db';

const FACT_EVENT_COLUMNS = [
  'id',
  'event_id',
  'event_name',
  'event_ts',
  'event_date',
  'app_id',
  'placement_id',
  'variant_id',
  'placement_version',
  'rc_app_user_id',
  'device_id',
  'session_id',
  'offering_id',
  'product_id',
  'price',
  'currency',
  'experiment_id',
  'rule_set_id',
  'sdk_version',
  'app_version',
  'os_version',
  'device_model',
  'locale',
  'timezone',
  'payload_json',
  'etl_processed_at'
] as const;

const SQLITE_MAX_VARIABLES = 999;
const MAX_ROWS_PER_INSERT = Math.max(
  1,
  Math.floor(SQLITE_MAX_VARIABLES / FACT_EVENT_COLUMNS.length)
);

export async function loadFactEvents(
  db: D1Adapter,
  events: FactEvent[]
): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  let inserted = 0;

  for (let i = 0; i < events.length; i += MAX_ROWS_PER_INSERT) {
    const chunk = events.slice(i, i + MAX_ROWS_PER_INSERT);
    const query = buildInsertQuery(chunk);
    const result = await db.execute(query.sql, query.params);
    inserted += result.changes;
  }

  return inserted;
}

function serializeEvent(event: FactEvent): unknown[] {
  return [
    event.id,
    event.event_id,
    event.event_name,
    event.event_ts,
    event.event_date,
    event.app_id,
    event.placement_id,
    event.variant_id,
    event.placement_version,
    event.rc_app_user_id,
    event.device_id,
    event.session_id,
    event.offering_id,
    event.product_id,
    event.price,
    event.currency,
    event.experiment_id,
    event.rule_set_id,
    event.sdk_version,
    event.app_version,
    event.os_version,
    event.device_model,
    event.locale,
    event.timezone,
    event.payload_json,
    event.etl_processed_at
  ];
}

function buildInsertQuery(
  events: FactEvent[]
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const rowPlaceholders = `(${FACT_EVENT_COLUMNS.map(() => '?').join(', ')})`;
  const rows = events.map((event) => {
    params.push(...serializeEvent(event));
    return rowPlaceholders;
  });

  return {
    sql: `insert into fact_events (${FACT_EVENT_COLUMNS.join(
      ', '
    )}) values ${rows.join(', ')} on conflict (event_id) do nothing`,
    params
  };
}
