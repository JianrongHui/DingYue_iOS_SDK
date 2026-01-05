import type { Context, MiddlewareHandler } from 'hono';

import type { AppContext } from '../types/hono';

const HEADER_APP_ID = 'x-app-id';
const HEADER_TIMESTAMP = 'x-timestamp';
const HEADER_NONCE = 'x-nonce';
const HEADER_SIGNATURE = 'x-signature';

const ALLOWED_TIME_SKEW_SEC = 5 * 60;
const NONCE_TTL_MS = 10 * 60 * 1000;
const APP_CACHE_TTL_MS = 5 * 60 * 1000;

type AppCredentialRow = {
  app_key: string;
  status: string;
};

type CachedApp = {
  appKey: string;
  status: string;
  expiresAt: number;
};

const appCache = new Map<string, CachedApp>();

export const hmacAuth: MiddlewareHandler<AppContext> = async (c, next) => {
  const appId = getHeaderValue(c, HEADER_APP_ID);
  if (!appId) {
    return unauthorized(c, 'missing X-App-Id header');
  }

  const appRecord = await getAppCredential(c, appId);
  if (!appRecord) {
    return unauthorized(c, 'unknown X-App-Id');
  }
  if (appRecord.status !== 'active') {
    return unauthorized(c, 'app is disabled');
  }
  const appKey = appRecord.appKey;

  const timestampHeader = getHeaderValue(c, HEADER_TIMESTAMP);
  if (!timestampHeader) {
    return unauthorized(c, 'missing X-Timestamp header');
  }
  if (!/^\d+$/.test(timestampHeader)) {
    return unauthorized(c, 'invalid X-Timestamp header');
  }

  const timestampSec = Number.parseInt(timestampHeader, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > ALLOWED_TIME_SKEW_SEC) {
    return unauthorized(c, 'timestamp out of range');
  }

  const nonce = getHeaderValue(c, HEADER_NONCE);
  if (!nonce) {
    return unauthorized(c, 'missing X-Nonce header');
  }

  const signature = getHeaderValue(c, HEADER_SIGNATURE);
  if (!signature) {
    return unauthorized(c, 'missing X-Signature header');
  }

  const canonicalPath = getCanonicalPath(c);
  const bodyHash = await sha256Hex(getBodyBuffer(c));
  const canonicalString = [
    c.req.method.toUpperCase(),
    canonicalPath,
    timestampHeader,
    nonce,
    bodyHash
  ].join('\n');

  const expectedSignature = await hmacSha256Hex(appKey, canonicalString);
  const providedSignature = signature.trim().toLowerCase();
  const expectedMac = await hmacSha256Bytes(appKey, expectedSignature);
  const providedMac = await hmacSha256Bytes(appKey, providedSignature);
  if (!timingSafeEqual(expectedMac, providedMac)) {
    return unauthorized(c, 'invalid signature');
  }

  const nonceKey = `${appId}:${nonce}`;
  const existing = await c.env.NONCE_CACHE.get(nonceKey);
  if (existing) {
    return unauthorized(c, 'nonce already used');
  }

  await c.env.NONCE_CACHE.put(nonceKey, '1', {
    expirationTtl: Math.floor(NONCE_TTL_MS / 1000)
  });

  c.set('appId', appId);
  c.set('appKey', appKey);

  await next();
};

function getHeaderValue(c: Context<AppContext>, headerName: string): string | null {
  const value = c.req.header(headerName);
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getAppCredential(
  c: Context<AppContext>,
  appId: string
): Promise<CachedApp | null> {
  const cached = appCache.get(appId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached;
  }

  const db = c.get('db');
  const result = await db.query<AppCredentialRow>(
    'select app_key, status from apps where app_id = ?',
    [appId]
  );

  const row = result.rows[0];
  const appKey = readString(row?.app_key);
  const status = readString(row?.status);

  if (!appKey || !status) {
    appCache.delete(appId);
    return null;
  }

  const record: CachedApp = {
    appKey,
    status,
    expiresAt: Date.now() + APP_CACHE_TTL_MS
  };
  appCache.set(appId, record);
  return record;
}

function getCanonicalPath(c: Context<AppContext>): string {
  const path = c.req.path;
  return path || '/';
}

function getBodyBuffer(c: Context<AppContext>): ArrayBuffer {
  const rawBody = c.get('rawBody');
  return rawBody ?? new ArrayBuffer(0);
}

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', body);
  return bufferToHex(hashBuffer);
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  return bufferToHex(signature);
}

async function hmacSha256Bytes(key: string, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  return new Uint8Array(signature);
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function unauthorized(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'unauthorized',
      message
    },
    401
  );
}
