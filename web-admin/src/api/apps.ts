import { apiRequest } from "./client";
import type { App } from "./types";

export type AppCreatePayload = {
  name: string;
  env: App["env"];
};

export type AppUpdatePayload = {
  name?: string;
  status?: App["status"];
};

type ApiApp = Omit<App, "id"> & { id?: string };

const normalizeApp = (app: ApiApp): App => ({
  ...app,
  id: app.id ?? app.app_id
});

export const listApps = async (): Promise<App[]> => {
  const data = await apiRequest<ApiApp[]>("GET", "/v1/admin/apps");
  return data.map(normalizeApp);
};

export const createApp = async (payload: AppCreatePayload): Promise<App> => {
  const data = await apiRequest<ApiApp>("POST", "/v1/admin/apps", payload);
  return normalizeApp(data);
};

export const updateApp = async (
  appId: string,
  payload: AppUpdatePayload
): Promise<App> => {
  const data = await apiRequest<ApiApp>(
    "PATCH",
    `/v1/admin/apps/${appId}`,
    payload
  );
  return normalizeApp(data);
};

export const deleteApp = async (appId: string): Promise<void> => {
  await apiRequest<void>("DELETE", `/v1/admin/apps/${appId}`);
};
