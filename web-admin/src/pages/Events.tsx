import { useEffect, useMemo, useState } from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import { queryEvents } from "../api/events";
import { listPlacementsByApps } from "../api/placements";
import { listVariantsByPlacements } from "../api/variants";
import type { App, EventDetail, Placement, Variant } from "../api/types";
import { seedApps, seedPlacements, seedVariants } from "../data/admin_seed";

interface QueryFilters {
  appId: string;
  eventNames: string[];
  placementId: string;
  from: string;
  to: string;
}

const EVENT_TYPES = [
  "SDK_ACTIVATED",
  "SDK_CONFIG_FETCH_SUCCESS",
  "SDK_CONFIG_FETCH_FAIL",
  "PAYWALL_ENTER",
  "PAYWALL_EXIT",
  "GUIDE_ENTER",
  "GUIDE_EXIT",
  "PURCHASE_START",
  "PURCHASE_SUCCESS",
  "PURCHASE_FAIL",
  "PURCHASE_CANCEL",
  "RESTORE_START",
  "RESTORE_SUCCESS",
  "RESTORE_FAIL",
  "H5_LOAD_START",
  "H5_LOAD_SUCCESS",
  "H5_LOAD_FAIL"
];

const PURCHASE_EVENTS = new Set([
  "PURCHASE_START",
  "PURCHASE_SUCCESS",
  "PURCHASE_FAIL",
  "PURCHASE_CANCEL",
  "RESTORE_START",
  "RESTORE_SUCCESS",
  "RESTORE_FAIL"
]);

const PRODUCT_IDS = ["prod_basic", "prod_plus", "prod_trial", "prod_annual"];
const CURRENCIES = ["USD", "EUR", "CNY"];
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");

