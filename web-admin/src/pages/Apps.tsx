import { type FormEvent, useEffect, useMemo, useState } from "react";
import { createApp, deleteApp, listApps, updateApp } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import type { App } from "../api/types";
import { seedApps } from "../data/admin_seed";
import { generateId } from "../utils/storage";

const statusClass = (status: string) => `status status-${status}`;

const ENV_LABELS: Record<App["env"], string> = {
  prod: "生产",
  staging: "预发"
};

const buildShortId = (prefix: string) => {
  const base = generateId().replace(/-/g, "");
  return `${prefix}_${base.slice(0, 6)}`;
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("");
  const [filterEnv, setFilterEnv] = useState<"all" | App["env"]>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createdSecrets, setCreatedSecrets] = useState<{
    app_id: string;
    app_key: string;
  } | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    env: "prod" as App["env"]
  });

  const loadApps = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listApps();
      setApps(data);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setApps(seedApps);
        setError("API 不可用，显示模拟应用。");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApps();
  }, []);

  const summary = useMemo(() => {
    const total = apps.length;
    const active = apps.filter((app) => app.status === "active").length;
    const latest = apps.reduce<string>((result, app) => {
      if (!result || app.created_at > result) {
        return app.created_at;
      }
      return result;
    }, "");
    return {
      total,
      active,
      latest: latest || "-"
    };
  }, [apps]);

  const filteredApps = useMemo(() => {
    const term = filterAppId.trim().toLowerCase();
    return apps.filter((app) => {
      const matchesTerm =
        !term ||
        app.app_id.toLowerCase().includes(term) ||
        app.name.toLowerCase().includes(term);
      const matchesEnv = filterEnv === "all" || app.env === filterEnv;
      return matchesTerm && matchesEnv;
    });
  }, [apps, filterAppId, filterEnv]);

  const handleToggleStatus = async (target: App) => {
    const nextStatus = target.status === "active" ? "disabled" : "active";
    setError(null);
    try {
      const updated = await updateApp(target.app_id, { status: nextStatus });
      setApps((prev) =>
        prev.map((app) => (app.id === target.id ? updated : app))
      );
    } catch (updateError) {
      if (shouldUseFallback(updateError)) {
        setApps((prev) =>
          prev.map((app) =>
            app.id === target.id ? { ...app, status: nextStatus } : app
          )
        );
        setError("API 不可用，已在本地更新状态。");
      } else {
        setError(getErrorMessage(updateError));
      }
    }
  };

  const handleDelete = async (target: App) => {
    if (!window.confirm(`确认删除应用 ${target.app_id}？`)) {
      return;
    }
    setError(null);
    try {
      await deleteApp(target.app_id);
      setApps((prev) => prev.filter((app) => app.id !== target.id));
    } catch (deleteError) {
      if (shouldUseFallback(deleteError)) {
        setApps((prev) => prev.filter((app) => app.id !== target.id));
        setError("API 不可用，已在本地删除应用。");
      } else {
        setError(getErrorMessage(deleteError));
      }
    }
  };

  const handleCopy = (value: string, label: string) => {
    if (!navigator.clipboard) {
      setError(`剪贴板不可用，无法复制 ${label}。`);
      return;
    }
    navigator.clipboard.writeText(value).catch(() => {
      setError(`复制 ${label} 失败。`);
    });
  };

  const openCreate = () => {
    setError(null);
    setCreateForm({ name: "", env: "prod" });
    setCreatedSecrets(null);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreatedSecrets(null);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createForm.name.trim();
    if (!name) {
      setError("应用名称为必填。");
      return;
    }

    setError(null);
    try {
      const created = await createApp({ name, env: createForm.env });
      setApps((prev) => [created, ...prev]);
      setCreatedSecrets({ app_id: created.app_id, app_key: created.app_key });
      setCreateForm({ name: "", env: "prod" });
    } catch (createError) {
      if (shouldUseFallback(createError)) {
        const newAppId = buildShortId("app");
        const newAppKey = buildShortId("key");
        const newApp: App = {
          id: generateId(),
          app_id: newAppId,
          app_key: newAppKey,
          name,
          env: createForm.env,
          status: "active",
          created_at: today()
        };
        setApps((prev) => [newApp, ...prev]);
        setCreatedSecrets({ app_id: newAppId, app_key: newAppKey });
        setCreateForm({ name: "", env: "prod" });
        setError("API 不可用，已在本地创建应用。");
      } else {
        setError(getErrorMessage(createError));
      }
    }
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          新建应用
        </button>
        <button className="ghost" type="button" onClick={loadApps}>
          刷新
        </button>
      </div>

      {loading && <div className="banner">正在加载应用...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid">
        <div className="card">
          <div className="card-label">应用总数</div>
          <div className="card-value">{summary.total}</div>
        </div>
        <div className="card">
          <div className="card-label">启用应用</div>
          <div className="card-value">{summary.active}</div>
        </div>
        <div className="card">
          <div className="card-label">最新创建</div>
          <div className="card-value">{summary.latest}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>应用列表</h3>
            <p>管理 app_id、密钥与环境状态。</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              应用 ID
              <input
                name="app_id"
                placeholder="应用 ID 或名称"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              />
            </label>
            <label>
              环境
              <select
                name="environment"
                value={filterEnv}
                onChange={(event) =>
                  setFilterEnv(event.target.value as "all" | App["env"])
                }
              >
                <option value="all">全部</option>
                <option value="prod">{ENV_LABELS.prod}</option>
                <option value="staging">{ENV_LABELS.staging}</option>
              </select>
            </label>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setFilterAppId("");
                setFilterEnv("all");
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
                <th>名称</th>
                <th>应用 ID</th>
                <th>环境</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id}>
                  <td>{app.name}</td>
                  <td>{app.app_id}</td>
                  <td>{ENV_LABELS[app.env] ?? app.env}</td>
                  <td>
                    <span className={statusClass(app.status)}>
                      {app.status === "active" ? "启用" : "禁用"}
                    </span>
                  </td>
                  <td>{app.created_at}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleToggleStatus(app)}
                      >
                        {app.status === "active" ? "禁用" : "启用"}
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleCopy(app.app_id, "app_id")}
                      >
                        复制 app_id
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleCopy(app.app_key, "app_key")}
                      >
                        复制 app_key
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(app)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredApps.length && !loading && (
                <tr>
                  <td colSpan={6}>未找到应用。</td>
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
              <h3>{createdSecrets ? "应用凭证" : "新建应用"}</h3>
              <button className="ghost small" type="button" onClick={closeCreate}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              {createdSecrets ? (
                <>
                  <p className="form-hint">
                    请立即保存这些凭证，仅显示一次。
                  </p>
                  <div className="key-row">
                    <div>
                      <div className="key-label">app_id</div>
                      <div className="key-value">{createdSecrets.app_id}</div>
                    </div>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() =>
                        handleCopy(createdSecrets.app_id, "app_id")
                      }
                    >
                      复制
                    </button>
                  </div>
                  <div className="key-row">
                    <div>
                      <div className="key-label">app_key</div>
                      <div className="key-value">{createdSecrets.app_key}</div>
                    </div>
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() =>
                        handleCopy(createdSecrets.app_key, "app_key")
                      }
                    >
                      复制
                    </button>
                  </div>
                  <div className="modal-actions">
                    <button className="primary" type="button" onClick={closeCreate}>
                      完成
                    </button>
                  </div>
                </>
              ) : (
                <form className="stack-form" onSubmit={handleCreate}>
                  <label>
                    名称
                    <input
                      name="name"
                      placeholder="应用显示名称"
                      value={createForm.name}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          name: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label>
                    环境
                    <select
                      name="env"
                      value={createForm.env}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          env: event.target.value as App["env"]
                        }))
                      }
                    >
                      <option value="prod">{ENV_LABELS.prod}</option>
                      <option value="staging">{ENV_LABELS.staging}</option>
                    </select>
                  </label>
                  <div className="modal-actions">
                    <button className="ghost" type="button" onClick={closeCreate}>
                      取消
                    </button>
                    <button className="primary" type="submit">
                      新建
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
