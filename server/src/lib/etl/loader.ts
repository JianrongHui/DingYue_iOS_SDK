import type { Pool } from 'pg';

import type { FactEvent } from './types';

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

export async function loadFactEvents(pool: Pool, events: FactEvent[]): Promise<number> {
  if (events.length === 0) {
    return 0;
  }

  const values: unknown[] = [];
  const rows = events.map((event, index) => {
    const offset = index * FACT_EVENT_COLUMNS.length;
    values.push(...serializeEvent(event));
    const placeholders = FACT_EVENT_COLUMNS.map(
      (_column, columnIndex) => `$${offset + columnIndex + 1}`
    );
    return `(${placeholders.join(', ')})`;
  });

  const query = `insert into fact_events (${FACT_EVENT_COLUMNS.join(
    ', '
  )}) values ${rows.join(', ')} on conflict (event_id) do nothing returning event_id`;

  const result = await pool.query(query, values);
  return result.rowCount ?? 0;
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