const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatDateTime = (date: Date) =>
  `${formatDateInput(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

const normalizeDateRange = (fromValue: string, toValue: string) => {
  const now = new Date();
  const fallbackStart = new Date(now.getTime() - 6 * DAY_MS);
  const start = fromValue ? new Date(`${fromValue}T00:00:00`) : fallbackStart;
  const end = toValue ? new Date(`${toValue}T23:59:59`) : now;
  const startTime = start.getTime();
  const endTime = end.getTime();

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return { start: fallbackStart, end: now };
  }

  if (endTime < startTime) {
    return { start: end, end: start };
  }

  return { start, end };
};

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const randomFrom = <T,>(items: T[]) => items[randomInt(0, items.length - 1)];

const randomId = () => Math.random().toString(36).slice(2, 10);

const pickPlacement = (
  appId: string,
  placementId: string,
  placementPool: Placement[]
) => {
  const trimmed = placementId.trim();
  if (trimmed) {
    const found = placementPool.find(
      (placement) => placement.placement_id === trimmed
    );
    if (found) {
      return { placement_id: found.placement_id, app_id: found.app_id };
    }
    return { placement_id: trimmed, app_id: appId };
  }

  const appPlacements = placementPool.filter(
    (placement) => placement.app_id === appId
  );
  if (appPlacements.length) {
    return randomFrom(appPlacements);
  }
  if (placementPool.length) {
    return randomFrom(placementPool);
  }
  return { placement_id: "plc_unknown", app_id: appId };
};

const pickVariantId = (placementId: string, variantPool: Variant[]) => {
  const placementVariants = variantPool.filter(
    (variant) => variant.placement_id === placementId
  );
  if (placementVariants.length) {
    return randomFrom(placementVariants).id;
  }
  return "var_default";
};

const generateMockEvents = (
  filters: QueryFilters,
  sources: { apps: App[]; placements: Placement[]; variants: Variant[] }
) => {
  const { start, end } = normalizeDateRange(filters.from, filters.to);
  const selectedEventNames = filters.eventNames.length
    ? filters.eventNames
    : EVENT_TYPES;
  const appPool =
    filters.appId === "all"
      ? sources.apps.map((app) => app.app_id)
      : [filters.appId];
  const safeAppPool = appPool.length ? appPool : ["app_unknown"];

  const recordCount = randomInt(50, 100);
  const devicePool = Array.from({ length: randomInt(20, 40) }, (_, index) => {
    return `dev_${randomId()}_${index}`;
  });

  const events: EventDetail[] = [];

  for (let i = 0; i < recordCount; i += 1) {
    const event_name = randomFrom(selectedEventNames);
    const app_id = randomFrom(safeAppPool);
    const placement = pickPlacement(
      app_id,
      filters.placementId,
      sources.placements
    );
    const placement_id = placement.placement_id;
    const variant_id = pickVariantId(placement_id, sources.variants);
    const startTime = start.getTime();
    const endTime = end.getTime();
    const eventTimestamp =
      startTime +
      Math.floor(Math.random() * Math.max(endTime - startTime, DAY_MS));

    const detail: EventDetail = {
      event_id: `evt_${randomId()}`,
      event_name,
      timestamp: new Date(eventTimestamp).toISOString(),
      app_id: placement.app_id,
      placement_id,
      variant_id,
      device_id: randomFrom(devicePool)
    };

    if (PURCHASE_EVENTS.has(event_name)) {
      detail.product_id = randomFrom(PRODUCT_IDS);
      detail.price = Number((randomInt(199, 2999) / 100).toFixed(2));
      detail.currency = randomFrom(CURRENCIES);
    }

    events.push(detail);
  }

  return events;
};

const buildSummary = (details: EventDetail[]) => {
  const summaryMap = new Map<
    string,
    {
      event_name: string;
      placement_id: string;
      variant_id: string;
      count: number;
      uniqueUsers: Set<string>;
      lastSeenAt: number;
    }
  >();

  details.forEach((detail) => {
    const key = `${detail.event_name}::${detail.placement_id}::${detail.variant_id}`;
    const timestamp = new Date(detail.timestamp).getTime();
    const entry = summaryMap.get(key);

    if (!entry) {
      summaryMap.set(key, {
        event_name: detail.event_name,
        placement_id: detail.placement_id,
        variant_id: detail.variant_id,
        count: 1,
        uniqueUsers: new Set([detail.device_id]),
        lastSeenAt: timestamp
      });
      return;
    }

    entry.count += 1;
    entry.uniqueUsers.add(detail.device_id);
    if (timestamp > entry.lastSeenAt) {
      entry.lastSeenAt = timestamp;
    }
  });

  return Array.from(summaryMap.values())
    .map((entry) => ({
      event_name: entry.event_name,
      placement_id: entry.placement_id,
      variant_id: entry.variant_id,
      count: entry.count,
      unique_users: entry.uniqueUsers.size,
      last_seen_at: formatDateTime(new Date(entry.lastSeenAt))
    }))
    .sort((a, b) => b.count - a.count || a.event_name.localeCompare(b.event_name));
};

const DEFAULT_TO = formatDateInput(new Date());
const DEFAULT_FROM = formatDateInput(new Date(Date.now() - 6 * DAY_MS));

const csvEscape = (value: string | number) => {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export default function EventsPage() {
  const [apps, setApps] = useState<App[]>(seedApps);
  const [placements, setPlacements] = useState<Placement[]>(seedPlacements);
  const [variants, setVariants] = useState<Variant[]>(seedVariants);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appId, setAppId] = useState("all");
  const [selectedEventNames, setSelectedEventNames] = useState<string[]>([]);
  const [placementId, setPlacementId] = useState("");
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [funnelEventA, setFunnelEventA] = useState(EVENT_TYPES[3]);
  const [funnelEventB, setFunnelEventB] = useState(EVENT_TYPES[8]);
  const [eventDetails, setEventDetails] = useState<EventDetail[]>(() =>
    generateMockEvents(
      {
        appId: "all",
        eventNames: [],
        placementId: "",
        from: DEFAULT_FROM,
        to: DEFAULT_TO
      },
      {
        apps: seedApps,
        placements: seedPlacements,
        variants: seedVariants
      }
    )
  );

  const eventSummary = useMemo(() => buildSummary(eventDetails), [eventDetails]);
  const eventCounts = useMemo(() => {
    const counts = new Map<string, number>();
    eventSummary.forEach((item) => {
      counts.set(item.event_name, (counts.get(item.event_name) ?? 0) + item.count);
    });
    return counts;
  }, [eventSummary]);

  useEffect(() => {
    const loadMeta = async () => {
      setLoading(true);
      setError(null);
      try {
        const appsData = await listApps();
        setApps(appsData);
        const placementsData = await listPlacementsByApps(
          appsData.map((app) => app.app_id)
        );
        setPlacements(placementsData);
        const variantsData = await listVariantsByPlacements(placementsData);
        setVariants(variantsData);
      } catch (loadError) {
        if (shouldUseFallback(loadError)) {
          setApps(seedApps);
          setPlacements(seedPlacements);
          setVariants(seedVariants);
          setError("API 不可用，使用模拟元数据。");
        } else {
          setError(getErrorMessage(loadError));
        }
      } finally {
        setLoading(false);
      }
    };

    void loadMeta();
  }, []);

  const eventACount = eventCounts.get(funnelEventA) ?? 0;
  const eventBCount = eventCounts.get(funnelEventB) ?? 0;
  const conversionRate =
    eventACount > 0 ? (eventBCount / eventACount) * 100 : 0;
  const conversionLabel = `${conversionRate.toFixed(2)}%`;

  const runQuery = async () => {
    setLoading(true);
    setError(null);
    try {
      const targetAppIds =
        appId === "all" ? apps.map((app) => app.app_id) : [appId];
      if (!targetAppIds.length) {
        setEventDetails([]);
        setLoading(false);
        return;
      }
      const responses = await Promise.all(
        targetAppIds.map((targetAppId) =>
          queryEvents({
            app_id: targetAppId,
            event_name: selectedEventNames,
            placement_id: placementId || undefined,
            from,
            to
          })
        )
      );
      setEventDetails(responses.flat());
    } catch (queryError) {
      if (shouldUseFallback(queryError)) {
        setEventDetails(
          generateMockEvents(
            {
              appId,
              eventNames: selectedEventNames,
              placementId,
              from,
              to
            },
            { apps, placements, variants }
          )
        );
        setError("API 不可用，显示模拟事件。");
      } else {
        setError(getErrorMessage(queryError));
      }
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (!eventSummary.length) {
      return;
    }
    const header = [
      "event_name",
      "placement_id",
      "variant_id",
      "count",
      "unique_users",
      "last_seen_at"
    ];
    const rows = eventSummary.map((item) =>
      [
        item.event_name,
        item.placement_id,
        item.variant_id,
        item.count,
        item.unique_users,
        item.last_seen_at
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `events_${formatDateInput(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={runQuery}>
          查询事件
        </button>
        <button
          className="ghost"
          type="button"
          onClick={exportCsv}
          disabled={!eventSummary.length}
        >
          导出 CSV
        </button>
      </div>

      {loading && <div className="banner">正在加载事件...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <div>
            <h3>事件查询</h3>
            <p>按时间、事件名与投放位筛选。</p>
          </div>
          <form
            className="inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              runQuery();
            }}
          >
            <label>
              应用 ID
              <select
                name="app_id"
                value={appId}
                onChange={(event) => setAppId(event.target.value)}
              >
                <option value="all">全部</option>
                {apps.map((app) => (
                  <option key={app.app_id} value={app.app_id}>
                    {app.app_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              事件名称
              <select
                name="event_name"
                multiple
                value={selectedEventNames}
                onChange={(event) =>
                  setSelectedEventNames(
                    Array.from(event.target.selectedOptions).map(
                      (option) => option.value
                    )
                  )
                }
              >
                {EVENT_TYPES.map((eventName) => (
                  <option key={eventName} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              投放位 ID
              <input
                name="placement_id"
                list="placement-options"
                placeholder="plc_201"
                value={placementId}
                onChange={(event) => setPlacementId(event.target.value)}
              />
            </label>
            <label>
              开始日期
              <input
                name="from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label>
              结束日期
              <input
                name="to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <button className="ghost" type="submit">
              执行查询
            </button>
          </form>
        </div>

        <datalist id="placement-options">
          {placements.map((placement) => (
            <option key={placement.placement_id} value={placement.placement_id} />
          ))}
        </datalist>

        <div className="chip-list">
          <span>记录数：{eventDetails.length}</span>
          <span>分组数：{eventSummary.length}</span>
          <span>
            范围：{from} 至 {to}
          </span>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>事件名称</th>
                <th>投放位 ID</th>
                <th>变体 ID</th>
                <th>次数</th>
                <th>去重用户数</th>
                <th>最后发生时间</th>
              </tr>
            </thead>
            <tbody>
              {eventSummary.length ? (
                eventSummary.map((event) => (
                  <tr
                    key={`${event.event_name}-${event.placement_id}-${event.variant_id}`}
                  >
                    <td>{event.event_name}</td>
                    <td>{event.placement_id}</td>
                    <td>{event.variant_id}</td>
                    <td>{event.count}</td>
                    <td>{event.unique_users}</td>
                    <td>{event.last_seen_at}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>暂无数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>漏斗分析</h3>
            <p>对比两个事件并计算转化率。</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              事件 A
              <select
                name="event_a"
                value={funnelEventA}
                onChange={(event) => setFunnelEventA(event.target.value)}
              >
                {EVENT_TYPES.map((eventName) => (
                  <option key={`a-${eventName}`} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              事件 B
              <select
                name="event_b"
                value={funnelEventB}
                onChange={(event) => setFunnelEventB(event.target.value)}
              >
                {EVENT_TYPES.map((eventName) => (
                  <option key={`b-${eventName}`} value={eventName}>
                    {eventName}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </div>

        <div className="chip-list">
          <span>事件 A 次数：{eventACount}</span>
          <span>事件 B 次数：{eventBCount}</span>
          <span>转化率：{conversionLabel}</span>
        </div>
      </div>
    </section>
  );
}
