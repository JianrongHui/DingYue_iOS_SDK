import { type FormEvent, useEffect, useMemo, useState } from "react";
import { listApps } from "../api/apps";
import { getErrorMessage, shouldUseFallback } from "../api/client";
import { listPlacementsByApps } from "../api/placements";
import {
  createRuleset,
  deleteRuleset,
  listRulesetsByPlacements,
  updateRuleset
} from "../api/rulesets";
import { listVariantsByPlacements } from "../api/variants";
import type {
  Condition,
  ConditionOperator,
  ConditionValue,
  FieldType,
  MatchType,
  Placement,
  RuleSet,
  Variant
} from "../api/types";
import { seedPlacements, seedVariants } from "../data/admin_seed";
import { generateId } from "../utils/storage";

type FieldDefinition = {
  id: string;
  label: string;
  type: FieldType;
};

type RuleFormState = {
  placement_id: string;
  variant_id: string;
  priority: number;
  match_type: MatchType;
  conditions: Condition[];
};

type TestInputState = Record<string, string>;

const FIELD_DEFINITIONS: FieldDefinition[] = [
  { id: "country", label: "country", type: "string" },
  { id: "region", label: "region", type: "string" },
  { id: "locale", label: "locale", type: "string" },
  { id: "channel", label: "channel", type: "string" },
  { id: "app_version", label: "app_version", type: "semver" },
  { id: "os_version", label: "os_version", type: "semver" },
  { id: "is_first_launch", label: "is_first_launch", type: "boolean" },
  { id: "has_entitlement", label: "has_entitlement", type: "boolean" },
  { id: "session_count", label: "session_count", type: "number" },
  { id: "install_days", label: "install_days", type: "number" },
  { id: "rc_entitlements", label: "rc_entitlements", type: "array" }
];

const FIELD_MAP = FIELD_DEFINITIONS.reduce<Record<string, FieldDefinition>>(
  (acc, field) => {
    acc[field.id] = field;
    return acc;
  },
  {}
);

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "eq",
  ne: "ne",
  in: "in",
  notIn: "notIn",
  gt: "gt",
  gte: "gte",
  lt: "lt",
  lte: "lte",
  contains: "contains",
  regex: "regex"
};

const OPERATORS_BY_TYPE: Record<FieldType, ConditionOperator[]> = {
  string: ["eq", "ne", "in", "notIn", "contains", "regex"],
  semver: ["eq", "ne", "gt", "gte", "lt", "lte"],
  number: ["eq", "ne", "gt", "gte", "lt", "lte", "in", "notIn"],
  boolean: ["eq", "ne"],
  array: ["contains", "in", "notIn"]
};

const isListOperator = (op: ConditionOperator) => op === "in" || op === "notIn";

const parseListInput = (value: string) =>
  value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const today = () => new Date().toISOString().slice(0, 10);

