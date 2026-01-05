import { Express, Request, Response } from 'express';

import { createAnalyticsForwarder, type SDKEvent } from '../../lib/analytics';
import { getDb } from '../../lib/db';

type JsonObject = Record<string, unknown>;

type StoredEvent = {
  id: string;
  app_id: string;
  event_name: string;
  payload: JsonObject;
  created_at: string;
};

const SDK_EVENTS_PATH = '/v1/sdk/events';
export function registerEventsRoutes(app: Express): void {
  app.post(SDK_EVENTS_PATH, handleEvents);
}

async function handleEvents(req: Request, res: Response): Promise<void> {
  const body = asObject(req.body);

  if (!body) {
    sendValidationError(res, 'body must be an object');
    return;
  }

  const rawEvents = body.events;

  if (!Array.isArray(rawEvents)) {
    sendValidationError(res, 'events must be an array');
    return;
  }

  const parsed = parseEvents(rawEvents);

  if (parsed.error) {
    sendValidationError(res, parsed.error);
    return;
  }

  const deduped = dedupeEvents(parsed.events);

  if (deduped.length === 0) {
    res.status(200).json({ ok: true, inserted: 0 });
    return;
  }

  try {
    const db = getDb();
    const query = buildInsertQuery(deduped);
    const result = await db.query<{ id: string }>(query.sql, query.params);
    const inserted = result.rowCount ?? 0;
    const insertedIds = new Set(result.rows.map((row) => row.id));
    const insertedEvents = deduped.filter((event) => insertedIds.has(event.id));

    if (insertedEvents.length > 0) {
      void forwardAnalyticsEvents(insertedEvents).catch((error) => {
        console.warn('Failed to forward analytics events', error);
      });
    }

    res.status(200).json({ ok: true, inserted });
  } catch (error) {
    console.error('Failed to persist events', error);
    res.status(500).json({
      error: 'internal_error',
      message: 'failed to persist events'
    });
  }
}

function parseEvents(rawEvents: unknown[]): { events: StoredEvent[]; error?: string } {
  const events: StoredEvent[] = [];

  for (let index = 0; index < rawEvents.length; index += 1) {
    const rawEvent = asObject(rawEvents[index]);

    if (!rawEvent) {
      return { events: [], error: `events[${index}] must be an object` };
    }

    const eventId = readString(rawEvent.event_id);
    const eventName = readString(rawEvent.event_name);
    const timestamp = readString(rawEvent.timestamp);
    const appId = readString(rawEvent.app_id);

    if (!eventId) {
      return { events: [], error: `events[${index}].event_id is required` };
    }
    if (!eventName) {
      return { events: [], error: `events[${index}].event_name is required` };
    }
    if (!timestamp) {
      return { events: [], error: `events[${index}].timestamp is required` };
    }
    if (!appId) {
      return { events: [], error: `events[${index}].app_id is required` };
    }

  const createdAt = new Date(timestamp);

  if (Number.isNaN(createdAt.getTime())) {
      return { events: [], error: `events[${index}].timestamp is invalid` };
    }

    events.push({
      id: eventId,
      app_id: appId,
      event_name: eventName,
      payload: rawEvent,
      created_at: createdAt.toISOString()
    });
  }

  return { events };
}

function dedupeEvents(events: StoredEvent[]): StoredEvent[] {
  const unique = new Map<string, StoredEvent>();

  for (const event of events) {
    if (!unique.has(event.id)) {
      unique.set(event.id, event);
    }
  }

  return Array.from(unique.values());
}

function buildInsertQuery(
  events: StoredEvent[]
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const placeholders = events.map((event) => {
    params.push(
      event.id,
      event.app_id,
      event.event_name,
      serializePayload(event.payload),
      event.created_at
    );
    return '(?, ?, ?, ?, ?)';
  });

  return {
    sql: `insert into events (id, app_id, event_name, payload, created_at) values ${placeholders.join(
      ', '
    )} on conflict (id) do nothing returning id`,
    params
  };
}

function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  return value as JsonObject;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({
    error: 'invalid_request',
    message
  });
}

async function forwardAnalyticsEvents(events: StoredEvent[]): Promise<void> {
  const db = getDb();
  const grouped = new Map<string, StoredEvent[]>();

  for (const event of events) {
    const list = grouped.get(event.app_id);
    if (list) {
      list.push(event);
    } else {
      grouped.set(event.app_id, [event]);
    }
  }

  await Promise.all(
    Array.from(grouped.entries()).map(async ([appId, appEvents]) => {
      const forwarder = await createAnalyticsForwarder(db, appId);
      await Promise.all(
        appEvents.map((event) => forwarder.forward(event.payload as SDKEvent))
      );
    })
  );
}

function serializePayload(payload: JsonObject): string {
  try {
    return JSON.stringify(payload);
  } catch (error) {
    return '{}';
  }
}
