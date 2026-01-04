import { packages } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

export default function PackagesPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">upload_package</button>
        <button className="ghost">rollback_version</button>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>upload_manifest</h3>
              <p>Preview manifest.json and entry_path before commit.</p>
            </div>
          </div>
          <form className="stack-form">
            <label>
              package_file
              <input name="package_file" placeholder="app_bundle.zip" />
            </label>
            <label>
              entry_path
              <input name="entry_path" placeholder="/index.html" />
            </label>
            <label>
              checksum
              <input name="checksum" placeholder="auto" />
            </label>
            <button className="ghost" type="button">
              generate_checksum
            </button>
          </form>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>version_notes</h3>
              <p>Track package metadata for rollback.</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>latest_version: 1.4.4</li>
            <li>rollback_target: 1.4.2</li>
            <li>integrity_check: passed</li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>package_list</h3>
            <p>Uploaded packages and active versions.</p>
          </div>
          <form className="inline-form">
            <label>
              package_id
              <input name="package_id" placeholder="package_id" />
            </label>
            <label>
              status
              <select name="status" defaultValue="all">
                <option value="all">all</option>
                <option value="active">active</option>
                <option value="rolled_back">rolled_back</option>
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
                <th>package_id</th>
                <th>version</th>
                <th>entry_path</th>
                <th>checksum</th>
                <th>status</th>
                <th>uploaded_at</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => (
                <tr key={pkg.package_id}>
                  <td>{pkg.package_id}</td>
                  <td>{pkg.version}</td>
                  <td>{pkg.entry_path}</td>
                  <td>{pkg.checksum}</td>
                  <td>
                    <span className={statusClass(pkg.status)}>{pkg.status}</span>
                  </td>
                  <td>{pkg.uploaded_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
