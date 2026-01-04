import { type FormEvent, useEffect, useMemo, useState } from "react";
import { seedApps, type App } from "../data/admin_seed";
import { generateId, getItems, setItems } from "../utils/storage";

const APPS_KEY = "dy_apps";

const statusClass = (status: string) => `status status-${status}`;

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

  const loadApps = () => {
    setLoading(true);
    setError(null);
    try {
      const raw = window.localStorage.getItem(APPS_KEY);
      const stored = getItems<App>(APPS_KEY);
      if (!raw) {
        setItems(APPS_KEY, seedApps);
        setApps(seedApps);
      } else {
        setApps(stored);
      }
    } catch (loadError) {
      setError("Failed to load apps from localStorage.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  const saveApps = (nextApps: App[]) => {
    setApps(nextApps);
    try {
      setItems(APPS_KEY, nextApps);
    } catch (saveError) {
      setError("Failed to save apps to localStorage.");
    }
  };

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

  const handleToggleStatus = (target: App) => {
    const nextStatus = target.status === "active" ? "disabled" : "active";
    const nextApps = apps.map((app) =>
      app.id === target.id ? { ...app, status: nextStatus } : app
    );
    saveApps(nextApps);
  };

  const handleDelete = (target: App) => {
    if (!window.confirm(`Delete app ${target.app_id}?`)) {
      return;
    }
    const nextApps = apps.filter((app) => app.id !== target.id);
    saveApps(nextApps);
  };

  const handleCopy = (value: string, label: string) => {
    if (!navigator.clipboard) {
      setError(`Clipboard unavailable for ${label}.`);
      return;
    }
    navigator.clipboard.writeText(value).catch(() => {
      setError(`Failed to copy ${label}.`);
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

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = createForm.name.trim();
    if (!name) {
      setError("App name is required.");
      return;
    }

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

    const nextApps = [newApp, ...apps];
    saveApps(nextApps);
    setError(null);
    setCreatedSecrets({ app_id: newAppId, app_key: newAppKey });
    setCreateForm({ name: "", env: "prod" });
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          create_app
        </button>
        <button className="ghost" type="button" onClick={loadApps}>
          refresh
        </button>
      </div>

      {loading && <div className="banner">loading apps...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid">
        <div className="card">
          <div className="card-label">total_apps</div>
          <div className="card-value">{summary.total}</div>
        </div>
        <div className="card">
          <div className="card-label">active_apps</div>
          <div className="card-value">{summary.active}</div>
        </div>
        <div className="card">
          <div className="card-label">latest_release</div>
          <div className="card-value">{summary.latest}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>app_list</h3>
            <p>Manage app_id, keys, and environment state.</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              app_id
              <input
                name="app_id"
                placeholder="app_id or name"
                value={filterAppId}
                onChange={(event) => setFilterAppId(event.target.value)}
              />
            </label>
            <label>
              environment
              <select
                name="environment"
                value={filterEnv}
                onChange={(event) =>
                  setFilterEnv(event.target.value as "all" | App["env"])
                }
              >
                <option value="all">all</option>
                <option value="prod">prod</option>
                <option value="staging">staging</option>
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
              reset
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>name</th>
                <th>app_id</th>
                <th>environment</th>
                <th>status</th>
                <th>created_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredApps.map((app) => (
                <tr key={app.id}>
                  <td>{app.name}</td>
                  <td>{app.app_id}</td>
                  <td>{app.env}</td>
                  <td>
                    <span className={statusClass(app.status)}>{app.status}</span>
                  </td>
                  <td>{app.created_at}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleToggleStatus(app)}
                      >
                        {app.status === "active" ? "disable" : "enable"}
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleCopy(app.app_id, "app_id")}
                      >
                        copy_app_id
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleCopy(app.app_key, "app_key")}
                      >
                        copy_app_key
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(app)}
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredApps.length && !loading && (
                <tr>
                  <td colSpan={6}>No apps found.</td>
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
              <h3>{createdSecrets ? "app_credentials" : "create_app"}</h3>
              <button className="ghost small" type="button" onClick={closeCreate}>
                close
              </button>
            </div>
            <div className="modal-body">
              {createdSecrets ? (
                <>
                  <p className="form-hint">
                    Store these credentials now. They will only be shown once.
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
                      copy
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
                      copy
                    </button>
                  </div>
                  <div className="modal-actions">
                    <button className="primary" type="button" onClick={closeCreate}>
                      done
                    </button>
                  </div>
                </>
              ) : (
                <form className="stack-form" onSubmit={handleCreate}>
                  <label>
                    name
                    <input
                      name="name"
                      placeholder="App display name"
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
                    env
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
                      <option value="prod">prod</option>
                      <option value="staging">staging</option>
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
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
