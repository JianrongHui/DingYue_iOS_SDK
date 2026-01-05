# 任务: 数仓 fact_events 表与 ETL

## 任务背景

你正在参与 DingYueSDK 私有化改造项目。需要设计并实现数仓层的 `fact_events` 表结构，以及从 `events` 表到 `fact_events` 的 ETL 流程，并验证统计 SQL 模板。

## 工作目录

```
/Users/kingsoft/Documents/Github/DingYue_iOS_SDK-worktrees/data-warehouse
```

## 分支信息

- 当前分支: `feat/data-warehouse`
- 基于: `main`

## 任务目标

### 1. 设计 fact_events 表结构

在 `server/src/db/migrations/` 创建新的迁移脚本 `009_fact_events.sql`：

```sql
-- 事实表：扁平化的事件数据，优化查询性能
create table fact_events (
  id text primary key,

  -- 事件标识
  event_id text not null,
  event_name text not null,
  event_ts text not null,           -- RFC3339 时间戳
  event_date text not null,         -- YYYY-MM-DD 分区键

  -- 应用与配置
  app_id text not null,
  placement_id text,
  variant_id text,
  placement_version text,

  -- 用户与设备
  rc_app_user_id text,
  device_id text,
  session_id text,

  -- 产品与交易
  offering_id text,
  product_id text,
  price real,
  currency text,

  -- 实验信息
  experiment_id text,
  rule_set_id text,

  -- SDK 与设备信息
  sdk_version text,
  app_version text,
  os_version text,
  device_model text,
  locale text,
  timezone text,

  -- 原始 payload（可选，用于回溯）
  payload_json text,

  -- ETL 元数据
  etl_processed_at text not null,

  unique(event_id)
);

-- 查询优化索引
create index idx_fact_events_app_date on fact_events (app_id, event_date);
create index idx_fact_events_name_date on fact_events (event_name, event_date);
create index idx_fact_events_placement on fact_events (placement_id, event_date);
create index idx_fact_events_variant on fact_events (variant_id, event_date);
create index idx_fact_events_user on fact_events (rc_app_user_id, event_date);
create index idx_fact_events_session on fact_events (session_id);
```

### 2. 实现 ETL 服务

创建 `server/src/lib/etl/` 目录：

```
server/src/lib/etl/
├── index.ts      # ETL 入口
├── extractor.ts  # 从 events 表提取数据
├── transformer.ts # 数据转换与扁平化
├── loader.ts     # 加载到 fact_events
└── types.ts      # 类型定义
```

#### ETL 流程

```typescript
// extractor.ts
export async function extractNewEvents(
  db: D1Database,
  lastProcessedId?: string,
  batchSize: number = 1000
): Promise<RawEvent[]> {
  // 提取尚未处理的事件
  const query = lastProcessedId
    ? `SELECT * FROM events WHERE id > ? ORDER BY id LIMIT ?`
    : `SELECT * FROM events ORDER BY id LIMIT ?`;
  // ...
}

// transformer.ts
export function transformEvent(raw: RawEvent): FactEvent {
  const payload = JSON.parse(raw.payload);
  return {
    id: generateId(),
    event_id: payload.event_id,
    event_name: raw.event_name,
    event_ts: payload.timestamp,
    event_date: payload.timestamp.slice(0, 10), // YYYY-MM-DD
    app_id: raw.app_id,
    placement_id: payload.placement_id,
    variant_id: payload.variant_id,
    // ... 其他字段扁平化
    payload_json: raw.payload, // 保留原始数据
    etl_processed_at: new Date().toISOString(),
  };
}

// loader.ts
export async function loadFactEvents(
  db: D1Database,
  events: FactEvent[]
): Promise<void> {
  // 批量插入 fact_events
  // 使用 INSERT OR IGNORE 避免重复
}
```

### 3. 创建 ETL 定时任务端点

在 `server/src/modules/` 创建 `etl` 模块：

```typescript
// POST /v1/admin/etl/run - 手动触发 ETL
// GET /v1/admin/etl/status - 查看 ETL 状态

// 也可以通过 Cloudflare Workers Cron Triggers 定时执行
```

### 4. 实现并验证统计 SQL

在 `server/src/lib/analytics/` 创建 `queries.ts`：

```typescript
// 转化率查询
export const CONVERSION_QUERY = `
with base as (
  select
    placement_id,
    variant_id,
    session_id,
    event_name,
    event_date as day
  from fact_events
  where app_id = ?
    and event_date >= ? and event_date <= ?
),
enter as (
  select day, placement_id, variant_id, count(distinct session_id) as enter_cnt
  from base
  where event_name = 'PAYWALL_ENTER'
  group by day, placement_id, variant_id
),
purchase as (
  select day, placement_id, variant_id, count(distinct session_id) as purchase_cnt
  from base
  where event_name = 'PURCHASE_SUCCESS'
  group by day, placement_id, variant_id
)
select e.day, e.placement_id, e.variant_id,
       e.enter_cnt,
       coalesce(p.purchase_cnt, 0) as purchase_cnt,
       coalesce(cast(p.purchase_cnt as real) / nullif(e.enter_cnt, 0), 0) as conversion
from enter e
left join purchase p using(day, placement_id, variant_id)
order by e.day desc;
`;

// SKU 转化率
export const SKU_CONVERSION_QUERY = `...`;

// 引导页完成率
export const GUIDE_COMPLETION_QUERY = `...`;
```

### 5. 创建汇总表迁移

创建 `server/src/db/migrations/010_aggregates.sql`：

```sql
-- 日级转化率汇总
create table agg_daily_conversion (
  id text primary key,
  app_id text not null,
  event_date text not null,
  placement_id text not null,
  variant_id text,
  enter_count integer not null,
  purchase_count integer not null,
  conversion_rate real not null,
  revenue real,
  currency text,
  updated_at text not null,
  unique(app_id, event_date, placement_id, variant_id)
);

-- A/B 实验对比汇总
create table agg_ab_experiment (
  id text primary key,
  app_id text not null,
  experiment_id text not null,
  variant_id text not null,
  event_date text not null,
  unique_users integer not null,
  enter_count integer not null,
  purchase_count integer not null,
  conversion_rate real not null,
  updated_at text not null,
  unique(experiment_id, variant_id, event_date)
);

create index idx_agg_conversion_lookup on agg_daily_conversion (app_id, event_date);
create index idx_agg_experiment_lookup on agg_ab_experiment (experiment_id, event_date);
```

## 开发命令

```bash
cd server
npm install
npm run dev

# 运行迁移（如果有脚本）
npm run migrate
```

## 验收标准

1. fact_events 表结构合理，索引完整
2. ETL 可批量处理 events 表数据
3. ETL 支持增量处理（记录上次处理位置）
4. 统计 SQL 在 D1/SQLite 上正确执行
5. 汇总表结构支持快速查询
6. TypeScript 类型完整

## 完成后

```bash
git add .
git commit -m "feat(data): add fact_events table and ETL pipeline

- Add fact_events table with query-optimized indexes
- Implement ETL extractor/transformer/loader
- Add manual ETL trigger endpoint
- Implement and verify analytics SQL queries
- Add aggregation tables for reporting

🤖 Generated with Claude Code"
```

## 参考文档

- 数仓模型: `DingYueSDK_Docs/09-Data-Warehouse.md`
- 统计 SQL: `DingYueSDK_Docs/10-Analytics-SQL.md`
- 数据库结构: `DingYueSDK_Docs/03-Database-Schema.md`
- 事件字典: `DingYueSDK_Docs/04-Events-Dictionary.md`
