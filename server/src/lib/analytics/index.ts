import { GA4Forwarder } from './ga4';
import type { AnalyticsForwarder, SDKEvent } from './types';

export { GA4Forwarder } from './ga4';
export { mapToGA4 } from './mapper';
export type { AnalyticsForwarder, GA4Event, SDKEvent } from './types';

const ENABLED_VALUES = new Set(['true', '1']);

export function createAnalyticsForwarderFromEnv(): AnalyticsForwarder {
  const enabled = isAnalyticsEnabled(process.env.ANALYTICS_ENABLED);

  if (!enabled) {
    return new NoopForwarder();
  }

  const measurementId = readString(process.env.GA4_MEASUREMENT_ID);
  const apiSecret = readString(process.env.GA4_API_SECRET);

  if (!measurementId || !apiSecret) {
    console.warn(
      'GA4 analytics enabled but GA4_MEASUREMENT_ID or GA4_API_SECRET is missing; forwarding disabled.'
    );
    return new NoopForwarder();
  }

  return new GA4Forwarder({ measurementId, apiSecret });
}

class NoopForwarder implements AnalyticsForwarder {
  async forward(_event: SDKEvent): Promise<boolean> {
    return false;
  }
}

function isAnalyticsEnabled(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ENABLED_VALUES.has(value.trim().toLowerCase());
}

function readString(value: string | undefined): string | undefined {
  if (!value) {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
