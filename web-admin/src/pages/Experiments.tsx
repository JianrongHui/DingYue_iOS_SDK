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
const EXPERIMENTS_KEY = "dy_experiments";

type ExperimentStatus = "draft" | "running" | "paused" | "ended";

type ExperimentVariant = {
  variant_id: string;
  weight: number;
};

type Experiment = {
  id: string;
  app_id: string;
  placement_id: string;
  status: ExperimentStatus;
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
  created_at: string;
  started_at?: string;
  ended_at?: string;
};

type ExperimentFormState = {
  app_id: string;
  placement_id: string;
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
};

const statusClass = (status: ExperimentStatus) => `status status-${status}`;

const today = () => new Date().toISOString().slice(0, 10);

const buildShortId = (prefix: string) => {
  const base = generateId().replace(/-/g, "");
  return `${prefix}_${base.slice(0, 6)}`;
};

const buildSeed = () => generateId();

const seedExperiments: Experiment[] = [
  {
    id: "exp_701",
    app_id: "app_9f21",
    placement_id: "plc_201",
    status: "running",
    traffic: 30,
    seed: "seed_2f91a",
    variants: [
      { variant_id: "var_401", weight: 60 },
      { variant_id: "var_404", weight: 40 }
    ],
    created_at: "2024-02-01",
    started_at: "2024-02-03"
  },
  {
    id: "exp_702",
    app_id: "app_9f21",
    placement_id: "plc_202",
    status: "paused",
    traffic: 20,
    seed: "seed_baa3f",
    variants: [
      { variant_id: "var_402", weight: 50 },
      { variant_id: "var_405", weight: 50 }
    ],
    created_at: "2024-02-06",
    started_at: "2024-02-08"
  },
  {
    id: "exp_703",
    app_id: "app_7a10",
    placement_id: "plc_203",
    status: "ended",
    traffic: 15,
    seed: "seed_8d773",
    variants: [
      { variant_id: "var_403", weight: 55 },
      { variant_id: "var_406", weight: 45 }
    ],
    created_at: "2024-01-18",
    started_at: "2024-01-20",
    ended_at: "2024-02-01"
  }
];

const hashString = (value: string) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const getPlacementVariants = (placementId: string, allVariants: Variant[]) =>
  allVariants.filter((variant) => variant.placement_id === placementId);

const createDefaultVariants = (
  placementId: string,
  allVariants: Variant[]
): ExperimentVariant[] => {
  const options = getPlacementVariants(placementId, allVariants);
  if (options.length >= 2) {
    const selected = options.slice(0, 2);
    const weight = Math.floor(100 / selected.length);
    return selected.map((variant, index) => ({
      variant_id: variant.id,
      weight: index === selected.length - 1 ? 100 - weight * index : weight
    }));
  }
  if (options.length === 1) {
    return [
      { variant_id: options[0].id, weight: 50 },
      { variant_id: "", weight: 50 }
    ];
  }
  return [
    { variant_id: "", weight: 50 },
    { variant_id: "", weight: 50 }
  ];
};

const normalizeVariantsForPlacement = (
  placementId: string,
  current: ExperimentVariant[],
  allVariants: Variant[]
) => {
  const allowed = new Set(
    getPlacementVariants(placementId, allVariants).map((variant) => variant.id)
  );
  const filtered = current.filter((variant) => allowed.has(variant.variant_id));
  if (filtered.length >= 2) {
    return filtered;
  }
  return createDefaultVariants(placementId, allVariants);
};

