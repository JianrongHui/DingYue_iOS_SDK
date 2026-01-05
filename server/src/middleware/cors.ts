import type { Context, MiddlewareHandler } from 'hono';

import type { AppContext } from '../types/hono';

type AllowedOrigins = {
  allowAll: boolean;
  origins: Set<string>;
};

const DEFAULT_ALLOW_METHODS = 'GET,POST,PATCH,DELETE,OPTIONS';
const DEFAULT_ALLOW_HEADERS =
  'Content-Type, X-App-Id, X-Timestamp, X-Nonce, X-Signature';
const DEFAULT_MAX_AGE = '86400';

let cachedOrigins: {
  raw?: string;
  parsed: AllowedOrigins;
} | null = null;

export const corsMiddleware: MiddlewareHandler<AppContext> = async (
  c,
  next
): Promise<Response | void> => {
  const origin = c.req.header('Origin');
  const allowed = resolveAllowedOrigins(c);
  const resolved = resolveOrigin(origin, allowed);

  if (c.req.method === 'OPTIONS') {
    const headers = buildCorsHeaders(resolved, allowed);
    return new Response(null, { status: 204, headers });
  }

  await next();

  if (resolved) {
    applyCorsHeaders(c, resolved, allowed);
  }
};

function resolveAllowedOrigins(c: Context<AppContext>): AllowedOrigins {
  const raw = c.env.CORS_ALLOWED_ORIGINS;

  if (cachedOrigins && cachedOrigins.raw === raw) {
    return cachedOrigins.parsed;
  }

  const parsed = parseAllowedOrigins(raw);
  cachedOrigins = { raw, parsed };
  return parsed;
}

function parseAllowedOrigins(raw: string | undefined): AllowedOrigins {
  if (!raw) {
    return { allowAll: true, origins: new Set() };
  }

  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*') {
    return { allowAll: true, origins: new Set() };
  }

  const origins = new Set(
    trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

  return { allowAll: false, origins };
}

function resolveOrigin(
  origin: string | undefined,
  allowed: AllowedOrigins
): string | null {
  if (!origin) {
    return null;
  }

  if (allowed.allowAll) {
    return '*';
  }

  return allowed.origins.has(origin) ? origin : null;
}

function buildCorsHeaders(
  origin: string | null,
  allowed: AllowedOrigins
): Headers {
  const headers = new Headers();
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    if (!allowed.allowAll) {
      headers.append('Vary', 'Origin');
    }
  }
  headers.set('Access-Control-Allow-Methods', DEFAULT_ALLOW_METHODS);
  headers.set('Access-Control-Allow-Headers', DEFAULT_ALLOW_HEADERS);
  headers.set('Access-Control-Max-Age', DEFAULT_MAX_AGE);
  return headers;
}

function applyCorsHeaders(
  c: Context<AppContext>,
  origin: string,
  allowed: AllowedOrigins
): void {
  c.header('Access-Control-Allow-Origin', origin);
  if (!allowed.allowAll) {
    c.header('Vary', 'Origin');
  }
  c.header('Access-Control-Allow-Methods', DEFAULT_ALLOW_METHODS);
  c.header('Access-Control-Allow-Headers', DEFAULT_ALLOW_HEADERS);
  c.header('Access-Control-Max-Age', DEFAULT_MAX_AGE);
}
