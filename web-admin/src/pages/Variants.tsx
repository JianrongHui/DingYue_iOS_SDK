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

const buildShortId = (prefix: string) => {
  const base = generateId().replace(/-/g, "");
  return `${prefix}_${base.slice(0, 6)}`;
};

const parseProductIds = (value: string) =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

type VariantFormState = {
  app_id: string;
  placement_id: string;
  package_id: string;
  offering_id: string;
  product_ids: string;
  priority: number;
  enabled: boolean;
  auto_close_on_success: boolean;
  auto_close_on_restore: boolean;
};

const toFormState = (variant: Variant): VariantFormState => ({
  app_id: variant.app_id,
  placement_id: variant.placement_id,
  package_id: variant.package_id,
  offering_id: variant.offering_id,
  product_ids: variant.product_ids.join("\n"),
  priority: variant.priority,
  enabled: variant.enabled,
  auto_close_on_success: variant.page_options.auto_close_on_success,
  auto_close_on_restore: variant.page_options.auto_close_on_restore
});

const emptyFormState: VariantFormState = {
  app_id: "",
  placement_id: "",
  package_id: "",
  offering_id: "",
  product_ids: "",
  priority: 1,
  enabled: true,
  auto_close_on_success: false,
  auto_close_on_restore: false
};

