export type AnalyticsSinkType = 'ga4' | 'firebase';

export type GA4Config = {
  measurement_id: string;
  api_secret: string;
};

export type FirebaseConfig = {
  app_id: string;
  api_secret: string;
};

export type AnalyticsSinkConfig = GA4Config | FirebaseConfig;

export type AnalyticsSink =
  | {
      id: string;
      app_id: string;
      type: 'ga4';
      config: GA4Config;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      app_id: string;
      type: 'firebase';
      config: FirebaseConfig;
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };

export type AnalyticsSinkRow = {
  id: string;
  app_id: string;
  type: string;
  config: unknown;
  enabled: unknown;
  created_at: string | Date | null;
  updated_at: string | Date | null;
};

export function isAnalyticsSinkType(value: string): value is AnalyticsSinkType {
  return value === 'ga4' || value === 'firebase';
}

export function parseAnalyticsSinkConfig(
  type: AnalyticsSinkType,
  raw: unknown
): AnalyticsSinkConfig | null {
  const config = parseObject(raw);

  if (!config) {
    return null;
  }

  if (type === 'ga4') {
    const measurementId = readString(config.measurement_id);
    const apiSecret = readString(config.api_secret);
    if (!measurementId || !apiSecret) {
      return null;
    }
    return { measurement_id: measurementId, api_secret: apiSecret };
  }

  const appId = readString(config.app_id);
  const apiSecret = readString(config.api_secret);
  if (!appId || !apiSecret) {
    return null;
  }
  return { app_id: appId, api_secret: apiSecret };
}

export function normalizeAnalyticsSinkRow(row: AnalyticsSinkRow): AnalyticsSink | null {
  const id = readString(row.id);
  const appId = readString(row.app_id);
  const type = readString(row.type);

  if (!id || !appId || !type || !isAnalyticsSinkType(type)) {
    return null;
  }

  const enabled = readEnabled(row.enabled);
  const createdAt = toIsoString(row.created_at);
  const updatedAt = toIsoString(row.updated_at);

  if (enabled === null || !createdAt || !updatedAt) {
    return null;
  }

  if (type === 'ga4') {
    const config = parseAnalyticsSinkConfig(type, row.config);
    if (!config || !('measurement_id' in config)) {
      return null;
    }
    return {
      id,
      app_id: appId,
      type,
      config,
      enabled,
      created_at: createdAt,
      updated_at: updatedAt
    };
  }

  if (type === 'firebase') {
    const config = parseAnalyticsSinkConfig(type, row.config);
    if (!config || !('app_id' in config)) {
      return null;
    }
    return {
      id,
      app_id: appId,
      type,
      config,
      enabled,
      created_at: createdAt,
      updated_at: updatedAt
    };
  }

  return null;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readEnabled(value: unknown): boolean | null {
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

  return null;
}

function toIsoString(value: string | Date | null): string | null {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}
