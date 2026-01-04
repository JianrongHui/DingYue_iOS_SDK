import { rule_sets } from "../data/mock_data";

export default function RulesPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">create_ruleset</button>
        <button className="ghost">preview_match</button>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>rule_builder</h3>
              <p>Compose all/any rules with typed validators.</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>match_type: all</li>
            <li>field_type: string, semver, number, boolean</li>
            <li>priority_sort: drag_order</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>match_test</h3>
              <p>Simulate rule evaluation for a test user.</p>
            </div>
          </div>
          <form className="stack-form">
            <label>
              app_user_id
              <input name="app_user_id" placeholder="app_user_id" />
            </label>
            <label>
              app_version
              <input name="app_version" placeholder="2.1.0" />
            </label>
            <label>
              locale
              <input name="locale" placeholder="en-US" />
            </label>
            <button className="ghost" type="button">
              run_test
            </button>
          </form>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>ruleset_list</h3>
            <p>Priority-ordered rulesets per placement.</p>
          </div>
          <form className="inline-form">
            <label>
              placement_id
              <input name="placement_id" placeholder="placement_id" />
            </label>
            <label>
              match_type
              <select name="match_type" defaultValue="all">
                <option value="all">all</option>
                <option value="any">any</option>
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
                <th>rule_set_id</th>
                <th>placement_id</th>
                <th>priority</th>
                <th>match_type</th>
                <th>conditions</th>
                <th>updated_at</th>
              </tr>
            </thead>
            <tbody>
              {rule_sets.map((rule) => (
                <tr key={rule.rule_set_id}>
                  <td>{rule.rule_set_id}</td>
                  <td>{rule.placement_id}</td>
                  <td>{rule.priority}</td>
                  <td>{rule.match_type}</td>
                  <td>{rule.conditions.join(" | ")}</td>
                  <td>{rule.updated_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
