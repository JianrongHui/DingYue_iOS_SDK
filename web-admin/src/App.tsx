import { useEffect, useState } from "react";
import { routes } from "./routes";

const defaultPath = routes[0]?.path ?? "/apps";

const normalizePath = (hash: string) => {
  const cleaned = hash.replace(/^#/, "").trim();
  if (!cleaned) {
    return defaultPath;
  }
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
};

const navOrder = ["Build", "Targeting", "Release", "Insights"];

export default function App() {
  const [path, setPath] = useState(() => normalizePath(window.location.hash));

  useEffect(() => {
    if (!window.location.hash) {
      window.location.hash = defaultPath;
    }
  }, []);

  useEffect(() => {
    const handleHash = () => setPath(normalizePath(window.location.hash));
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const activeRoute = routes.find((route) => route.path === path) ?? routes[0];
  const ActivePage = activeRoute.component;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">DY</div>
          <div>
            <div className="brand-title">DingYue Console</div>
            <div className="brand-subtitle">web_admin</div>
          </div>
        </div>

        <nav className="nav">
          {navOrder.map((group) => {
            const groupRoutes = routes.filter(
              (route) => route.nav_group === group
            );
            if (!groupRoutes.length) {
              return null;
            }
            return (
              <div className="nav-section" key={group}>
                <div className="nav-label">{group}</div>
                {groupRoutes.map((route) => (
                  <a
                    key={route.path}
                    href={`#${route.path}`}
                    className={
                      route.path === activeRoute.path ? "nav-item active" : "nav-item"
                    }
                    aria-current={
                      route.path === activeRoute.path ? "page" : undefined
                    }
                  >
                    {route.label}
                  </a>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="pill">env: prod</div>
          <div className="pill">region: us-east</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <div className="eyebrow">Admin Console</div>
            <h1>{activeRoute.label}</h1>
            <p>{activeRoute.description}</p>
          </div>
          <div className="topbar-actions">
            <button className="ghost" type="button">
              sync
            </button>
            <button className="primary" type="button">
              create
            </button>
          </div>
        </header>

        <main className="content">
          {activeRoute ? (
            <ActivePage />
          ) : (
            <section className="page">
              <div className="card">
                <h3>route_not_found</h3>
                <p>Return to a valid navigation item.</p>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
