import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import { listPlacementsByApps } from "../api/placements";
import {
  commitPackage,
  listPackages,
  presignPackage,
  type PackagePresignResponse
} from "../api/packages";
import { listVariantsByPlacements } from "../api/variants";
import type {
  App,
  PackageManifest,
  PackageRecord,
  PackageStatus,
  Placement,
  Variant
} from "../api/types";
import { seedApps, seedPlacements, seedVariants } from "../data/admin_seed";
import { generateId } from "../utils/storage";

type UploadPreview = {
  manifest: PackageManifest;
  checksum: string;
  size_bytes: number;
  file_name: string;
  cdn_url: string;
};

type UploadFormState = {
  app_id: string;
  placement_id: string;
  file: File | null;
};

const seedPackages: PackageRecord[] = [
  {
    id: "pkg_810",
    app_id: "app_9f21",
    placement_id: "plc_201",
    version: "1.4.2",
    checksum: "b9e1a0f",
    entry_path: "dist/index.html",
    cdn_url: "https://cdn.dingyue.local/app_9f21/plc_201/1.4.2/app_bundle.zip",
    size_bytes: 842113,
    status: "inactive",
    manifest: {
      manifest_version: 1,
      placement_type: "guide",
      package_version: "1.4.2",
      entry_path: "dist/index.html"
    },
    created_at: "2024-02-11"
  },
  {
    id: "pkg_812",
    app_id: "app_9f21",
    placement_id: "plc_201",
    version: "1.4.4",
    checksum: "a4c0e2b",
    entry_path: "dist/index.html",
    cdn_url: "https://cdn.dingyue.local/app_9f21/plc_201/1.4.4/app_bundle.zip",
    size_bytes: 910552,
    status: "active",
    manifest: {
      manifest_version: 1,
      placement_type: "guide",
      package_version: "1.4.4",
      entry_path: "dist/index.html"
    },
    created_at: "2024-02-13"
  },
  {
    id: "pkg_820",
    app_id: "app_9f21",
    placement_id: "plc_202",
    version: "2.0.5",
    checksum: "e4d12c1",
    entry_path: "dist/index.html",
    cdn_url: "https://cdn.dingyue.local/app_9f21/plc_202/2.0.5/paywall.zip",
    size_bytes: 1208440,
    status: "rolled_back",
    manifest: {
      manifest_version: 1,
      placement_type: "paywall",
      package_version: "2.0.5",
      entry_path: "dist/index.html"
    },
    created_at: "2024-01-22"
  },
  {
    id: "pkg_821",
    app_id: "app_9f21",
    placement_id: "plc_202",
    version: "2.1.0",
    checksum: "c3d71af",
    entry_path: "dist/index.html",
    cdn_url: "https://cdn.dingyue.local/app_9f21/plc_202/2.1.0/paywall.zip",
    size_bytes: 1284330,
    status: "active",
    manifest: {
      manifest_version: 1,
      placement_type: "paywall",
      package_version: "2.1.0",
      entry_path: "dist/index.html"
    },
    created_at: "2024-02-06"
  },
  {
    id: "pkg_830",
    app_id: "app_7a10",
    placement_id: "plc_203",
    version: "1.3.8",
    checksum: "d1f6a22",
    entry_path: "dist/index.html",
    cdn_url: "https://cdn.dingyue.local/app_7a10/plc_203/1.3.8/onboarding.zip",
    size_bytes: 774210,
    status: "active",
    manifest: {
      manifest_version: 1,
      placement_type: "guide",
      package_version: "1.3.8",
      entry_path: "dist/index.html"
    },
    created_at: "2024-02-01"
  }
];

const statusClass = (status: PackageStatus) => `status status-${status}`;

const today = () => new Date().toISOString().slice(0, 10);

const buildShortId = (prefix: string) => {
  const base = generateId().replace(/-/g, "");
  return `${prefix}_${base.slice(0, 6)}`;
};

const inferVersion = (fileName: string) => {
  const match = fileName.match(/(\d+\.\d+\.\d+)/);
  if (match) {
    return match[1];
  }
  const now = new Date();
  return `1.${now.getMonth() + 1}.${now.getDate()}`;
};

