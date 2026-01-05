import type { Context, Hono } from 'hono';

import { createAnalyticsForwarder, type SDKEvent } from '../../lib/analytics';
import type { D1Adapter } from '../../lib/db';
import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type StoredEvent = {
  id: string;
  app_id: string;
  event_name: string;
  payload: JsonObject;
  created_at: string;
};

const SDK_EVENTS_PATH = '/v1/sdk/events';
export function registerEventsRoutes(app: Hono<AppContext>): void {
  app.post(SDK_EVENTS_PATH, handleEvents);
}

async function handleEvents(c: Context<AppContext>): Promise<Response> {
  const appId = c.get('appId');
  if (!appId) {
    return sendUnauthorized(c, 'missing app context');
  }

  let payload: unknown;
  try {
    payload = await c.req.json();
  } catch (_error) {
    return sendValidationError(c, 'body must be an object');
  }

  const body = asObject(payload);

  if (!body) {
    return sendValidationError(c, 'body must be an object');
  }

  const rawEvents = body.events;

  if (!Array.isArray(rawEvents)) {
    return sendValidationError(c, 'events must be an array');
  }

  const parsed = parseEvents(rawEvents, appId);

  if (parsed.error) {
    return sendValidationError(c, parsed.error);
  }

  const deduped = dedupeEvents(parsed.events);

  if (deduped.length === 0) {
    return c.json({ ok: true, inserted: 0 }, 200);
  }

  try {
    const db = c.get('db');
    const query = buildInsertQuery(deduped);
    const result = await db.query<{ id: string }>(query.sql, query.params);
    const inserted = result.rowCount ?? 0;
    const insertedIds = new Set(result.rows.map((row) => row.id));
    const insertedEvents = deduped.filter((event) => insertedIds.has(event.id));

    if (insertedEvents.length > 0) {
      void forwardAnalyticsEvents(db, insertedEvents, c.env).catch((error) => {
        console.warn('Failed to forward analytics events', error);
      });
    }

    return c.json({ ok: true, inserted }, 200);
  } catch (error) {
    console.error('Failed to persist events', error);
    return sendInternalError(c, 'failed to persist events');
  }
}

function parseEvents(
  rawEvents: unknown[],
  expectedAppId: string
): { events: StoredEvent[]; error?: string } {
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
    if (appId !== expectedAppId) {
      return { events: [], error: `events[${index}].app_id does not match X-App-Id` };
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

function sendValidationError(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'invalid_request',
      message
    },
    400
  );
}

function sendUnauthorized(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'unauthorized',
      message
    },
    401
  );
}

function sendInternalError(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'internal_error',
      message
    },
    500
  );
}

async function forwardAnalyticsEvents(
  db: D1Adapter,
  events: StoredEvent[],
  env: AppContext['Bindings']
): Promise<void> {
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
      const forwarder = await createAnalyticsForwarder(db, appId, env);
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
