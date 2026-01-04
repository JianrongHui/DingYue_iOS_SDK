import { experiments } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

export default function ExperimentsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">create_experiment</button>
        <button className="ghost">pause_experiment</button>
      </div>

      <div className="card-grid">
        <div className="card">
          <div className="card-label">active_experiments</div>
          <div className="card-value">2</div>
        </div>
        <div className="card">
          <div className="card-label">avg_traffic</div>
          <div className="card-value">18%</div>
        </div>
        <div className="card">
          <div className="card-label">next_review</div>
          <div className="card-value">2024-02-21</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>experiment_list</h3>
            <p>Traffic split, seed, and variant weights.</p>
          </div>
          <form className="inline-form">
            <label>
              placement_id
              <input name="placement_id" placeholder="placement_id" />
            </label>
            <label>
              status
              <select name="status" defaultValue="all">
                <option value="all">all</option>
                <option value="running">running</option>
                <option value="paused">paused</option>
                <option value="ended">ended</option>
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
                <th>experiment_id</th>
                <th>placement_id</th>
                <th>status</th>
                <th>traffic</th>
                <th>seed</th>
                <th>variants</th>
                <th>start_at</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((experiment) => (
                <tr key={experiment.experiment_id}>
                  <td>{experiment.experiment_id}</td>
                  <td>{experiment.placement_id}</td>
                  <td>
                    <span className={statusClass(experiment.status)}>
                      {experiment.status}
                    </span>
                  </td>
                  <td>{experiment.traffic}</td>
                  <td>{experiment.seed}</td>
                  <td>{experiment.variants.join(", ")}</td>
                  <td>{experiment.start_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
