const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | Array<string | number | boolean>;

type QueryParams = Record<string, QueryValue>;

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const parseJson = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
};

export const buildQuery = (params: QueryParams): string => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      const filtered = value
        .map((item) => String(item))
        .filter((item) => item.length > 0);
      if (filtered.length) {
        searchParams.set(key, filtered.join(","));
      }
      return;
    }
    const stringValue = String(value);
    if (stringValue.length) {
      searchParams.set(key, stringValue);
    }
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

export const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Request failed.";
};

export const shouldUseFallback = (error: unknown): boolean => {
  if (!import.meta.env.DEV) {
    return false;
  }
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 404;
  }
  return true;
};

export async function apiRequest<T>(
  method: HttpMethod,
  path: string,
  body?: unknown
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const details = await parseJson<unknown>(response).catch(() => undefined);
    const message =
      typeof details === "object" && details && "message" in details
        ? String((details as { message?: string }).message || "Request failed")
        : "Request failed";
    throw new ApiError(response.status, message, details);
  }

  return parseJson<T>(response);
}
