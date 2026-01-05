import { v4 as uuidv4 } from 'uuid';

import type { FactEvent, RawEvent } from './types';

type JsonObject = Record<string, unknown>;

export function transformEvent(raw: RawEvent, processedAt: string): FactEvent {
  const payload = normalizePayload(raw.payload);
  const device = asObject(payload.device);
  const app = asObject(payload.app);
  const sdk = asObject(payload.sdk);

  const eventId = readString(payload.event_id) ?? raw.id;
  const eventTs =
    normalizeTimestamp(readString(payload.timestamp)) ??
    normalizeTimestamp(raw.created_at) ??
    new Date().toISOString();

  return {
    id: uuidv4(),
    event_id: eventId,
    event_name: raw.event_name,
    event_ts: eventTs,
    event_date: eventTs.slice(0, 10),
    app_id: raw.app_id,
    placement_id: readString(payload.placement_id) ?? null,
    variant_id: readString(payload.variant_id) ?? null,
    placement_version: readString(payload.placement_version) ?? null,
    rc_app_user_id: readString(payload.rc_app_user_id) ?? null,
    device_id: readString(payload.device_id) ?? null,
    session_id: readString(payload.session_id) ?? null,
    offering_id: readString(payload.offering_id) ?? null,
    product_id: readString(payload.product_id) ?? null,
    price: readNumber(payload.price) ?? null,
    currency: readString(payload.currency) ?? null,
    experiment_id: readString(payload.experiment_id) ?? null,
    rule_set_id: readString(payload.rule_set_id) ?? null,
    sdk_version: readString(payload.sdk_version) ?? readString(sdk?.version) ?? null,
    app_version: readString(payload.app_version) ?? readString(app?.version) ?? null,
    os_version: readString(payload.os_version) ?? readString(device?.os_version) ?? null,
    device_model: readString(payload.device_model) ?? readString(device?.model) ?? null,
    locale: readString(payload.locale) ?? readString(device?.locale) ?? null,
    timezone: readString(payload.timezone) ?? readString(device?.timezone) ?? null,
    payload_json: stringifyPayload(raw.payload),
    etl_processed_at: processedAt
  };
}

function normalizePayload(value: unknown): JsonObject {
  const objectValue = asObject(value);

  if (objectValue) {
    return objectValue;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      const parsedObject = asObject(parsed);
      if (parsedObject) {
        return parsedObject;
      }
    } catch (error) {
      return {};
    }
  }

  return {};
}

function normalizeTimestamp(value: unknown): string | undefined {
  if (!value) {
    return;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return;
    }
    return value.toISOString();
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      return;
    }
    return parsed.toISOString();
  }

  return;
}

function stringifyPayload(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? value : null;
  }

  if (value === undefined) {
    return null;
  }

  try {
    return JSON.stringify(value);
  } catch (error) {
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

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return;
}
