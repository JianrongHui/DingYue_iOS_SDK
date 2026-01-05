# 任务: analytics_sinks 配置管理

## 任务背景

你正在参与 DingYueSDK 私有化改造项目。当前 GA4/Firebase 事件转发配置通过环境变量管理，需要改造为通过 D1 数据库的 `analytics_sinks` 表动态管理，支持按 app_id 配置不同的转发目标。

## 工作目录

```
/Users/kingsoft/Documents/Github/DingYue_iOS_SDK-worktrees/analytics-sinks
```

## 分支信息

- 当前分支: `feat/analytics-sinks`
- 基于: `main`

## 任务目标

### 1. 后端: 实现 analytics_sinks 的 CRUD API

在 `server/src/modules/` 创建 `analytics-sinks` 模块：

```
server/src/modules/analytics-sinks/
├── index.ts      # 路由注册
├── routes.ts     # 路由处理
├── service.ts    # 业务逻辑
└── types.ts      # 类型定义
```

#### API 端点

```
GET    /v1/admin/analytics-sinks?app_id=...
POST   /v1/admin/analytics-sinks
PATCH  /v1/admin/analytics-sinks/{sink_id}
DELETE /v1/admin/analytics-sinks/{sink_id}
```

#### 数据结构

```typescript
interface AnalyticsSink {
  id: string;
  app_id: string;
  type: 'ga4' | 'firebase';
  config: GA4Config | FirebaseConfig;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface GA4Config {
  measurement_id: string;
  api_secret: string;
}

interface FirebaseConfig {
  app_id: string;
  api_secret: string;
}
```

### 2. 修改事件转发逻辑

修改 `server/src/lib/analytics/index.ts`：

当前实现从环境变量读取配置：
```typescript
// 当前实现
function createGa4ForwarderFromEnv(): GA4Forwarder | undefined {
  const measurementId = process.env.GA4_MEASUREMENT_ID;
  ...
}
```

改为从数据库读取：
```typescript
// 改造后
export async function createAnalyticsForwarder(
  db: D1Database,
  appId: string
): Promise<AnalyticsForwarder> {
  // 查询该 app_id 启用的 sinks
  const sinks = await db.prepare(
    'SELECT * FROM analytics_sinks WHERE app_id = ? AND enabled = 1'
  ).bind(appId).all();

  // 根据 sinks 创建对应的 forwarders
  // ...
}
```

修改 `server/src/modules/events/index.ts` 中的事件处理，使用动态创建的 forwarder。

### 3. 添加缓存机制

为避免每次请求都查询数据库，实现简单的内存缓存：

```typescript
// server/src/lib/analytics/cache.ts
const sinkCache = new Map<string, { sinks: AnalyticsSink[]; expireAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export async function getSinksForApp(
  db: D1Database,
  appId: string
): Promise<AnalyticsSink[]> {
  const cached = sinkCache.get(appId);
  if (cached && Date.now() < cached.expireAt) {
    return cached.sinks;
  }

  const sinks = await queryFromDb(db, appId);
  sinkCache.set(appId, { sinks, expireAt: Date.now() + CACHE_TTL });
  return sinks;
}

export function invalidateSinkCache(appId: string): void {
  sinkCache.delete(appId);
}
```

### 4. 前端: 添加 Analytics Sinks 管理页面

在 `web-admin/src/pages/` 创建 `AnalyticsSinks.tsx`：

功能要求：
- 按 app_id 筛选查看 sinks
- 创建新的 sink（选择类型、填写配置）
- 编辑已有 sink
- 启用/禁用 sink
- 删除 sink
- 配置字段（api_secret）显示为掩码，支持复制

## 数据库表结构

已存在于 `server/src/db/migrations/`：

```sql
create table analytics_sinks (
  id text primary key,
  app_id text not null,
  type text not null, -- ga4|firebase
  config text not null, -- JSON
  enabled integer not null -- 0/1
);
```

需要添加 updated_at 字段的迁移脚本。

## 开发命令

```bash
# 后端
cd server
npm install
npm run dev

# 前端
cd web-admin
npm install
npm run dev
```

## 验收标准

1. 后端 CRUD API 正常工作
2. 事件转发使用数据库配置而非环境变量
3. 缓存机制正确，配置更新后缓存失效
4. 前端管理页面可正常操作
5. TypeScript 类型完整
6. 保持向后兼容（环境变量作为全局 fallback）

## 完成后

```bash
git add .
git commit -m "feat(analytics): add analytics_sinks configuration management

- Add CRUD API for analytics_sinks
- Modify event forwarding to use database config
- Add sink cache with TTL
- Add admin page for sink management
- Keep env vars as global fallback

🤖 Generated with Claude Code"
```

## 参考文档

- 数据库结构: `DingYueSDK_Docs/03-Database-Schema.md`
- 现有转发实现: `server/src/lib/analytics/index.ts`
- 现有 GA4 转发: `server/src/lib/analytics/ga4.ts`
- 现有 Firebase 转发: `server/src/lib/analytics/firebase.ts`
