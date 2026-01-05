import { apiRequest, buildQuery } from "./client";
import type { Placement } from "./types";

export type PlacementCreatePayload = {
  app_id: string;
  placement_id: string;
  type: Placement["type"];
  enabled?: boolean;
};

export type PlacementUpdatePayload = {
  enabled?: boolean;
  default_variant_id?: string | null;
};

type ApiPlacement = Omit<Placement, "id"> & { id?: string };

const normalizePlacement = (placement: ApiPlacement): Placement => ({
  ...placement,
  id: placement.id ?? placement.placement_id
});

export const listPlacements = async (appId: string): Promise<Placement[]> => {
  const query = buildQuery({ app_id: appId });
  const data = await apiRequest<ApiPlacement[]>(
    "GET",
    `/v1/admin/placements${query}`
  );
  return data.map(normalizePlacement);
};

export const listPlacementsByApps = async (
  appIds: string[]
): Promise<Placement[]> => {
  const uniqueIds = Array.from(new Set(appIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return [];
  }
  const responses = await Promise.all(uniqueIds.map((appId) => listPlacements(appId)));
  return responses.flat();
};

export const createPlacement = async (
  payload: PlacementCreatePayload
): Promise<Placement> => {
  const data = await apiRequest<ApiPlacement>(
    "POST",
    "/v1/admin/placements",
    payload
  );
  return normalizePlacement(data);
};

export const updatePlacement = async (
  placementId: string,
  payload: PlacementUpdatePayload
): Promise<Placement> => {
  const data = await apiRequest<ApiPlacement>(
    "PATCH",
    `/v1/admin/placements/${placementId}`,
    payload
  );
  return normalizePlacement(data);
};

export const deletePlacement = async (placementId: string): Promise<void> => {
  await apiRequest<void>("DELETE", `/v1/admin/placements/${placementId}`);
};
