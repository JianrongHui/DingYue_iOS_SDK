import type { Pool } from 'pg';

import type { EtlCursor, RawEvent } from './types';

type EventRow = {
  id: string;
  app_id: string;
  event_name: string;
  payload: unknown;
  created_at: string | Date;
};

export async function getLastProcessedCursor(pool: Pool): Promise<EtlCursor | null> {
  const result = await pool.query<{ event_ts: string; event_id: string }>(
    'select event_ts, event_id from fact_events order by event_ts desc, event_id desc limit 1'
  );

  if (result.rows.length === 0) {
    return null;
  }

  return {
    event_ts: result.rows[0].event_ts,
    event_id: result.rows[0].event_id
  };
}

export async function extractNewEvents(
  pool: Pool,
  cursor?: EtlCursor | null,
  batchSize: number = 1000
): Promise<RawEvent[]> {
  const limit = Math.max(1, batchSize);

  if (!cursor) {
    const result = await pool.query<EventRow>(
      'select id, app_id, event_name, payload, created_at from events order by created_at asc, id asc limit $1',
      [limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      app_id: row.app_id,
      event_name: row.event_name,
      payload: row.payload,
      created_at: row.created_at
    }));
  }

  const result = await pool.query<EventRow>(
    'select id, app_id, event_name, payload, created_at from events where (created_at > $1::timestamptz) or (created_at = $1::timestamptz and id > $2) order by created_at asc, id asc limit $3',
    [cursor.event_ts, cursor.event_id, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    app_id: row.app_id,
    event_name: row.event_name,
    payload: row.payload,
    created_at: row.created_at
  }));
}
