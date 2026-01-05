import type { Context, Hono } from 'hono';

import { getFactEventsEtlStatus, runFactEventsEtl } from '../../lib/etl';
import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

const ETL_RUN_PATH = '/v1/admin/etl/run';
const ETL_STATUS_PATH = '/v1/admin/etl/status';

export function registerEtlRoutes(app: Hono<AppContext>): void {
  app.post(ETL_RUN_PATH, handleEtlRun);
  app.get(ETL_STATUS_PATH, handleEtlStatus);
}

async function handleEtlRun(c: Context<AppContext>): Promise<Response> {
  try {
    const rawBody = await readOptionalJson(c);
    if (rawBody === null) {
      return sendValidationError(c, 'body must be an object');
    }
    const body = asObject(rawBody);

    if (!body && rawBody !== undefined && rawBody !== null) {
      return sendValidationError(c, 'body must be an object');
    }

    const options = body ?? {};
    const batchSize = readPositiveInt(options.batch_size);
    const maxBatches = readPositiveInt(options.max_batches);

    if (options.batch_size !== undefined && batchSize === undefined) {
      return sendValidationError(c, 'batch_size must be a positive integer');
    }

    if (options.max_batches !== undefined && maxBatches === undefined) {
      return sendValidationError(c, 'max_batches must be a positive integer');
    }

    const db = c.get('db');
    const result = await runFactEventsEtl(db, {
      batchSize,
      maxBatches
    });

    return c.json(
      {
        ok: true,
        ...result
      },
      200
    );
  } catch (error) {
    console.error('Failed to run ETL', error);
    return sendInternalError(c, 'failed to run etl');
  }
}

async function handleEtlStatus(c: Context<AppContext>): Promise<Response> {
  try {
    const db = c.get('db');
    const status = await getFactEventsEtlStatus(db);

    return c.json(
      {
        ok: true,
        ...status
      },
      200
    );
  } catch (error) {
    console.error('Failed to fetch ETL status', error);
    return sendInternalError(c, 'failed to fetch etl status');
  }
}

function asObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  return value as JsonObject;
}

function readPositiveInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed;
  }

  return;
}

async function readOptionalJson(c: Context<AppContext>): Promise<unknown | undefined> {
  const rawText = await c.req.raw.clone().text();
  const trimmed = rawText.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
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
