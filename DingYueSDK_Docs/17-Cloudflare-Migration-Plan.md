# Cloudflare Workers + D1 改造实施计划

> 用途：将后端从 Node.js + PostgreSQL 改造为 Cloudflare Workers + D1
> 创建日期：2026-01-05
> 状态：待评审

---

## 一、当前架构问题

### 1.1 问题总结

当前后端代码是为 **Node.js + PostgreSQL** 设计的，无法直接部署到 Cloudflare Workers + D1：

| 检查项 | 状态 | 问题 |
|--------|------|------|
| wrangler.toml | ❌ 缺失 | 没有 Workers 配置文件 |
| 入口文件格式 | ❌ 不兼容 | 使用 `app.listen()` 而非 `export default { fetch }` |
| 数据库层 | ❌ 不兼容 | 使用 PostgreSQL `pg` 库，非 D1 API |
| 迁移脚本 | ❌ 不兼容 | 11 个脚本全部使用 PostgreSQL 语法 |
| R2 存储 | ❌ 缺失 | 没有对象存储配置 |

### 1.2 PostgreSQL → SQLite 语法差异

| PostgreSQL | SQLite/D1 | 出现次数 |
|------------|-----------|----------|
| `uuid` | `text` | 17 处 |
| `timestamptz` | `text` (RFC3339) | 10 处 |
| `boolean` | `integer` (0/1) | 4 处 |
| `jsonb` | `text` | 3 处 |
| `text[]` | `text` (JSON) | 1 处 |
| `$1, $2` 占位符 | `?` 占位符 | 多处 |

### 1.3 Node.js → Workers 不兼容 API

| Node.js API | Workers 替代方案 |
|-------------|-----------------|
| `crypto.createHmac` | `crypto.subtle.sign` |
| `crypto.createHash` | `crypto.subtle.digest` |
| `crypto.randomUUID` | `crypto.randomUUID`（兼容） |
| `fs` 模块 | R2 存储 API |
| `adm-zip` 库 | `fflate` 库 |
| `pg` 库 | D1 API |

---

## 二、改造方案

### 选定方案：完整迁移到 Cloudflare Workers + D1

**预计工作量**：2-3 天

---

## 三、分阶段实施计划

### 第一阶段：基础设施准备

#### 1.1 创建 Workers 配置
**新建文件**: `server/wrangler.toml`
```toml
name = "dingyue-sdk-api"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "dingyue-sdk"
database_id = "<创建后填入>"

[[r2_buckets]]
binding = "R2"
bucket_name = "dingyue-packages"

[vars]
# 非敏感配置在这里

# 敏感配置使用 secrets:
# wrangler secret put GA4_API_SECRET
# wrangler secret put FIREBASE_API_SECRET
```

#### 1.2 更新依赖
**修改文件**: `server/package.json`

添加依赖：
```json
{
  "devDependencies": {
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0"
  },
  "dependencies": {
    "hono": "^4.0.0",
    "fflate": "^0.8.0"
  }
}
```

移除依赖：
- `pg`
- `adm-zip`

#### 1.3 创建类型定义
**新建文件**: `server/src/types/env.d.ts`
```typescript
interface Env {
  DB: D1Database;
  R2: R2Bucket;
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  FIREBASE_APP_ID?: string;
  FIREBASE_API_SECRET?: string;
}
```

---

### 第二阶段：数据库层改造

#### 2.1 创建 D1 适配器
**新建文件**: `server/src/lib/db-d1.ts`

```typescript
export type D1Adapter = {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  batch<T>(statements: { sql: string; params?: unknown[] }[]): Promise<{ rows: T[] }[]>;
};

export function createD1Adapter(d1: D1Database): D1Adapter {
  return {
    async query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }> {
      const stmt = d1.prepare(sql);
      const bound = params ? stmt.bind(...params) : stmt;
      const result = await bound.all<T>();
      return { rows: result.results ?? [], rowCount: result.results?.length ?? 0 };
    },
    async execute(sql: string, params?: unknown[]): Promise<{ changes: number }> {
      const stmt = d1.prepare(sql);
      const bound = params ? stmt.bind(...params) : stmt;
      const result = await bound.run();
      return { changes: result.meta.changes };
    },
    async batch<T>(statements: { sql: string; params?: unknown[] }[]): Promise<{ rows: T[] }[]> {
      const stmts = statements.map(s => {
        const stmt = d1.prepare(s.sql);
        return s.params ? stmt.bind(...s.params) : stmt;
      });
      const results = await d1.batch<T>(stmts);
      return results.map(r => ({ rows: r.results ?? [] }));
    }
  };
}
```

