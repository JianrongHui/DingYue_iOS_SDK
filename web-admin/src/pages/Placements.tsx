import { placements } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

export default function PlacementsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">create_placement</button>
        <button className="ghost">set_default_variant</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>placement_list</h3>
            <p>Enable placements and preview active packages.</p>
          </div>
          <form className="inline-form">
            <label>
              app_id
              <input name="app_id" placeholder="app_id" />
            </label>
            <label>
              placement_id
              <input name="placement_id" placeholder="placement_id" />
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
                <th>placement_id</th>
                <th>app_id</th>
                <th>status</th>
                <th>default_variant_id</th>
                <th>package_preview</th>
              </tr>
            </thead>
            <tbody>
              {placements.map((placement) => (
                <tr key={placement.placement_id}>
                  <td>{placement.name}</td>
                  <td>{placement.placement_id}</td>
                  <td>{placement.app_id}</td>
                  <td>
                    <span className={statusClass(placement.status)}>
                      {placement.status}
                    </span>
                  </td>
                  <td>{placement.default_variant_id}</td>
                  <td>{placement.package_preview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
