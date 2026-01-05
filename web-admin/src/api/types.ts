export type App = {
  id: string;
  app_id: string;
  app_key: string;
  name: string;
  env: "prod" | "staging";
  status: "active" | "disabled";
  created_at: string;
};

export type Placement = {
  id: string;
  app_id: string;
  placement_id: string;
  type: "guide" | "paywall";
  enabled: boolean;
  default_variant_id: string | null;
  created_at: string;
};

export type Variant = {
  id: string;
  app_id: string;
  placement_id: string;
  package_id: string;
  offering_id: string;
  product_ids: string[];
  priority: number;
  enabled: boolean;
  page_options: {
    auto_close_on_success: boolean;
    auto_close_on_restore: boolean;
  };
  created_at: string;
};

export type PackageManifest = {
  manifest_version: number;
  placement_type: Placement["type"];
  package_version: string;
  entry_path: string;
  checksum?: string;
};

export type PackageStatus = "active" | "inactive" | "rolled_back";

export type PackageRecord = {
  id: string;
  app_id: string;
  placement_id: string;
  version: string;
  checksum: string;
  entry_path: string;
  cdn_url: string;
  size_bytes: number;
  status: PackageStatus;
  manifest: PackageManifest;
  created_at: string;
};

export type ExperimentStatus = "draft" | "running" | "paused" | "ended";

export type ExperimentVariant = {
  variant_id: string;
  weight: number;
};

export type Experiment = {
  id: string;
  app_id: string;
  placement_id: string;
  status: ExperimentStatus;
  traffic: number;
  seed: string;
  variants: ExperimentVariant[];
  created_at: string;
  started_at?: string;
  ended_at?: string;
};

export type MatchType = "all" | "any";
export type FieldType = "string" | "semver" | "number" | "boolean" | "array";
export type ConditionOperator =
  | "eq"
  | "ne"
  | "in"
  | "notIn"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "regex";
export type ConditionValue = string | number | boolean | string[];

export type Condition = {
  field: string;
  op: ConditionOperator;
  value: ConditionValue;
};

export type RuleSet = {
  id: string;
  app_id: string;
  placement_id: string;
  priority: number;
  match_type: MatchType;
  conditions: Condition[];
  variant_id: string;
  experiment_id?: string;
  created_at: string;
};

export type EventSummary = {
  event_name: string;
  placement_id: string;
  variant_id: string;
  count: number;
  unique_users: number;
  last_seen_at: string;
};

export type EventDetail = {
  event_id: string;
  event_name: string;
  timestamp: string;
  app_id: string;
  placement_id: string;
  variant_id: string;
  device_id: string;
  product_id?: string;
  price?: number;
  currency?: string;
};
