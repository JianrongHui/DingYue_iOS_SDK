import { type FormEvent, useEffect, useMemo, useState } from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import {
  createVariant,
  deleteVariant,
  listVariantsByPlacements,
  updateVariant
} from "../api/variants";
import { listPlacementsByApps } from "../api/placements";
import type { App, Placement, Variant } from "../api/types";
import { seedApps, seedPlacements, seedVariants } from "../data/admin_seed";
import { generateId } from "../utils/storage";

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
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setApps(seedApps);
        setPlacements(seedPlacements);
        setVariants(seedVariants);
        setError("API 不可用，显示模拟变体。");
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

  const handleToggleEnabled = async (target: Variant) => {
    const nextEnabled = !target.enabled;
    setError(null);
    try {
      const updated = await updateVariant(target.id, { enabled: nextEnabled });
      setVariants((prev) =>
        prev.map((variant) => (variant.id === target.id ? updated : variant))
      );
    } catch (updateError) {
      if (shouldUseFallback(updateError)) {
        setVariants((prev) =>
          prev.map((variant) =>
            variant.id === target.id ? { ...variant, enabled: nextEnabled } : variant
          )
        );
        setError("API 不可用，已在本地更新变体。");
      } else {
        setError(getErrorMessage(updateError));
      }
    }
  };

  const handleDelete = async (target: Variant) => {
    if (!window.confirm(`确认删除变体 ${target.id}？`)) {
      return;
    }
    setError(null);
    try {
      await deleteVariant(target.id);
      setVariants((prev) => prev.filter((variant) => variant.id !== target.id));
    } catch (deleteError) {
      if (shouldUseFallback(deleteError)) {
        setVariants((prev) => prev.filter((variant) => variant.id !== target.id));
        setError("API 不可用，已在本地删除变体。");
      } else {
        setError(getErrorMessage(deleteError));
      }
    }
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.app_id || !form.placement_id || !form.package_id.trim()) {
      setError("app_id、placement_id 和 package_id 为必填。");
      return;
    }

    const productIds = parseProductIds(form.product_ids);
    const payload = {
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
      }
    };

    setError(null);
    try {
      if (editingVariant) {
        const updated = await updateVariant(editingVariant.id, payload);
        setVariants((prev) =>
          prev.map((variant) =>
            variant.id === editingVariant.id ? updated : variant
          )
        );
      } else {
        const created = await createVariant(payload);
        setVariants((prev) => [created, ...prev]);
      }
      setModalOpen(false);
      setEditingVariant(null);
    } catch (saveError) {
      if (shouldUseFallback(saveError)) {
        const fallbackVariant: Variant = {
          id: editingVariant?.id ?? buildShortId("var"),
          app_id: payload.app_id,
          placement_id: payload.placement_id,
          package_id: payload.package_id,
          offering_id: payload.offering_id,
          product_ids: productIds,
          priority: payload.priority,
          enabled: payload.enabled,
          page_options: payload.page_options,
          created_at: editingVariant?.created_at ?? today()
        };
        setVariants((prev) =>
          editingVariant
            ? prev.map((variant) =>
                variant.id === editingVariant.id ? fallbackVariant : variant
              )
            : [fallbackVariant, ...prev]
        );
        setModalOpen(false);
        setEditingVariant(null);
        setError("API 不可用，已在本地保存变体。");
      } else {
        setError(getErrorMessage(saveError));
      }
    }
  };

  const formPlacements = placements.filter(
    (placement) => placement.app_id === form.app_id
  );

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          新建变体
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          刷新
        </button>
      </div>

      {loading && <div className="banner">正在加载变体...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>产品配置</h3>
              <p>预览 offering_id 与 product_ids 顺序。</p>
            </div>
          </div>
          {highlightedVariant ? (
            <div className="chip-list">
              <span>变体 ID：{highlightedVariant.id}</span>
              <span>Offering ID：{highlightedVariant.offering_id || "-"}</span>
              <span>包 ID：{highlightedVariant.package_id}</span>
              {highlightedVariant.product_ids.map((productId) => (
                <span key={`${highlightedVariant.id}-${productId}`}>
                  产品 ID：{productId}
                </span>
              ))}
            </div>
          ) : (
            <p className="form-hint">暂无变体，先创建后预览。</p>
          )}
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>页面参数</h3>
              <p>渲染时下发给客户端的参数。</p>
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
            <h3>变体列表</h3>
            <p>启用的变体与包绑定关系。</p>
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
              重置
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>变体 ID</th>
                <th>应用 ID</th>
                <th>投放位 ID</th>
                <th>包 ID</th>
                <th>Offering ID</th>
                <th>产品 ID 列表</th>
                <th>优先级</th>
                <th>启用</th>
                <th>页面参数</th>
                <th>创建时间</th>
                <th>操作</th>
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
                      {variant.enabled ? "已启用" : "已禁用"}
                    </span>
                  </td>
                  <td>
                    <div className="chip-list">
                      <span>
                        成功关闭：{" "}
                        {variant.page_options.auto_close_on_success ? "开" : "关"}
                      </span>
                      <span>
                        恢复关闭：{" "}
                        {variant.page_options.auto_close_on_restore ? "开" : "关"}
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
                        编辑
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleToggleEnabled(variant)}
                      >
                        {variant.enabled ? "禁用" : "启用"}
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(variant)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredVariants.length && !loading && (
                <tr>
                  <td colSpan={11}>未找到变体。</td>
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
              <h3>{editingVariant ? "编辑变体" : "新建变体"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                关闭
              </button>
            </div>
            <div className="modal-body">
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        placement_id: event.target.value
                      }))
                    }
                  >
                    <option value="">选择投放位</option>
                    {formPlacements.map((placement) => (
                      <option key={placement.placement_id} value={placement.placement_id}>
                        {placement.placement_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  包 ID
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
                  Offering ID
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
                  产品 ID 列表
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
                  product_ids 可用逗号或换行分隔。
                </p>
                <label>
                  优先级
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
                  启用
                </label>
                <div>
                  <div className="form-hint">页面参数</div>
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
                    购买成功自动关闭
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
                    恢复购买自动关闭
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    取消
                  </button>
                  <button className="primary" type="submit">
                    {editingVariant ? "保存" : "新建"}
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