export default function VariantsPage() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("");
  const [filterPlacementId, setFilterPlacementId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState<Variant | null>(null);
  const [form, setForm] = useState<VariantFormState>(emptyFormState);

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
      setError("Failed to load variants data from localStorage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const saveVariants = (nextVariants: Variant[]) => {
    setVariants(nextVariants);
    try {
      setItems(VARIANTS_KEY, nextVariants);
    } catch (saveError) {
      setError("Failed to save variants to localStorage.");
    }
  };

  const filteredPlacements = useMemo(() => {
    if (!filterAppId) {
      return placements;
    }
    return placements.filter((placement) => placement.app_id === filterAppId);
  }, [placements, filterAppId]);

  const filteredVariants = useMemo(() => {
    return variants.filter((variant) => {
      const matchesApp = !filterAppId || variant.app_id === filterAppId;
      const matchesPlacement =
        !filterPlacementId || variant.placement_id === filterPlacementId;
      return matchesApp && matchesPlacement;
    });
  }, [variants, filterAppId, filterPlacementId]);

  const highlightedVariant = filteredVariants[0] ?? variants[0] ?? null;

  const openCreate = () => {
    const defaultAppId = apps[0]?.app_id ?? "";
    const defaultPlacementId =
      placements.find((placement) => placement.app_id === defaultAppId)
        ?.placement_id ?? "";
    setError(null);
    setEditingVariant(null);
    setForm({
      ...emptyFormState,
      app_id: defaultAppId,
      placement_id: defaultPlacementId
    });
    setModalOpen(true);
  };

  const openEdit = (variant: Variant) => {
    setError(null);
    setEditingVariant(variant);
    setForm(toFormState(variant));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingVariant(null);
  };

  const handleToggleEnabled = (target: Variant) => {
    const nextVariants = variants.map((variant) =>
      variant.id === target.id
        ? { ...variant, enabled: !variant.enabled }
        : variant
    );
    saveVariants(nextVariants);
  };

  const handleDelete = (target: Variant) => {
    if (!window.confirm(`Delete variant ${target.id}?`)) {
      return;
    }
    const nextVariants = variants.filter((variant) => variant.id !== target.id);
    saveVariants(nextVariants);
  };

  const handleFormAppChange = (value: string) => {
    const availablePlacements = placements.filter(
      (placement) => placement.app_id === value
    );
    setForm((prev) => {
      const nextPlacementId = availablePlacements.some(
        (placement) => placement.placement_id === prev.placement_id
      )
        ? prev.placement_id
        : availablePlacements[0]?.placement_id ?? "";
      return {
        ...prev,
        app_id: value,
        placement_id: nextPlacementId
      };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.app_id || !form.placement_id || !form.package_id.trim()) {
      setError("app_id, placement_id, and package_id are required.");
      return;
    }

    const productIds = parseProductIds(form.product_ids);
    const nextVariant: Variant = {
      id: editingVariant?.id ?? buildShortId("var"),
      app_id: form.app_id,
      placement_id: form.placement_id,
      package_id: form.package_id.trim(),
      offering_id: form.offering_id.trim(),
      product_ids: productIds,
      priority: Number.isNaN(form.priority) ? 0 : Number(form.priority),
      enabled: form.enabled,
      page_options: {
        auto_close_on_success: form.auto_close_on_success,
        auto_close_on_restore: form.auto_close_on_restore
      },
      created_at: editingVariant?.created_at ?? today()
    };

    const nextVariants = editingVariant
      ? variants.map((variant) =>
          variant.id === editingVariant.id ? nextVariant : variant
        )
      : [nextVariant, ...variants];

    saveVariants(nextVariants);
    setError(null);
    setModalOpen(false);
    setEditingVariant(null);
  };

  const formPlacements = placements.filter(
    (placement) => placement.app_id === form.app_id
  );

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          create_variant
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          refresh
        </button>
      </div>

      {loading && <div className="banner">loading variants...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>offering_config</h3>
              <p>Preview offering_id and product_ids order.</p>
            </div>
          </div>
          {highlightedVariant ? (
            <div className="chip-list">
              <span>variant_id: {highlightedVariant.id}</span>
              <span>offering_id: {highlightedVariant.offering_id || "-"}</span>
              <span>package_id: {highlightedVariant.package_id}</span>
              {highlightedVariant.product_ids.map((productId) => (
                <span key={`${highlightedVariant.id}-${productId}`}>
                  product_id: {productId}
                </span>
              ))}
            </div>
          ) : (
            <p className="form-hint">No variants yet. Create one to preview.</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>page_options</h3>
              <p>Payload sent to client on render.</p>
            </div>
          </div>
          <pre className="code-block">
            {JSON.stringify(highlightedVariant?.page_options ?? {}, null, 2)}
          </pre>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>variant_list</h3>
            <p>Enabled variants and package bindings.</p>
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
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setFilterAppId("");
                setFilterPlacementId("");
              }}
            >
              reset
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>variant_id</th>
                <th>app_id</th>
                <th>placement_id</th>
                <th>package_id</th>
                <th>offering_id</th>
                <th>product_ids</th>
                <th>priority</th>
                <th>enabled</th>
                <th>page_options</th>
                <th>created_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVariants.map((variant) => (
                <tr key={variant.id}>
                  <td>{variant.id}</td>
                  <td>{variant.app_id}</td>
                  <td>{variant.placement_id}</td>
                  <td>{variant.package_id}</td>
                  <td>{variant.offering_id || "-"}</td>
                  <td>{variant.product_ids.join(", ") || "-"}</td>
                  <td>{variant.priority}</td>
                  <td>
                    <span
                      className={statusClass(
                        variant.enabled ? "enabled" : "disabled"
                      )}
                    >
                      {variant.enabled ? "enabled" : "disabled"}
                    </span>
                  </td>
                  <td>
                    <div className="chip-list">
                      <span>
                        success:{" "}
                        {variant.page_options.auto_close_on_success ? "on" : "off"}
                      </span>
                      <span>
                        restore:{" "}
                        {variant.page_options.auto_close_on_restore ? "on" : "off"}
                      </span>
                    </div>
                  </td>
                  <td>{variant.created_at}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => openEdit(variant)}
                      >
                        edit
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleToggleEnabled(variant)}
                      >
                        {variant.enabled ? "disable" : "enable"}
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(variant)}
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredVariants.length && !loading && (
                <tr>
                  <td colSpan={11}>No variants found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal large"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{editingVariant ? "edit_variant" : "create_variant"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                close
              </button>
            </div>
            <div className="modal-body">
              <form className="stack-form" onSubmit={handleSubmit}>
                <label>
                  app_id
                  <select
                    name="app_id"
                    value={form.app_id}
                    onChange={(event) => handleFormAppChange(event.target.value)}
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
                    value={form.placement_id}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        placement_id: event.target.value
                      }))
                    }
                  >
                    <option value="">select_placement</option>
                    {formPlacements.map((placement) => (
                      <option key={placement.placement_id} value={placement.placement_id}>
                        {placement.placement_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  package_id
                  <input
                    name="package_id"
                    placeholder="pkg_001"
                    value={form.package_id}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        package_id: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  offering_id
                  <input
                    name="offering_id"
                    placeholder="offer_promo"
                    value={form.offering_id}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        offering_id: event.target.value
                      }))
                    }
                  />
                </label>
                <label>
                  product_ids
                  <textarea
                    name="product_ids"
                    placeholder="prod_trial, prod_annual"
                    value={form.product_ids}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        product_ids: event.target.value
                      }))
                    }
                  />
                </label>
                <p className="form-hint">
                  Enter multiple product_ids separated by commas or new lines.
                </p>
                <label>
                  priority
                  <input
                    name="priority"
                    type="number"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priority: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    name="enabled"
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        enabled: event.target.checked
                      }))
                    }
                  />
                  enabled
                </label>
                <div>
                  <div className="form-hint">page_options</div>
                  <label className="checkbox-row">
                    <input
                      name="auto_close_on_success"
                      type="checkbox"
                      checked={form.auto_close_on_success}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          auto_close_on_success: event.target.checked
                        }))
                      }
                    />
                    auto_close_on_success
                  </label>
                  <label className="checkbox-row">
                    <input
                      name="auto_close_on_restore"
                      type="checkbox"
                      checked={form.auto_close_on_restore}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          auto_close_on_restore: event.target.checked
                        }))
                      }
                    />
                    auto_close_on_restore
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    cancel
                  </button>
                  <button className="primary" type="submit">
                    {editingVariant ? "save" : "create"}
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
