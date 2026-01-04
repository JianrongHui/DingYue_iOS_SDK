import { forwarding, funnels } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

export default function AnalyticsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">refresh_reports</button>
        <button className="ghost">export_csv</button>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>funnel_analysis</h3>
              <p>Conversion rates across multi-step journeys.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>funnel_name</th>
                  <th>steps</th>
                  <th>conversion_rate</th>
                </tr>
              </thead>
              <tbody>
                {funnels.map((funnel) => (
                  <tr key={funnel.funnel_name}>
                    <td>{funnel.funnel_name}</td>
                    <td>{funnel.steps.join(" -> ")}</td>
                    <td>{funnel.conversion_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>forwarding_status</h3>
              <p>Analytics integration health and failure logs.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>provider</th>
                  <th>status</th>
                  <th>last_success_at</th>
                  <th>failure_count</th>
                </tr>
              </thead>
              <tbody>
                {forwarding.map((item) => (
                  <tr key={item.provider}>
                    <td>{item.provider}</td>
                    <td>
                      <span className={statusClass(item.status)}>
                        {item.status}
                      </span>
                    </td>
                    <td>{item.last_success_at}</td>
                    <td>{item.failure_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>mapping_review</h3>
            <p>Review GA4/Firebase event mapping coverage.</p>
          </div>
        </div>
        <div className="chip-list">
          <span>mapping_group: core_events</span>
          <span>mapped_events: 22</span>
          <span>unmapped_events: 4</span>
        </div>
      </div>
    </section>
  );
}
