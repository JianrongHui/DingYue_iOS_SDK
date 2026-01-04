import { app_summary, apps } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

export default function AppsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">create_app</button>
        <button className="ghost">reset_app_key</button>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-label">total_apps</div>
          <div className="card-value">{app_summary.total_apps}</div>
        </div>
        <div className="card">
          <div className="card-label">active_apps</div>
          <div className="card-value">{app_summary.active_apps}</div>
        </div>
        <div className="card">
          <div className="card-label">latest_release</div>
          <div className="card-value">{app_summary.latest_release}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>app_list</h3>
            <p>Manage app_id, keys, and environment state.</p>
          </div>
          <form className="inline-form">
            <label>
              app_id
              <input name="app_id" placeholder="app_id" />
            </label>
            <label>
              environment
              <select name="environment" defaultValue="all">
                <option value="all">all</option>
                <option value="prod">prod</option>
                <option value="staging">staging</option>
                <option value="dev">dev</option>
              </select>
            </label>
            <button className="ghost" type="button">
              filter
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
                <th>app_key</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.app_id}>
                  <td>{app.name}</td>
                  <td>{app.app_id}</td>
                  <td>{app.environment}</td>
                  <td>
                    <span className={statusClass(app.status)}>{app.status}</span>
                  </td>
                  <td>{app.created_at}</td>
                  <td>{app.app_key}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
