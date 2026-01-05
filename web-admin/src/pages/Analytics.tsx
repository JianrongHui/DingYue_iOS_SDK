import { forwarding, funnels } from "../data/mock_data";

const statusClass = (status: string) => `status status-${status}`;

const FORWARDING_STATUS_LABELS: Record<string, string> = {
  healthy: "正常",
  warning: "告警",
  failed: "失败"
};

const formatForwardingStatus = (status: string) =>
  FORWARDING_STATUS_LABELS[status] ?? status;

export default function AnalyticsPage() {
  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary">刷新报表</button>
        <button className="ghost">导出 CSV</button>
      </div>

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>漏斗分析</h3>
              <p>多步骤路径转化率。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>漏斗名称</th>
                  <th>步骤</th>
                  <th>转化率</th>
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
              <h3>转发状态</h3>
              <p>分析接入健康度与失败日志。</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>提供方</th>
                  <th>状态</th>
                  <th>最近成功时间</th>
                  <th>失败次数</th>
                </tr>
              </thead>
              <tbody>
                {forwarding.map((item) => (
                  <tr key={item.provider}>
                    <td>{item.provider}</td>
                    <td>
                      <span className={statusClass(item.status)}>
                        {formatForwardingStatus(item.status)}
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
            <h3>映射检查</h3>
            <p>查看 GA4/Firebase 事件映射覆盖情况。</p>
          </div>
        </div>
        <div className="chip-list">
          <span>映射组：核心事件</span>
          <span>已映射事件：22</span>
          <span>未映射事件：4</span>
        </div>
      </div>
    </section>
  );
}
