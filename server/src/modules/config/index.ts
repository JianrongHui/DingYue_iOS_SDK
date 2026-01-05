import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';
import {
  assignExperiment,
  matchRulesets,
  type condition,
  type experiment_variant,
  type rules_context,
  type ruleset
} from '../../lib/rules';

type ConfigRequest = {
  sdk?: {
    version?: string;
    build?: number;
  };
  app?: {
    bundle_id?: string;
    version?: string;
    build?: string;
  };
  device?: {
    os_version?: string;
    model?: string;
    locale?: string;
    timezone?: string;
    ip_country?: string;
  };
  user?: {
    rc_app_user_id?: string;
    app_user_id?: string;
    device_id?: string;
  };
  session?: {
    is_first_launch?: boolean;
    session_count?: number;
    install_days?: number;
  };
  attributes?: {
    channel?: string;
    custom?: Record<string, unknown>;
  };
};

type VariantConfig = {
  variant_id: string;
  package: {
    version: string;
    cdn_url: string;
    checksum: string;
    entry_path: string;
    size_bytes: number;
  };
  offering: {
    offering_id: string;
    product_ids: string[];
    fallback_to_current_offering: boolean;
  };
  page_options: {
    auto_close_on_success: boolean;
    auto_close_on_restore: boolean;
  };
};

type RuleHit = {
  rule_set_id: string | null;
  experiment_id: string | null;
};

type PlacementResponse = {
  placement_id: string;
  type: string;
  enabled: boolean;
  variant: VariantConfig;
  rule_hit: RuleHit;
};

type ConfigResponse = {
  ttl_seconds: number;
  placements: PlacementResponse[];
  server_time: string;
};

type PlacementConfig = {
  placement_id: string;
  type: string;
  enabled: boolean;
  default_variant_id: string;
  variants: VariantConfig[];
  rulesets: ruleset[];
  experiments: ExperimentRecord[];
};

const SDK_CONFIG_PATH = '/v1/sdk/config';
const DEFAULT_TTL_SECONDS = 3600;
const DEFAULT_PAGE_OPTIONS: VariantConfig['page_options'] = {
  auto_close_on_success: false,
  auto_close_on_restore: false
};

type PlacementRow = {
  placement_id: string;
  type: string;
  enabled: number;
  default_variant_id: string | null;
};

type VariantRow = {
  id: string;
  placement_id: string;
  package_id: string;
  offering_id: string | null;
  product_ids: string | null;
  priority: number;
  enabled: number;
  page_options: string | null;
};

type VariantEntry = {
  config: VariantConfig;
  priority: number;
};

type PackageRow = {
  id: string;
  placement_id: string;
  version: string;
  checksum: string;
  entry_path: string;
  cdn_url: string;
  size_bytes: number;
};

type RulesetRow = {
  id: string;
  placement_id: string;
  priority: number;
  condition: string;
  variant_id: string;
  experiment_id: string | null;
};

type ExperimentRow = {
  id: string;
  placement_id: string;
  status: string;
  traffic: number;
  seed: string;
};

type ExperimentVariantRow = {
  experiment_id: string;
  variant_id: string;
  weight: number;
};

type ExperimentRecord = {
  experiment_id: string;
  status: string;
  traffic: number;
  seed: string;
  variants: experiment_variant[];
};

export function registerConfigRoutes(app: Hono<AppContext>): void {
  app.post(SDK_CONFIG_PATH, handleConfigRequest);
}

async function handleConfigRequest(c: Context<AppContext>): Promise<Response> {
  let body: ConfigRequest | undefined;

  try {
    body = (await c.req.json()) as ConfigRequest;
  } catch (_error) {
    return sendValidationError(c, 'body must be an object');
  }

  const validationError = validateConfigRequest(body);

  if (validationError) {
    return sendValidationError(c, validationError);
  }

  const appId = c.get('appId');
  if (!appId) {
    return sendUnauthorized(c, 'missing app context');
  }

  try {
    const placements = await loadPlacementConfigs(c.get('db'), appId);
    return c.json(buildConfigResponse(body, placements), 200);
  } catch (error) {
    console.error('Failed to load config', error);
    return sendInternalError(c, 'failed to load config');
  }
}

