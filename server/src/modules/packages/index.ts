import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

import AdmZip from 'adm-zip';
import { Express, Request, Response, Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

type JsonObject = Record<string, unknown>;

type Manifest = {
  manifest_version: number;
  placement_type: 'paywall' | 'guide';
  package_version: string;
  entry_path: string;
  checksum?: string;
};

type PendingPackage = {
  package_id: string;
  app_id: string;
  placement_id: string;
  storage_key: string;
  upload_path: string;
};

type StoredPackage = {
  package_id: string;
  app_id: string;
  placement_id?: string;
  storage_key: string;
  version: string;
  checksum: string;
  cdn_url: string;
  entry_path: string;
  size_bytes: number;
  created_at: string;
};

type PackageError = {
  status: number;
  code: string;
  message: string;
};

const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), 'storage');
const LOCAL_CDN_ROOT = path.resolve(process.cwd(), 'cdn');
const MANIFEST_NAME = 'manifest.json';
const ALLOWED_PLACEMENT_TYPES = new Set<Manifest['placement_type']>(['paywall', 'guide']);
const pendingPackages = new Map<string, PendingPackage>();
const storedPackages = new Map<string, StoredPackage>();

export function registerPackagesModule(app: Express): void {
  const router = Router();

  router.post('/v1/admin/packages/presign', handlePresign);
  router.post('/v1/admin/packages/commit', handleCommit);

  app.use(router);
}

async function handlePresign(req: Request, res: Response): Promise<void> {
  try {
    const body = asObject(req.body);

    if (!body) {
      sendValidationError(res, 'INVALID_REQUEST', 'body must be an object');
      return;
    }

    const appId = readString(body.app_id);
    const placementId = readString(body.placement_id);
    const filename = readString(body.filename);

    if (!appId || !placementId || !filename) {
      sendValidationError(res, 'INVALID_REQUEST', 'app_id, placement_id, filename are required');
      return;
    }

    const packageId = createPackageId();
    const storageKey = buildStorageKey(appId, placementId, packageId);
    const uploadPath = resolveStoragePath(storageKey, LOCAL_STORAGE_ROOT);

    if (!uploadPath) {
      sendValidationError(res, 'INVALID_STORAGE_KEY', 'storage_key is invalid');
      return;
    }

    await fs.mkdir(path.dirname(uploadPath), { recursive: true });

    pendingPackages.set(packageId, {
      package_id: packageId,
      app_id: appId,
      placement_id: placementId,
      storage_key: storageKey,
      upload_path: uploadPath
    });

    res.status(200).json({
      package_id: packageId,
      upload_url: uploadPath,
      storage_key: storageKey
    });
  } catch (error) {
    console.error('Failed to presign package', error);
    sendInternalError(res, 'failed to presign package');
  }
}

async function handleCommit(req: Request, res: Response): Promise<void> {
  try {
    const body = asObject(req.body);

    if (!body) {
      sendValidationError(res, 'INVALID_REQUEST', 'body must be an object');
      return;
    }

    const appId = readString(body.app_id);
    const packageId = readString(body.package_id);
    const storageKey = readString(body.storage_key);

    if (!appId || !packageId || !storageKey) {
      sendValidationError(res, 'INVALID_REQUEST', 'app_id, package_id, storage_key are required');
      return;
    }

    const pendingPackage = pendingPackages.get(packageId);

    if (pendingPackage) {
      if (pendingPackage.app_id !== appId) {
        sendValidationError(res, 'INVALID_REQUEST', 'app_id does not match presign record');
        return;
      }
      if (pendingPackage.storage_key !== storageKey) {
        sendValidationError(res, 'INVALID_REQUEST', 'storage_key does not match presign record');
        return;
      }
    }

    if (!storageKey.startsWith(`packages/${appId}/`)) {
      sendValidationError(res, 'INVALID_STORAGE_KEY', 'storage_key must start with packages/{app_id}/');
      return;
    }

    const storagePath = resolveStoragePath(storageKey, LOCAL_STORAGE_ROOT);

    if (!storagePath) {
      sendValidationError(res, 'INVALID_STORAGE_KEY', 'storage_key is invalid');
      return;
    }

    let fileBuffer: Buffer;
    let sizeBytes: number;

    try {
      const stat = await fs.stat(storagePath);
      sizeBytes = stat.size;
      fileBuffer = await fs.readFile(storagePath);
    } catch (error) {
      sendValidationError(res, 'UPLOAD_NOT_FOUND', 'uploaded package not found');
      return;
    }

    const checksum = computeChecksum(fileBuffer);
    const zip = new AdmZip(fileBuffer);
    const manifestResult = readManifest(zip);

    if (manifestResult.error) {
      sendPackageError(res, manifestResult.error);
      return;
    }

    const manifest = manifestResult.manifest;
    const normalizedEntryPath = normalizeZipPath(manifest.entry_path);
    const entry = findZipEntry(zip, normalizedEntryPath);

    if (!entry || entry.isDirectory) {
      sendPackageError(res, {
        status: 400,
        code: 'ENTRY_NOT_FOUND',
        message: `entry_path ${manifest.entry_path} not found`
      });
      return;
    }

    const cdnPath = resolveStoragePath(storageKey, LOCAL_CDN_ROOT);

    if (!cdnPath) {
      sendValidationError(res, 'INVALID_STORAGE_KEY', 'storage_key is invalid for cdn path');
      return;
    }

    await fs.mkdir(path.dirname(cdnPath), { recursive: true });
    await fs.copyFile(storagePath, cdnPath);

    const cdnUrl = cdnPath;
    const record: StoredPackage = {
      package_id: packageId,
      app_id: appId,
      placement_id: pendingPackage?.placement_id,
      storage_key: storageKey,
      version: manifest.package_version,
      checksum,
      cdn_url: cdnUrl,
      entry_path: normalizedEntryPath,
      size_bytes: sizeBytes,
      created_at: new Date().toISOString()
    };

    storedPackages.set(packageId, record);
    pendingPackages.delete(packageId);

    res.status(200).json({
      package_id: record.package_id,
      version: record.version,
      checksum: record.checksum,
      cdn_url: record.cdn_url,
      entry_path: record.entry_path,
      size_bytes: record.size_bytes
    });
  } catch (error) {
    console.error('Failed to commit package', error);
    sendInternalError(res, 'failed to commit package');
  }
}

