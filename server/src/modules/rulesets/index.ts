import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type RuleSetRow = {
  id: string;
  app_id: string;
  placement_id: string;
  priority: number;
  condition: string;
  variant_id: string;
  experiment_id: string | null;
  created_at: string;
};

type ConditionGroup = {
  all?: unknown[];
  any?: unknown[];
};

const RULESETS_PATH = '/v1/admin/rulesets';

export function registerRulesetsRoutes(app: Hono<AppContext>): void {
  app.get(RULESETS_PATH, handleList);
  app.post(RULESETS_PATH, handleCreate);
  app.patch(`${RULESETS_PATH}/:rule_set_id`, handleUpdate);
  app.delete(`${RULESETS_PATH}/:rule_set_id`, handleDelete);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    const placementId = readString(c.req.query('placement_id'));
    if (!appId || !placementId) {
      return sendValidationError(c, 'app_id and placement_id are required');
    }

    const db = c.get('db');
    const result = await db.query<RuleSetRow>(
      `select id, app_id, placement_id, priority, condition, variant_id, experiment_id, created_at
       from rulesets where app_id = ? and placement_id = ?
       order by priority desc, created_at desc`,
      [appId, placementId]
    );

    return c.json(result.rows.map(normalizeRuleSetRow), 200);
  } catch (error) {
    console.error('Failed to list rulesets', error);
    return sendInternalError(c, 'failed to list rulesets');
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
    const priority = readNumber(body.priority);
    const condition = readCondition(body.condition);
    const variantId = readString(body.variant_id);
    const experimentId = readNullableString(body.experiment_id);

    if (!appId || !placementId || priority === undefined || priority === null || !variantId) {
      return sendValidationError(
        c,
        'app_id, placement_id, priority, variant_id are required'
      );
    }

    if (!condition) {
      return sendValidationError(c, 'condition is invalid');
    }

    const now = new Date().toISOString();
    const ruleSetId = createShortId('rule');
    const db = c.get('db');

    const result = await db.query<RuleSetRow>(
      `insert into rulesets
        (id, app_id, placement_id, priority, condition, variant_id, experiment_id, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       returning id, app_id, placement_id, priority, condition, variant_id, experiment_id, created_at`,
      [
        ruleSetId,
        appId,
        placementId,
        priority,
        JSON.stringify(condition),
        variantId,
        experimentId,
        now
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to create ruleset');
    }

    return c.json(normalizeRuleSetRow(row), 201);
  } catch (error) {
    console.error('Failed to create ruleset', error);
    return sendInternalError(c, 'failed to create ruleset');
  }
}

async function handleUpdate(c: Context<AppContext>): Promise<Response> {
  try {
    const ruleSetId = readString(c.req.param('rule_set_id'));
    if (!ruleSetId) {
      return sendValidationError(c, 'rule_set_id is required');
    }

    const body = await readJsonBody(c);
    if (!body) {
      return sendValidationError(c, 'body must be an object');
    }

    const priority =
      Object.prototype.hasOwnProperty.call(body, 'priority') ?
        readNumber(body.priority) :
        undefined;
    const condition =
      Object.prototype.hasOwnProperty.call(body, 'condition') ?
        readCondition(body.condition) :
        undefined;
    const variantId =
      Object.prototype.hasOwnProperty.call(body, 'variant_id') ?
        readString(body.variant_id) :
        undefined;
    const hasExperiment = Object.prototype.hasOwnProperty.call(body, 'experiment_id');
    const experimentId = hasExperiment ? readNullableString(body.experiment_id) : undefined;

    if (priority === undefined && condition === undefined && variantId === undefined && !hasExperiment) {
      return sendValidationError(c, 'no fields to update');
    }

    if (priority === null) {
      return sendValidationError(c, 'priority is invalid');
    }

    if (condition === null) {
      return sendValidationError(c, 'condition is invalid');
    }

    const db = c.get('db');
    const existing = await db.query<RuleSetRow>(
      `select id, app_id, placement_id, priority, condition, variant_id, experiment_id, created_at
       from rulesets where id = ?`,
      [ruleSetId]
    );

    const current = existing.rows[0];
    if (!current) {
      return sendNotFound(c, 'ruleset not found');
    }

    const nextPriority = priority ?? current.priority;
    const nextCondition =
      condition !== undefined ? condition : parseCondition(current.condition);
    const nextVariant = variantId ?? current.variant_id;
    const nextExperiment = hasExperiment ? experimentId ?? null : current.experiment_id;

    const result = await db.query<RuleSetRow>(
      `update rulesets
       set priority = ?, condition = ?, variant_id = ?, experiment_id = ?
       where id = ?
       returning id, app_id, placement_id, priority, condition, variant_id, experiment_id, created_at`,
      [
        nextPriority,
        JSON.stringify(nextCondition),
        nextVariant,
        nextExperiment,
        ruleSetId
      ]
    );

    const row = result.rows[0];
    if (!row) {
      return sendInternalError(c, 'failed to update ruleset');
    }

    return c.json(normalizeRuleSetRow(row), 200);
  } catch (error) {
    console.error('Failed to update ruleset', error);
    return sendInternalError(c, 'failed to update ruleset');
  }
}

async function handleDelete(c: Context<AppContext>): Promise<Response> {
  try {
    const ruleSetId = readString(c.req.param('rule_set_id'));
    if (!ruleSetId) {
      return sendValidationError(c, 'rule_set_id is required');
    }

    const db = c.get('db');
    const result = await db.query<{ id: string }>(
      'delete from rulesets where id = ? returning id',
      [ruleSetId]
    );

    if (result.rowCount === 0) {
      return sendNotFound(c, 'ruleset not found');
    }

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to delete ruleset', error);
    return sendInternalError(c, 'failed to delete ruleset');
  }
}

function normalizeRuleSetRow(row: RuleSetRow): {
  id: string;
  rule_set_id: string;
  app_id: string;
  placement_id: string;
  priority: number;
  condition: ConditionGroup;
  variant_id: string;
  experiment_id: string | null;
  created_at: string;
} {
  return {
    id: row.id,
    rule_set_id: row.id,
    app_id: row.app_id,
    placement_id: row.placement_id,
    priority: row.priority,
    condition: parseCondition(row.condition),
    variant_id: row.variant_id,
    experiment_id: row.experiment_id ?? null,
    created_at: row.created_at
  };
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

function readNullableString(value: unknown): string | null | undefined {
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

function readCondition(value: unknown): ConditionGroup | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as ConditionGroup;
  const all = Array.isArray(payload.all) ? payload.all : undefined;
  const any = Array.isArray(payload.any) ? payload.any : undefined;

  if ((!all || all.length === 0) && (!any || any.length === 0)) {
    return null;
  }

  return {
    all: all ?? undefined,
    any: any ?? undefined
  };
}

function parseCondition(value: string): ConditionGroup {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const payload = parsed as ConditionGroup;
      return {
        all: Array.isArray(payload.all) ? payload.all : undefined,
        any: Array.isArray(payload.any) ? payload.any : undefined
      };
    }
  } catch (_error) {
    return {};
  }

  return {};
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