#### 2.2 修改现有模块

| 文件 | 改造内容 |
|------|---------|
| `server/src/lib/db.ts` | 重写为 D1 适配器工厂 |
| `server/src/modules/events/routes.ts` | `$1, $2` → `?` 占位符 |
| `server/src/modules/analytics-sinks/service.ts` | 适配 D1 API |
| `server/src/lib/analytics/cache.ts` | 修改查询语法 |
| `server/src/lib/etl/extractor.ts` | 移除 `::timestamptz` 类型转换 |
| `server/src/lib/etl/loader.ts` | 修改批量插入语法 |

---

### 第三阶段：迁移脚本转换

**创建目录**: `server/src/db/migrations-d1/`

#### 转换规则

| PostgreSQL | SQLite |
|------------|--------|
| `uuid primary key` | `text primary key` |
| `timestamptz` | `text` |
| `boolean` | `integer` |
| `jsonb` | `text` |
| `text[]` | `text` |
| `now()` | `datetime('now')` |
| `$1, $2, $3` | `?, ?, ?` |

#### 需要转换的文件

| 原文件 | 新文件 | 主要变更 |
|--------|--------|---------|
| `001_create_apps.sql` | `001_create_apps.sql` | uuid→text, timestamptz→text |
| `002_create_placements.sql` | `002_create_placements.sql` | uuid→text, boolean→integer |
| `003_create_packages.sql` | `003_create_packages.sql` | uuid→text, bigint→integer |
| `004_create_variants.sql` | `004_create_variants.sql` | text[]→text, jsonb→text |
| `005_create_rulesets.sql` | `005_create_rulesets.sql` | jsonb→text |
| `006_create_experiments.sql` | `006_create_experiments.sql` | uuid→text |
| `007_create_events.sql` | `007_create_events.sql` | jsonb→text |
| `008_create_analytics_sinks.sql` | `008_create_analytics_sinks.sql` | 合并 009 的时间戳字段 |
| `009_add_timestamps.sql` | 删除 | 合并到 008 |
| `010_fact_events.sql` | `009_fact_events.sql` | 基本兼容 |
| `011_aggregates.sql` | `010_aggregates.sql` | 基本兼容 |

---

### 第四阶段：Express → Hono 改造

#### 4.1 创建 Workers 入口
**新建文件**: `server/src/worker.ts`

```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createD1Adapter } from './lib/db-d1';

type Bindings = {
  DB: D1Database;
  R2: R2Bucket;
  GA4_MEASUREMENT_ID?: string;
  GA4_API_SECRET?: string;
  FIREBASE_APP_ID?: string;
  FIREBASE_API_SECRET?: string;
};

type Variables = {
  requestId: string;
  db: D1Adapter;
  appId?: string;
  appKey?: string;
};

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 中间件
app.use('*', async (c, next) => {
  c.set('requestId', crypto.randomUUID());
  c.set('db', createD1Adapter(c.env.DB));
  await next();
});

app.use('/v1/sdk/*', hmacAuthMiddleware);

// 健康检查
app.get('/healthz', (c) => {
  return c.json({ status: 'ok', request_id: c.get('requestId') });
});

// 注册模块路由
// registerConfigRoutes(app);
// registerEventsRoutes(app);
// registerPackagesRoutes(app);
// registerAnalyticsSinksRoutes(app);
// registerEtlRoutes(app);

export default app;
```

#### 4.2 中间件改造

**修改文件**: `server/src/middleware/hmac.ts`

```typescript
// 原始 Node.js 实现
import { createHmac, createHash, timingSafeEqual } from 'crypto';

// Workers 实现
async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buffer = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bufferToHex(hashBuffer);
}

async function hmacSha256Hex(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  return bufferToHex(signature);
}

function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

#### 4.3 路由改造模式

每个模块需要从 Express 路由改为 Hono 路由：

```typescript
// 原始 Express
app.post('/v1/sdk/events', async (req, res) => {
  const pool = getDbPool();
  const result = await pool.query(...);
  res.json({ ok: true });
});

