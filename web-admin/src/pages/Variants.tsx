import { variants } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

const page_options = {
  theme: "midnight",
  layout: "centered",
  accent_color: "#e44c2a",
  dismiss_mode: "manual"
};

export default function VariantsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">create_variant</button>
        <button className="ghost">bind_package</button>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>offering_config</h3>
              <p>Configure offering_id and product_ids order.</p>
            </div>
          </div>
          <div className="chip-list">
            <span>offering_id: offer_promo</span>
            <span>product_ids: prod_trial</span>
            <span>product_ids: prod_annual</span>
          </div>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>page_options</h3>
              <p>Preview page_options payload sent to client.</p>
            </div>
          </div>
          <pre className="code-block">{JSON.stringify(page_options, null, 2)}</pre>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>variant_list</h3>
            <p>Enabled variants and package bindings.</p>
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
                <option value="enabled">enabled</option>
                <option value="paused">paused</option>
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
                <th>variant_id</th>
                <th>placement_id</th>
                <th>package_id</th>
                <th>offering_id</th>
                <th>product_ids</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.variant_id}>
                  <td>{variant.variant_id}</td>
                  <td>{variant.placement_id}</td>
                  <td>{variant.package_id}</td>
                  <td>{variant.offering_id}</td>
                  <td>{variant.product_ids.join(", ")}</td>
                  <td>
                    <span className={statusClass(variant.status)}>
                      {variant.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
