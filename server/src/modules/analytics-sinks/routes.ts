import { Express, Request, Response, Router } from 'express';

import { invalidateSinkCache } from '../../lib/analytics/cache';
import { getDb } from '../../lib/db';
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

export function registerAnalyticsSinksRoutes(app: Express): void {
  const router = Router();

  router.get(ANALYTICS_SINKS_PATH, handleList);
  router.post(ANALYTICS_SINKS_PATH, handleCreate);
  router.patch(`${ANALYTICS_SINKS_PATH}/:sink_id`, handleUpdate);
  router.delete(`${ANALYTICS_SINKS_PATH}/:sink_id`, handleDelete);

  app.use(router);
}

async function handleList(req: Request, res: Response): Promise<void> {
  try {
    const appId = readQueryString(req.query.app_id);
    const db = getDb();
    const sinks = await listAnalyticsSinks(db, appId);

    res.status(200).json({ sinks });
  } catch (error) {
    console.error('Failed to list analytics sinks', error);
    sendInternalError(res, 'failed to list analytics sinks');
  }
}

async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const parsed = parseCreateBody(req.body);

    if (parsed.error) {
      sendValidationError(res, parsed.error);
      return;
    }

    const db = getDb();
    const sink = await createAnalyticsSink(db, parsed.input);

    invalidateSinkCache(sink.app_id);
    res.status(201).json({ sink });
  } catch (error) {
    console.error('Failed to create analytics sink', error);
    sendInternalError(res, 'failed to create analytics sink');
  }
}

async function handleUpdate(req: Request, res: Response): Promise<void> {
  try {
    const sinkId = readString(req.params.sink_id);

    if (!sinkId) {
      sendValidationError(res, 'sink_id is required');
      return;
    }

    const db = getDb();
    const existing = await getAnalyticsSinkById(db, sinkId);

    if (!existing) {
      sendNotFound(res, 'analytics sink not found');
      return;
    }

    const parsed = parseUpdateBody(req.body, existing);

    if (parsed.error) {
      sendValidationError(res, parsed.error);
      return;
    }

    const updated = await updateAnalyticsSink(db, sinkId, parsed.input, existing);

    if (updated.app_id !== existing.app_id) {
      invalidateSinkCache(existing.app_id);
    }
    invalidateSinkCache(updated.app_id);

    res.status(200).json({ sink: updated });
  } catch (error) {
    console.error('Failed to update analytics sink', error);
    sendInternalError(res, 'failed to update analytics sink');
  }
}

async function handleDelete(req: Request, res: Response): Promise<void> {
  try {
    const sinkId = readString(req.params.sink_id);

    if (!sinkId) {
      sendValidationError(res, 'sink_id is required');
      return;
    }

    const db = getDb();
    const appId = await deleteAnalyticsSink(db, sinkId);

    if (!appId) {
      sendNotFound(res, 'analytics sink not found');
      return;
    }

    invalidateSinkCache(appId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to delete analytics sink', error);
    sendInternalError(res, 'failed to delete analytics sink');
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

function readQueryString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return readString(value[0]);
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

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({
    error: 'invalid_request',
    message
  });
}

function sendNotFound(res: Response, message: string): void {
  res.status(404).json({
    error: 'not_found',
    message
  });
}

function sendInternalError(res: Response, message: string): void {
  res.status(500).json({
    error: 'internal_error',
    message
  });
}
