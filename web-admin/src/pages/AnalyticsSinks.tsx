import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  seedAnalyticsSinks,
  seedApps,
  type AnalyticsSink,
  type App
} from "../data/admin_seed";
import { generateId, getItems, setItems } from "../utils/storage";

const APPS_KEY = "dy_apps";
const SINKS_KEY = "dy_analytics_sinks";

const statusClass = (status: string) => `status status-${status}`;

const today = () => new Date().toISOString().slice(0, 10);

type SinkFormState = {
  app_id: string;
  type: AnalyticsSink["type"];
  measurement_id: string;
  firebase_app_id: string;
  api_secret: string;
  enabled: boolean;
};

const emptyFormState: SinkFormState = {
  app_id: "",
  type: "ga4",
  measurement_id: "",
  firebase_app_id: "",
  api_secret: "",
  enabled: true
};

const toFormState = (sink: AnalyticsSink): SinkFormState => {
  if (sink.type === "ga4") {
    return {
      app_id: sink.app_id,
      type: sink.type,
      measurement_id: sink.config.measurement_id,
      firebase_app_id: "",
      api_secret: sink.config.api_secret,
      enabled: sink.enabled
    };
  }

  return {
    app_id: sink.app_id,
    type: sink.type,
    measurement_id: "",
    firebase_app_id: sink.config.app_id,
    api_secret: sink.config.api_secret,
    enabled: sink.enabled
  };
};

const maskSecret = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 6) {
    return "*".repeat(trimmed.length);
  }
  const visibleStart = trimmed.slice(0, 2);
  const visibleEnd = trimmed.slice(-2);
  const hidden = "*".repeat(Math.max(trimmed.length - 4, 4));
  return `${visibleStart}${hidden}${visibleEnd}`;
};

