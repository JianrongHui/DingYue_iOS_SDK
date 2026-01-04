import { events } from "../data/mock_data";

export default function EventsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">query_events</button>
        <button className="ghost">export_csv</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>event_query</h3>
            <p>Filter by time, event_name, and placement_id.</p>
          </div>
          <form className="inline-form">
            <label>
              app_id
              <input name="app_id" placeholder="app_id" />
            </label>
            <label>
              event_name
              <input name="event_name" placeholder="event_name" />
            </label>
            <label>
              placement_id
              <input name="placement_id" placeholder="placement_id" />
            </label>
            <label>
              from
              <input name="from" placeholder="2024-02-01" />
            </label>
            <label>
              to
              <input name="to" placeholder="2024-02-14" />
            </label>
            <button className="ghost" type="button">
              run_query
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>event_name</th>
                <th>placement_id</th>
                <th>count</th>
                <th>last_seen_at</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={`${event.event_name}-${event.placement_id}`}>
                  <td>{event.event_name}</td>
                  <td>{event.placement_id}</td>
                  <td>{event.count}</td>
                  <td>{event.last_seen_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
