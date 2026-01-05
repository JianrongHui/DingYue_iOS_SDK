import type { Pool } from 'pg';

import { extractNewEvents, getLastProcessedCursor } from './extractor';
import { loadFactEvents } from './loader';
import { transformEvent } from './transformer';
import type { EtlCursor, EtlRunOptions, EtlRunResult, EtlStatus, RawEvent } from './types';

const DEFAULT_BATCH_SIZE = 1000;

export async function runFactEventsEtl(
  pool: Pool,
  options: EtlRunOptions = {}
): Promise<EtlRunResult> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxBatches = options.maxBatches ?? Number.POSITIVE_INFINITY;
  let cursor = await getLastProcessedCursor(pool);
  let extracted = 0;
  let inserted = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const events = await extractNewEvents(pool, cursor, batchSize);

    if (events.length === 0) {
      break;
    }

    const processedAt = new Date().toISOString();
    const factEvents = events.map((event) => transformEvent(event, processedAt));
    const insertedCount = await loadFactEvents(pool, factEvents);

    extracted += events.length;
    inserted += insertedCount;
    batches += 1;
    cursor = buildCursorFromRawEvent(events[events.length - 1]);

    if (events.length < batchSize) {
      break;
    }
  }

  return {
    batches,
    extracted,
    inserted,
    last_cursor: cursor ?? undefined
  };
}

export async function getFactEventsEtlStatus(pool: Pool): Promise<EtlStatus> {
  const [cursor, factCount, sourceCount] = await Promise.all([
    getLastProcessedCursor(pool),
    countTable(pool, 'fact_events'),
    countTable(pool, 'events')
  ]);

  return {
    last_cursor: cursor ?? undefined,
    fact_events_count: factCount,
    source_events_count: sourceCount
  };
}

function buildCursorFromRawEvent(event: RawEvent): EtlCursor {
  return {
    event_ts: normalizeTimestamp(event.created_at) ?? new Date().toISOString(),
    event_id: event.id
  };
}

function normalizeTimestamp(value: string | Date): string | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return;
    }
    return value.toISOString();
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return;
  }

  return parsed.toISOString();
}

async function countTable(pool: Pool, table: 'fact_events' | 'events'): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*) as count from ${table}`
  );

  if (result.rows.length === 0) {
    return 0;
  }

  const parsed = Number(result.rows[0].count);
  return Number.isNaN(parsed) ? 0 : parsed;
}
