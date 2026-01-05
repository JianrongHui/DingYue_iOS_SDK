import type { Context, Hono } from 'hono';

import { invalidateSinkCache } from '../../lib/analytics/cache';
import type { AppContext } from '../../types/hono';
import {
  createAnalyticsSink,
  deleteAnalyticsSink,
  getAnalyticsSinkById,
  listAnalyticsSinks,
  updateAnalyticsSink,
  type CreateAnalyticsSinkInput,
  type UpdateAnalyticsSinkInput
} from './service';
import {
  type AnalyticsSink,
  type AnalyticsSinkConfig,
  type AnalyticsSinkType,
  isAnalyticsSinkType,
  parseAnalyticsSinkConfig
} from './types';

type JsonObject = Record<string, unknown>;

const ANALYTICS_SINKS_PATH = '/v1/admin/analytics-sinks';

export function registerAnalyticsSinksRoutes(app: Hono<AppContext>): void {
  app.get(ANALYTICS_SINKS_PATH, handleList);
  app.post(ANALYTICS_SINKS_PATH, handleCreate);
  app.patch(`${ANALYTICS_SINKS_PATH}/:sink_id`, handleUpdate);
  app.delete(`${ANALYTICS_SINKS_PATH}/:sink_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    const db = c.get('db');
    const sinks = await listAnalyticsSinks(db, appId);

    return c.json({ sinks }, 200);
  } catch (error) {
    console.error('Failed to list analytics sinks', error);
    return sendInternalError(c, 'failed to list analytics sinks');
  }
}

async function handleCreate(c: Context<AppContext>): Promise<Response> {
  try {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (_error) {
      return sendValidationError(c, 'body must be an object');
    }

    const parsed = parseCreateBody(body);

    if (parsed.error) {
      return sendValidationError(c, parsed.error);
    }

    const db = c.get('db');
    const sink = await createAnalyticsSink(db, parsed.input);

    invalidateSinkCache(sink.app_id);
    return c.json({ sink }, 201);
  } catch (error) {
    console.error('Failed to create analytics sink', error);
    return sendInternalError(c, 'failed to create analytics sink');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const sinkId = readString(c.req.param('sink_id'));

    if (!sinkId) {
      return sendValidationError(c, 'sink_id is required');
    }

    const db = c.get('db');
    const existing = await getAnalyticsSinkById(db, sinkId);

    if (!existing) {
      return sendNotFound(c, 'analytics sink not found');
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch (_error) {
      return sendValidationError(c, 'body must be an object');
    }

    const parsed = parseUpdateBody(body, existing);

    if (parsed.error) {
      return sendValidationError(c, parsed.error);
    }

    const updated = await updateAnalyticsSink(db, sinkId, parsed.input, existing);

    if (updated.app_id !== existing.app_id) {
      invalidateSinkCache(existing.app_id);
    }
    invalidateSinkCache(updated.app_id);

    return c.json({ sink: updated }, 200);
  } catch (error) {
    console.error('Failed to update analytics sink', error);
    return sendInternalError(c, 'failed to update analytics sink');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const sinkId = readString(c.req.param('sink_id'));

    if (!sinkId) {
      return sendValidationError(c, 'sink_id is required');
    }

    const db = c.get('db');
    const appId = await deleteAnalyticsSink(db, sinkId);

    if (!appId) {
      return sendNotFound(c, 'analytics sink not found');
    }

    invalidateSinkCache(appId);
    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete analytics sink', error);
    return sendInternalError(c, 'failed to delete analytics sink');
  }
}

function parseCreateBody(body: unknown): { input: CreateAnalyticsSinkInput; error?: string } {
  const payload = asObject(body);

  if (!payload) {
    return { input: {} as CreateAnalyticsSinkInput, error: 'body must be an object' };
  }

  const appId = readString(payload.app_id);
  const typeValue = readString(payload.type);

  if (!appId) {
    return { input: {} as CreateAnalyticsSinkInput, error: 'app_id is required' };
  }

  if (!typeValue || !isAnalyticsSinkType(typeValue)) {
    return { input: {} as CreateAnalyticsSinkInput, error: 'type must be ga4 or firebase' };
  }

  const config = parseAnalyticsSinkConfig(typeValue, payload.config);

  if (!config) {
    return { input: {} as CreateAnalyticsSinkInput, error: 'config is invalid for type' };
  }

  const enabled = readBoolean(payload.enabled) ?? true;

  return {
    input: {
      app_id: appId,
      type: typeValue,
      config,
      enabled
    }
  };
}

function parseUpdateBody(
  body: unknown,
  existing: AnalyticsSink
): { input: UpdateAnalyticsSinkInput; error?: string } {
  const payload = asObject(body);

  if (!payload) {
    return { input: {} as UpdateAnalyticsSinkInput, error: 'body must be an object' };
  }

  const appId = readString(payload.app_id);
  const typeValue = readString(payload.type);
  const enabled = readBoolean(payload.enabled);
  const hasConfig = Object.prototype.hasOwnProperty.call(payload, 'config');

  let type: AnalyticsSinkType | undefined;
  if (typeValue) {
    if (!isAnalyticsSinkType(typeValue)) {
      return { input: {} as UpdateAnalyticsSinkInput, error: 'type must be ga4 or firebase' };
    }
    type = typeValue;
  }

  if (type && type !== existing.type && !hasConfig) {
    return {
      input: {} as UpdateAnalyticsSinkInput,
      error: 'config is required when changing type'
    };
  }

  let config: AnalyticsSinkConfig | undefined;
  if (hasConfig) {
    const resolvedType = type ?? existing.type;
    const parsedConfig = parseAnalyticsSinkConfig(resolvedType, payload.config);

    if (!parsedConfig) {
      return {
        input: {} as UpdateAnalyticsSinkInput,
        error: 'config is invalid for type'
      };
    }

    config = parsedConfig;
  }

  if (!appId && !type && enabled === undefined && !hasConfig) {
    return { input: {} as UpdateAnalyticsSinkInput, error: 'no fields to update' };
  }

  return {
    input: {
      app_id: appId,
      type,
      config,
      enabled
    }
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
