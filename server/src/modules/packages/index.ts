import { unzipSync } from 'fflate';
import type { Context, Hono } from 'hono';

import type { AppContext } from '../../types/hono';

type JsonObject = Record<string, unknown>;

type Manifest = {
  manifest_version: number;
  placement_type: 'paywall' | 'guide';
  package_version: string;
  entry_path: string;
  checksum?: string;
};

type PackageError = {
  status: 400;
  code: string;
  message: string;
};

type PackageRow = {
  id: string;
  app_id: string;
  placement_id: string;
  version: string;
  checksum: string;
  entry_path: string;
  cdn_url: string;
  size_bytes: number;
  created_at: string;
};

type PlacementRow = {
  placement_id: string;
  type: Manifest['placement_type'];
};

type VariantPackageRow = {
  package_id: string;
  enabled: number;
};

type StorageKeyParts = {
  appId: string;
  placementId: string;
  packageId: string;
};

const MANIFEST_NAME = 'manifest.json';
const ALLOWED_PLACEMENT_TYPES = new Set<Manifest['placement_type']>(['paywall', 'guide']);

export function registerPackagesModule(app: Hono<AppContext>): void {
  app.get('/v1/admin/packages', handleList);
  app.post('/v1/admin/packages/presign', handlePresign);
  app.put('/v1/admin/packages/upload/:package_id', handleUpload);
  app.post('/v1/admin/packages/commit', handleCommit);
}

async function handleList(c: Context<AppContext>): Promise<Response> {
  try {
    const appId = readString(c.req.query('app_id'));
    const placementId = readString(c.req.query('placement_id'));
    const { where, params } = buildPackageFilters(appId, placementId);

    const db = c.get('db');
    const [packagesResult, placementsResult, variantsResult] = await Promise.all([
      db.query<PackageRow>(
        `select id, app_id, placement_id, version, checksum, entry_path, cdn_url, size_bytes, created_at
         from packages ${where} order by created_at desc`,
        params
      ),
      db.query<PlacementRow>(
        `select placement_id, type
         from placements ${where}`,
        params
      ),
      db.query<VariantPackageRow>(
        `select package_id, enabled
         from variants ${where}`,
        params
      )
    ]);

    const placementTypes = new Map<string, Manifest['placement_type']>();
    for (const row of placementsResult.rows) {
      placementTypes.set(row.placement_id, row.type);
    }

    const activePackages = new Set(
      variantsResult.rows
        .filter((row) => row.enabled === 1)
        .map((row) => row.package_id)
    );

    const response = packagesResult.rows.map((row) => {
      const placementType = placementTypes.get(row.placement_id) ?? 'paywall';
      const status = activePackages.has(row.id) ? 'active' : 'inactive';

      return {
        id: row.id,
        app_id: row.app_id,
        placement_id: row.placement_id,
        version: row.version,
        checksum: row.checksum,
        entry_path: row.entry_path,
        cdn_url: row.cdn_url,
        size_bytes: row.size_bytes,
        status,
        manifest: {
          manifest_version: 1,
          placement_type: placementType,
          package_version: row.version,
          entry_path: row.entry_path,
          checksum: row.checksum
        },
        created_at: row.created_at
      };
    });

    return c.json(response, 200);
  } catch (error) {
    console.error('Failed to list packages', error);
    return sendInternalError(c, 'failed to list packages');
  }
}

async function handlePresign(c: Context<AppContext>): Promise<Response> {
  try {
    const body = await readJsonBody(c);

    if (!body) {
      return sendValidationError(c, 'INVALID_REQUEST', 'body must be an object');
    }

    const appId = readString(body.app_id);
    const placementId = readString(body.placement_id);
    const filename = readString(body.filename);

    if (!appId || !placementId || !filename) {
      return sendValidationError(
        c,
        'INVALID_REQUEST',
        'app_id, placement_id, filename are required'
      );
    }

    const packageId = createPackageId();
    const storageKey = buildStorageKey(appId, placementId, packageId);

    if (!storageKey) {
      return sendValidationError(c, 'INVALID_STORAGE_KEY', 'storage_key is invalid');
    }

    const uploadUrl = buildUploadUrl(c, packageId, storageKey);

    return c.json(
      {
        package_id: packageId,
        upload_url: uploadUrl,
        storage_key: storageKey
      },
      200
    );
  } catch (error) {
    console.error('Failed to presign package', error);
    return sendInternalError(c, 'failed to presign package');
  }
}

