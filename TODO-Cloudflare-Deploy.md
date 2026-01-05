# Cloudflare 部署待办事项

## 1) Secrets（必须）
- GA4_API_SECRET（如启用 GA4 转发）
- FIREBASE_API_SECRET（如启用 Firebase 转发）
- 可选：GA4_MEASUREMENT_ID / FIREBASE_APP_ID（若使用 env 方式转发）

## 2) 管理后台 Pages 环境变量（必须）
- VITE_API_BASE_URL=https://dingyue-sdk-api.hjryxy.workers.dev
- 如需限制跨域：CORS_ALLOWED_ORIGINS=https://dingyue-sdk-admin.pages.dev

## 3) Worker 线上可用性验证（必须）
- GET /healthz 应返回 200
- POST /v1/sdk/config（HMAC）应返回 200
- POST /v1/sdk/events（HMAC）应返回 200

## 4) 初始化数据（必须）
- 已创建 App：
  - app_id: app_306f64b3
  - app_key: key_11e64cbb
- 仍需创建 placements / variants / packages / rulesets / experiments，否则 /v1/sdk/config 为空

## 5) 配置文件提交（建议）
- 提交 server/wrangler.toml 的 D1/KV 真实 ID 与 CORS 配置
