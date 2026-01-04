type RequestLike = {
  body?: unknown;
};

type ResponseLike = {
  json?: (body: unknown) => unknown;
  send?: (body: unknown) => unknown;
};

type AppLike = {
  post: (path: string, handler: (req: RequestLike, res: ResponseLike) => unknown) => void;
};

const MAX_BUFFER_SIZE = 1000;
const inMemoryEvents: unknown[] = [];

const sendOk = (res: ResponseLike) => {
  if (typeof res.json === "function") {
    return res.json({ ok: true });
  }
  if (typeof res.send === "function") {
    return res.send({ ok: true });
  }
  return { ok: true };
};

const normalizeBody = (body: unknown): Record<string, unknown> => {
  if (body && typeof body === "object") {
    return body as Record<string, unknown>;
  }
  return {};
};

const appendEvents = (events: unknown[]) => {
  for (const event of events) {
    inMemoryEvents.push(event);
    if (inMemoryEvents.length > MAX_BUFFER_SIZE) {
      inMemoryEvents.shift();
    }
  }
};

export function registerEventsRoutes(app: AppLike) {
  app.post("/v1/sdk/events", (req, res) => {
    const body = normalizeBody(req?.body);
    const events = body.events;

    if (Array.isArray(events)) {
      appendEvents(events);
    }

    // TODO: Persist events to durable storage.
    return sendOk(res);
  });
}
