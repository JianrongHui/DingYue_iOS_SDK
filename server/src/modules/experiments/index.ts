import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type ExperimentRow = {
  id: string;
  app_id: string;
  placement_id: string;
  status: string;
  traffic: number;
  seed: string;
  created_at: string;
};

type ExperimentVariantRow = {
  experiment_id: string;
  variant_id: string;
  weight: number;
};

type ExperimentVariant = {
  variant_id: string;
  weight: number;
};

const EXPERIMENTS_PATH = '/v1/admin/experiments';
const ALLOWED_STATUSES = new Set(['draft', 'running', 'paused', 'ended']);

export function registerExperimentsRoutes(app: Hono<AppContext>): void {
  app.get(EXPERIMENTS_PATH, handleList);
  app.post(EXPERIMENTS_PATH, handleCreate);
  app.patch(`${EXPERIMENTS_PATH}/:experiment_id`, handleUpdate);
  app.delete(`${EXPERIMENTS_PATH}/:experiment_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    const placementId = readString(c.req.query('placement_id'));
    if (!appId || !placementId) {
      return sendValidationError(c, 'app_id and placement_id are required');
    }

    const db = c.get('db');
    const experiments = await db.query<ExperimentRow>(
      `select id, app_id, placement_id, status, traffic, seed, created_at
       from experiments where app_id = ? and placement_id = ?
       order by created_at desc`,
      [appId, placementId]
    );

    if (experiments.rows.length === 0) {
      return c.json([], 200);
    }

    const ids = experiments.rows.map((row) => row.id);
    const variants = await queryExperimentVariants(db, ids);
    const variantMap = groupVariantsByExperiment(variants);

    const response = experiments.rows.map((row) =>
      normalizeExperimentRow(row, variantMap.get(row.id) ?? [])
    );

    return c.json(response, 200);
  } catch (error) {
    console.error('Failed to list experiments', error);
    return sendInternalError(c, 'failed to list experiments');
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
    const status = readString(body.status);
    const traffic = readNumber(body.traffic);
    const seed = readString(body.seed);
    const variants = readVariants(body.variants);

    if (!appId || !placementId || !status || traffic === undefined || seed === undefined) {
      return sendValidationError(
        c,
        'app_id, placement_id, status, traffic, seed are required'
      );
    }

    if (!ALLOWED_STATUSES.has(status)) {
      return sendValidationError(c, 'status is invalid');
    }

    if (traffic === null || traffic < 0 || traffic > 100) {
      return sendValidationError(c, 'traffic must be between 0 and 100');
    }

    if (!variants || variants.length === 0) {
      return sendValidationError(c, 'variants are required');
    }

    const now = new Date().toISOString();
    const experimentId = createShortId('exp');
    const db = c.get('db');

    const statements = [
      {
        sql: `insert into experiments
          (id, app_id, placement_id, status, traffic, seed, created_at)
         values (?, ?, ?, ?, ?, ?, ?)`,
        params: [experimentId, appId, placementId, status, traffic, seed, now]
      },
      ...variants.map((variant) => ({
        sql: `insert into experiment_variants
          (id, experiment_id, variant_id, weight)
         values (?, ?, ?, ?)`,
        params: [createShortId('expvar'), experimentId, variant.variant_id, variant.weight]
      }))
    ];

    await db.batch(statements);

    return c.json(
      normalizeExperimentRow(
        {
          id: experimentId,
          app_id: appId,
          placement_id: placementId,
          status,
          traffic,
          seed,
          created_at: now
        },
        variants
      ),
      201
    );
  } catch (error) {
    console.error('Failed to create experiment', error);
    return sendInternalError(c, 'failed to create experiment');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const experimentId = readString(c.req.param('experiment_id'));
    if (!experimentId) {
      return sendValidationError(c, 'experiment_id is required');
    }

    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const status =
      Object.prototype.hasOwnProperty.call(body, 'status') ? readString(body.status) : undefined;
    const traffic =
      Object.prototype.hasOwnProperty.call(body, 'traffic') ? readNumber(body.traffic) : undefined;
    const variants =
      Object.prototype.hasOwnProperty.call(body, 'variants') ?
        readVariants(body.variants) :
        undefined;

    if (status === undefined && traffic === undefined && variants === undefined) {
      return sendValidationError(c, 'no fields to update');
    }

    if (status !== undefined && (!status || !ALLOWED_STATUSES.has(status))) {
      return sendValidationError(c, 'status is invalid');
    }

    if (traffic !== undefined && (traffic === null || traffic < 0 || traffic > 100)) {
      return sendValidationError(c, 'traffic must be between 0 and 100');
    }

    if (variants === null) {
      return sendValidationError(c, 'variants is invalid');
    }

    const db = c.get('db');
    const existing = await db.query<ExperimentRow>(
      `select id, app_id, placement_id, status, traffic, seed, created_at
       from experiments where id = ?`,
      [experimentId]
    );

    const current = existing.rows[0];
    if (!current) {
      return sendNotFound(c, 'experiment not found');
    }

    const nextStatus = status ?? current.status;
    const nextTraffic = traffic ?? current.traffic;
    const nextVariants = variants ?? (await queryExperimentVariants(db, [experimentId])).map(
      (row) => ({ variant_id: row.variant_id, weight: row.weight })
    );

    const statements = [
      {
        sql: `update experiments set status = ?, traffic = ? where id = ?`,
        params: [nextStatus, nextTraffic, experimentId]
      }
    ];

    if (variants !== undefined) {
      statements.push({
        sql: 'delete from experiment_variants where experiment_id = ?',
        params: [experimentId]
      });
      statements.push(
        ...nextVariants.map((variant) => ({
          sql: `insert into experiment_variants
            (id, experiment_id, variant_id, weight)
           values (?, ?, ?, ?)`,
          params: [createShortId('expvar'), experimentId, variant.variant_id, variant.weight]
        }))
      );
    }

    await db.batch(statements);

    return c.json(
      normalizeExperimentRow(
        {
          id: current.id,
          app_id: current.app_id,
          placement_id: current.placement_id,
          status: nextStatus,
          traffic: nextTraffic,
          seed: current.seed,
          created_at: current.created_at
        },
        nextVariants
      ),
      200
    );
  } catch (error) {
    console.error('Failed to update experiment', error);
    return sendInternalError(c, 'failed to update experiment');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const experimentId = readString(c.req.param('experiment_id'));
    if (!experimentId) {
      return sendValidationError(c, 'experiment_id is required');
    }

    const db = c.get('db');
    const existing = await db.query<{ id: string }>(
      'select id from experiments where id = ?',
      [experimentId]
    );
    if (existing.rowCount === 0) {
      return sendNotFound(c, 'experiment not found');
    }

    const statements = [
      {
        sql: 'delete from experiment_variants where experiment_id = ?',
        params: [experimentId]
      },
      {
        sql: 'delete from experiments where id = ?',
        params: [experimentId]
      }
    ];

    await db.batch(statements);
    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete experiment', error);
    return sendInternalError(c, 'failed to delete experiment');
  }
}

function normalizeExperimentRow(
  row: ExperimentRow,
  variants: ExperimentVariant[]
): {
  id: string;
  experiment_id: string;
  app_id: string;
  placement_id: string;
  status: string;
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
  created_at: string;
} {
  return {
    id: row.id,
    experiment_id: row.id,
    app_id: row.app_id,
    placement_id: row.placement_id,
    status: row.status,
    traffic: row.traffic,
    seed: row.seed,
    variants,
    created_at: row.created_at
  };
}

async function queryExperimentVariants(
  db: AppContext['Variables']['db'],
  experimentIds: string[]
): Promise<ExperimentVariantRow[]> {
  if (experimentIds.length === 0) {
    return [];
  }

  const placeholders = experimentIds.map(() => '?').join(', ');
  const result = await db.query<ExperimentVariantRow>(
    `select experiment_id, variant_id, weight
     from experiment_variants where experiment_id in (${placeholders})`,
    experimentIds
  );

  return result.rows;
}

function groupVariantsByExperiment(
  rows: ExperimentVariantRow[]
): Map<string, ExperimentVariant[]> {
  const map = new Map<string, ExperimentVariant[]>();
  for (const row of rows) {
    const list = map.get(row.experiment_id);
    const entry = { variant_id: row.variant_id, weight: row.weight };
    if (list) {
      list.push(entry);
    } else {
      map.set(row.experiment_id, [entry]);
    }
  }
  return map;
}

function createShortId(prefix: string): string {
  const seed = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${seed.slice(0, 6)}`;
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

function readNumber(value: unknown): number | null | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return;
}

function readVariants(value: unknown): ExperimentVariant[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const variants: ExperimentVariant[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }
    const payload = entry as Record<string, unknown>;
    const variantId = readString(payload.variant_id);
    const weight = readNumber(payload.weight);
    if (!variantId || weight === null || weight === undefined) {
      return null;
    }
    variants.push({ variant_id: variantId, weight });
  }

  return variants;
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