function createPackageId(): string {
  return `pkg_${uuidv4()}`;
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

function buildStorageKey(appId: string, placementId: string, packageId: string): string {
  return path.posix.join('packages', appId, placementId, `${packageId}.zip`);
}

function resolveStoragePath(storageKey: string, root: string): string | null {
  const normalizedKey = storageKey.replace(/\\/g, '/');
  const resolvedPath = path.resolve(root, normalizedKey);
  const relative = path.relative(root, resolvedPath);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  return resolvedPath;
}

function normalizeZipPath(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  return normalized.replace(/^(\.\/)+/, '').replace(/^\/+/, '');
}

function computeChecksum(buffer: Buffer): string {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function readManifest(zip: AdmZip): { manifest: Manifest; error?: PackageError } {
  const manifestEntry = findZipEntry(zip, MANIFEST_NAME);

  if (!manifestEntry) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'MANIFEST_NOT_FOUND',
        message: 'manifest.json not found'
      }
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(manifestEntry.getData().toString('utf-8'));
  } catch (error) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'INVALID_MANIFEST_JSON',
        message: 'manifest.json is not valid JSON'
      }
    };
  }

  const manifestObject = asObject(parsed);

  if (!manifestObject) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'INVALID_MANIFEST',
        message: 'manifest.json must be an object'
      }
    };
  }

  const manifestVersion = readNumber(manifestObject.manifest_version);
  const placementType = readString(manifestObject.placement_type);
  const packageVersion = readString(manifestObject.package_version);
  const entryPath = readString(manifestObject.entry_path);
  const checksum = readString(manifestObject.checksum);

  if (!manifestVersion || manifestVersion !== 1) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'INVALID_MANIFEST_VERSION',
        message: 'manifest_version must be 1'
      }
    };
  }

  if (!placementType || !ALLOWED_PLACEMENT_TYPES.has(placementType as Manifest['placement_type'])) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'INVALID_PLACEMENT_TYPE',
        message: 'placement_type must be paywall or guide'
      }
    };
  }

  if (!packageVersion || !entryPath) {
    return {
      manifest: {} as Manifest,
      error: {
        status: 400,
        code: 'INVALID_MANIFEST',
        message: 'package_version and entry_path are required'
      }
    };
  }

  return {
    manifest: {
      manifest_version: manifestVersion,
      placement_type: placementType as Manifest['placement_type'],
      package_version: packageVersion,
      entry_path: entryPath,
      checksum: checksum || undefined
    }
  };
}

function findZipEntry(zip: AdmZip, targetPath: string): AdmZip.IZipEntry | null {
  const normalizedTarget = normalizeZipPath(targetPath);
  const direct = zip.getEntry(normalizedTarget);

  if (direct) {
    return direct;
  }

  const lowerTarget = normalizedTarget.toLowerCase();
  const entries = zip.getEntries();

  return (
    entries.find(
      (entry) => normalizeZipPath(entry.entryName).toLowerCase() === lowerTarget
    ) ?? null
  );
}

function sendValidationError(res: Response, code: string, message: string): void {
  res.status(400).json({
    error: code,
    message
  });
}

function sendPackageError(res: Response, error: PackageError): void {
  res.status(error.status).json({
    error: error.code,
    message: error.message
  });
}

function sendInternalError(res: Response, message: string): void {
  res.status(500).json({
    error: 'internal_error',
    message
  });
}
