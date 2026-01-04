# Server Core Skeleton

Minimal Node.js + TypeScript + Express skeleton for backend services.

## Setup

- Install dependencies: `npm install`
- Build: `npm run build`
- Start: `npm start`

## Endpoints

- `GET /healthz`
  - Response: `{ "status": "ok", "request_id": "..." }`

## Middleware

- Request ID: reads `x-request-id` or generates one, then echoes it back in the same header.
- Error handler: returns `{ "message": "...", "request_id": "..." }` with status 500.

## Adding Business Routes

Add routes or modules and register them in `server/src/app.ts` inside `registerModules`.
