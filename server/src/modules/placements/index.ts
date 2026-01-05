import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type PlacementRow = {
  id: string;
  app_id: string;
  placement_id: string;
  type: string;
  enabled: number;
  default_variant_id: string | null;
  created_at: string;
  updated_at: string;
};

const PLACEMENTS_PATH = '/v1/admin/placements';
const ALLOWED_TYPES = new Set(['paywall', 'guide']);

export function registerPlacementsRoutes(app: Hono<AppContext>): void {
  app.get(PLACEMENTS_PATH, handleList);
  app.post(PLACEMENTS_PATH, handleCreate);
  app.patch(`${PLACEMENTS_PATH}/:placement_id`, handleUpdate);
  app.delete(`${PLACEMENTS_PATH}/:placement_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    if (!appId) {
      return sendValidationError(c, 'app_id is required');
    }

    const db = c.get('db');
    const result = await db.query<PlacementRow>(
      `select id, app_id, placement_id, type, enabled, default_variant_id, created_at, updated_at
       from placements where app_id = ? order by created_at desc`,
      [appId]
    );

    return c.json(result.rows.map(normalizePlacementRow), 200);
  } catch (error) {
    console.error('Failed to list placements', error);
    return sendInternalError(c, 'failed to list placements');
  }
}

async function handleCreate(c: Context<AppContext>): Promise<Response> {
  try {
    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const appId = readString(body.app_id);
    const placementId = readString(body.placement_id);
    const type = readString(body.type);
    const enabled = readBoolean(body.enabled) ?? true;
    const hasDefaultVariant = Object.prototype.hasOwnProperty.call(
      body,
      'default_variant_id'
    );
    const defaultVariantId = hasDefaultVariant
      ? readNullableString(body.default_variant_id)
      : null;

    if (!appId || !placementId || !type) {
      return sendValidationError(c, 'app_id, placement_id, type are required');
    }
    if (!ALLOWED_TYPES.has(type)) {
      return sendValidationError(c, 'type must be paywall or guide');
    }
    if (hasDefaultVariant && defaultVariantId === undefined) {
      return sendValidationError(c, 'default_variant_id must be a string or null');
    }

    const now = new Date().toISOString();
    const db = c.get('db');
    const result = await db.query<PlacementRow>(
      `insert into placements
        (id, app_id, placement_id, type, enabled, default_variant_id, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       returning id, app_id, placement_id, type, enabled, default_variant_id, created_at, updated_at`,
      [
        placementId,
        appId,
        placementId,
        type,
        enabled ? 1 : 0,
        defaultVariantId ?? null,
        now,
        now
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to create placement');
    }

    return c.json(normalizePlacementRow(row), 201);
  } catch (error) {
    console.error('Failed to create placement', error);
    return sendInternalError(c, 'failed to create placement');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const placementId = readString(c.req.param('placement_id'));
    if (!placementId) {
      return sendValidationError(c, 'placement_id is required');
    }

    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const enabled =
      Object.prototype.hasOwnProperty.call(body, 'enabled') ?
        readBoolean(body.enabled) :
        undefined;
    const hasDefaultVariant = Object.prototype.hasOwnProperty.call(
      body,
      'default_variant_id'
    );
    const defaultVariantId = hasDefaultVariant
      ? readNullableString(body.default_variant_id)
      : undefined;

    if (enabled === undefined && !hasDefaultVariant) {
      return sendValidationError(c, 'no fields to update');
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'enabled') &&
      enabled === undefined
    ) {
      return sendValidationError(c, 'enabled must be a boolean');
    }
    if (hasDefaultVariant && defaultVariantId === undefined) {
      return sendValidationError(c, 'default_variant_id must be a string or null');
    }

    const db = c.get('db');
    const existing = await db.query<PlacementRow>(
      `select id, app_id, placement_id, type, enabled, default_variant_id, created_at, updated_at
       from placements where placement_id = ?`,
      [placementId]
    );

    const current = existing.rows[0];
    if (!current) {
      return sendNotFound(c, 'placement not found');
    }

    const nextEnabled = enabled ?? current.enabled === 1;
    const nextDefaultVariant = hasDefaultVariant ? defaultVariantId : current.default_variant_id;
    const now = new Date().toISOString();

    const result = await db.query<PlacementRow>(
      `update placements
       set enabled = ?, default_variant_id = ?, updated_at = ?
       where placement_id = ?
       returning id, app_id, placement_id, type, enabled, default_variant_id, created_at, updated_at`,
      [nextEnabled ? 1 : 0, nextDefaultVariant, now, placementId]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to update placement');
    }

    return c.json(normalizePlacementRow(row), 200);
  } catch (error) {
    console.error('Failed to update placement', error);
    return sendInternalError(c, 'failed to update placement');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const placementId = readString(c.req.param('placement_id'));
    if (!placementId) {
      return sendValidationError(c, 'placement_id is required');
    }

    const db = c.get('db');
    const result = await db.query<{ placement_id: string }>(
      'delete from placements where placement_id = ? returning placement_id',
      [placementId]
    );

    if (result.rowCount === 0) {
      return sendNotFound(c, 'placement not found');
    }

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete placement', error);
    return sendInternalError(c, 'failed to delete placement');
  }
}

function normalizePlacementRow(row: PlacementRow): {
  id: string;
  app_id: string;
  placement_id: string;
  type: string;
  enabled: boolean;
  default_variant_id: string | null;
  created_at: string;
} {
  return {
    id: row.id,
    app_id: row.app_id,
    placement_id: row.placement_id,
    type: row.type,
    enabled: row.enabled === 1,
    default_variant_id: row.default_variant_id ?? null,
    created_at: row.created_at
  };
}

async function readJsonBody(c: Context<AppContext>): Promise<JsonObject | null> {
  try {
    const parsed = await c.req.json();
    return asObject(parsed) ?? null;
  } catch (_error) {
    return null;
  }
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

function readNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readString(value);
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
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

function sendNotFound(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'not_found',
      message
    },
    404
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
