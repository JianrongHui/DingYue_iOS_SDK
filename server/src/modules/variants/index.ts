import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type VariantRow = {
  id: string;
  app_id: string;
  placement_id: string;
  package_id: string;
  offering_id: string | null;
  product_ids: string | null;
  priority: number;
  enabled: number;
  page_options: string | null;
  created_at: string;
};

type PageOptions = {
  auto_close_on_success: boolean;
  auto_close_on_restore: boolean;
};

const VARIANTS_PATH = '/v1/admin/variants';

export function registerVariantsRoutes(app: Hono<AppContext>): void {
  app.get(VARIANTS_PATH, handleList);
  app.post(VARIANTS_PATH, handleCreate);
  app.patch(`${VARIANTS_PATH}/:variant_id`, handleUpdate);
  app.delete(`${VARIANTS_PATH}/:variant_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    const placementId = readString(c.req.query('placement_id'));
    if (!appId || !placementId) {
      return sendValidationError(c, 'app_id and placement_id are required');
    }

    const db = c.get('db');
    const result = await db.query<VariantRow>(
      `select id, app_id, placement_id, package_id, offering_id, product_ids,
              priority, enabled, page_options, created_at
       from variants where app_id = ? and placement_id = ?
       order by priority asc, created_at desc`,
      [appId, placementId]
    );

    return c.json(result.rows.map(normalizeVariantRow), 200);
  } catch (error) {
    console.error('Failed to list variants', error);
    return sendInternalError(c, 'failed to list variants');
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
    const packageId = readString(body.package_id);
    const offeringId = readString(body.offering_id);
    const priority = readNumber(body.priority);
    const enabled = readBoolean(body.enabled) ?? true;
    const productIds = readStringArray(body.product_ids);
    const pageOptions = readPageOptions(body.page_options);

    if (!appId || !placementId || !packageId || priority === undefined || priority === null) {
      return sendValidationError(
        c,
        'app_id, placement_id, package_id, priority are required'
      );
    }

    if (productIds === null) {
      return sendValidationError(c, 'product_ids must be an array of strings');
    }

    if (pageOptions === null) {
      return sendValidationError(c, 'page_options is invalid');
    }

    const now = new Date().toISOString();
    const variantId = createShortId('var');
    const db = c.get('db');
    const result = await db.query<VariantRow>(
      `insert into variants
        (id, app_id, placement_id, package_id, offering_id, product_ids, priority,
         enabled, page_options, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       returning id, app_id, placement_id, package_id, offering_id, product_ids,
                 priority, enabled, page_options, created_at`,
      [
        variantId,
        appId,
        placementId,
        packageId,
        offeringId ?? null,
        JSON.stringify(productIds ?? []),
        priority,
        enabled ? 1 : 0,
        JSON.stringify(pageOptions ?? defaultPageOptions()),
        now
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to create variant');
    }

    return c.json(normalizeVariantRow(row), 201);
  } catch (error) {
    console.error('Failed to create variant', error);
    return sendInternalError(c, 'failed to create variant');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const variantId = readString(c.req.param('variant_id'));
    if (!variantId) {
      return sendValidationError(c, 'variant_id is required');
    }

    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const offeringId = readOptionalString(body.offering_id);
    const priority =
      Object.prototype.hasOwnProperty.call(body, 'priority') ?
        readNumber(body.priority) :
        undefined;
    const enabled =
      Object.prototype.hasOwnProperty.call(body, 'enabled') ?
        readBoolean(body.enabled) :
        undefined;
    const productIds =
      Object.prototype.hasOwnProperty.call(body, 'product_ids') ?
        readStringArray(body.product_ids) :
        undefined;
    const pageOptions =
      Object.prototype.hasOwnProperty.call(body, 'page_options') ?
        readPageOptions(body.page_options) :
        undefined;

    if (
      offeringId === undefined &&
      priority === undefined &&
      enabled === undefined &&
      productIds === undefined &&
      pageOptions === undefined
    ) {
      return sendValidationError(c, 'no fields to update');
    }

    if (priority === null) {
      return sendValidationError(c, 'priority must be a number');
    }

    if (
      Object.prototype.hasOwnProperty.call(body, 'enabled') &&
      enabled === undefined
    ) {
      return sendValidationError(c, 'enabled must be a boolean');
    }

    if (productIds === null) {
      return sendValidationError(c, 'product_ids must be an array of strings');
    }

    if (pageOptions === null) {
      return sendValidationError(c, 'page_options is invalid');
    }

    const db = c.get('db');
    const existing = await db.query<VariantRow>(
      `select id, app_id, placement_id, package_id, offering_id, product_ids,
              priority, enabled, page_options, created_at
       from variants where id = ?`,
      [variantId]
    );

    const current = existing.rows[0];
    if (!current) {
      return sendNotFound(c, 'variant not found');
    }

    const nextOffering = offeringId !== undefined ? offeringId : current.offering_id;
    const nextPriority = priority ?? current.priority;
    const nextEnabled = enabled ?? current.enabled === 1;
    const nextProductIds =
      productIds !== undefined ? productIds ?? [] : parseStringArray(current.product_ids);
    const nextPageOptions =
      pageOptions !== undefined
        ? pageOptions ?? defaultPageOptions()
        : parsePageOptions(current.page_options);

    const result = await db.query<VariantRow>(
      `update variants
       set offering_id = ?, product_ids = ?, priority = ?, enabled = ?, page_options = ?
       where id = ?
       returning id, app_id, placement_id, package_id, offering_id, product_ids,
                 priority, enabled, page_options, created_at`,
      [
        nextOffering ?? null,
        JSON.stringify(nextProductIds ?? []),
        nextPriority,
        nextEnabled ? 1 : 0,
        JSON.stringify(nextPageOptions ?? defaultPageOptions()),
        variantId
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to update variant');
    }

    return c.json(normalizeVariantRow(row), 200);
  } catch (error) {
    console.error('Failed to update variant', error);
    return sendInternalError(c, 'failed to update variant');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const variantId = readString(c.req.param('variant_id'));
    if (!variantId) {
      return sendValidationError(c, 'variant_id is required');
    }

    const db = c.get('db');
    const result = await db.query<{ id: string }>(
      'delete from variants where id = ? returning id',
      [variantId]
    );

    if (result.rowCount === 0) {
      return sendNotFound(c, 'variant not found');
    }

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete variant', error);
    return sendInternalError(c, 'failed to delete variant');
  }
}

function normalizeVariantRow(row: VariantRow): {
  id: string;
  variant_id: string;
  app_id: string;
  placement_id: string;
  package_id: string;
  offering_id: string;
  product_ids: string[];
  priority: number;
  enabled: boolean;
  page_options: PageOptions;
  created_at: string;
} {
  return {
    id: row.id,
    variant_id: row.id,
    app_id: row.app_id,
    placement_id: row.placement_id,
    package_id: row.package_id,
    offering_id: row.offering_id ?? '',
    product_ids: parseStringArray(row.product_ids),
    priority: row.priority,
    enabled: row.enabled === 1,
    page_options: parsePageOptions(row.page_options),
    created_at: row.created_at
  };
}

function createShortId(prefix: string): string {
  const seed = crypto.randomUUID().replace(/-/g, '');
  return `${prefix}_${seed.slice(0, 6)}`;
}

function defaultPageOptions(): PageOptions {
  return {
    auto_close_on_success: false,
    auto_close_on_restore: false
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

function readOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null;
  }

  return readString(value);
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

function readStringArray(value: unknown): string[] | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const items: string[] = [];
  for (const entry of value) {
    const str = readString(entry);
    if (!str) {
      return null;
    }
    items.push(str);
  }

  return items;
}

function readPageOptions(value: unknown): PageOptions | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Record<string, unknown>;
  const success = readBoolean(payload.auto_close_on_success);
  const restore = readBoolean(payload.auto_close_on_restore);

  if (success === undefined || restore === undefined) {
    return null;
  }

  return {
    auto_close_on_success: success,
    auto_close_on_restore: restore
  };
}

function parseStringArray(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((entry) => typeof entry === 'string');
    }
  } catch (_error) {
    return [];
  }

  return [];
}

function parsePageOptions(value: string | null): PageOptions {
  if (!value) {
    return defaultPageOptions();
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      const payload = parsed as Record<string, unknown>;
      const success = readBoolean(payload.auto_close_on_success) ?? false;
      const restore = readBoolean(payload.auto_close_on_restore) ?? false;
      return {
        auto_close_on_success: success,
        auto_close_on_restore: restore
      };
    }
  } catch (_error) {
    return defaultPageOptions();
  }

  return defaultPageOptions();
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
