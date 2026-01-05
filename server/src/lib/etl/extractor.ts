import type { EtlCursor, RawEvent } from './types';
import type { D1Adapter } from '../db';

type EventRow = {
  id: string;
  app_id: string;
  event_name: string;
  payload: unknown;
  created_at: string | Date;
};

export async function getLastProcessedCursor(
  db: D1Adapter
): Promise<EtlCursor | null> {
  const result = await db.query<{ event_ts: string; event_id: string }>(
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
  db: D1Adapter,
  cursor?: EtlCursor | null,
  batchSize: number = 1000
): Promise<RawEvent[]> {
  const limit = Math.max(1, batchSize);

  if (!cursor) {
    const result = await db.query<EventRow>(
      'select id, app_id, event_name, payload, created_at from events order by created_at asc, id asc limit ?',
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

  const result = await db.query<EventRow>(
    'select id, app_id, event_name, payload, created_at from events where (created_at > ?) or (created_at = ? and id > ?) order by created_at asc, id asc limit ?',
    [cursor.event_ts, cursor.event_ts, cursor.event_id, limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    app_id: row.app_id,
    event_name: row.event_name,
    payload: row.payload,
    created_at: row.created_at
  }));
}
