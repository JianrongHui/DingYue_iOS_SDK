# Rules DSL Library

Pure functions for targeting rules and experiment assignment. All input fields use
snake_case.

## Function Signatures

```ts
export function evaluateCondition(
  condition_input: condition,
  context: rules_context
): boolean;

export function matchRulesets(
  rulesets: ruleset[],
  context: rules_context
): ruleset_match | null;

export function assignExperiment(
  experiment_input: experiment,
  user_key: string
): assignment_result;
```

## Example

```ts
import {
  assignExperiment,
  evaluateCondition,
  matchRulesets,
  type condition,
  type experiment,
  type rules_context,
  type ruleset,
} from "./index";

const context: rules_context = {
  country: "US",
  is_first_launch: true,
  app_version: "2.1.0",
  session_count: 3,
  custom: {
    plan: "pro",
  },
};

const condition_input: condition = {
  all: [
    { field: "country", op: "in", value: ["US", "CA"] },
    { field: "is_first_launch", op: "eq", value: true },
    { field: "app_version", op: "gte", value: "2.0.0" },
    { field: "custom.plan", op: "eq", value: "pro" },
  ],
};

const rulesets: ruleset[] = [
  {
    rule_set_id: "rs_priority_100",
    priority: 100,
    condition: condition_input,
    variant_id: "variant_a",
    experiment_id: "exp_checkout",
  },
  {
    rule_set_id: "rs_priority_10",
    priority: 10,
    condition: { all: [] },
    variant_id: "variant_b",
  },
];

const match = matchRulesets(rulesets, context);

if (match) {
  if (match.experiment_id) {
    const experiment_input: experiment = {
      experiment_id: "exp_checkout",
      seed: "checkout_seed",
      traffic: 50,
      default_variant_id: "variant_a",
      variants: [
        { variant_id: "variant_a", weight: 50 },
        { variant_id: "variant_c", weight: 50 },
      ],
    };

    const user_key = "rc_app_user_id_or_device_id";
    const assignment = assignExperiment(experiment_input, user_key);
    const variant_id = assignment.variant_id;
  } else {
    const variant_id = match.variant_id;
  }
} else {
  const variant_id = "placement_default_variant";
}

const matched = evaluateCondition(condition_input, context);
```

## Notes

- Ruleset selection sorts by `priority` descending and returns the first match.
- Missing or invalid `app_version`/`os_version` values never match version ops.
- `custom` fields can be accessed with dot notation, for example `custom.plan`.
- `assignExperiment` uses `seed + user_key` for bucketing and falls back to
  `default_variant_id` when `bucket >= traffic`.
