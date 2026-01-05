import { apiRequest, buildQuery } from "./client";
import type { Placement, Variant } from "./types";

export type VariantCreatePayload = {
  app_id: string;
  placement_id: string;
  package_id: string;
  offering_id?: string;
  product_ids?: string[];
  priority: number;
  enabled?: boolean;
  page_options?: Variant["page_options"];
};

export type VariantUpdatePayload = {
  offering_id?: string;
  product_ids?: string[];
  priority?: number;
  enabled?: boolean;
  page_options?: Variant["page_options"];
};

type ApiVariant = Omit<Variant, "id"> & { id?: string; variant_id?: string };

const normalizeVariant = (variant: ApiVariant): Variant => ({
  ...variant,
  id: variant.id ?? variant.variant_id ?? ""
});

export const listVariants = async (
  appId: string,
  placementId: string
): Promise<Variant[]> => {
  const query = buildQuery({ app_id: appId, placement_id: placementId });
  const data = await apiRequest<ApiVariant[]>(
    "GET",
    `/v1/admin/variants${query}`
  );
  return data.map(normalizeVariant);
};

export const listVariantsByPlacements = async (
  placements: Placement[]
): Promise<Variant[]> => {
  if (!placements.length) {
    return [];
  }
  const responses = await Promise.all(
    placements.map((placement) =>
      listVariants(placement.app_id, placement.placement_id)
    )
  );
  return responses.flat();
};

export const createVariant = async (
  payload: VariantCreatePayload
): Promise<Variant> => {
  const data = await apiRequest<ApiVariant>(
    "POST",
    "/v1/admin/variants",
    payload
  );
  return normalizeVariant(data);
};

export const updateVariant = async (
  variantId: string,
  payload: VariantUpdatePayload
): Promise<Variant> => {
  const data = await apiRequest<ApiVariant>(
    "PATCH",
    `/v1/admin/variants/${variantId}`,
    payload
  );
  return normalizeVariant(data);
};

export const deleteVariant = async (variantId: string): Promise<void> => {
  await apiRequest<void>("DELETE", `/v1/admin/variants/${variantId}`);
};
