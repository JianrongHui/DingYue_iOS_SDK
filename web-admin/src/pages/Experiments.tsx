import { type FormEvent, useEffect, useMemo, useState } from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import {
  createExperiment,
  deleteExperiment,
  listExperimentsByPlacements,
  updateExperiment as updateExperimentApi
} from "../api/experiments";
import { listPlacementsByApps } from "../api/placements";
import { listVariantsByPlacements } from "../api/variants";
import type {
  App,
  Experiment,
  ExperimentStatus,
  ExperimentVariant,
  Placement,
  Variant
} from "../api/types";
import { seedApps, seedPlacements, seedVariants } from "../data/admin_seed";
import { generateId } from "../utils/storage";

type ExperimentFormState = {
  app_id: string;
  placement_id: string;
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
};

const statusClass = (status: ExperimentStatus) => `status status-${status}`;

const STATUS_LABELS: Record<ExperimentStatus, string> = {
  draft: "草稿",
  running: "运行中",
  paused: "已暂停",
  ended: "已结束"
};

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

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const appsData = await listApps();
      setApps(appsData);
      const placementsData = await listPlacementsByApps(
        appsData.map((app) => app.app_id)
      );
      setPlacements(placementsData);
      const variantsData = await listVariantsByPlacements(placementsData);
      setVariants(variantsData);
      const experimentsData = await listExperimentsByPlacements(placementsData);
      setExperiments(experimentsData);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setApps(seedApps);
        setPlacements(seedPlacements);
        setVariants(seedVariants);
        setExperiments(seedExperiments);
        setError("API 不可用，显示模拟实验。");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const traffic = Number(form.traffic);
    if (!form.app_id || !form.placement_id) {
      setFormError("app_id 和 placement_id 为必填。");
      return;
    }
    if (Number.isNaN(traffic) || traffic < 0 || traffic > 100) {
      setFormError("流量需在 0-100 之间。");
      return;
    }
    if (!form.seed.trim()) {
      setFormError("随机种子为必填。");
      return;
    }

    const cleanedVariants = form.variants.map((variant) => ({
      variant_id: variant.variant_id.trim(),
      weight: Number(variant.weight)
    }));

    if (cleanedVariants.length < 2) {
      setFormError("至少需要两个变体。");
      return;
    }

    if (cleanedVariants.some((variant) => !variant.variant_id)) {
      setFormError("每个变体都需要选择 variant_id。");
      return;
    }

    const duplicateCheck = new Set<string>();
    for (const variant of cleanedVariants) {
      if (duplicateCheck.has(variant.variant_id)) {
        setFormError("实验内的 variant_id 不能重复。");
        return;
      }
      duplicateCheck.add(variant.variant_id);
    }

    const allowedVariants = new Set(
      getPlacementVariants(form.placement_id, variants).map((item) => item.id)
    );
    if (cleanedVariants.some((variant) => !allowedVariants.has(variant.variant_id))) {
      setFormError("变体必须属于所选投放位。");
      return;
    }

    const weightSum = cleanedVariants.reduce(
      (sum, variant) => sum + (Number.isNaN(variant.weight) ? 0 : variant.weight),
      0
    );
    if (Math.abs(weightSum - 100) > 0.01) {
      setFormError("变体权重之和必须为 100。");
      return;
    }

    if (
      cleanedVariants.some(
        (variant) => variant.weight < 0 || variant.weight > 100
      )
    ) {
      setFormError("变体权重需在 0-100 之间。");
      return;
    }

    const payload = {
      app_id: form.app_id,
      placement_id: form.placement_id,
      status: editingExperiment?.status ?? "draft",
      traffic,
      seed: form.seed.trim(),
      variants: cleanedVariants
    };

    setFormError(null);
    try {
      if (editingExperiment) {
        const updated = await updateExperimentApi(editingExperiment.id, {
          status: payload.status,
          traffic: payload.traffic,
          variants: payload.variants
        });
        setExperiments((prev) =>
          prev.map((experiment) =>
            experiment.id === editingExperiment.id
              ? { ...experiment, ...updated }
              : experiment
          )
        );
      } else {
        const created = await createExperiment(payload);
        setExperiments((prev) => [created, ...prev]);
      }
      setModalOpen(false);
      setEditingExperiment(null);
    } catch (saveError) {
      if (shouldUseFallback(saveError)) {
        const fallbackExperiment: Experiment = {
          id: editingExperiment?.id ?? buildShortId("exp"),
          app_id: payload.app_id,
          placement_id: payload.placement_id,
          status: payload.status,
          traffic: payload.traffic,
          seed: payload.seed,
          variants: payload.variants,
          created_at: editingExperiment?.created_at ?? today(),
          started_at: editingExperiment?.started_at,
          ended_at: editingExperiment?.ended_at
        };
        setExperiments((prev) =>
          editingExperiment
            ? prev.map((experiment) =>
                experiment.id === editingExperiment.id
                  ? fallbackExperiment
                  : experiment
              )
            : [fallbackExperiment, ...prev]
        );
        setModalOpen(false);
        setEditingExperiment(null);
        setFormError(null);
        setError("API 不可用，已在本地保存实验。");
      } else {
        setFormError(getErrorMessage(saveError));
      }
    }
  };

  const applyExperimentUpdate = async (
    target: Experiment,
    updates: Partial<Experiment>
  ) => {
    setError(null);
    try {
      const updated = await updateExperimentApi(target.id, {
        status: updates.status,
        traffic: updates.traffic,
        variants: updates.variants
      });
      setExperiments((prev) =>
        prev.map((experiment) =>
          experiment.id === target.id
            ? { ...experiment, ...updates, ...updated }
            : experiment
        )
      );
    } catch (updateError) {
      if (shouldUseFallback(updateError)) {
        setExperiments((prev) =>
          prev.map((experiment) =>
            experiment.id === target.id ? { ...experiment, ...updates } : experiment
          )
        );
        setError("API 不可用，已在本地更新实验。");
      } else {
        setError(getErrorMessage(updateError));
      }
    }
  };

  const handleStart = (target: Experiment) => {
    if (target.status !== "draft") {
      return;
    }
    applyExperimentUpdate(target, {
      status: "running",
      started_at: target.started_at ?? today(),
      ended_at: undefined
    });
  };

  const handlePause = (target: Experiment) => {
    if (target.status !== "running") {
      return;
    }
    applyExperimentUpdate(target, { status: "paused" });
  };

  const handleResume = (target: Experiment) => {
    if (target.status !== "paused") {
      return;
    }
    applyExperimentUpdate(target, { status: "running" });
  };

  const handleEnd = (target: Experiment) => {
    if (target.status === "ended") {
      return;
    }
    applyExperimentUpdate(target, {
      status: "ended",
      ended_at: today()
    });
  };

  const handleDelete = async (target: Experiment) => {
    if (!window.confirm(`确认删除实验 ${target.id}？`)) {
      return;
    }
    setError(null);
    try {
      await deleteExperiment(target.id);
      setExperiments((prev) =>
        prev.filter((experiment) => experiment.id !== target.id)
      );
    } catch (deleteError) {
      if (shouldUseFallback(deleteError)) {
        setExperiments((prev) =>
          prev.filter((experiment) => experiment.id !== target.id)
        );
        setError("API 不可用，已在本地删除实验。");
      } else {
        setError(getErrorMessage(deleteError));
      }
    }
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          新建实验
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          刷新
        </button>
      </div>

      {loading && <div className="banner">正在加载实验...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid">
        <div className="card">
          <div className="card-label">运行中实验</div>
          <div className="card-value">{summary.running}</div>
        </div>
        <div className="card">
          <div className="card-label">已暂停实验</div>
          <div className="card-value">{summary.paused}</div>
        </div>
        <div className="card">
          <div className="card-label">平均流量占比</div>
          <div className="card-value">{summary.averageTraffic}%</div>
        </div>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>实验统计</h3>
              <p>模拟各变体的曝光与转化。</p>
            </div>
            <label>
              实验 ID
              <select
                className="table-select"
                value={selectedExperimentId ?? ""}
                onChange={(event) => setSelectedExperimentId(event.target.value)}
              >
                <option value="">选择实验</option>
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
                    <th>变体 ID</th>
                    <th>权重</th>
                    <th>曝光</th>
                    <th>转化</th>
                    <th>转化率</th>
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
            <p className="form-hint">选择实验查看统计数据。</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>分桶规则</h3>
              <p>A/B 流量分配的稳定分桶规则。</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>流量：0-100，进入实验的用户占比</li>
            <li>bucket = hash(seed + user_id) % 100</li>
            <li>bucket &gt;= traffic 使用默认变体</li>
            <li>bucket &lt; traffic 按权重使用变体</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>实验列表</h3>
            <p>展示流量分配、随机种子与变体权重。</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              应用 ID
              <select
                name="app_id"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              >
                <option value="">全部</option>
                {apps.map((app) => (
                  <option key={app.app_id} value={app.app_id}>
                    {app.app_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              投放位 ID
              <select
                name="placement_id"
                value={filterPlacementId}
                onChange={(event) => setFilterPlacementId(event.target.value)}
              >
                <option value="">全部</option>
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
              状态
              <select
                name="status"
                value={filterStatus}
                onChange={(event) =>
                  setFilterStatus(event.target.value as "all" | ExperimentStatus)
                }
              >
                <option value="all">全部</option>
                <option value="draft">{STATUS_LABELS.draft}</option>
                <option value="running">{STATUS_LABELS.running}</option>
                <option value="paused">{STATUS_LABELS.paused}</option>
                <option value="ended">{STATUS_LABELS.ended}</option>
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
              重置
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>实验 ID</th>
                <th>应用 ID</th>
                <th>投放位 ID</th>
                <th>状态</th>
                <th>流量</th>
                <th>种子</th>
                <th>变体</th>
                <th>创建时间</th>
                <th>操作</th>
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
                        {STATUS_LABELS[experiment.status]}
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
                            canEdit ? "" : "仅草稿/暂停的实验可编辑"
                          }
                        >
                          编辑
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "draft"}
                          onClick={() => handleStart(experiment)}
                        >
                          启动
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "running"}
                          onClick={() => handlePause(experiment)}
                        >
                          暂停
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status !== "paused"}
                          onClick={() => handleResume(experiment)}
                        >
                          继续
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={experiment.status === "ended"}
                          onClick={() => handleEnd(experiment)}
                        >
                          结束
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          disabled={!canDelete}
                          onClick={() => handleDelete(experiment)}
                          title={
                            canDelete
                              ? ""
                              : "仅草稿/已结束的实验可删除"
                          }
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredExperiments.length && !loading && (
                <tr>
                  <td colSpan={9}>未找到实验。</td>
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
              <h3>{editingExperiment ? "编辑实验" : "新建实验"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              {formError && <div className="banner error">{formError}</div>}
              <form className="stack-form" onSubmit={handleSubmit}>
                <label>
                  应用 ID
                  <select
                    name="app_id"
                    value={form.app_id}
                    onChange={(event) => handleFormAppChange(event.target.value)}
                  >
                    <option value="">选择应用</option>
                    {apps.map((app) => (
                      <option key={app.app_id} value={app.app_id}>
                        {app.app_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  投放位 ID
                  <select
                    name="placement_id"
                    value={form.placement_id}
                    onChange={(event) => handleFormPlacementChange(event.target.value)}
                  >
                    <option value="">选择投放位</option>
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
                  流量占比
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
                  随机种子
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
                  重新生成种子
                </button>

                <div>
                  <div className="card-label">变体</div>
                  <p className="form-hint">
                    至少添加两个变体，总权重需等于 100。
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>变体 ID</th>
                          <th>权重</th>
                          <th>操作</th>
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
                                <option value="">选择变体</option>
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
                                移除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-hint">总权重：{totalWeight}%</div>
                  {!formPlacementVariants.length && (
                    <div className="banner">
                      该投放位暂无变体，请先创建变体。
                    </div>
                  )}
                  <button className="ghost" type="button" onClick={handleAddVariant}>
                    添加变体
                  </button>
                </div>

                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    取消
                  </button>
                  <button className="primary" type="submit">
                    {editingExperiment ? "保存" : "新建"}
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
