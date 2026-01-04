import { randomUUID } from 'crypto';
import { Express, Request, Response, Router } from 'express';

type JsonObject = Record<string, unknown>;

const DEFAULT_ENTRY_PATH = 'dist/index.html';
const PLACEHOLDER_CHECKSUM = 'sha256:placeholder';
const PLACEHOLDER_CDN_HOST = 'https://cdn.yourdomain.com';
const PLACEHOLDER_STORAGE_HOST = 'https://storage.yourdomain.com';

export function registerPackagesModule(app: Express): void {
  const router = Router();

  router.post('/v1/admin/packages/presign', handlePresign);
  router.post('/v1/admin/packages/commit', handleCommit);

  app.use(router);
}

function handlePresign(_req: Request, res: Response): void {
  const packageId = createPackageId();
  const presignUrl = `${PLACEHOLDER_STORAGE_HOST}/uploads/${packageId}.zip?signature=placeholder`;

  // TODO: Integrate object storage presign and persist package metadata.
  res.status(200).json({
    package_id: packageId,
    presign_url: presignUrl
  });
}

function handleCommit(req: Request, res: Response): void {
  const body = asObject(req.body);
  const packageId = readString(body?.package_id) ?? createPackageId();
  const entryPath = readString(body?.entry_path) ?? DEFAULT_ENTRY_PATH;
  const checksum = readString(body?.checksum) ?? PLACEHOLDER_CHECKSUM;
  const cdnUrl = `${PLACEHOLDER_CDN_HOST}/packages/${packageId}.zip`;

  // TODO: Validate manifest.json, verify checksum, and finalize CDN URL.
  res.status(200).json({
    cdn_url: cdnUrl,
    checksum,
    entry_path: entryPath
  });
}

function createPackageId(): string {
  return `pkg_${randomUUID()}`;
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
