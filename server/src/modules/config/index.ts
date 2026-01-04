import { Express, Request, Response } from 'express';

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

type ConfigResponse = {
  ttl_seconds: number;
  placements: Array<{
    placement_id: string;
    type: string;
    enabled: boolean;
    variant: {
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
    rule_hit: {
      rule_set_id: string;
      experiment_id: string;
    };
  }>;
  server_time: string;
};

const SDK_CONFIG_PATH = '/v1/sdk/config';

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

    res.status(200).json(buildSampleResponse());
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

function buildSampleResponse(): ConfigResponse {
  return {
    ttl_seconds: 3600,
    placements: [
      {
        placement_id: 'paywall_main',
        type: 'paywall',
        enabled: true,
        variant: {
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
        rule_hit: {
          rule_set_id: 'rule_us_new',
          experiment_id: 'exp_q1'
        }
      }
    ],
    // TODO: apply rules/experiments to decide placement and variant.
    server_time: new Date().toISOString()
  };
}
