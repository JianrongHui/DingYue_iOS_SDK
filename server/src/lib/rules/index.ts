export type rule_operator =
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

export type condition = condition_group | condition_leaf;

export type condition_group = {
  all?: condition[];
  any?: condition[];
};

export type condition_leaf = {
  field: string;
  op: rule_operator;
  value: unknown;
};

export type rules_context = {
  country?: string;
  region?: string;
  locale?: string;
  app_version?: string;
  os_version?: string;
  channel?: string;
  is_first_launch?: boolean;
  session_count?: number;
  install_days?: number;
  has_entitlement?: boolean;
  rc_entitlements?: string[];
  custom?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ruleset = {
  rule_set_id: string;
  priority: number;
  condition: condition;
  variant_id: string;
  experiment_id?: string;
};

export type ruleset_match = {
  rule_set_id: string;
  variant_id: string;
  experiment_id?: string;
};

export type experiment_variant = {
  variant_id: string;
  weight: number;
};

export type experiment = {
  experiment_id: string;
  seed: string;
  traffic: number;
  variants: experiment_variant[];
  default_variant_id: string;
};

export type assignment_result = {
  variant_id: string;
  bucket: number;
  in_experiment: boolean;
};

const VERSION_FIELDS = new Set(["app_version", "os_version"]);

export function evaluateCondition(
  condition_input: condition,
  context: rules_context
): boolean {
  if (is_condition_leaf(condition_input)) {
    return evaluate_leaf(condition_input, context);
  }

  const group = condition_input as condition_group;
  const has_all = Array.isArray(group.all);
  const has_any = Array.isArray(group.any);

  if (!has_all && !has_any) {
    return false;
  }

  const all_match = has_all
    ? (group.all as condition[]).every((item) =>
        evaluateCondition(item, context)
      )
    : true;
  const any_match = has_any
    ? (group.any as condition[]).some((item) =>
        evaluateCondition(item, context)
      )
    : true;

  if (has_all && has_any) {
    return all_match && any_match;
  }

  return has_all ? all_match : any_match;
}

export function matchRulesets(
  rulesets: ruleset[],
  context: rules_context
): ruleset_match | null {
  const sorted = rulesets
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const left_priority = Number.isFinite(left.item.priority)
        ? left.item.priority
        : 0;
      const right_priority = Number.isFinite(right.item.priority)
        ? right.item.priority
        : 0;

      if (left_priority === right_priority) {
        return left.index - right.index;
      }

      return right_priority - left_priority;
    })
    .map((entry) => entry.item);

  for (const ruleset_item of sorted) {
    if (evaluateCondition(ruleset_item.condition, context)) {
      return {
        rule_set_id: ruleset_item.rule_set_id,
        variant_id: ruleset_item.variant_id,
        experiment_id: ruleset_item.experiment_id,
      };
    }
  }

  return null;
}

export function assignExperiment(
  experiment_input: experiment,
  user_key: string
): assignment_result {
  const seed = experiment_input.seed ?? "";
  const key = `${seed}${user_key}`;
  const bucket = hash_string(key) % 100;
  const traffic = clamp_number(experiment_input.traffic, 0, 100);
  const fallback_variant_id = experiment_input.default_variant_id;

  if (bucket >= traffic) {
    return {
      variant_id: fallback_variant_id,
      bucket,
      in_experiment: false,
    };
  }

  return {
    variant_id: pick_weighted_variant(
      experiment_input.variants,
      key,
      fallback_variant_id
    ),
    bucket,
    in_experiment: true,
  };
}

function is_condition_leaf(condition_input: condition): condition_input is condition_leaf {
  return (
    typeof (condition_input as condition_leaf).field === "string" &&
    typeof (condition_input as condition_leaf).op === "string"
  );
}

function evaluate_leaf(condition_input: condition_leaf, context: rules_context): boolean {
  const actual = get_field_value(context, condition_input.field);

  if (actual === undefined || actual === null) {
    return false;
  }

  if (VERSION_FIELDS.has(condition_input.field)) {
    return evaluate_version_condition(condition_input.op, actual, condition_input.value);
  }

  switch (condition_input.op) {
    case "eq":
      return is_equal_value(actual, condition_input.value);
    case "ne":
      return !is_equal_value(actual, condition_input.value);
    case "in":
      return is_value_in_list(actual, condition_input.value);
    case "notIn":
      return !is_value_in_list(actual, condition_input.value);
    case "gt":
      return compare_numbers(actual, condition_input.value, (left, right) => left > right);
    case "gte":
      return compare_numbers(actual, condition_input.value, (left, right) => left >= right);
    case "lt":
      return compare_numbers(actual, condition_input.value, (left, right) => left < right);
    case "lte":
      return compare_numbers(actual, condition_input.value, (left, right) => left <= right);
    case "contains":
      return contains_value(actual, condition_input.value);
    case "regex":
      return matches_regex(actual, condition_input.value);
    default:
      return false;
  }
}

