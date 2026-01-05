import { FirebaseForwarder } from './firebase';
import { GA4Forwarder } from './ga4';
import { getSinksForApp } from './cache';
import type { AnalyticsSink } from '../../modules/analytics-sinks/types';
import type { AnalyticsForwarder, SDKEvent } from './types';
import type { D1Adapter } from '../db';
import type { Env } from '../../types/env';

export { FirebaseForwarder } from './firebase';
export { GA4Forwarder } from './ga4';
export { mapToGA4 } from './mapper';
export { CONVERSION_QUERY, GUIDE_COMPLETION_QUERY, SKU_CONVERSION_QUERY } from './queries';
export type { AnalyticsForwarder, GA4Event, SDKEvent } from './types';

const ENABLED_VALUES = new Set(['true', '1']);

export function createAnalyticsForwarderFromEnv(env: Env): AnalyticsForwarder {
  const forwarders: AnalyticsForwarder[] = [];

  const ga4Forwarder = createGa4ForwarderFromEnv(env);
  const firebaseForwarder = createFirebaseForwarderFromEnv(env);

  if (ga4Forwarder) {
    forwarders.push(ga4Forwarder);
  }

  if (firebaseForwarder) {
    forwarders.push(firebaseForwarder);
  }

  return composeForwarders(forwarders);
}

export async function createAnalyticsForwarder(
  db: D1Adapter,
  appId: string,
  env: Env
): Promise<AnalyticsForwarder> {
  const { sinks, hasAny } = await getSinksForApp(db, appId);
  const forwarders = sinks
    .map((sink) => buildForwarderFromSink(sink))
    .filter((forwarder): forwarder is AnalyticsForwarder => Boolean(forwarder));

  if (forwarders.length === 0) {
    return hasAny ? new NoopForwarder() : createAnalyticsForwarderFromEnv(env);
  }

  return composeForwarders(forwarders);
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

function composeForwarders(forwarders: AnalyticsForwarder[]): AnalyticsForwarder {
  if (forwarders.length === 0) {
    return new NoopForwarder();
  }

  if (forwarders.length === 1) {
    return forwarders[0];
  }

  return new MultiForwarder(forwarders);
}

function buildForwarderFromSink(sink: AnalyticsSink): AnalyticsForwarder | undefined {
  if (sink.type === 'ga4') {
    return new GA4Forwarder({
      measurementId: sink.config.measurement_id,
      apiSecret: sink.config.api_secret
    });
  }

  if (sink.type === 'firebase') {
    return new FirebaseForwarder({
      appId: sink.config.app_id,
      apiSecret: sink.config.api_secret
    });
  }

  return;
}

function createGa4ForwarderFromEnv(env: Env): GA4Forwarder | undefined {
  const enabled = isAnalyticsEnabled(env.ANALYTICS_ENABLED);

  if (!enabled) {
    return;
  }

  const measurementId = readString(env.GA4_MEASUREMENT_ID);
  const apiSecret = readString(env.GA4_API_SECRET);

  if (!measurementId || !apiSecret) {
    console.warn(
      'GA4 analytics enabled but GA4_MEASUREMENT_ID or GA4_API_SECRET is missing; forwarding disabled.'
    );
    return;
  }

  return new GA4Forwarder({ measurementId, apiSecret });
}

function createFirebaseForwarderFromEnv(env: Env): FirebaseForwarder | undefined {
  const enabled = isAnalyticsEnabled(env.FIREBASE_ENABLED);

  if (!enabled) {
    return;
  }

  const appId = readString(env.FIREBASE_APP_ID);
  const apiSecret = readString(env.FIREBASE_API_SECRET);

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
