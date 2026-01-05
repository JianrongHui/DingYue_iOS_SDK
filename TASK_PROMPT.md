# 任务: Web 管理后台接入真实后端 API

## 任务背景

你正在参与 DingYueSDK 私有化改造项目。当前 Web 管理后台（React + Vite + TypeScript）使用 localStorage 存储数据，需要改造为对接真实后端 API。

## 工作目录

```
/Users/kingsoft/Documents/Github/DingYue_iOS_SDK-worktrees/web-real-api
```

## 分支信息

- 当前分支: `feat/web-real-api`
- 基于: `main`

## 任务目标

将 `web-admin/` 目录下所有页面从 localStorage 改为调用真实后端 API：

### 需要改造的页面

1. **Apps.tsx** - 应用管理
   - GET /v1/admin/apps → 获取应用列表
   - POST /v1/admin/apps → 创建应用
   - PATCH /v1/admin/apps/{app_id} → 更新应用状态

2. **Placements.tsx** - 位置管理
   - GET /v1/admin/placements?app_id=... → 获取位置列表
   - POST /v1/admin/placements → 创建位置
   - PATCH /v1/admin/placements/{placement_id} → 更新位置

3. **Variants.tsx** - 变体管理
   - GET /v1/admin/variants?app_id=...&placement_id=... → 获取变体
   - POST /v1/admin/variants → 创建变体
   - PATCH /v1/admin/variants/{variant_id} → 更新变体

4. **Packages.tsx** - 包管理
   - POST /v1/admin/packages/presign → 获取上传签名
   - POST /v1/admin/packages/commit → 提交包信息
   - GET 包列表

5. **Events.tsx** - 事件查询
   - GET /v1/admin/events?app_id=...&from=...&to=... → 查询事件

6. **Experiments.tsx** - 实验管理
   - GET /v1/admin/experiments?app_id=...&placement_id=...
   - POST /v1/admin/experiments
   - PATCH /v1/admin/experiments/{experiment_id}

7. **Rules.tsx** - 规则管理
   - GET /v1/admin/rulesets?app_id=...&placement_id=...
   - POST /v1/admin/rulesets
   - PATCH /v1/admin/rulesets/{rule_set_id}

## 技术规范

### API 规范
- Base URL: 通过环境变量 `VITE_API_BASE_URL` 配置
- Content-Type: application/json
- 字段命名: snake_case
- 时间格式: RFC3339 UTC

### 代码组织

请创建以下结构:

```
web-admin/src/
├── api/
│   ├── client.ts       # HTTP 客户端封装（fetch + 错误处理）
│   ├── apps.ts         # Apps API
│   ├── placements.ts   # Placements API
│   ├── variants.ts     # Variants API
│   ├── packages.ts     # Packages API
│   ├── events.ts       # Events API
│   ├── experiments.ts  # Experiments API
│   ├── rulesets.ts     # Rulesets API
│   └── types.ts        # API 响应类型定义
├── hooks/
│   ├── useApps.ts      # Apps 数据 hook
│   ├── usePlacements.ts
│   ├── useVariants.ts
│   └── ...
```

### HTTP 客户端要求

```typescript
// api/client.ts 示例结构
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

export async function apiRequest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new ApiError(response.status, error.message || 'Request failed');
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}
```

### 页面改造模式

保持现有 UI 不变，只替换数据层：

```typescript
// 改造前 (localStorage)
const loadApps = () => {
  const stored = getItems<App>(APPS_KEY);
  setApps(stored);
};

// 改造后 (API)
const loadApps = async () => {
  setLoading(true);
  try {
    const data = await appsApi.list();
    setApps(data);
  } catch (err) {
    setError(err instanceof ApiError ? err.message : 'Failed to load');
  } finally {
    setLoading(false);
  }
};
```

## 验收标准

1. 所有页面可正常 CRUD 操作（在后端可用时）
2. 加载状态正确显示
3. 错误状态友好提示
4. 保留开发模式下的 mock 数据回退（后端不可用时）
5. TypeScript 类型完整，无 any

## 开发命令

```bash
cd web-admin
npm install
npm run dev          # 启动开发服务器
npm run build        # 构建
npm run lint         # 检查
```

## 环境变量

在 `web-admin/.env.development` 添加：
```
VITE_API_BASE_URL=http://localhost:8787
```

## 完成后

1. 确保 `npm run build` 成功
2. 确保 `npm run lint` 无错误
3. 提交代码：
```bash
git add .
git commit -m "feat(web-admin): integrate real backend API

- Add API client with error handling
- Create API modules for all resources
- Update all pages to use API calls
- Add loading/error states
- Support fallback to mock data in dev mode

🤖 Generated with Claude Code"
```

## 参考文档

- API 规范: `DingYueSDK_Docs/02-Backend-APIs.md`
- 数据库结构: `DingYueSDK_Docs/03-Database-Schema.md`
- OpenAPI: `DingYueSDK_Docs/12-OpenAPI-Full.yaml`