function get_field_value(context: rules_context, field: string): unknown {
  if (!field) {
    return undefined;
  }

  const parts = field.split(".");
  let current: unknown = context;

  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    const record = current as Record<string, unknown>;
    if (!Object.prototype.hasOwnProperty.call(record, part)) {
      return undefined;
    }

    current = record[part];
  }

  return current;
}

function evaluate_version_condition(
  op: rule_operator,
  actual: unknown,
  expected: unknown
): boolean {
  if (typeof actual !== "string") {
    return false;
  }

  if (op === "in" || op === "notIn") {
    if (!Array.isArray(expected)) {
      return false;
    }

    const valid_values = expected.filter(
      (value): value is string => typeof value === "string"
    );
    if (valid_values.length === 0) {
      return false;
    }

    const matches = valid_values.some((value) => compare_semver(actual, value) === 0);
    return op === "in" ? matches : !matches;
  }

  if (typeof expected !== "string") {
    return false;
  }

  const comparison = compare_semver(actual, expected);
  if (comparison === null) {
    return false;
  }

  switch (op) {
    case "eq":
      return comparison === 0;
    case "ne":
      return comparison !== 0;
    case "gt":
      return comparison > 0;
    case "gte":
      return comparison >= 0;
    case "lt":
      return comparison < 0;
    case "lte":
      return comparison <= 0;
    default:
      return false;
  }
}

function compare_semver(left: string, right: string): number | null {
  const left_parts = parse_semver(left);
  const right_parts = parse_semver(right);

  if (!left_parts || !right_parts) {
    return null;
  }

  const max_len = Math.max(left_parts.length, right_parts.length);

  for (let index = 0; index < max_len; index += 1) {
    const left_value = left_parts[index] ?? 0;
    const right_value = right_parts[index] ?? 0;

    if (left_value > right_value) {
      return 1;
    }

    if (left_value < right_value) {
      return -1;
    }
  }

  return 0;
}

function parse_semver(value: string): number[] | null {
  if (value.trim() === "") {
    return null;
  }

  const parts = value.split(".");
  if (parts.length === 0) {
    return null;
  }

  const numbers: number[] = [];

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }

    numbers.push(Number(part));
  }

  return numbers;
}

function is_equal_value(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  return left === right;
}

function is_value_in_list(actual: unknown, list_value: unknown): boolean {
  if (!Array.isArray(list_value)) {
    return false;
  }

  return list_value.some((value) => is_equal_value(actual, value));
}

function compare_numbers(
  actual: unknown,
  expected: unknown,
  compare: (left: number, right: number) => boolean
): boolean {
  const actual_number = to_number(actual);
  const expected_number = to_number(expected);

  if (actual_number === null || expected_number === null) {
    return false;
  }

  return compare(actual_number, expected_number);
}

function to_number(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function contains_value(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }

  if (Array.isArray(actual)) {
    return actual.some((value) => value === expected);
  }

  if (
    actual &&
    typeof actual === "object" &&
    typeof expected === "string" &&
    Object.prototype.hasOwnProperty.call(actual, expected)
  ) {
    return true;
  }

  return false;
}

function matches_regex(actual: unknown, expected: unknown): boolean {
  if (typeof actual !== "string" || typeof expected !== "string") {
    return false;
  }

  try {
    const matcher = new RegExp(expected);
    return matcher.test(actual);
  } catch (error) {
    return false;
  }
}

function pick_weighted_variant(
  variants: experiment_variant[],
  key: string,
  fallback_variant_id: string
): string {
  const valid_variants = variants.filter((variant) =>
    Number.isFinite(variant.weight)
  );
  const total_weight = valid_variants.reduce(
    (sum, variant) => sum + Math.max(0, variant.weight),
    0
  );

  if (total_weight <= 0) {
    return fallback_variant_id;
  }

  const roll = (hash_string(`${key}:variant`) / 4294967296) * total_weight;
  let cumulative = 0;

  for (const variant of valid_variants) {
    const weight = Math.max(0, variant.weight);
    cumulative += weight;

    if (roll < cumulative) {
      return variant.variant_id;
    }
  }

  return fallback_variant_id;
}

function hash_string(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function clamp_number(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}
