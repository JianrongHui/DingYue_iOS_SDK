import { apiRequest, buildQuery } from "./client";
import type { Experiment, ExperimentVariant, Placement } from "./types";

export type ExperimentCreatePayload = {
  app_id: string;
  placement_id: string;
  status: Experiment["status"];
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
};

export type ExperimentUpdatePayload = {
  status?: Experiment["status"];
  traffic?: number;
  variants?: ExperimentVariant[];
};

type ApiExperiment = Omit<Experiment, "id"> & {
  id?: string;
  experiment_id?: string;
};

const normalizeExperiment = (experiment: ApiExperiment): Experiment => ({
  ...experiment,
  id: experiment.id ?? experiment.experiment_id ?? ""
});

export const listExperiments = async (
  appId: string,
  placementId: string
): Promise<Experiment[]> => {
  const query = buildQuery({ app_id: appId, placement_id: placementId });
  const data = await apiRequest<ApiExperiment[]>(
    "GET",
    `/v1/admin/experiments${query}`
  );
  return data.map(normalizeExperiment);
};

export const listExperimentsByPlacements = async (
  placements: Placement[]
): Promise<Experiment[]> => {
  if (!placements.length) {
    return [];
  }
  const responses = await Promise.all(
    placements.map((placement) =>
      listExperiments(placement.app_id, placement.placement_id)
    )
  );
  return responses.flat();
};

export const createExperiment = async (
  payload: ExperimentCreatePayload
): Promise<Experiment> => {
  const data = await apiRequest<ApiExperiment>(
    "POST",
    "/v1/admin/experiments",
    payload
  );
  return normalizeExperiment(data);
};

export const updateExperiment = async (
  experimentId: string,
  payload: ExperimentUpdatePayload
): Promise<Experiment> => {
  const data = await apiRequest<ApiExperiment>(
    "PATCH",
    `/v1/admin/experiments/${experimentId}`,
    payload
  );
  return normalizeExperiment(data);
};

export const deleteExperiment = async (experimentId: string): Promise<void> => {
  await apiRequest<void>("DELETE", `/v1/admin/experiments/${experimentId}`);
};
