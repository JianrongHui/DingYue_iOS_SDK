import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const HEADER_APP_ID = 'x-app-id';
const HEADER_TIMESTAMP = 'x-timestamp';
const HEADER_NONCE = 'x-nonce';
const HEADER_SIGNATURE = 'x-signature';

const ALLOWED_TIME_SKEW_SEC = 5 * 60;
const NONCE_TTL_MS = 10 * 60 * 1000;

// TODO: Replace with persistent app credential lookup.
const APP_KEYS: Record<string, string> = {
  app_x: 'app_key_x'
};

const nonceCache: Map<string, number> = new Map();

export function hmacAuth(req: Request, res: Response, next: NextFunction): void {
  const appId = getHeaderValue(req, HEADER_APP_ID);
  if (!appId) {
    unauthorized(res, 'missing X-App-Id header');
    return;
  }

  const appKey = APP_KEYS[appId];
  if (!appKey) {
    unauthorized(res, 'unknown X-App-Id');
    return;
  }

  const timestampHeader = getHeaderValue(req, HEADER_TIMESTAMP);
  if (!timestampHeader) {
    unauthorized(res, 'missing X-Timestamp header');
    return;
  }
  if (!/^\d+$/.test(timestampHeader)) {
    unauthorized(res, 'invalid X-Timestamp header');
    return;
  }

  const timestampSec = Number.parseInt(timestampHeader, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > ALLOWED_TIME_SKEW_SEC) {
    unauthorized(res, 'timestamp out of range');
    return;
  }

  const nonce = getHeaderValue(req, HEADER_NONCE);
  if (!nonce) {
    unauthorized(res, 'missing X-Nonce header');
    return;
  }

  const signature = getHeaderValue(req, HEADER_SIGNATURE);
  if (!signature) {
    unauthorized(res, 'missing X-Signature header');
    return;
  }

  const canonicalPath = getCanonicalPath(req);
  const bodyHash = sha256Hex(getBodyBuffer(req));
  const canonicalString = [
    req.method.toUpperCase(),
    canonicalPath,
    timestampHeader,
    nonce,
    bodyHash
  ].join('\n');

  const expectedSignature = hmacSha256Hex(appKey, canonicalString);
  if (!timingSafeEqualString(signature.toLowerCase(), expectedSignature)) {
    unauthorized(res, 'invalid signature');
    return;
  }

  const nowMs = Date.now();
  cleanupExpiredNonces(nowMs);

  const nonceKey = `${appId}:${nonce}`;
  const existingExpiry = nonceCache.get(nonceKey);
  if (existingExpiry && existingExpiry > nowMs) {
    unauthorized(res, 'nonce already used');
    return;
  }

  nonceCache.set(nonceKey, nowMs + NONCE_TTL_MS);

  next();
}

function getHeaderValue(req: Request, headerName: string): string | null {
  const value = req.get(headerName);
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCanonicalPath(req: Request): string {
  const originalUrl = req.originalUrl || req.url || '';
  const path = originalUrl.split('?')[0];
  return path || '/';
}

function getBodyBuffer(req: Request): Buffer {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody;
  }
  return Buffer.alloc(0);
}

function sha256Hex(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

function hmacSha256Hex(key: string, data: string): string {
  return createHmac('sha256', key).update(data).digest('hex');
}

function timingSafeEqualString(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function cleanupExpiredNonces(nowMs: number): void {
  for (const [nonceKey, expiresAt] of nonceCache) {
    if (expiresAt <= nowMs) {
      nonceCache.delete(nonceKey);
    }
  }
}

function unauthorized(res: Response, message: string): void {
  res.status(401).json({
    error: 'unauthorized',
    message
  });
}
