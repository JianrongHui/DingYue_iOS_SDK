import { apiRequest, buildQuery } from "./client";
import type { Condition, RuleSet, Placement } from "./types";
import { generateId } from "../utils/storage";

type ConditionGroup = {
  all?: Condition[];
  any?: Condition[];
};

export type RuleSetCreatePayload = {
  app_id: string;
  placement_id: string;
  priority: number;
  condition: ConditionGroup;
  variant_id: string;
  experiment_id?: string;
};

export type RuleSetUpdatePayload = {
  priority?: number;
  condition?: ConditionGroup;
  variant_id?: string;
  experiment_id?: string;
};

type ApiRuleSet = Omit<RuleSet, "id" | "match_type" | "conditions"> & {
  id?: string;
  rule_set_id?: string;
  condition?: ConditionGroup;
  match_type?: RuleSet["match_type"];
  conditions?: Condition[];
};

const normalizeRuleSet = (ruleSet: ApiRuleSet): RuleSet => {
  const group = ruleSet.condition;
  const matchType: RuleSet["match_type"] =
    ruleSet.match_type ?? (group?.any && group.any.length ? "any" : "all");
  const conditions =
    ruleSet.conditions ?? (matchType === "any" ? group?.any : group?.all) ?? [];

  return {
    ...ruleSet,
    id: ruleSet.id ?? ruleSet.rule_set_id ?? generateId(),
    match_type: matchType,
    conditions
  };
};

const buildConditionGroup = (
  matchType: RuleSet["match_type"],
  conditions: Condition[]
): ConditionGroup => {
  if (matchType === "any") {
    return { any: conditions };
  }
  return { all: conditions };
};

export const listRulesets = async (
  appId: string,
  placementId: string
): Promise<RuleSet[]> => {
  const query = buildQuery({ app_id: appId, placement_id: placementId });
  const data = await apiRequest<ApiRuleSet[]>(
    "GET",
    `/v1/admin/rulesets${query}`
  );
  return data.map(normalizeRuleSet);
};

export const listRulesetsByPlacements = async (
  placements: Placement[]
): Promise<RuleSet[]> => {
  if (!placements.length) {
    return [];
  }
  const responses = await Promise.all(
    placements.map((placement) =>
      listRulesets(placement.app_id, placement.placement_id)
    )
  );
  return responses.flat();
};

export const createRuleset = async (ruleSet: RuleSet): Promise<RuleSet> => {
  const payload: RuleSetCreatePayload = {
    app_id: ruleSet.app_id,
    placement_id: ruleSet.placement_id,
    priority: ruleSet.priority,
    condition: buildConditionGroup(ruleSet.match_type, ruleSet.conditions),
    variant_id: ruleSet.variant_id,
    experiment_id: ruleSet.experiment_id
  };

  const data = await apiRequest<ApiRuleSet>(
    "POST",
    "/v1/admin/rulesets",
    payload
  );
  return normalizeRuleSet(data);
};

export const updateRuleset = async (
  ruleSetId: string,
  updates: Partial<RuleSet>
): Promise<RuleSet> => {
  const payload: RuleSetUpdatePayload = {
    priority: updates.priority,
    condition:
      updates.match_type && updates.conditions
        ? buildConditionGroup(updates.match_type, updates.conditions)
        : updates.conditions
          ? buildConditionGroup("all", updates.conditions)
          : undefined,
    variant_id: updates.variant_id,
    experiment_id: updates.experiment_id
  };

  const data = await apiRequest<ApiRuleSet>(
    "PATCH",
    `/v1/admin/rulesets/${ruleSetId}`,
    payload
  );
  return normalizeRuleSet(data);
};

export const deleteRuleset = async (ruleSetId: string): Promise<void> => {
  await apiRequest<void>("DELETE", `/v1/admin/rulesets/${ruleSetId}`);
};