export default function AnalyticsSinksPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [sinks, setSinks] = useState<AnalyticsSink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAppId, setFilterAppId] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSink, setEditingSink] = useState<AnalyticsSink | null>(null);
  const [form, setForm] = useState<SinkFormState>(emptyFormState);

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

      const sinksRaw = window.localStorage.getItem(SINKS_KEY);
      const storedSinks = getItems<AnalyticsSink>(SINKS_KEY);
      const resolvedSinks = sinksRaw ? storedSinks : seedAnalyticsSinks;
      if (!sinksRaw) {
        setItems(SINKS_KEY, seedAnalyticsSinks);
      }
      setSinks(resolvedSinks);
    } catch (loadError) {
      setError("无法从本地存储读取分析转发。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveSinks = (nextSinks: AnalyticsSink[]) => {
    setSinks(nextSinks);
    try {
      setItems(SINKS_KEY, nextSinks);
    } catch (saveError) {
      setError("无法保存分析转发到本地存储。");
    }
  };

  const filteredSinks = useMemo(() => {
    if (filterAppId === "all") {
      return sinks;
    }
    return sinks.filter((sink) => sink.app_id === filterAppId);
  }, [sinks, filterAppId]);

  const summary = useMemo(() => {
    const total = sinks.length;
    const enabled = sinks.filter((sink) => sink.enabled).length;
    const ga4 = sinks.filter((sink) => sink.type === "ga4").length;
    const firebase = sinks.filter((sink) => sink.type === "firebase").length;
    return { total, enabled, ga4, firebase };
  }, [sinks]);

  const handleToggleEnabled = (target: AnalyticsSink) => {
    const nextSinks = sinks.map((sink) =>
      sink.id === target.id
        ? { ...sink, enabled: !sink.enabled, updated_at: today() }
        : sink
    );
    saveSinks(nextSinks);
  };

  const handleDelete = (target: AnalyticsSink) => {
    if (!window.confirm(`确认删除转发 ${target.id}？`)) {
      return;
    }
    const nextSinks = sinks.filter((sink) => sink.id !== target.id);
    saveSinks(nextSinks);
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
    const defaultAppId = apps[0]?.app_id ?? "";
    setError(null);
    setEditingSink(null);
    setForm({
      ...emptyFormState,
      app_id: defaultAppId
    });
    setModalOpen(true);
  };

  const openEdit = (sink: AnalyticsSink) => {
    setError(null);
    setEditingSink(sink);
    setForm(toFormState(sink));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingSink(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.app_id) {
      setError("app_id 为必填。");
      return;
    }

    if (!form.api_secret.trim()) {
      setError("api_secret 为必填。");
      return;
    }

    if (form.type === "ga4" && !form.measurement_id.trim()) {
      setError("GA4 需要 measurement_id。");
      return;
    }

    if (form.type === "firebase" && !form.firebase_app_id.trim()) {
      setError("Firebase 需要 app_id。");
      return;
    }

    const baseSink = {
      id: editingSink?.id ?? `sink_${generateId().slice(0, 8)}`,
      app_id: form.app_id,
      enabled: form.enabled,
      created_at: editingSink?.created_at ?? today(),
      updated_at: today()
    };

    const nextSink: AnalyticsSink =
      form.type === "ga4"
        ? {
            ...baseSink,
            type: "ga4",
            config: {
              measurement_id: form.measurement_id.trim(),
              api_secret: form.api_secret.trim()
            }
          }
        : {
            ...baseSink,
            type: "firebase",
            config: {
              app_id: form.firebase_app_id.trim(),
              api_secret: form.api_secret.trim()
            }
          };

    const nextSinks = editingSink
      ? sinks.map((sink) => (sink.id === editingSink.id ? nextSink : sink))
      : [nextSink, ...sinks];

    saveSinks(nextSinks);
    setError(null);
    setModalOpen(false);
    setEditingSink(null);
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          新建转发
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          刷新
        </button>
      </div>

      {loading && <div className="banner">正在加载分析转发...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <h3>转发列表</h3>
            <p>按应用管理 GA4/Firebase 转发目的地。</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              应用 ID
              <select
                name="app_id"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              >
                <option value="all">全部</option>
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
              重置
            </button>
          </form>
        </div>

        <div className="chip-list">
          <span>总数：{summary.total}</span>
          <span>已启用：{summary.enabled}</span>
          <span>GA4：{summary.ga4}</span>
          <span>Firebase：{summary.firebase}</span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>转发 ID</th>
                <th>应用 ID</th>
                <th>类型</th>
                <th>配置</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredSinks.map((sink) => {
                const configLabel =
                  sink.type === "ga4" ? "Measurement ID" : "Firebase App ID";
                const configValue =
                  sink.type === "ga4"
                    ? sink.config.measurement_id
                    : sink.config.app_id;
                return (
                  <tr key={sink.id}>
                    <td>{sink.id}</td>
                    <td>{sink.app_id}</td>
                    <td>{sink.type}</td>
                    <td>
                      <div className="config-stack">
                        <div className="config-row">
                          <span className="key-label">{configLabel}</span>
                          <span className="key-value">{configValue}</span>
                        </div>
                        <div className="config-row">
                          <span className="key-label">api_secret</span>
                          <span className="key-value">
                            {maskSecret(sink.config.api_secret)}
                          </span>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              handleCopy(sink.config.api_secret, "api_secret")
                            }
                          >
                            复制
                          </button>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={statusClass(
                          sink.enabled ? "enabled" : "disabled"
                        )}
                      >
                        {sink.enabled ? "已启用" : "已禁用"}
                      </span>
                    </td>
                    <td>{sink.updated_at}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => openEdit(sink)}
                        >
                          编辑
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleToggleEnabled(sink)}
                        >
                          {sink.enabled ? "禁用" : "启用"}
                        </button>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleDelete(sink)}
                        >
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filteredSinks.length && !loading && (
                <tr>
                  <td colSpan={7}>未找到分析转发。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{editingSink ? "编辑转发" : "新建转发"}</h3>
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
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        app_id: event.target.value
                      }))
                    }
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
                  类型
                  <select
                    name="type"
                    value={form.type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        type: event.target.value as AnalyticsSink["type"]
                      }))
                    }
                  >
                    <option value="ga4">ga4</option>
                    <option value="firebase">firebase</option>
                  </select>
                </label>
                {form.type === "ga4" ? (
                  <label>
                    Measurement ID
                    <input
                      name="measurement_id"
                      placeholder="G-12345ABC"
                      value={form.measurement_id}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          measurement_id: event.target.value
                        }))
                      }
                    />
                  </label>
                ) : (
                  <label>
                    Firebase App ID
                    <input
                      name="firebase_app_id"
                      placeholder="1:1234567890:ios:abc123def456"
                      value={form.firebase_app_id}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          firebase_app_id: event.target.value
                        }))
                      }
                    />
                  </label>
                )}
                <label>
                  API Secret
                  <input
                    name="api_secret"
                    type="password"
                    placeholder="secret"
                    value={form.api_secret}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        api_secret: event.target.value
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
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
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    取消
                  </button>
                  <button className="primary" type="submit">
                    {editingSink ? "保存" : "新建"}
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
