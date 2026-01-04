import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  seedApps,
  seedPlacements,
  seedVariants,
  type App,
  type Placement,
  type Variant
} from "../data/admin_seed";
import { generateId, getItems, setItems } from "../utils/storage";

const APPS_KEY = "dy_apps";
const PLACEMENTS_KEY = "dy_placements";
const VARIANTS_KEY = "dy_variants";

const statusClass = (status: string) => `status status-${status}`;

const today = () => new Date().toISOString().slice(0, 10);

export default function PlacementsPage() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    app_id: "",
    placement_id: "",
    type: "guide" as Placement["type"]
  });

  const loadData = () => {
    setLoading(true);
    setError(null);
    try {
      const appsRaw = window.localStorage.getItem(APPS_KEY);
      const storedApps = getItems<App>(APPS_KEY);
      const resolvedApps = appsRaw ? storedApps : seedApps;
      if (!appsRaw) {
        setItems(APPS_KEY, seedApps);
      }
      setApps(resolvedApps);

      const placementsRaw = window.localStorage.getItem(PLACEMENTS_KEY);
      const storedPlacements = getItems<Placement>(PLACEMENTS_KEY);
      const resolvedPlacements = placementsRaw ? storedPlacements : seedPlacements;
      if (!placementsRaw) {
        setItems(PLACEMENTS_KEY, seedPlacements);
      }
      setPlacements(resolvedPlacements);

      const variantsRaw = window.localStorage.getItem(VARIANTS_KEY);
      const storedVariants = getItems<Variant>(VARIANTS_KEY);
      const resolvedVariants = variantsRaw ? storedVariants : seedVariants;
      if (!variantsRaw) {
        setItems(VARIANTS_KEY, seedVariants);
      }
      setVariants(resolvedVariants);
    } catch (loadError) {
      setError("Failed to load placements data from localStorage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const savePlacements = (nextPlacements: Placement[]) => {
    setPlacements(nextPlacements);
    try {
      setItems(PLACEMENTS_KEY, nextPlacements);
    } catch (saveError) {
      setError("Failed to save placements to localStorage.");
    }
  };

  const filteredPlacements = useMemo(() => {
    if (filterAppId === "all") {
      return placements;
    }
    return placements.filter((placement) => placement.app_id === filterAppId);
  }, [placements, filterAppId]);

  const handleToggleEnabled = (target: Placement) => {
    const nextPlacements = placements.map((placement) =>
      placement.id === target.id
        ? { ...placement, enabled: !placement.enabled }
        : placement
    );
    savePlacements(nextPlacements);
  };

  const handleDelete = (target: Placement) => {
    if (!window.confirm(`Delete placement ${target.placement_id}?`)) {
      return;
    }
    const nextPlacements = placements.filter((placement) => placement.id !== target.id);
    savePlacements(nextPlacements);
  };

  const handleDefaultVariantChange = (placementId: string, nextVariantId: string) => {
    const value = nextVariantId || null;
    const nextPlacements = placements.map((placement) =>
      placement.placement_id === placementId
        ? { ...placement, default_variant_id: value }
        : placement
    );
    savePlacements(nextPlacements);
  };

  const openCreate = () => {
    const defaultAppId = apps[0]?.app_id ?? "";
    setError(null);
    setCreateForm({ app_id: defaultAppId, placement_id: "", type: "guide" });
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const placementId = createForm.placement_id.trim();
    if (!createForm.app_id) {
      setError("Select an app_id for the placement.");
      return;
    }
    if (!placementId) {
      setError("placement_id is required.");
      return;
    }
    if (placements.some((placement) => placement.placement_id === placementId)) {
      setError("placement_id already exists.");
      return;
    }

    const newPlacement: Placement = {
      id: generateId(),
      app_id: createForm.app_id,
      placement_id: placementId,
      type: createForm.type,
      enabled: true,
      default_variant_id: null,
      created_at: today()
    };

    const nextPlacements = [newPlacement, ...placements];
    savePlacements(nextPlacements);
    setError(null);
    setCreateOpen(false);
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          create_placement
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          refresh
        </button>
      </div>

      {loading && <div className="banner">loading placements...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <h3>placement_list</h3>
            <p>Enable placements and manage default variants.</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              app_id
              <select
                name="app_id"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              >
                <option value="all">all</option>
                {apps.map((app) => (
                  <option key={app.app_id} value={app.app_id}>
                    {app.app_id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost"
              type="button"
              onClick={() => setFilterAppId("all")}
            >
              reset
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>placement_id</th>
                <th>type</th>
                <th>enabled</th>
                <th>default_variant</th>
                <th>app_id</th>
                <th>created_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlacements.map((placement) => {
                const placementVariants = variants.filter(
                  (variant) => variant.placement_id === placement.placement_id
                );
                return (
                  <tr key={placement.id}>
                    <td>{placement.placement_id}</td>
                    <td>{placement.type}</td>
                    <td>
                      <span
                        className={statusClass(
                          placement.enabled ? "enabled" : "disabled"
                        )}
                      >
                        {placement.enabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td>
                      <select
                        className="table-select"
                        value={placement.default_variant_id ?? ""}
                        onChange={(event) =>
                          handleDefaultVariantChange(
                            placement.placement_id,
                            event.target.value
                          )
                        }
                      >
                        <option value="">none</option>
                        {placementVariants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>{placement.app_id}</td>
                    <td>{placement.created_at}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleToggleEnabled(placement)}
                        >
                          {placement.enabled ? "disable" : "enable"}
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleDelete(placement)}
                        >
                          delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredPlacements.length && !loading && (
                <tr>
                  <td colSpan={7}>No placements found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createOpen && (
        <div className="modal-backdrop" onClick={closeCreate}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>create_placement</h3>
              <button className="ghost small" type="button" onClick={closeCreate}>
                close
              </button>
            </div>
            <div className="modal-body">
              <form className="stack-form" onSubmit={handleCreate}>
                <label>
                  app_id
                  <select
                    name="app_id"
                    value={createForm.app_id}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        app_id: event.target.value
                      }))
                    }
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
                  <input
                    name="placement_id"
                    placeholder="plc_001"
                    value={createForm.placement_id}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        placement_id: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  type
                  <select
                    name="type"
                    value={createForm.type}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        type: event.target.value as Placement["type"]
                      }))
                    }
                  >
                    <option value="guide">guide</option>
                    <option value="paywall">paywall</option>
                  </select>
                </label>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeCreate}>
                    cancel
                  </button>
                  <button className="primary" type="submit">
                    create
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
