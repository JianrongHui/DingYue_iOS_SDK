import { Express, Request, Response } from 'express';
import {
  assignExperiment,
  matchRulesets,
  type experiment,
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
  experiments: experiment[];
};

const SDK_CONFIG_PATH = '/v1/sdk/config';
const DEFAULT_TTL_SECONDS = 3600;
const MOCK_PLACEMENTS: PlacementConfig[] = [
  {
    placement_id: 'paywall_main',
    type: 'paywall',
    enabled: true,
    default_variant_id: 'v_2025_01',
    variants: [
      {
        variant_id: 'v_2025_01',
        package: {
          version: '2.1.0',
          cdn_url: 'https://cdn.your.com/paywall_2_1_0.zip',
          checksum: 'sha256:...',
          entry_path: 'dist/index.html',
          size_bytes: 1234567
        },
        offering: {
          offering_id: 'default',
          product_ids: ['com.app.weekly', 'com.app.yearly'],
          fallback_to_current_offering: true
        },
        page_options: {
          auto_close_on_success: true,
          auto_close_on_restore: true
        }
      },
      {
        variant_id: 'v_2025_02',
        package: {
          version: '2.2.0',
          cdn_url: 'https://cdn.your.com/paywall_2_2_0.zip',
          checksum: 'sha256:...',
          entry_path: 'dist/index.html',
          size_bytes: 1420000
        },
        offering: {
          offering_id: 'promo',
          product_ids: ['com.app.monthly', 'com.app.yearly'],
          fallback_to_current_offering: false
        },
        page_options: {
          auto_close_on_success: true,
          auto_close_on_restore: false
        }
      }
    ],
    rulesets: [
      {
        rule_set_id: 'rule_first_launch',
        priority: 100,
        condition: {
          all: [{ field: 'is_first_launch', op: 'eq', value: true }]
        },
        variant_id: 'v_2025_02',
        experiment_id: 'exp_first_launch'
      },
      {
        rule_set_id: 'rule_cn_locale',
        priority: 80,
        condition: {
          all: [{ field: 'country', op: 'eq', value: 'CN' }]
        },
        variant_id: 'v_2025_01'
      },
      {
        rule_set_id: 'rule_store_channel',
        priority: 10,
        condition: {
          all: [{ field: 'channel', op: 'in', value: ['appstore', 'googleplay'] }]
        },
        variant_id: 'v_2025_02'
      }
    ],
    experiments: [
      {
        experiment_id: 'exp_first_launch',
        seed: 'paywall_main_first_launch',
        traffic: 50,
        default_variant_id: 'v_2025_02',
        variants: [
          { variant_id: 'v_2025_02', weight: 60 },
          { variant_id: 'v_2025_01', weight: 40 }
        ]
      }
    ]
  }
];

export function registerConfigRoutes(app: Express): void {
  app.post(SDK_CONFIG_PATH, (req: Request, res: Response) => {
    const validationError = validateConfigRequest(req.body as ConfigRequest);

    if (validationError) {
      res.status(400).json({
        error: 'invalid_request',
        message: validationError
      });
      return;
    }

    res.status(200).json(buildConfigResponse(req.body as ConfigRequest));
  });
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildConfigResponse(body: ConfigRequest): ConfigResponse {
  const context = buildRulesContext(body);
  const userKey = resolveUserKey(body.user);

  return {
    ttl_seconds: DEFAULT_TTL_SECONDS,
    placements: MOCK_PLACEMENTS.map((placement) =>
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
  let variantId = placement.default_variant_id;
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
      if (experiment) {
        const assignment = assignExperiment(experiment, userKey);
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
    variant: resolveVariant(placement, variantId),
    rule_hit: ruleHit
  };
}

function resolveVariant(
  placement: PlacementConfig,
  variantId: string
): VariantConfig {
  const direct = placement.variants.find(
    (variant) => variant.variant_id === variantId
  );
  if (direct) {
    return direct;
  }

  const fallback =
    placement.variants.find(
      (variant) => variant.variant_id === placement.default_variant_id
    ) ?? placement.variants[0];

  if (!fallback) {
    throw new Error(`Placement ${placement.placement_id} has no variants`);
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
