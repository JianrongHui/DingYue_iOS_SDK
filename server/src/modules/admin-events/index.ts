import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type EventRow = {
  id: string;
  app_id: string;
  event_name: string;
  payload: string;
  created_at: string;
};

type EventDetail = {
  event_id: string;
  event_name: string;
  timestamp: string;
  app_id: string;
  placement_id: string;
  variant_id: string;
  device_id: string;
  product_id?: string;
  price?: number;
  currency?: string;
};

const EVENTS_PATH = '/v1/admin/events';

export function registerAdminEventsRoutes(app: Hono<AppContext>): void {
  app.get(EVENTS_PATH, handleQuery);
}

async function handleQuery(c: Context<AppContext>): Promise<Response> {
  try {
    const url = new URL(c.req.url);
    const appId = readString(url.searchParams.get('app_id'));
    const from = readString(url.searchParams.get('from'));
    const to = readString(url.searchParams.get('to'));
    const placementId = readString(url.searchParams.get('placement_id'));
    const eventNames = url.searchParams
      .getAll('event_name')
      .map((name) => name.trim())
      .filter(Boolean);

    if (!appId || !from || !to) {
      return sendValidationError(c, 'app_id, from, to are required');
    }

    const conditions: string[] = ['app_id = ?', 'created_at >= ?', 'created_at <= ?'];
    const params: unknown[] = [appId, from, to];

    if (eventNames.length > 0) {
      conditions.push(`event_name in (${eventNames.map(() => '?').join(', ')})`);
      params.push(...eventNames);
    }

    if (placementId) {
      conditions.push(`json_extract(payload, '$.placement_id') = ?`);
      params.push(placementId);
    }

    const db = c.get('db');
    const result = await db.query<EventRow>(
      `select id, app_id, event_name, payload, created_at
       from events where ${conditions.join(' and ')}
       order by created_at desc`,
      params
    );

    const response: EventDetail[] = result.rows.map((row) => normalizeEventRow(row));
    return c.json(response, 200);
  } catch (error) {
    console.error('Failed to query events', error);
    return sendInternalError(c, 'failed to query events');
  }
}

function normalizeEventRow(row: EventRow): EventDetail {
  const payload = parsePayload(row.payload);
  const eventId = readString(payload.event_id) ?? row.id;
  const timestamp = readString(payload.timestamp) ?? row.created_at;
  const placementId = readString(payload.placement_id) ?? '';
  const variantId = readString(payload.variant_id) ?? '';
  const deviceId = readString(payload.device_id) ?? '';

  const detail: EventDetail = {
    event_id: eventId,
    event_name: row.event_name,
    timestamp,
    app_id: row.app_id,
    placement_id: placementId,
    variant_id: variantId,
    device_id: deviceId
  };

  const productId = readString(payload.product_id);
  if (productId) {
    detail.product_id = productId;
  }
  const price = readNumber(payload.price);
  if (price !== undefined) {
    detail.price = price;
  }
  const currency = readString(payload.currency);
  if (currency) {
    detail.currency = currency;
  }

  return detail;
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (_error) {
    return {};
  }

  return {};
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return;
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

function sendInternalError(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'internal_error',
      message
    },
    500
  );
}