const buildVariantStats = (experiment: Experiment) => {
  const seedValue = hashString(`${experiment.id}-${experiment.seed}`);
  const baseExposure = 2200 + (seedValue % 3800);
  const trafficExposure = Math.round((baseExposure * experiment.traffic) / 100);

  return experiment.variants.map((variant) => {
    const rateSeed = hashString(`${variant.variant_id}-${experiment.seed}`);
    const conversionRate = 0.02 + (rateSeed % 700) / 10000;
    const exposures = Math.round((trafficExposure * variant.weight) / 100);
    const conversions = Math.min(
      exposures,
      Math.max(0, Math.round(exposures * conversionRate))
    );
    return {
      ...variant,
      exposures,
      conversions,
      conversionRate: exposures ? conversions / exposures : 0
    };
  });
};

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("");
  const [filterPlacementId, setFilterPlacementId] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | ExperimentStatus>(
    "all"
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExperiment, setEditingExperiment] = useState<Experiment | null>(
    null
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<ExperimentFormState>({
    app_id: "",
    placement_id: "",
    traffic: 0,
    seed: buildSeed(),
    variants: []
  });
  const [selectedExperimentId, setSelectedExperimentId] = useState<string | null>(
    null
  );

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

      const experimentsRaw = window.localStorage.getItem(EXPERIMENTS_KEY);
      const storedExperiments = getItems<Experiment>(EXPERIMENTS_KEY);
      const resolvedExperiments = experimentsRaw
        ? storedExperiments
        : seedExperiments;
      if (!experimentsRaw) {
        setItems(EXPERIMENTS_KEY, seedExperiments);
      }
      setExperiments(resolvedExperiments);
    } catch (loadError) {
      setError("Failed to load experiments data from localStorage.");
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

  const saveExperiments = (nextExperiments: Experiment[]) => {
    setExperiments(nextExperiments);
    try {
      setItems(EXPERIMENTS_KEY, nextExperiments);
    } catch (saveError) {
      setError("Failed to save experiments to localStorage.");
    }
  };

  const filteredPlacements = useMemo(() => {
    if (!filterAppId) {
      return placements;
    }
    return placements.filter((placement) => placement.app_id === filterAppId);
  }, [placements, filterAppId]);

  const filteredExperiments = useMemo(() => {
    return experiments.filter((experiment) => {
      const matchesApp = !filterAppId || experiment.app_id === filterAppId;
      const matchesPlacement =
        !filterPlacementId || experiment.placement_id === filterPlacementId;
      const matchesStatus =
        filterStatus === "all" || experiment.status === filterStatus;
      return matchesApp && matchesPlacement && matchesStatus;
    });
  }, [experiments, filterAppId, filterPlacementId, filterStatus]);

  const summary = useMemo(() => {
    const running = experiments.filter(
      (experiment) => experiment.status === "running"
    ).length;
    const paused = experiments.filter(
      (experiment) => experiment.status === "paused"
    ).length;
    const averageTraffic = experiments.length
      ? Math.round(
          experiments.reduce((sum, experiment) => sum + experiment.traffic, 0) /
            experiments.length
        )
      : 0;
    return { running, paused, averageTraffic };
  }, [experiments]);

  useEffect(() => {
    if (!filteredExperiments.length) {
      setSelectedExperimentId(null);
      return;
    }
    if (
      !selectedExperimentId ||
      !filteredExperiments.some((experiment) => experiment.id === selectedExperimentId)
    ) {
      setSelectedExperimentId(filteredExperiments[0].id);
    }
  }, [filteredExperiments, selectedExperimentId]);

  const selectedExperiment = filteredExperiments.find(
    (experiment) => experiment.id === selectedExperimentId
  );

  const totalWeight = useMemo(() => {
    return form.variants.reduce(
      (sum, variant) => sum + (Number.isNaN(variant.weight) ? 0 : variant.weight),
      0
    );
  }, [form.variants]);

  const formPlacements = placements.filter(
    (placement) => placement.app_id === form.app_id
  );

  const formPlacementVariants = useMemo(() => {
    return getPlacementVariants(form.placement_id, variants);
  }, [form.placement_id, variants]);

  const openCreate = () => {
    const defaultAppId = apps[0]?.app_id ?? "";
    const defaultPlacementId =
      placements.find((placement) => placement.app_id === defaultAppId)
        ?.placement_id ?? "";

    setError(null);
    setFormError(null);
    setEditingExperiment(null);
    setForm({
      app_id: defaultAppId,
      placement_id: defaultPlacementId,
      traffic: 20,
      seed: buildSeed(),
      variants: createDefaultVariants(defaultPlacementId, variants)
    });
    setModalOpen(true);
  };

  const openEdit = (experiment: Experiment) => {
    setError(null);
    setFormError(null);
    setEditingExperiment(experiment);
    setForm({
      app_id: experiment.app_id,
      placement_id: experiment.placement_id,
      traffic: experiment.traffic,
      seed: experiment.seed,
      variants: experiment.variants.map((variant) => ({ ...variant }))
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingExperiment(null);
    setFormError(null);
  };

  const handleFormAppChange = (value: string) => {
    setForm((prev) => {
      if (prev.app_id === value) {
        return prev;
      }
      const availablePlacements = placements.filter(
        (placement) => placement.app_id === value
      );
      const nextPlacementId = availablePlacements.some(
        (placement) => placement.placement_id === prev.placement_id
      )
        ? prev.placement_id
        : availablePlacements[0]?.placement_id ?? "";
      const nextVariants = normalizeVariantsForPlacement(
        nextPlacementId,
        prev.variants,
        variants
      );
      return {
        ...prev,
        app_id: value,
        placement_id: nextPlacementId,
        variants: nextVariants
      };
    });
  };

  const handleFormPlacementChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      placement_id: value,
      variants: normalizeVariantsForPlacement(value, prev.variants, variants)
    }));
  };

  const handleVariantChange = (
    index: number,
    key: keyof ExperimentVariant,
    value: string
  ) => {
    setForm((prev) => {
      const nextVariants = prev.variants.map((variant, currentIndex) => {
        if (currentIndex !== index) {
          return variant;
        }
        if (key === "weight") {
          const nextWeight = Number(value);
          return {
            ...variant,
            weight: Number.isNaN(nextWeight) ? 0 : nextWeight
          };
        }
        return { ...variant, variant_id: value };
      });
      return { ...prev, variants: nextVariants };
    });
  };

  const handleAddVariant = () => {
    setForm((prev) => ({
      ...prev,
      variants: [...prev.variants, { variant_id: "", weight: 0 }]
    }));
  };

  const handleRemoveVariant = (index: number) => {
    setForm((prev) => {
      if (prev.variants.length <= 2) {
        return prev;
      }
      const nextVariants = prev.variants.filter((_, currentIndex) => {
        return currentIndex !== index;
      });
      return { ...prev, variants: nextVariants };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const traffic = Number(form.traffic);
    if (!form.app_id || !form.placement_id) {
      setFormError("app_id and placement_id are required.");
      return;
    }
    if (Number.isNaN(traffic) || traffic < 0 || traffic > 100) {
      setFormError("traffic must be between 0 and 100.");
      return;
    }
    if (!form.seed.trim()) {
      setFormError("seed is required.");
      return;
    }

    const cleanedVariants = form.variants.map((variant) => ({
      variant_id: variant.variant_id.trim(),
      weight: Number(variant.weight)
    }));

    if (cleanedVariants.length < 2) {
      setFormError("At least two variants are required.");
      return;
    }

    if (cleanedVariants.some((variant) => !variant.variant_id)) {
      setFormError("Select a variant_id for each variant.");
      return;
    }

    const duplicateCheck = new Set<string>();
    for (const variant of cleanedVariants) {
      if (duplicateCheck.has(variant.variant_id)) {
        setFormError("variant_id must be unique within an experiment.");
        return;
      }
      duplicateCheck.add(variant.variant_id);
    }

    const allowedVariants = new Set(
      getPlacementVariants(form.placement_id, variants).map((item) => item.id)
    );
    if (cleanedVariants.some((variant) => !allowedVariants.has(variant.variant_id))) {
      setFormError("Variants must belong to the selected placement.");
      return;
    }

    const weightSum = cleanedVariants.reduce(
      (sum, variant) => sum + (Number.isNaN(variant.weight) ? 0 : variant.weight),
      0
    );
    if (Math.abs(weightSum - 100) > 0.01) {
      setFormError("Variant weights must sum to 100.");
      return;
    }

    if (
      cleanedVariants.some(
        (variant) => variant.weight < 0 || variant.weight > 100
      )
    ) {
      setFormError("Variant weights must be between 0 and 100.");
      return;
    }

    const nextExperiment: Experiment = {
      id: editingExperiment?.id ?? buildShortId("exp"),
      app_id: form.app_id,
      placement_id: form.placement_id,
      status: editingExperiment?.status ?? "draft",
      traffic,
      seed: form.seed.trim(),
      variants: cleanedVariants,
      created_at: editingExperiment?.created_at ?? today(),
      started_at: editingExperiment?.started_at,
      ended_at: editingExperiment?.ended_at
    };

    const nextExperiments = editingExperiment
      ? experiments.map((experiment) =>
          experiment.id === editingExperiment.id ? nextExperiment : experiment
        )
      : [nextExperiment, ...experiments];

    saveExperiments(nextExperiments);
    setModalOpen(false);
    setEditingExperiment(null);
    setFormError(null);
  };

  const updateExperiment = (
    target: Experiment,
    updates: Partial<Experiment>
  ) => {
    const nextExperiments = experiments.map((experiment) =>
      experiment.id === target.id ? { ...experiment, ...updates } : experiment
    );
    saveExperiments(nextExperiments);
  };

  const handleStart = (target: Experiment) => {
    if (target.status !== "draft") {
      return;
    }
    updateExperiment(target, {
      status: "running",
      started_at: target.started_at ?? today(),
      ended_at: undefined
    });
  };

  const handlePause = (target: Experiment) => {
    if (target.status !== "running") {
      return;
    }
    updateExperiment(target, { status: "paused" });
  };

  const handleResume = (target: Experiment) => {
    if (target.status !== "paused") {
      return;
    }
    updateExperiment(target, { status: "running" });
  };

  const handleEnd = (target: Experiment) => {
    if (target.status === "ended") {
      return;
    }
    updateExperiment(target, {
      status: "ended",
      ended_at: today()
    });
  };

  const handleDelete = (target: Experiment) => {
    if (!window.confirm(`Delete experiment ${target.id}?`)) {
      return;
    }
    const nextExperiments = experiments.filter(
      (experiment) => experiment.id !== target.id
    );
    saveExperiments(nextExperiments);
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          create_experiment
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          refresh
        </button>
      </div>

      {loading && <div className="banner">loading experiments...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid">
        <div className="card">
          <div className="card-label">running_experiments</div>
          <div className="card-value">{summary.running}</div>
        </div>
        <div className="card">
          <div className="card-label">paused_experiments</div>
          <div className="card-value">{summary.paused}</div>
        </div>
        <div className="card">
          <div className="card-label">avg_traffic</div>
          <div className="card-value">{summary.averageTraffic}%</div>
        </div>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>experiment_stats</h3>
              <p>Simulated exposure and conversion per variant.</p>
            </div>
            <label>
              experiment_id
              <select
                className="table-select"
                value={selectedExperimentId ?? ""}
                onChange={(event) => setSelectedExperimentId(event.target.value)}
              >
                <option value="">select_experiment</option>
                {filteredExperiments.map((experiment) => (
                  <option key={experiment.id} value={experiment.id}>
                    {experiment.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedExperiment ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>variant_id</th>
                    <th>weight</th>
                    <th>impressions</th>
                    <th>conversions</th>
                    <th>conversion_rate</th>
                  </tr>
                </thead>
                <tbody>
                  {buildVariantStats(selectedExperiment).map((variant) => (
                    <tr
                      key={`${selectedExperiment.id}-${variant.variant_id}`}
                    >
                      <td>{variant.variant_id}</td>
                      <td>{variant.weight}%</td>
                      <td>{variant.exposures}</td>
                      <td>{variant.conversions}</td>
                      <td>{(variant.conversionRate * 100).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="form-hint">Select an experiment to review stats.</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>bucket_rules</h3>
              <p>Stable bucketing for A/B traffic allocation.</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>traffic: 0-100 percentage of users entering the experiment</li>
            <li>bucket = hash(seed + user_id) % 100</li>
            <li>bucket >= traffic uses default variant</li>
            <li>bucket &lt; traffic uses weighted variants</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>experiment_list</h3>
            <p>Traffic split, seed, and variant weights.</p>
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
                  <option
                    key={placement.placement_id}
                    value={placement.placement_id}
                  >
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
                  setFilterStatus(event.target.value as "all" | ExperimentStatus)
                }
              >
                <option value="all">all</option>
                <option value="draft">draft</option>
                <option value="running">running</option>
                <option value="paused">paused</option>
                <option value="ended">ended</option>
              </select>
            </label>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setFilterAppId("");
                setFilterPlacementId("");
                setFilterStatus("all");
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
                <th>experiment_id</th>
                <th>app_id</th>
                <th>placement_id</th>
                <th>status</th>
                <th>traffic</th>
                <th>seed</th>
                <th>variants</th>
                <th>created_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExperiments.map((experiment) => {
                const canEdit =
                  experiment.status === "draft" || experiment.status === "paused";
                const canDelete =
                  experiment.status === "draft" || experiment.status === "ended";
                return (
                  <tr key={experiment.id}>
                    <td>{experiment.id}</td>
                    <td>{experiment.app_id}</td>
                    <td>{experiment.placement_id}</td>
                    <td>
                      <span className={statusClass(experiment.status)}>
                        {experiment.status}
                      </span>
                    </td>
                    <td>{experiment.traffic}%</td>
                    <td>{experiment.seed}</td>
                    <td>
                      {experiment.variants
                        .map(
                          (variant) =>
                            `${variant.variant_id} (${variant.weight}%)`
                        )
                        .join(", ")}
                    </td>
                    <td>{experiment.created_at}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="ghost small"
                          type="button"
                          disabled={!canEdit}
                          onClick={() => openEdit(experiment)}
                          title={
                            canEdit ? "" : "Only draft/paused experiments can be edited"
                          }
                        >
                          edit
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "draft"}
                          onClick={() => handleStart(experiment)}
                        >
                          start
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "running"}
                          onClick={() => handlePause(experiment)}
                        >
                          pause
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "paused"}
                          onClick={() => handleResume(experiment)}
                        >
                          resume
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status === "ended"}
                          onClick={() => handleEnd(experiment)}
                        >
                          end
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={!canDelete}
                          onClick={() => handleDelete(experiment)}
                          title={
                            canDelete
                              ? ""
                              : "Only draft/ended experiments can be deleted"
                          }
                        >
                          delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredExperiments.length && !loading && (
                <tr>
                  <td colSpan={9}>No experiments found.</td>
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
              <h3>{editingExperiment ? "edit_experiment" : "create_experiment"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                close
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="banner error">{formError}</div>}
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
                    onChange={(event) => handleFormPlacementChange(event.target.value)}
                  >
                    <option value="">select_placement</option>
                    {formPlacements.map((placement) => (
                      <option
                        key={placement.placement_id}
                        value={placement.placement_id}
                      >
                        {placement.placement_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  traffic
                  <input
                    name="traffic"
                    type="number"
                    min={0}
                    max={100}
                    value={form.traffic}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        traffic: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label>
                  seed
                  <input
                    name="seed"
                    value={form.seed}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, seed: event.target.value }))
                    }
                  />
                </label>
                <button
                  className="ghost"
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, seed: buildSeed() }))
                  }
                >
                  regenerate_seed
                </button>

                <div>
                  <div className="card-label">variants</div>
                  <p className="form-hint">
                    Add at least two variants. Total weight must equal 100.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>variant_id</th>
                          <th>weight</th>
                          <th>actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.variants.map((variant, index) => (
                          <tr key={`variant-${index}`}>
                            <td>
                              <select
                                name={`variant_id_${index}`}
                                value={variant.variant_id}
                                onChange={(event) =>
                                  handleVariantChange(
                                    index,
                                    "variant_id",
                                    event.target.value
                                  )
                                }
                              >
                                <option value="">select_variant</option>
                                {formPlacementVariants.map((option) => {
                                  const isSelectedElsewhere = form.variants.some(
                                    (item, itemIndex) =>
                                      itemIndex !== index &&
                                      item.variant_id === option.id
                                  );
                                  return (
                                    <option
                                      key={option.id}
                                      value={option.id}
                                      disabled={isSelectedElsewhere}
                                    >
                                      {option.id}
                                    </option>
                                  );
                                })}
                              </select>
                            </td>
                            <td>
                              <input
                                name={`variant_weight_${index}`}
                                type="number"
                                min={0}
                                max={100}
                                value={variant.weight}
                                onChange={(event) =>
                                  handleVariantChange(
                                    index,
                                    "weight",
                                    event.target.value
                                  )
                                }
                              />
                            </td>
                            <td>
                              <button
                                className="ghost small"
                                type="button"
                                disabled={form.variants.length <= 2}
                                onClick={() => handleRemoveVariant(index)}
                              >
                                remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-hint">total_weight: {totalWeight}%</div>
                  {!formPlacementVariants.length && (
                    <div className="banner">
                      No variants found for this placement. Create variants first.
                    </div>
                  )}
                  <button className="ghost" type="button" onClick={handleAddVariant}>
                    add_variant
                  </button>
                </div>

                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    cancel
                  </button>
                  <button className="primary" type="submit">
                    {editingExperiment ? "save" : "create"}
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