// Hono 改造
app.post('/v1/sdk/events', async (c) => {
  const db = c.get('db');
  const body = await c.req.json();
  const result = await db.query(...);
  return c.json({ ok: true });
});
```

---

### 第五阶段：R2 存储改造

**修改文件**: `server/src/modules/packages/index.ts`

#### 5.1 上传流程改造

```typescript
// 原始 fs 实现
import * as fs from 'fs';
await fs.promises.writeFile(path, buffer);

// R2 实现
await c.env.R2.put(storageKey, buffer, {
  httpMetadata: {
    contentType: 'application/zip'
  }
});
```

#### 5.2 下载流程改造

```typescript
// 原始 fs 实现
const buffer = await fs.promises.readFile(path);

// R2 实现
const object = await c.env.R2.get(storageKey);
if (!object) {
  return c.json({ error: 'NOT_FOUND' }, 404);
}
const buffer = await object.arrayBuffer();
```

#### 5.3 Zip 处理改造

```typescript
// 原始 adm-zip
import AdmZip from 'adm-zip';
const zip = new AdmZip(buffer);
const manifest = zip.getEntry('manifest.json');

// fflate 实现
import { unzipSync } from 'fflate';
const files = unzipSync(new Uint8Array(buffer));
const manifestData = files['manifest.json'];
const manifest = JSON.parse(new TextDecoder().decode(manifestData));
```

---

### 第六阶段：Web Admin 部署配置

#### 6.1 创建 SPA 路由配置
**新建文件**: `web-admin/public/_redirects`
```
/* /index.html 200
```

#### 6.2 环境变量配置
**新建文件**: `web-admin/.env.production`
```
VITE_API_BASE_URL=https://dingyue-sdk-api.<your-subdomain>.workers.dev
```

---

### 第七阶段：部署

#### 7.1 创建 Cloudflare 资源

```bash
# 创建 D1 数据库
wrangler d1 create dingyue-sdk
# 记录返回的 database_id 填入 wrangler.toml

# 创建 R2 存储桶
wrangler r2 bucket create dingyue-packages
```

#### 7.2 执行数据库迁移

```bash
# 本地测试
wrangler d1 migrations apply dingyue-sdk --local

# 生产环境
wrangler d1 migrations apply dingyue-sdk
```

#### 7.3 配置 Secrets

```bash
wrangler secret put GA4_API_SECRET
wrangler secret put FIREBASE_API_SECRET
```

#### 7.4 部署 Workers

```bash
cd server
wrangler deploy
```

#### 7.5 部署 Web Admin

```bash
cd web-admin
npm run build
# 上传 dist/ 到 Cloudflare Pages
# 或使用 wrangler pages deploy dist
```

---

## 四、关键文件清单

| 文件 | 操作 | 优先级 |
|------|------|--------|
| `server/wrangler.toml` | 新建 | P0 |
| `server/src/worker.ts` | 新建 | P0 |
| `server/src/types/env.d.ts` | 新建 | P0 |
| `server/src/lib/db-d1.ts` | 新建 | P0 |
| `server/src/lib/db.ts` | 重写 | P0 |
| `server/src/middleware/hmac.ts` | 重写 | P0 |
| `server/src/middleware/request_id.ts` | 重写 | P1 |
| `server/src/modules/events/routes.ts` | 修改 | P1 |
| `server/src/modules/config/index.ts` | 修改 | P1 |
| `server/src/modules/packages/index.ts` | 重写 | P1 |
| `server/src/modules/analytics-sinks/*.ts` | 修改 | P1 |
| `server/src/lib/etl/*.ts` | 修改 | P2 |
| `server/src/lib/analytics/*.ts` | 修改 | P2 |
| `server/src/db/migrations-d1/*.sql` | 新建（10个）| P0 |
| `server/package.json` | 修改 | P0 |
| `web-admin/public/_redirects` | 新建 | P1 |

---

## 五、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| D1 性能限制 | 高并发场景受限 | 使用 KV 缓存热点数据 |
| SQLite 功能差异 | 复杂查询需调整 | 提前测试所有查询 |
| R2 上传限制 | 单次最大 100MB | 分片上传 |
| Workers CPU 限制 | Zip 处理可能超时 | 使用流式处理 |

---

## 六、验收标准

- [ ] `wrangler dev` 本地运行成功
- [ ] `/healthz` 健康检查通过
- [ ] `/v1/sdk/config` HMAC 验证通过
- [ ] `/v1/sdk/events` 事件入库成功
- [ ] 包上传/下载流程正常
- [ ] Web Admin 构建部署成功
- [ ] 端到端联调通过
