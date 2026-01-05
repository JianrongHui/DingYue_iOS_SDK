/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  NONCE_CACHE: KVNamespace;
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  FIREBASE_APP_ID?: string;
  FIREBASE_API_SECRET?: string;
  ANALYTICS_ENABLED?: string;
  FIREBASE_ENABLED?: string;
  CDN_BASE_URL?: string;
}