const buildShortId = (prefix: string) => {
  const base = generateId().replace(/-/g, "");
  return `${prefix}_${base.slice(0, 6)}`;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isNaN(value) ? null : value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const parseSemver = (value: string) => {
  const cleaned = value.trim().replace(/^v/i, "");
  if (!cleaned) {
    return [];
  }
  return cleaned.split(".").map((segment) => {
    const match = segment.match(/^\d+/);
    return match ? Number(match[0]) : 0;
  });
};

const compareSemver = (left: string, right: string) => {
  const leftParts = parseSemver(left);
  const rightParts = parseSemver(right);
  const length = Math.max(leftParts.length, rightParts.length, 1);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
};

const normalizeList = (value: ConditionValue): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return parseListInput(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
};

const defaultValueFor = (type: FieldType, op: ConditionOperator): ConditionValue => {
  if (type === "boolean") {
    return false;
  }
  if (isListOperator(op)) {
    return [];
  }
  return "";
};

const normalizeConditionValue = (
  type: FieldType,
  op: ConditionOperator,
  value: ConditionValue
): ConditionValue => {
  if (isListOperator(op)) {
    return normalizeList(value);
  }
  if (type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    if (typeof value === "string") {
      return value === "true";
    }
    return false;
  }
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  if (typeof value === "number") {
    return Number.isNaN(value) ? "" : value;
  }
  return value ?? "";
};

const createEmptyCondition = (fieldId?: string): Condition => {
  const field = FIELD_MAP[fieldId ?? FIELD_DEFINITIONS[0].id] ?? FIELD_DEFINITIONS[0];
  const op = OPERATORS_BY_TYPE[field.type][0];
  return {
    field: field.id,
    op,
    value: defaultValueFor(field.type, op)
  };
};

const normalizeConditionForForm = (condition: Condition): Condition => {
  const field = FIELD_MAP[condition.field] ?? FIELD_DEFINITIONS[0];
  const allowedOps = OPERATORS_BY_TYPE[field.type];
  const op = allowedOps.includes(condition.op) ? condition.op : allowedOps[0];
  const value = normalizeConditionValue(field.type, op, condition.value);
  return { field: field.id, op, value };
};

const isConditionValid = (condition: Condition) => {
  if (!condition.field || !condition.op) {
    return false;
  }
  if (isListOperator(condition.op)) {
    return Array.isArray(condition.value) && condition.value.length > 0;
  }
  if (typeof condition.value === "boolean") {
    return true;
  }
  if (typeof condition.value === "number") {
    return !Number.isNaN(condition.value);
  }
  if (typeof condition.value === "string") {
    return condition.value.trim().length > 0;
  }
  return false;
};

const formatConditionValue = (value: ConditionValue) => {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (value === "" || value === null || value === undefined) {
    return "-";
  }
  return String(value);
};

const formatCondition = (condition: Condition) =>
  `${condition.field} ${condition.op} ${formatConditionValue(condition.value)}`;

const evaluateCondition = (
  condition: Condition,
  attributes: Record<string, unknown>
) => {
  const field = FIELD_MAP[condition.field];
  if (!field) {
    return false;
  }
  const actual = attributes[condition.field];
  if (actual === undefined || actual === null) {
    return false;
  }

  const op = condition.op;
  const expected = condition.value;
  const type = field.type;

  if (op === "eq" || op === "ne") {
    let isEqual = false;
    if (type === "boolean") {
      const actualValue =
        typeof actual === "boolean" ? actual : String(actual) === "true";
      const expectedValue =
        typeof expected === "boolean" ? expected : String(expected) === "true";
      isEqual = actualValue === expectedValue;
    } else if (type === "number") {
      const actualNumber = toNumber(actual);
      const expectedNumber = toNumber(expected);
      if (actualNumber !== null && expectedNumber !== null) {
        isEqual = actualNumber === expectedNumber;
      }
    } else if (type === "semver") {
      isEqual = compareSemver(String(actual), String(expected)) === 0;
    } else if (type === "array") {
      const actualList = Array.isArray(actual)
        ? actual.map((item) => String(item))
        : [];
      const expectedList = normalizeList(expected);
      isEqual =
        actualList.length === expectedList.length &&
        expectedList.every((item) => actualList.includes(String(item)));
    } else {
      isEqual = String(actual) === String(expected);
    }
    return op === "eq" ? isEqual : !isEqual;
  }

  if (op === "contains") {
    const expectedValue = String(expected);
    if (!expectedValue) {
      return false;
    }
    if (type === "array") {
      return (
        Array.isArray(actual) &&
        actual.map((item) => String(item)).includes(expectedValue)
      );
    }
    return String(actual).includes(expectedValue);
  }

  if (op === "regex") {
    try {
      const regex = new RegExp(String(expected));
      if (Array.isArray(actual)) {
        return actual.some((item) => regex.test(String(item)));
      }
      return regex.test(String(actual));
    } catch (error) {
      return false;
    }
  }

  if (op === "in" || op === "notIn") {
    const expectedList = normalizeList(expected);
    let isMatch = false;

    if (type === "number") {
      const actualNumber = toNumber(actual);
      const listNumbers = expectedList
        .map((item) => toNumber(item))
        .filter((item): item is number => item !== null);
      isMatch = actualNumber !== null && listNumbers.includes(actualNumber);
    } else if (type === "semver") {
      const actualValue = String(actual);
      isMatch = expectedList.some(
        (item) => compareSemver(actualValue, String(item)) === 0
      );
    } else if (Array.isArray(actual)) {
      const actualList = actual.map((item) => String(item));
      isMatch = actualList.some((item) => expectedList.includes(item));
    } else {
      isMatch = expectedList.includes(String(actual));
    }
    return op === "in" ? isMatch : !isMatch;
  }

  if (type === "number") {
    const actualNumber = toNumber(actual);
    const expectedNumber = toNumber(expected);
    if (actualNumber === null || expectedNumber === null) {
      return false;
    }
    if (op === "gt") {
      return actualNumber > expectedNumber;
    }
    if (op === "gte") {
      return actualNumber >= expectedNumber;
    }
    if (op === "lt") {
      return actualNumber < expectedNumber;
    }
    if (op === "lte") {
      return actualNumber <= expectedNumber;
    }
  }

  if (type === "semver") {
    const comparison = compareSemver(String(actual), String(expected));
    if (op === "gt") {
      return comparison > 0;
    }
    if (op === "gte") {
      return comparison >= 0;
    }
    if (op === "lt") {
      return comparison < 0;
    }
    if (op === "lte") {
      return comparison <= 0;
    }
  }

  return false;
};

const evaluateRuleSet = (ruleSet: RuleSet, attributes: Record<string, unknown>) => {
  if (!ruleSet.conditions.length) {
    return false;
  }
  const results = ruleSet.conditions.map((condition) =>
    evaluateCondition(condition, attributes)
  );
  return ruleSet.match_type === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
};

const buildTestAttributes = (input: TestInputState) =>
  FIELD_DEFINITIONS.reduce<Record<string, unknown>>((acc, field) => {
    const raw = input[field.id];
    const trimmed = raw.trim();
    if (!trimmed) {
      return acc;
    }
    if (field.type === "boolean") {
      acc[field.id] = trimmed === "true";
      return acc;
    }
    if (field.type === "number") {
      const parsed = toNumber(trimmed);
      if (parsed !== null) {
        acc[field.id] = parsed;
      }
      return acc;
    }
    if (field.type === "array") {
      const list = parseListInput(trimmed);
      if (list.length) {
        acc[field.id] = list;
      }
      return acc;
    }
    acc[field.id] = trimmed;
    return acc;
  }, {});

const emptyTestState = () =>
  FIELD_DEFINITIONS.reduce<TestInputState>((acc, field) => {
    acc[field.id] = "";
    return acc;
  }, {});

export default function RulesPage() {
  const [rulesets, setRuleSets] = useState<RuleSet[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterPlacementId, setFilterPlacementId] = useState("");
  const [filterMatchType, setFilterMatchType] = useState<"" | MatchType>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRuleSet, setEditingRuleSet] = useState<RuleSet | null>(null);
  const [form, setForm] = useState<RuleFormState>({
    placement_id: "",
    variant_id: "",
    priority: 1,
    match_type: "all",
    conditions: [createEmptyCondition()]
  });
  const [testPlacementId, setTestPlacementId] = useState("");
  const [testInput, setTestInput] = useState<TestInputState>(emptyTestState);
  const [testResult, setTestResult] = useState<{
    matched: RuleSet | null;
    evaluated: RuleSet[];
  } | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const appsData = await listApps();
      const placementsData = await listPlacementsByApps(
        appsData.map((app) => app.app_id)
      );
      setPlacements(placementsData);
      const variantsData = await listVariantsByPlacements(placementsData);
      setVariants(variantsData);
      const rulesetsData = await listRulesetsByPlacements(placementsData);
      setRuleSets(rulesetsData);
    } catch (loadError) {
      if (shouldUseFallback(loadError)) {
        setPlacements(seedPlacements);
        setVariants(seedVariants);
        setRuleSets([]);
        setError("API unavailable. Showing mock rulesets.");
      } else {
        setError(getErrorMessage(loadError));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const sortedRuleSets = useMemo(() => {
    return [...rulesets].sort((a, b) => a.priority - b.priority);
  }, [rulesets]);

  const filteredRuleSets = useMemo(() => {
    return sortedRuleSets.filter((ruleSet) => {
      const matchPlacement =
        !filterPlacementId || ruleSet.placement_id === filterPlacementId;
      const matchType = !filterMatchType || ruleSet.match_type === filterMatchType;
      return matchPlacement && matchType;
    });
  }, [filterPlacementId, filterMatchType, sortedRuleSets]);

  const formVariants = useMemo(() => {
    return variants.filter((variant) => variant.placement_id === form.placement_id);
  }, [form.placement_id, variants]);

  const openCreate = () => {
    const defaultPlacementId = placements[0]?.placement_id ?? "";
    const defaultVariantId =
      variants.find((variant) => variant.placement_id === defaultPlacementId)?.id ??
      "";
    setEditingRuleSet(null);
    setError(null);
    setForm({
      placement_id: defaultPlacementId,
      variant_id: defaultVariantId,
      priority: 1,
      match_type: "all",
      conditions: [createEmptyCondition()]
    });
    setModalOpen(true);
  };

  const openEdit = (ruleSet: RuleSet) => {
    setEditingRuleSet(ruleSet);
    setError(null);
    setForm({
      placement_id: ruleSet.placement_id,
      variant_id: ruleSet.variant_id,
      priority: ruleSet.priority,
      match_type: ruleSet.match_type,
      conditions: ruleSet.conditions.map(normalizeConditionForForm)
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingRuleSet(null);
  };

  const handleFormPlacementChange = (value: string) => {
    setForm((prev) => {
      const availableVariants = variants.filter(
        (variant) => variant.placement_id === value
      );
      const nextVariantId = availableVariants.some(
        (variant) => variant.id === prev.variant_id
      )
        ? prev.variant_id
        : availableVariants[0]?.id ?? "";
      return {
        ...prev,
        placement_id: value,
        variant_id: nextVariantId
      };
    });
  };

  const updateConditionAt = (
    index: number,
    updater: (condition: Condition) => Condition
  ) => {
    setForm((prev) => {
      const nextConditions = prev.conditions.map((condition, idx) =>
        idx === index ? updater(condition) : condition
      );
      return { ...prev, conditions: nextConditions };
    });
  };

  const handleConditionFieldChange = (index: number, fieldId: string) => {
    const field = FIELD_MAP[fieldId] ?? FIELD_DEFINITIONS[0];
    const op = OPERATORS_BY_TYPE[field.type][0];
    updateConditionAt(index, () => ({
      field: field.id,
      op,
      value: defaultValueFor(field.type, op)
    }));
  };

  const handleConditionOpChange = (index: number, op: ConditionOperator) => {
    updateConditionAt(index, (condition) => {
      const field = FIELD_MAP[condition.field] ?? FIELD_DEFINITIONS[0];
      return {
        ...condition,
        op,
        value: normalizeConditionValue(field.type, op, condition.value)
      };
    });
  };

  const handleConditionValueChange = (
    index: number,
    value: ConditionValue
  ) => {
    updateConditionAt(index, (condition) => ({ ...condition, value }));
  };

  const handleAddCondition = () => {
    setForm((prev) => ({
      ...prev,
      conditions: [...prev.conditions, createEmptyCondition(prev.conditions[0]?.field)]
    }));
  };

  const handleRemoveCondition = (index: number) => {
    setForm((prev) => ({
      ...prev,
      conditions: prev.conditions.filter((_, idx) => idx !== index)
    }));
  };

  const handleDelete = async (ruleSet: RuleSet) => {
    if (!window.confirm(`Delete ruleset ${ruleSet.id}?`)) {
      return;
    }
    setError(null);
    try {
      await deleteRuleset(ruleSet.id);
      setRuleSets((prev) => prev.filter((item) => item.id !== ruleSet.id));
    } catch (deleteError) {
      if (shouldUseFallback(deleteError)) {
        setRuleSets((prev) => prev.filter((item) => item.id !== ruleSet.id));
        setError("API unavailable. Deleted ruleset locally.");
      } else {
        setError(getErrorMessage(deleteError));
      }
    }
  };

  const handlePriorityChange = async (ruleSet: RuleSet, value: number) => {
    const nextPriority = Number.isNaN(value) ? ruleSet.priority : value;
    setRuleSets((prev) =>
      prev.map((item) =>
        item.id === ruleSet.id ? { ...item, priority: nextPriority } : item
      )
    );
    try {
      const updated = await updateRuleset(ruleSet.id, { priority: nextPriority });
      setRuleSets((prev) =>
        prev.map((item) => (item.id === ruleSet.id ? updated : item))
      );
    } catch (updateError) {
      if (shouldUseFallback(updateError)) {
        setError("API unavailable. Updated priority locally.");
      } else {
        setRuleSets((prev) =>
          prev.map((item) =>
            item.id === ruleSet.id ? { ...item, priority: ruleSet.priority } : item
          )
        );
        setError(getErrorMessage(updateError));
      }
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.placement_id || !form.variant_id) {
      setError("placement_id and variant_id are required.");
      return;
    }
    if (!form.conditions.length) {
      setError("Add at least one condition.");
      return;
    }
    if (!form.conditions.every(isConditionValid)) {
      setError("Each condition needs a field, operator, and value.");
      return;
    }

    const placement = placements.find(
      (item) => item.placement_id === form.placement_id
    );
    const appId = placement?.app_id ?? "";

    const nextRuleSet: RuleSet = {
      id: editingRuleSet?.id ?? buildShortId("rs"),
      app_id: appId,
      placement_id: form.placement_id,
      priority: Number.isNaN(form.priority) ? 0 : Number(form.priority),
      match_type: form.match_type,
      conditions: form.conditions.map((condition) => ({
        ...condition,
        value: normalizeConditionValue(
          FIELD_MAP[condition.field]?.type ?? "string",
          condition.op,
          condition.value
        )
      })),
      variant_id: form.variant_id,
      created_at: editingRuleSet?.created_at ?? today()
    };

    setError(null);
    try {
      if (editingRuleSet) {
        const updated = await updateRuleset(nextRuleSet.id, nextRuleSet);
        setRuleSets((prev) =>
          prev.map((item) => (item.id === nextRuleSet.id ? updated : item))
        );
      } else {
        const created = await createRuleset(nextRuleSet);
        setRuleSets((prev) => [created, ...prev]);
      }
      setModalOpen(false);
      setEditingRuleSet(null);
    } catch (saveError) {
      if (shouldUseFallback(saveError)) {
        setRuleSets((prev) =>
          editingRuleSet
            ? prev.map((item) => (item.id === nextRuleSet.id ? nextRuleSet : item))
            : [nextRuleSet, ...prev]
        );
        setModalOpen(false);
        setEditingRuleSet(null);
        setError("API unavailable. Saved ruleset locally.");
      } else {
        setError(getErrorMessage(saveError));
      }
    }
  };

  const handleRunTest = () => {
    const attributes = buildTestAttributes(testInput);
    const candidates = sortedRuleSets.filter((ruleSet) =>
      testPlacementId ? ruleSet.placement_id === testPlacementId : true
    );
    let matched: RuleSet | null = null;
    for (const ruleSet of candidates) {
      if (evaluateRuleSet(ruleSet, attributes)) {
        matched = ruleSet;
        break;
      }
    }
    setTestResult({ matched, evaluated: candidates });
  };

  const ruleDslPreview = useMemo(() => {
    return {
      [form.match_type]: form.conditions.map((condition) => ({
        field: condition.field,
        op: condition.op,
        value: condition.value
      }))
    };
  }, [form]);

  return (
    <section className="page">
      <div className="section-actions">
        <button className="primary" type="button" onClick={openCreate}>
          create_ruleset
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          refresh
        </button>
      </div>

      {loading && <div className="banner">loading rulesets...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>rule_builder</h3>
              <p>Compose all/any rules with typed inputs and DSL preview.</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>match_type: all / any</li>
            <li>
              fields: country, region, locale, channel, app_version, os_version,
              is_first_launch, has_entitlement, session_count, install_days,
              rc_entitlements
            </li>
            <li>operators: eq, ne, in, notIn, gt, gte, lt, lte, contains, regex</li>
            <li>priority: lower number wins</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>match_test</h3>
              <p>Simulate rule evaluation for a test user.</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              placement_id
              <select
                name="test_placement_id"
                value={testPlacementId}
                onChange={(event) => setTestPlacementId(event.target.value)}
              >
                <option value="">all</option>
                {placements.map((placement) => (
                  <option key={placement.placement_id} value={placement.placement_id}>
                    {placement.placement_id}
                  </option>
                ))}
              </select>
            </label>
            <div className="card-grid two">
              {FIELD_DEFINITIONS.map((field) => {
                if (field.type === "boolean") {
                  return (
                    <label key={field.id}>
                      {field.label}
                      <select
                        name={`test_${field.id}`}
                        value={testInput[field.id]}
                        onChange={(event) =>
                          setTestInput((prev) => ({
                            ...prev,
                            [field.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">unset</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    </label>
                  );
                }
                if (field.type === "array") {
                  return (
                    <label key={field.id}>
                      {field.label}
                      <textarea
                        name={`test_${field.id}`}
                        placeholder="entitlement_a, entitlement_b"
                        value={testInput[field.id]}
                        onChange={(event) =>
                          setTestInput((prev) => ({
                            ...prev,
                            [field.id]: event.target.value
                          }))
                        }
                      />
                    </label>
                  );
                }
                return (
                  <label key={field.id}>
                    {field.label}
                    <input
                      name={`test_${field.id}`}
                      type={field.type === "number" ? "number" : "text"}
                      placeholder={field.type === "semver" ? "2.1.0" : field.label}
                      value={testInput[field.id]}
                      onChange={(event) =>
                        setTestInput((prev) => ({
                          ...prev,
                          [field.id]: event.target.value
                        }))
                      }
                    />
                  </label>
                );
              })}
            </div>
            <button className="ghost" type="button" onClick={handleRunTest}>
              run_test
            </button>
          </form>
          {testResult && (
            <div
              className={`banner ${testResult.matched ? "success" : "error"}`}
            >
              {testResult.matched
                ? `Matched ruleset ${testResult.matched.id} (variant ${testResult.matched.variant_id}).`
                : `No ruleset matched across ${testResult.evaluated.length} candidates.`}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>ruleset_list</h3>
            <p>Priority-ordered rulesets per placement.</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              placement_id
              <select
                name="placement_id"
                value={filterPlacementId}
                onChange={(event) => setFilterPlacementId(event.target.value)}
              >
                <option value="">all</option>
                {placements.map((placement) => (
                  <option key={placement.placement_id} value={placement.placement_id}>
                    {placement.placement_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              match_type
              <select
                name="match_type"
                value={filterMatchType}
                onChange={(event) =>
                  setFilterMatchType(event.target.value as "" | MatchType)
                }
              >
                <option value="">all</option>
                <option value="all">all</option>
                <option value="any">any</option>
              </select>
            </label>
            <button
              className="ghost"
              type="button"
              onClick={() => {
                setFilterPlacementId("");
                setFilterMatchType("");
              }}
            >
              reset
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>rule_set_id</th>
                <th>app_id</th>
                <th>placement_id</th>
                <th>variant_id</th>
                <th>priority</th>
                <th>match_type</th>
                <th>conditions</th>
                <th>created_at</th>
                <th>actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRuleSets.map((ruleSet) => (
                <tr key={ruleSet.id}>
                  <td>{ruleSet.id}</td>
                  <td>{ruleSet.app_id || "-"}</td>
                  <td>{ruleSet.placement_id}</td>
                  <td>{ruleSet.variant_id}</td>
                  <td>
                    <input
                      className="table-select"
                      type="number"
                      value={ruleSet.priority}
                      onChange={(event) =>
                        handlePriorityChange(ruleSet, Number(event.target.value))
                      }
                    />
                  </td>
                  <td>{ruleSet.match_type}</td>
                  <td>{ruleSet.conditions.map(formatCondition).join(" | ")}</td>
                  <td>{ruleSet.created_at}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => openEdit(ruleSet)}
                      >
                        edit
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(ruleSet)}
                      >
                        delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRuleSets.length && !loading && (
                <tr>
                  <td colSpan={9}>No rulesets found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div
            className="modal large"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{editingRuleSet ? "edit_ruleset" : "create_ruleset"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                close
              </button>
            </div>
            <div className="modal-body">
              <form className="stack-form" onSubmit={handleSubmit}>
                <label>
                  placement_id
                  <select
                    name="placement_id"
                    value={form.placement_id}
                    onChange={(event) => handleFormPlacementChange(event.target.value)}
                  >
                    <option value="">select_placement</option>
                    {placements.map((placement) => (
                      <option
                        key={placement.placement_id}
                        value={placement.placement_id}
                      >
                        {placement.placement_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  variant_id
                  <select
                    name="variant_id"
                    value={form.variant_id}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        variant_id: event.target.value
                      }))
                    }
                  >
                    <option value="">select_variant</option>
                    {formVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  priority
                  <input
                    name="priority"
                    type="number"
                    value={form.priority}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        priority: Number(event.target.value)
                      }))
                    }
                  />
                </label>
                <label>
                  match_type
                  <select
                    name="match_type"
                    value={form.match_type}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        match_type: event.target.value as MatchType
                      }))
                    }
                  >
                    <option value="all">all</option>
                    <option value="any">any</option>
                  </select>
                </label>
                <div>
                  <div className="form-hint">conditions</div>
                  {form.conditions.map((condition, index) => {
                    const field = FIELD_MAP[condition.field] ?? FIELD_DEFINITIONS[0];
                    const supportedOps = OPERATORS_BY_TYPE[field.type];
                    const showListInput = isListOperator(condition.op);
                    return (
                      <div className="inline-form" key={`${condition.field}-${index}`}>
                        <label>
                          field
                          <select
                            value={condition.field}
                            onChange={(event) =>
                              handleConditionFieldChange(index, event.target.value)
                            }
                          >
                            {FIELD_DEFINITIONS.map((fieldOption) => (
                              <option key={fieldOption.id} value={fieldOption.id}>
                                {fieldOption.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          op
                          <select
                            value={condition.op}
                            onChange={(event) =>
                              handleConditionOpChange(
                                index,
                                event.target.value as ConditionOperator
                              )
                            }
                          >
                            {supportedOps.map((op) => (
                              <option key={op} value={op}>
                                {OPERATOR_LABELS[op]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          value
                          {field.type === "boolean" ? (
                            <select
                              value={String(condition.value)}
                              onChange={(event) =>
                                handleConditionValueChange(
                                  index,
                                  event.target.value === "true"
                                )
                              }
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : showListInput ? (
                            <textarea
                              value={
                                Array.isArray(condition.value)
                                  ? condition.value.join("\n")
                                  : String(condition.value)
                              }
                              placeholder="value_a, value_b"
                              onChange={(event) =>
                                handleConditionValueChange(
                                  index,
                                  parseListInput(event.target.value)
                                )
                              }
                            />
                          ) : (
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              placeholder={field.type === "semver" ? "2.0.0" : ""}
                              value={
                                condition.value === null || condition.value === undefined
                                  ? ""
                                  : String(condition.value)
                              }
                              onChange={(event) =>
                                handleConditionValueChange(index, event.target.value)
                              }
                            />
                          )}
                        </label>
                        <button
                          className="ghost small"
                          type="button"
                          onClick={() => handleRemoveCondition(index)}
                          disabled={form.conditions.length === 1}
                        >
                          remove
                        </button>
                      </div>
                    );
                  })}
                  <button className="ghost small" type="button" onClick={handleAddCondition}>
                    add_condition
                  </button>
                </div>
                <div>
                  <div className="form-hint">dsl_preview</div>
                  <pre className="code-block">
                    {JSON.stringify(ruleDslPreview, null, 2)}
                  </pre>
                </div>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    cancel
                  </button>
                  <button className="primary" type="submit">
                    {editingRuleSet ? "save" : "create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