const checksumFromFile = (file: File) => {
  const seed = `${file.name}:${file.size}:${file.lastModified}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, "0");
  return hex.slice(0, 8);
};

const buildCdnUrl = (
  appId: string,
  placementId: string,
  version: string,
  fileName: string
) => `https://cdn.dingyue.local/${appId}/${placementId}/${version}/${fileName}`;

export default function PackagesPage() {
  const [packages, setPackages] = useState<PackageRecord[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("");
  const [filterPlacementId, setFilterPlacementId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | PackageStatus>("all");
  const [uploadForm, setUploadForm] = useState<UploadFormState>({
    app_id: "",
    placement_id: "",
    file: null
  });
  const [uploadPreview, setUploadPreview] = useState<UploadPreview | null>(null);
  const [presignInfo, setPresignInfo] = useState<PackagePresignResponse | null>(
    null
  );
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const appsData = await listApps();
      setApps(appsData);
      const placementsData = await listPlacementsByApps(
        appsData.map((app) => app.app_id)
      );
      setPlacements(placementsData);
      const variantsData = await listVariantsByPlacements(placementsData);
      setVariants(variantsData);
      const packagesData = await listPackages();
      setPackages(packagesData);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setApps(seedApps);
        setPlacements(seedPlacements);
        setVariants(seedVariants);
        setPackages(seedPackages);
        setError("API unavailable. Showing mock packages.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (apps.length && !uploadForm.app_id) {
      const defaultAppId = apps[0]?.app_id ?? "";
      const defaultPlacementId =
        placements.find((placement) => placement.app_id === defaultAppId)
          ?.placement_id ?? "";
      setUploadForm((prev) => ({
        ...prev,
        app_id: defaultAppId,
        placement_id: defaultPlacementId
      }));
    }
  }, [apps, placements, uploadForm.app_id]);

  useEffect(() => {
    if (
      filterPlacementId &&
      !placements.some(
        (placement) =>
          placement.placement_id === filterPlacementId &&
          (!filterAppId || placement.app_id === filterAppId)
      )
    ) {
      setFilterPlacementId("");
    }
  }, [filterAppId, filterPlacementId, placements]);

  useEffect(() => {
    if (packages.length && !selectedPackageId) {
      setSelectedPackageId(packages[0]?.id ?? "");
      return;
    }
    if (selectedPackageId && !packages.some((pkg) => pkg.id === selectedPackageId)) {
      setSelectedPackageId(packages[0]?.id ?? "");
    }
  }, [packages, selectedPackageId]);

  const filteredPlacements = useMemo(() => {
    if (!filterAppId) {
      return placements;
    }
    return placements.filter((placement) => placement.app_id === filterAppId);
  }, [placements, filterAppId]);

  const uploadPlacements = useMemo(() => {
    if (!uploadForm.app_id) {
      return placements;
    }
    return placements.filter((placement) => placement.app_id === uploadForm.app_id);
  }, [placements, uploadForm.app_id]);

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const matchesApp = !filterAppId || pkg.app_id === filterAppId;
      const matchesPlacement =
        !filterPlacementId || pkg.placement_id === filterPlacementId;
      const matchesStatus = filterStatus === "all" || pkg.status === filterStatus;
      return matchesApp && matchesPlacement && matchesStatus;
    });
  }, [packages, filterAppId, filterPlacementId, filterStatus]);

  const selectedPackage =
    packages.find((pkg) => pkg.id === selectedPackageId) ?? null;

  const selectedVariants = useMemo(() => {
    if (!selectedPackage) {
      return [];
    }
    return variants.filter((variant) => variant.package_id === selectedPackage.id);
  }, [selectedPackage, variants]);

  const handleUploadAppChange = (value: string) => {
    const nextPlacements = placements.filter(
      (placement) => placement.app_id === value
    );
    setUploadForm((prev) => ({
      ...prev,
      app_id: value,
      placement_id: nextPlacements.some(
        (placement) => placement.placement_id === prev.placement_id
      )
        ? prev.placement_id
        : nextPlacements[0]?.placement_id ?? ""
    }));
    setUploadPreview(null);
    setPresignInfo(null);
  };

  const handleUploadPlacementChange = (value: string) => {
    setUploadForm((prev) => ({
      ...prev,
      placement_id: value
    }));
    setUploadPreview(null);
    setPresignInfo(null);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadForm((prev) => ({ ...prev, file }));
    setUploadPreview(null);
    setPresignInfo(null);
  };

  const resetUpload = () => {
    setUploadForm((prev) => ({ ...prev, file: null }));
    setUploadPreview(null);
    setPresignInfo(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleParseManifest = async () => {
    setError(null);
    setSuccess(null);
    if (!uploadForm.app_id || !uploadForm.placement_id) {
      setError("Select app_id and placement_id before uploading.");
      return;
    }
    if (!uploadForm.file) {
      setError("Select a zip file to upload.");
      return;
    }
    if (!uploadForm.file.name.toLowerCase().endsWith(".zip")) {
      setError("Package file must be a .zip archive.");
      return;
    }

    const placementType =
      placements.find(
        (placement) => placement.placement_id === uploadForm.placement_id
      )?.type ?? "paywall";
    const version = inferVersion(uploadForm.file.name);
    const entryPath = "dist/index.html";
    const manifest: PackageManifest = {
      manifest_version: 1,
      placement_type: placementType,
      package_version: version,
      entry_path: entryPath
    };
    const checksum = checksumFromFile(uploadForm.file);
    const cdnUrl = buildCdnUrl(
      uploadForm.app_id,
      uploadForm.placement_id,
      version,
      uploadForm.file.name
    );
    const preview = {
      manifest,
      checksum,
      size_bytes: uploadForm.file.size,
      file_name: uploadForm.file.name,
      cdn_url: cdnUrl
    };

    setUploadPreview(preview);
    try {
      const presign = await presignPackage({
        app_id: uploadForm.app_id,
        placement_id: uploadForm.placement_id,
        filename: uploadForm.file.name
      });
      setPresignInfo(presign);
    } catch (presignError) {
      if (shouldUseFallback(presignError)) {
        setPresignInfo(null);
        setError("API unavailable. Using local upload flow.");
      } else {
        setError(getErrorMessage(presignError));
      }
    }
  };

  const handleConfirmUpload = async () => {
    setError(null);
    setSuccess(null);
    if (!uploadForm.file || !uploadPreview) {
      setError("Parse manifest before confirming upload.");
      return;
    }

    const hasActive = packages.some(
      (pkg) =>
        pkg.app_id === uploadForm.app_id &&
        pkg.placement_id === uploadForm.placement_id &&
        pkg.status === "active"
    );
    const status: PackageStatus = hasActive ? "inactive" : "active";
    const buildLocalPackage = (): PackageRecord => ({
      id: buildShortId("pkg"),
      app_id: uploadForm.app_id,
      placement_id: uploadForm.placement_id,
      version: uploadPreview.manifest.package_version,
      checksum: uploadPreview.checksum,
      entry_path: uploadPreview.manifest.entry_path,
      cdn_url: uploadPreview.cdn_url,
      size_bytes: uploadPreview.size_bytes,
      status,
      manifest: uploadPreview.manifest,
      created_at: today()
    });

    if (presignInfo) {
      try {
        if (!presignInfo.upload_url.startsWith("http")) {
          throw new Error("Upload URL is not reachable.");
        }
        const uploadResponse = await fetch(presignInfo.upload_url, {
          method: "PUT",
          body: uploadForm.file
        });
        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}.`);
        }
        const committed = await commitPackage({
          app_id: uploadForm.app_id,
          package_id: presignInfo.package_id,
          storage_key: presignInfo.storage_key
        });
        const nextPackage: PackageRecord = {
          id: committed.package_id,
          app_id: uploadForm.app_id,
          placement_id: committed.placement_id ?? uploadForm.placement_id,
          version: committed.version,
          checksum: committed.checksum,
          entry_path: committed.entry_path,
          cdn_url: committed.cdn_url,
          size_bytes: committed.size_bytes,
          status,
          manifest: uploadPreview.manifest,
          created_at: committed.created_at ?? today()
        };
        setPackages((prev) => [nextPackage, ...prev]);
        setSelectedPackageId(nextPackage.id);
        resetUpload();
        setSuccess("Package uploaded. Activate the version when ready.");
        return;
      } catch (uploadError) {
        if (shouldUseFallback(uploadError)) {
          const nextPackage = buildLocalPackage();
          setPackages((prev) => [nextPackage, ...prev]);
          setSelectedPackageId(nextPackage.id);
          resetUpload();
          setSuccess("Package uploaded locally. Activate the version when ready.");
          setError("API unavailable. Stored package locally.");
          return;
        }
        setError(getErrorMessage(uploadError));
        return;
      }
    }

    if (import.meta.env.DEV) {
      const nextPackage = buildLocalPackage();
      setPackages((prev) => [nextPackage, ...prev]);
      setSelectedPackageId(nextPackage.id);
      resetUpload();
      setSuccess("Package uploaded locally. Activate the version when ready.");
      setError("API unavailable. Stored package locally.");
      return;
    }

    setError("Upload signature missing. Refresh and try again.");
  };

  const handleActivate = (target: PackageRecord) => {
    if (target.status === "active") {
      return;
    }
    setError(null);
    setSuccess(null);
    const nextPackages = packages.map((pkg) => {
      if (pkg.app_id !== target.app_id || pkg.placement_id !== target.placement_id) {
        return pkg;
      }
      if (pkg.id === target.id) {
        return { ...pkg, status: "active" };
      }
      if (pkg.status === "active") {
        return { ...pkg, status: "inactive" };
      }
      return pkg;
    });
    setPackages(nextPackages);
    setSuccess(`Activated version ${target.version}.`);
  };

  const getRollbackTarget = (target: PackageRecord) => {
    const siblings = packages
      .filter(
        (pkg) =>
          pkg.app_id === target.app_id && pkg.placement_id === target.placement_id
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const activeIndex = siblings.findIndex((pkg) => pkg.id === target.id);
    if (activeIndex === -1) {
      return null;
    }
    return siblings[activeIndex + 1] ?? null;
  };

  const handleRollback = (target: PackageRecord) => {
    setError(null);
    setSuccess(null);
    const rollbackTarget = getRollbackTarget(target);
    if (!rollbackTarget) {
      setError("No previous version available for rollback.");
      return;
    }
    const nextPackages = packages.map((pkg) => {
      if (pkg.app_id !== target.app_id || pkg.placement_id !== target.placement_id) {
        return pkg;
      }
      if (pkg.id === target.id) {
        return { ...pkg, status: "rolled_back" };
      }
      if (pkg.id === rollbackTarget.id) {
        return { ...pkg, status: "active" };
      }
      if (pkg.status === "active") {
        return { ...pkg, status: "inactive" };
      }
      return pkg;
    });
    setPackages(nextPackages);
    setSuccess(`Rolled back to version ${rollbackTarget.version}.`);
  };

  const handleDelete = (target: PackageRecord) => {
    setError(null);
    setSuccess(null);
    if (target.status === "active") {
      setError("Cannot delete active version. Activate another version first.");
      return;
    }
    if (!window.confirm(`Delete package ${target.id}?`)) {
      return;
    }
    const nextPackages = packages.filter((pkg) => pkg.id !== target.id);
    setPackages(nextPackages);
    setSuccess(`Deleted package ${target.id}.`);
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={loadData}>
          refresh
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            setFilterAppId("");
            setFilterPlacementId("");
            setFilterStatus("all");
          }}
        >
          reset_filters
        </button>
      </div>

      {loading && <div className="banner">loading packages...</div>}
      {error && <div className="banner error">{error}</div>}
      {success && <div className="banner success">{success}</div>}

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>upload_package</h3>
              <p>Upload zip bundle and preview manifest.json before confirm.</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              app_id
              <select
                name="app_id"
                value={uploadForm.app_id}
                onChange={(event) => handleUploadAppChange(event.target.value)}
              >
                <option value="">select_app</option>
                {apps.map((app) => (
                  <option key={app.app_id} value={app.app_id}>
                    {app.app_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              placement_id
              <select
                name="placement_id"
                value={uploadForm.placement_id}
                onChange={(event) => handleUploadPlacementChange(event.target.value)}
              >
                <option value="">select_placement</option>
                {uploadPlacements.map((placement) => (
                  <option key={placement.placement_id} value={placement.placement_id}>
                    {placement.placement_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              package_file
              <input
                name="package_file"
                type="file"
                accept=".zip"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </label>
            {uploadForm.file && (
              <p className="form-hint">
                selected_file: {uploadForm.file.name} ({uploadForm.file.size.toLocaleString()}{" "}
                bytes)
              </p>
            )}
            <button className="ghost" type="button" onClick={handleParseManifest}>
              parse_manifest
            </button>
            {uploadPreview ? (
              <>
                <div className="chip-list">
                  <span>version: {uploadPreview.manifest.package_version}</span>
                  <span>placement_type: {uploadPreview.manifest.placement_type}</span>
                  <span>entry_path: {uploadPreview.manifest.entry_path}</span>
                  <span>checksum: {uploadPreview.checksum}</span>
                </div>
                <pre className="code-block">
                  {JSON.stringify(uploadPreview.manifest, null, 2)}
                </pre>
              </>
            ) : (
              <p className="form-hint">
                Parse manifest.json to preview version and entry_path.
              </p>
            )}
            <div className="modal-actions">
              <button className="ghost" type="button" onClick={resetUpload}>
                clear
              </button>
              <button
                className="primary"
                type="button"
                onClick={handleConfirmUpload}
                disabled={!uploadPreview}
              >
                confirm_upload
              </button>
            </div>
          </form>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>package_detail</h3>
              <p>Manifest payload, CDN URL, checksum, and linked variants.</p>
            </div>
          </div>
          {selectedPackage ? (
            <>
              <div className="chip-list">
                <span>package_id: {selectedPackage.id}</span>
                <span>app_id: {selectedPackage.app_id}</span>
                <span>placement_id: {selectedPackage.placement_id}</span>
                <span>version: {selectedPackage.version}</span>
                <span>entry_path: {selectedPackage.entry_path}</span>
                <span>status: {selectedPackage.status}</span>
                <span>
                  size_bytes: {selectedPackage.size_bytes.toLocaleString()}
                </span>
              </div>
              <div className="key-row">
                <div>
                  <div className="key-label">cdn_url</div>
                  <div className="key-value">{selectedPackage.cdn_url}</div>
                </div>
              </div>
              <div className="key-row">
                <div>
                  <div className="key-label">checksum</div>
                  <div className="key-value">{selectedPackage.checksum}</div>
                </div>
              </div>
              <div>
                <div className="form-hint">manifest.json</div>
                <pre className="code-block">
                  {JSON.stringify(selectedPackage.manifest, null, 2)}
                </pre>
              </div>
              <div>
                <div className="form-hint">variants</div>
                {selectedVariants.length ? (
                  <div className="chip-list">
                    {selectedVariants.map((variant) => (
                      <span key={variant.id}>
                        variant_id: {variant.id}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="form-hint">No variants linked to this package.</p>
                )}
              </div>
            </>
          ) : (
            <p className="form-hint">
              Select a package from the list to view details.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>package_list</h3>
            <p>Uploaded packages and active versions.</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              app_id
              <select
                name="app_id"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              >
                <option value="">all</option>
                {apps.map((app) => (
                  <option key={app.app_id} value={app.app_id}>
                    {app.app_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              placement_id
              <select
                name="placement_id"
                value={filterPlacementId}
                onChange={(event) => setFilterPlacementId(event.target.value)}
              >
                <option value="">all</option>
                {filteredPlacements.map((placement) => (
                  <option key={placement.placement_id} value={placement.placement_id}>
                    {placement.placement_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              status
              <select
                name="status"
                value={filterStatus}
                onChange={(event) =>
                  setFilterStatus(event.target.value as "all" | PackageStatus)
                }
              >
                <option value="all">all</option>
                <option value="active">active</option>
                <option value="inactive">inactive</option>
                <option value="rolled_back">rolled_back</option>
              </select>
            </label>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>package_id</th>
                <th>version</th>
                <th>entry_path</th>
                <th>checksum</th>
                <th>status</th>
                <th>size_bytes</th>
                <th>uploaded_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPackages.map((pkg) => {
                const rollbackTarget = pkg.status === "active"
                  ? getRollbackTarget(pkg)
                  : null;
                return (
                  <tr
                    key={pkg.id}
                    onClick={() => setSelectedPackageId(pkg.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{pkg.id}</td>
                    <td>{pkg.version}</td>
                    <td>{pkg.entry_path}</td>
                    <td>{pkg.checksum}</td>
                    <td>
                      <span className={statusClass(pkg.status)}>{pkg.status}</span>
                    </td>
                    <td>{pkg.size_bytes.toLocaleString()}</td>
                    <td>{pkg.created_at}</td>
                    <td>
                      <div className="table-actions">
                        {pkg.status === "active" ? (
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleRollback(pkg)}
                            disabled={!rollbackTarget}
                          >
                            rollback
                          </button>
                        ) : (
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleActivate(pkg)}
                          >
                            activate
                          </button>
                        )}
                        {pkg.status !== "active" && (
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() => handleDelete(pkg)}
                          >
                            delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredPackages.length && !loading && (
                <tr>
                  <td colSpan={8}>No packages found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
