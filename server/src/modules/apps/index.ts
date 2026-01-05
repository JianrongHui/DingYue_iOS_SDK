import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type AppRow = {
  id: string;
  app_id: string;
  app_key: string;
  name: string;
  env: string;
  status: string;
  created_at: string;
  updated_at: string;
};

const APPS_PATH = '/v1/admin/apps';
const ALLOWED_ENVS = new Set(['prod', 'staging']);
const ALLOWED_STATUSES = new Set(['active', 'disabled']);

export function registerAppsRoutes(app: Hono<AppContext>): void {
  app.get(APPS_PATH, handleList);
  app.post(APPS_PATH, handleCreate);
  app.patch(`${APPS_PATH}/:app_id`, handleUpdate);
  app.delete(`${APPS_PATH}/:app_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const db = c.get('db');
    const result = await db.query<AppRow>(
      'select id, app_id, app_key, name, env, status, created_at, updated_at from apps order by created_at desc'
    );

    return c.json(result.rows.map(normalizeAppRow), 200);
  } catch (error) {
    console.error('Failed to list apps', error);
    return sendInternalError(c, 'failed to list apps');
  }
}

async function handleCreate(c: Context<AppContext>): Promise<Response> {
  try {
    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const name = readString(body.name);
    const env = readString(body.env);

    if (!name) {
      return sendValidationError(c, 'name is required');
    }
    if (!env || !ALLOWED_ENVS.has(env)) {
      return sendValidationError(c, 'env must be prod or staging');
    }

    const appId = createShortId('app');
    const appKey = createShortId('key');
    const now = new Date().toISOString();

    const db = c.get('db');
    const result = await db.query<AppRow>(
      `insert into apps (id, app_id, app_key, name, env, status, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       returning id, app_id, app_key, name, env, status, created_at, updated_at`,
      [appId, appId, appKey, name, env, 'active', now, now]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to create app');
    }

    return c.json(normalizeAppRow(row), 201);
  } catch (error) {
    console.error('Failed to create app', error);
    return sendInternalError(c, 'failed to create app');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.param('app_id'));
    if (!appId) {
      return sendValidationError(c, 'app_id is required');
    }

    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const name = readString(body.name);
    const status = readString(body.status);

    if (!name && !status) {
      return sendValidationError(c, 'no fields to update');
    }

    if (status && !ALLOWED_STATUSES.has(status)) {
      return sendValidationError(c, 'status must be active or disabled');
    }

    const db = c.get('db');
    const existing = await db.query<AppRow>(
      'select id, app_id, app_key, name, env, status, created_at, updated_at from apps where app_id = ?',
      [appId]
    );

    const current = existing.rows[0];
    if (!current) {
      return sendNotFound(c, 'app not found');
    }

    const nextName = name ?? current.name;
    const nextStatus = status ?? current.status;
    const now = new Date().toISOString();

    const result = await db.query<AppRow>(
      `update apps
       set name = ?, status = ?, updated_at = ?
       where app_id = ?
       returning id, app_id, app_key, name, env, status, created_at, updated_at`,
      [nextName, nextStatus, now, appId]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to update app');
    }

    return c.json(normalizeAppRow(row), 200);
  } catch (error) {
    console.error('Failed to update app', error);
    return sendInternalError(c, 'failed to update app');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.param('app_id'));
    if (!appId) {
      return sendValidationError(c, 'app_id is required');
    }

    const db = c.get('db');
    const result = await db.query<{ app_id: string }>(
      'delete from apps where app_id = ? returning app_id',
      [appId]
    );

    if (result.rowCount === 0) {
      return sendNotFound(c, 'app not found');
    }

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete app', error);
    return sendInternalError(c, 'failed to delete app');
  }
}

function normalizeAppRow(row: AppRow): AppRow {
  return {
    id: row.id,
    app_id: row.app_id,
    app_key: row.app_key,
    name: row.name,
    env: row.env,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function createShortId(prefix: string): string {
  const seed = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${seed.slice(0, 8)}`;
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
