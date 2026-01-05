import { apiRequest, buildQuery } from "./client";
import type { PackageManifest, PackageRecord, PackageStatus, Placement } from "./types";
import { generateId } from "../utils/storage";

export type PackagePresignPayload = {
  app_id: string;
  placement_id: string;
  filename: string;
};

export type PackagePresignResponse = {
  package_id: string;
  upload_url: string;
  storage_key: string;
};

export type PackageCommitPayload = {
  app_id: string;
  package_id: string;
  storage_key: string;
};

export type PackageCommitResponse = {
  package_id: string;
  version: string;
  checksum: string;
  cdn_url: string;
  entry_path: string;
  size_bytes: number;
  created_at?: string;
  placement_id?: string;
};

type ApiPackageRecord = Partial<PackageRecord> & {
  id?: string;
  package_id?: string;
  manifest?: PackageManifest;
  placement_type?: Placement["type"];
  package_version?: string;
  status?: PackageStatus;
};

const normalizePackage = (record: ApiPackageRecord): PackageRecord => {
  const id = record.id ?? record.package_id ?? generateId();
  const version =
    record.version ?? record.package_version ?? record.manifest?.package_version ?? "";
  const entryPath = record.entry_path ?? record.manifest?.entry_path ?? "";
  const placementType =
    record.manifest?.placement_type ?? record.placement_type ?? "paywall";
  const manifest: PackageManifest = record.manifest ?? {
    manifest_version: 1,
    placement_type: placementType,
    package_version: version,
    entry_path: entryPath,
    checksum: record.checksum
  };

  return {
    id,
    app_id: record.app_id ?? "",
    placement_id: record.placement_id ?? "",
    version,
    checksum: record.checksum ?? "",
    entry_path: entryPath,
    cdn_url: record.cdn_url ?? "",
    size_bytes: record.size_bytes ?? 0,
    status: record.status ?? "inactive",
    manifest,
    created_at: record.created_at ?? new Date().toISOString()
  };
};

export const presignPackage = async (
  payload: PackagePresignPayload
): Promise<PackagePresignResponse> => {
  return apiRequest<PackagePresignResponse>(
    "POST",
    "/v1/admin/packages/presign",
    payload
  );
};

export const commitPackage = async (
  payload: PackageCommitPayload
): Promise<PackageCommitResponse> => {
  return apiRequest<PackageCommitResponse>(
    "POST",
    "/v1/admin/packages/commit",
    payload
  );
};

export const listPackages = async (params?: {
  app_id?: string;
  placement_id?: string;
}): Promise<PackageRecord[]> => {
  const query = buildQuery({
    app_id: params?.app_id,
    placement_id: params?.placement_id
  });
  const data = await apiRequest<ApiPackageRecord[]>(
    "GET",
    `/v1/admin/packages${query}`
  );
  return data.map(normalizePackage);
};
