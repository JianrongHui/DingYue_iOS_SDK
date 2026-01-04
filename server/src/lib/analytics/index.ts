import { FirebaseForwarder } from './firebase';
import { GA4Forwarder } from './ga4';
import type { AnalyticsForwarder, SDKEvent } from './types';

export { FirebaseForwarder } from './firebase';
export { GA4Forwarder } from './ga4';
export { mapToGA4 } from './mapper';
export type { AnalyticsForwarder, GA4Event, SDKEvent } from './types';

const ENABLED_VALUES = new Set(['true', '1']);

export function createAnalyticsForwarderFromEnv(): AnalyticsForwarder {
  const forwarders: AnalyticsForwarder[] = [];

  const ga4Forwarder = createGa4ForwarderFromEnv();
  const firebaseForwarder = createFirebaseForwarderFromEnv();

  if (ga4Forwarder) {
    forwarders.push(ga4Forwarder);
  }

  if (firebaseForwarder) {
    forwarders.push(firebaseForwarder);
  }

  if (forwarders.length === 0) {
    return new NoopForwarder();
  }

  if (forwarders.length === 1) {
    return forwarders[0];
  }

  return new MultiForwarder(forwarders);
}

class NoopForwarder implements AnalyticsForwarder {
  async forward(_event: SDKEvent): Promise<boolean> {
    return false;
  }
}

class MultiForwarder implements AnalyticsForwarder {
  private readonly forwarders: AnalyticsForwarder[];

  constructor(forwarders: AnalyticsForwarder[]) {
    this.forwarders = forwarders;
  }

  async forward(event: SDKEvent): Promise<boolean> {
    const results = await Promise.all(
      this.forwarders.map((forwarder) => forwarder.forward(event))
    );

    return results.some(Boolean);
  }
}

function createGa4ForwarderFromEnv(): GA4Forwarder | undefined {
  const enabled = isAnalyticsEnabled(process.env.ANALYTICS_ENABLED);

  if (!enabled) {
    return;
  }

  const measurementId = readString(process.env.GA4_MEASUREMENT_ID);
  const apiSecret = readString(process.env.GA4_API_SECRET);

  if (!measurementId || !apiSecret) {
    console.warn(
      'GA4 analytics enabled but GA4_MEASUREMENT_ID or GA4_API_SECRET is missing; forwarding disabled.'
    );
    return;
  }

  return new GA4Forwarder({ measurementId, apiSecret });
}

function createFirebaseForwarderFromEnv(): FirebaseForwarder | undefined {
  const enabled = isAnalyticsEnabled(process.env.FIREBASE_ENABLED);

  if (!enabled) {
    return;
  }

  const appId = readString(process.env.FIREBASE_APP_ID);
  const apiSecret = readString(process.env.FIREBASE_API_SECRET);

  if (!appId || !apiSecret) {
    console.warn(
      'Firebase analytics enabled but FIREBASE_APP_ID or FIREBASE_API_SECRET is missing; forwarding disabled.'
    );
    return;
  }

  return new FirebaseForwarder({ appId, apiSecret });
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