async function handleUpload(c: Context<AppContext>): Promise<Response> {
  try {
    const packageId = readString(c.req.param('package_id'));
    const storageKey = readString(c.req.query('storage_key'));

    if (!packageId || !storageKey) {
      return sendValidationError(
        c,
        'INVALID_REQUEST',
        'package_id and storage_key are required'
      );
    }

    const parsed = parseStorageKey(storageKey);
    if (!parsed || parsed.packageId !== packageId) {
      return sendValidationError(c, 'INVALID_STORAGE_KEY', 'storage_key is invalid');
    }

    const buffer = await c.req.raw.arrayBuffer();
    if (buffer.byteLength === 0) {
      return sendValidationError(c, 'INVALID_REQUEST', 'upload body is empty');
    }

    await c.env.R2.put(storageKey, buffer, {
      httpMetadata: {
        contentType: 'application/zip'
      }
    });

    return c.json({ ok: true }, 200);
  } catch (error) {
    console.error('Failed to upload package', error);
    return sendInternalError(c, 'failed to upload package');
  }
}

async function handleCommit(c: Context<AppContext>): Promise<Response> {
  try {
    const body = await readJsonBody(c);

    if (!body) {
      return sendValidationError(c, 'INVALID_REQUEST', 'body must be an object');
    }

    const appId = readString(body.app_id);
    const packageId = readString(body.package_id);
    const storageKey = readString(body.storage_key);

    if (!appId || !packageId || !storageKey) {
      return sendValidationError(
        c,
        'INVALID_REQUEST',
        'app_id, package_id, storage_key are required'
      );
    }

    const parsedKey = parseStorageKey(storageKey);
    if (!parsedKey) {
      return sendValidationError(c, 'INVALID_STORAGE_KEY', 'storage_key is invalid');
    }
    if (parsedKey.packageId !== packageId || parsedKey.appId !== appId) {
      return sendValidationError(c, 'INVALID_REQUEST', 'storage_key does not match request');
    }

    const object = await c.env.R2.get(storageKey);
    if (!object) {
      return sendValidationError(c, 'UPLOAD_NOT_FOUND', 'uploaded package not found');
    }

    const buffer = await object.arrayBuffer();
    const sizeBytes = buffer.byteLength;
    const checksum = await computeChecksum(buffer);

    let manifestResult: { manifest: Manifest; entryPath: string };
    try {
      manifestResult = validateZip(buffer);
    } catch (error) {
      if (isPackageError(error)) {
        return sendPackageError(c, error);
      }
      console.error('Invalid package zip', error);
      return sendPackageError(c, {
        status: 400,
        code: 'INVALID_ZIP',
        message: 'invalid zip file'
      });
    }

    const { manifest, entryPath } = manifestResult;
    const cdnUrl = buildCdnUrl(storageKey, c.env);
    const createdAt = new Date().toISOString();

    const db = c.get('db');
    await db.execute(
      `insert into packages
        (id, app_id, placement_id, version, checksum, entry_path, cdn_url, size_bytes, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        packageId,
        appId,
        parsedKey.placementId,
        manifest.package_version,
        checksum,
        entryPath,
        cdnUrl,
        sizeBytes,
        createdAt
      ]
    );

    return c.json(
      {
        package_id: packageId,
        placement_id: parsedKey.placementId,
        version: manifest.package_version,
        checksum,
        cdn_url: cdnUrl,
        entry_path: entryPath,
        size_bytes: sizeBytes,
        created_at: createdAt
      },
      200
    );
  } catch (error) {
    console.error('Failed to commit package', error);
    return sendInternalError(c, 'failed to commit package');
  }
}

function createPackageId(): string {
  return `pkg_${crypto.randomUUID()}`;
}

async function readJsonBody(c: Context<AppContext>): Promise<JsonObject | null> {
  try {
    const parsed = await c.req.json();
    return asObject(parsed) ?? null;
  } catch (_error) {
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
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return;
  }

  return value;
}

function buildStorageKey(appId: string, placementId: string, packageId: string): string | null {
  if (!isSafeSegment(appId) || !isSafeSegment(placementId) || !isSafeSegment(packageId)) {
    return null;
  }

  return `packages/${appId}/${placementId}/${packageId}.zip`;
}

function parseStorageKey(storageKey: string): StorageKeyParts | null {
  const normalized = storageKey.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (parts.length !== 4) {
    return null;
  }
  if (parts[0] !== 'packages') {
    return null;
  }
  const [_, appId, placementId, filename] = parts;
  if (!filename.endsWith('.zip')) {
    return null;
  }
  const packageId = filename.slice(0, -4);
  if (!packageId) {
    return null;
  }
  return { appId, placementId, packageId };
}

function isSafeSegment(value: string): boolean {
  if (!value) {
    return false;
  }
  return !value.includes('/') && !value.includes('\\') && !value.includes('..');
}

function buildUploadUrl(
  c: Context<AppContext>,
  packageId: string,
  storageKey: string
): string {
  const url = new URL(c.req.url);
  url.pathname = `/v1/admin/packages/upload/${packageId}`;
  url.search = new URLSearchParams({ storage_key: storageKey }).toString();
  return url.toString();
}

function buildPackageFilters(
  appId: string | undefined,
  placementId: string | undefined
): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (appId) {
    conditions.push('app_id = ?');
    params.push(appId);
  }

  if (placementId) {
    conditions.push('placement_id = ?');
    params.push(placementId);
  }

  if (conditions.length === 0) {
    return { where: '', params };
  }

  return { where: `where ${conditions.join(' and ')}`, params };
}

function buildCdnUrl(storageKey: string, env: AppContext['Bindings']): string {
  const base = readString(env.CDN_BASE_URL);
  if (!base) {
    return storageKey;
  }
  const normalized = base.replace(/\/+$/, '');
  return `${normalized}/${storageKey}`;
}

function validateZip(buffer: ArrayBuffer): { manifest: Manifest; entryPath: string } {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(buffer));
  } catch (error) {
    throw error;
  }

  const manifestData = findZipEntry(files, MANIFEST_NAME);
  if (!manifestData) {
    throw {
      status: 400,
      code: 'MANIFEST_NOT_FOUND',
      message: 'manifest.json not found'
    } satisfies PackageError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(manifestData));
  } catch (_error) {
    throw {
      status: 400,
      code: 'INVALID_MANIFEST_JSON',
      message: 'manifest.json is not valid JSON'
    } satisfies PackageError;
  }

  const manifestObject = asObject(parsed);
  if (!manifestObject) {
    throw {
      status: 400,
      code: 'INVALID_MANIFEST',
      message: 'manifest.json must be an object'
    } satisfies PackageError;
  }

  const manifestVersion = readNumber(manifestObject.manifest_version);
  const placementType = readString(manifestObject.placement_type);
  const packageVersion = readString(manifestObject.package_version);
  const entryPath = readString(manifestObject.entry_path) ?? 'index.html';
  const checksum = readString(manifestObject.checksum);

  if (!manifestVersion || manifestVersion !== 1) {
    throw {
      status: 400,
      code: 'INVALID_MANIFEST_VERSION',
      message: 'manifest_version must be 1'
    } satisfies PackageError;
  }

  if (!placementType || !ALLOWED_PLACEMENT_TYPES.has(placementType as Manifest['placement_type'])) {
    throw {
      status: 400,
      code: 'INVALID_PLACEMENT_TYPE',
      message: 'placement_type must be paywall or guide'
    } satisfies PackageError;
  }

  if (!packageVersion) {
    throw {
      status: 400,
      code: 'INVALID_MANIFEST',
      message: 'package_version is required'
    } satisfies PackageError;
  }

  const normalizedEntryPath = normalizeZipPath(entryPath);
  const entry = findZipEntry(files, normalizedEntryPath);
  if (!entry) {
    throw {
      status: 400,
      code: 'ENTRY_NOT_FOUND',
      message: `entry_path ${entryPath} not found`
    } satisfies PackageError;
  }

  return {
    manifest: {
      manifest_version: manifestVersion,
      placement_type: placementType as Manifest['placement_type'],
      package_version: packageVersion,
      entry_path: normalizedEntryPath,
      checksum: checksum || undefined
    },
    entryPath: normalizedEntryPath
  };
}

function normalizeZipPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

function findZipEntry(
  files: Record<string, Uint8Array>,
  targetPath: string
): Uint8Array | null {
  const normalizedTarget = normalizeZipPath(targetPath);
  const direct = files[normalizedTarget];
  if (direct) {
    return direct;
  }

  const lowerTarget = normalizedTarget.toLowerCase();
  for (const [entryName, data] of Object.entries(files)) {
    if (normalizeZipPath(entryName).toLowerCase() === lowerTarget) {
      return data;
    }
  }

  return null;
}

async function computeChecksum(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return `sha256:${bufferToHex(hash)}`;
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function isPackageError(value: unknown): value is PackageError {
  return (
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    'code' in value &&
    'message' in value
  );
}

function sendValidationError(
  c: Context<AppContext>,
  code: string,
  message: string
): Response {
  return c.json(
    {
      error: code,
      message
    },
    400
  );
}

function sendPackageError(c: Context<AppContext>, error: PackageError): Response {
  return c.json(
    {
      error: error.code,
      message: error.message
    },
    error.status
  );
}

function sendInternalError(c: Context<AppContext>, message: string): Response {
  return c.json(
    {
      error: 'internal_error',
      message
    },
    500
  );
}
