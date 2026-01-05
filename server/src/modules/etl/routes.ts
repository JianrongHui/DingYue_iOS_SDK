import { Express, Request, Response } from 'express';

import { getDb } from '../../lib/db';
import { getFactEventsEtlStatus, runFactEventsEtl } from '../../lib/etl';

type JsonObject = Record<string, unknown>;

const ETL_RUN_PATH = '/v1/admin/etl/run';
const ETL_STATUS_PATH = '/v1/admin/etl/status';

export function registerEtlRoutes(app: Express): void {
  app.post(ETL_RUN_PATH, handleEtlRun);
  app.get(ETL_STATUS_PATH, handleEtlStatus);
}

async function handleEtlRun(req: Request, res: Response): Promise<void> {
  try {
    const rawBody = req.body;
    const body = asObject(rawBody);

    if (!body && rawBody !== undefined && rawBody !== null) {
      sendValidationError(res, 'body must be an object');
      return;
    }

    const options = body ?? {};
    const batchSize = readPositiveInt(options.batch_size);
    const maxBatches = readPositiveInt(options.max_batches);

    if (options.batch_size !== undefined && batchSize === undefined) {
      sendValidationError(res, 'batch_size must be a positive integer');
      return;
    }

    if (options.max_batches !== undefined && maxBatches === undefined) {
      sendValidationError(res, 'max_batches must be a positive integer');
      return;
    }

    const db = getDb();
    const result = await runFactEventsEtl(db, {
      batchSize,
      maxBatches
    });

    res.status(200).json({
      ok: true,
      ...result
    });
  } catch (error) {
    console.error('Failed to run ETL', error);
    sendInternalError(res, 'failed to run etl');
  }
}

async function handleEtlStatus(_req: Request, res: Response): Promise<void> {
  try {
    const db = getDb();
    const status = await getFactEventsEtlStatus(db);

    res.status(200).json({
      ok: true,
      ...status
    });
  } catch (error) {
    console.error('Failed to fetch ETL status', error);
    sendInternalError(res, 'failed to fetch etl status');
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

function sendValidationError(res: Response, message: string): void {
  res.status(400).json({
    error: 'invalid_request',
    message
  });
}

function sendInternalError(res: Response, message: string): void {
  res.status(500).json({
    error: 'internal_error',
    message
  });
}