function validateConfigRequest(body: ConfigRequest | undefined): string | null {
  if (!body || typeof body !== 'object') {
    return 'body must be an object';
  }

  if (!body.sdk || !isNonEmptyString(body.sdk.version)) {
    return 'sdk.version is required';
  }

  if (!body.app || !isNonEmptyString(body.app.bundle_id)) {
    return 'app.bundle_id is required';
  }

  if (!body.device || !isNonEmptyString(body.device.model)) {
    return 'device.model is required';
  }

  const hasUserIdentifier =
    isNonEmptyString(body.user?.rc_app_user_id) ||
    isNonEmptyString(body.user?.app_user_id) ||
    isNonEmptyString(body.user?.device_id);

  if (!hasUserIdentifier) {
    return 'user identifier is required';
  }

  return null;
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

function sendUnauthorized(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'unauthorized',
      message
    },
    401
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildConfigResponse(
  body: ConfigRequest,
  placements: PlacementConfig[]
): ConfigResponse {
  const context = buildRulesContext(body);
  const userKey = resolveUserKey(body.user);

  return {
    ttl_seconds: DEFAULT_TTL_SECONDS,
    placements: placements.map((placement) =>
      buildPlacementResponse(placement, context, userKey)
    ),
    server_time: new Date().toISOString()
  };
}

function buildPlacementResponse(
  placement: PlacementConfig,
  context: rules_context,
  userKey: string
): PlacementResponse {
  const match = matchRulesets(placement.rulesets, context);
  const fallbackVariantId = resolveFallbackVariantId(
    placement.variants,
    placement.default_variant_id
  );
  let variantId = fallbackVariantId;
  let ruleHit: RuleHit = { rule_set_id: null, experiment_id: null };

  if (match) {
    ruleHit = {
      rule_set_id: match.rule_set_id,
      experiment_id: match.experiment_id ?? null
    };

    if (match.experiment_id) {
      const experiment = placement.experiments.find(
        (item) => item.experiment_id === match.experiment_id
      );
      if (experiment && experiment.status === 'running') {
        const assignment = assignExperiment(
          {
            experiment_id: experiment.experiment_id,
            seed: experiment.seed,
            traffic: experiment.traffic,
            variants: experiment.variants,
            default_variant_id: match.variant_id
          },
          userKey
        );
        variantId = assignment.variant_id;
      } else {
        variantId = match.variant_id;
      }
    } else {
      variantId = match.variant_id;
    }
  }

  return {
    placement_id: placement.placement_id,
    type: placement.type,
    enabled: placement.enabled,
    variant: resolveVariant(placement.variants, variantId, fallbackVariantId),
    rule_hit: ruleHit
  };
}

function resolveVariant(
  variants: VariantConfig[],
  variantId: string,
  fallbackVariantId: string
): VariantConfig {
  const direct = variants.find((variant) => variant.variant_id === variantId);
  if (direct) {
    return direct;
  }

  const fallback =
    variants.find((variant) => variant.variant_id === fallbackVariantId) ??
    variants[0];

  if (!fallback) {
    throw new Error('No variants available for placement');
  }

  return fallback;
}

function buildRulesContext(body: ConfigRequest): rules_context {
  return {
    country: body.device?.ip_country,
    locale: body.device?.locale,
    app_version: body.app?.version,
    os_version: body.device?.os_version,
    channel: body.attributes?.channel,
    is_first_launch: body.session?.is_first_launch,
    session_count: body.session?.session_count,
    install_days: body.session?.install_days,
    custom: body.attributes?.custom
  };
}

function resolveUserKey(user: ConfigRequest['user']): string {
  if (isNonEmptyString(user?.rc_app_user_id)) {
    return user.rc_app_user_id;
  }

  if (isNonEmptyString(user?.device_id)) {
    return user.device_id;
  }

  if (isNonEmptyString(user?.app_user_id)) {
    return user.app_user_id;
  }

  return 'anonymous';
}

async function loadPlacementConfigs(
  db: AppContext['Variables']['db'],
  appId: string
): Promise<PlacementConfig[]> {
  const [
    placementsResult,
    variantsResult,
    packagesResult,
    rulesetsResult,
    experimentsResult
  ] = await Promise.all([
    db.query<PlacementRow>(
      `select placement_id, type, enabled, default_variant_id
       from placements where app_id = ?`,
      [appId]
    ),
    db.query<VariantRow>(
      `select id, placement_id, package_id, offering_id, product_ids, priority, enabled, page_options
       from variants where app_id = ?`,
      [appId]
    ),
    db.query<PackageRow>(
      `select id, placement_id, version, checksum, entry_path, cdn_url, size_bytes
       from packages where app_id = ?`,
      [appId]
    ),
    db.query<RulesetRow>(
      `select id, placement_id, priority, condition, variant_id, experiment_id
       from rulesets where app_id = ?`,
      [appId]
    ),
    db.query<ExperimentRow>(
      `select id, placement_id, status, traffic, seed
       from experiments where app_id = ?`,
      [appId]
    )
  ]);

  const packagesById = new Map<string, PackageRow>();
  for (const row of packagesResult.rows) {
    packagesById.set(row.id, row);
  }

  const variantsByPlacement = new Map<string, VariantEntry[]>();
  for (const row of variantsResult.rows) {
    if (row.enabled !== 1) {
      continue;
    }
    const packageRow = packagesById.get(row.package_id);
    if (!packageRow) {
      console.warn(
        'Package missing for variant',
        row.id,
        'package_id',
        row.package_id
      );
      continue;
    }
    const variantConfig = buildVariantConfig(row, packageRow);
    const entry: VariantEntry = { config: variantConfig, priority: row.priority };
    const list = variantsByPlacement.get(row.placement_id);
    if (list) {
      list.push(entry);
    } else {
      variantsByPlacement.set(row.placement_id, [entry]);
    }
  }

  for (const list of variantsByPlacement.values()) {
    list.sort((left, right) => left.priority - right.priority);
  }

  const rulesetsByPlacement = new Map<string, ruleset[]>();
  for (const row of rulesetsResult.rows) {
    const parsedCondition = parseCondition(row.condition);
    if (!parsedCondition) {
      console.warn('Invalid ruleset condition', row.id);
      continue;
    }
    const record: ruleset = {
      rule_set_id: row.id,
      priority: row.priority,
      condition: parsedCondition,
      variant_id: row.variant_id,
      experiment_id: row.experiment_id ?? undefined
    };
    const list = rulesetsByPlacement.get(row.placement_id);
    if (list) {
      list.push(record);
    } else {
      rulesetsByPlacement.set(row.placement_id, [record]);
    }
  }

  const experimentsByPlacement = new Map<string, ExperimentRecord[]>();
  const experimentIds = experimentsResult.rows.map((row) => row.id);
  const experimentVariants = await queryExperimentVariants(db, experimentIds);
  const variantsByExperiment = groupExperimentVariants(experimentVariants);

  for (const row of experimentsResult.rows) {
    const variants = variantsByExperiment.get(row.id) ?? [];
    const record: ExperimentRecord = {
      experiment_id: row.id,
      status: row.status,
      traffic: row.traffic,
      seed: row.seed,
      variants
    };
    const list = experimentsByPlacement.get(row.placement_id);
    if (list) {
      list.push(record);
    } else {
      experimentsByPlacement.set(row.placement_id, [record]);
    }
  }

  const placements: PlacementConfig[] = [];
  for (const row of placementsResult.rows) {
    if (!isPlacementType(row.type)) {
      console.warn('Invalid placement type', row.placement_id, row.type);
      continue;
    }

    const variantEntries = variantsByPlacement.get(row.placement_id) ?? [];
    const variants = variantEntries.map((entry) => entry.config);
    if (variants.length === 0) {
      console.warn('No variants for placement', row.placement_id);
      continue;
    }

    placements.push({
      placement_id: row.placement_id,
      type: row.type,
      enabled: row.enabled === 1,
      default_variant_id: resolveFallbackVariantId(variants, row.default_variant_id),
      variants,
      rulesets: rulesetsByPlacement.get(row.placement_id) ?? [],
      experiments: experimentsByPlacement.get(row.placement_id) ?? []
    });
  }

  return placements;
}

function buildVariantConfig(row: VariantRow, pkg: PackageRow): VariantConfig {
  return {
    variant_id: row.id,
    package: {
      version: pkg.version,
      cdn_url: pkg.cdn_url,
      checksum: pkg.checksum,
      entry_path: pkg.entry_path,
      size_bytes: pkg.size_bytes
    },
    offering: {
      offering_id: row.offering_id ?? '',
      product_ids: parseStringArray(row.product_ids),
      fallback_to_current_offering: true
    },
    page_options: parsePageOptions(row.page_options)
  };
}

function parseCondition(value: string): condition | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as condition;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function parsePageOptions(value: string | null): VariantConfig['page_options'] {
  if (!value) {
    return DEFAULT_PAGE_OPTIONS;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const payload = parsed as Record<string, unknown>;
      const success = readBoolean(payload.auto_close_on_success);
      const restore = readBoolean(payload.auto_close_on_restore);
      if (success !== undefined && restore !== undefined) {
        return {
          auto_close_on_success: success,
          auto_close_on_restore: restore
        };
      }
    }
  } catch (_error) {
    return DEFAULT_PAGE_OPTIONS;
  }

  return DEFAULT_PAGE_OPTIONS;
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

function resolveFallbackVariantId(
  variants: VariantConfig[],
  defaultVariantId: string | null
): string {
  if (defaultVariantId) {
    const match = variants.find((variant) => variant.variant_id === defaultVariantId);
    if (match) {
      return match.variant_id;
    }
  }

  return variants[0]?.variant_id ?? '';
}

function isPlacementType(value: string): value is 'paywall' | 'guide' {
  return value === 'paywall' || value === 'guide';
}

async function queryExperimentVariants(
  db: AppContext['Variables']['db'],
  experimentIds: string[]
): Promise<ExperimentVariantRow[]> {
  if (experimentIds.length === 0) {
    return [];
  }

  const results: ExperimentVariantRow[] = [];
  const chunkSize = 200;
  for (let index = 0; index < experimentIds.length; index += chunkSize) {
    const chunk = experimentIds.slice(index, index + chunkSize);
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db.query<ExperimentVariantRow>(
      `select experiment_id, variant_id, weight
       from experiment_variants where experiment_id in (${placeholders})`,
      chunk
    );
    results.push(...result.rows);
  }

  return results;
}

function groupExperimentVariants(
  rows: ExperimentVariantRow[]
): Map<string, experiment_variant[]> {
  const map = new Map<string, experiment_variant[]>();
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
