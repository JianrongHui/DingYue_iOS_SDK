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
  { id: "country", label: "国家/地区", type: "string" },
  { id: "region", label: "区域", type: "string" },
  { id: "locale", label: "语言/地区", type: "string" },
  { id: "channel", label: "渠道", type: "string" },
  { id: "app_version", label: "应用版本", type: "semver" },
  { id: "os_version", label: "系统版本", type: "semver" },
  { id: "is_first_launch", label: "首次启动", type: "boolean" },
  { id: "has_entitlement", label: "已有权益", type: "boolean" },
  { id: "session_count", label: "会话次数", type: "number" },
  { id: "install_days", label: "安装天数", type: "number" },
  { id: "rc_entitlements", label: "RC 权益", type: "array" }
];

const FIELD_MAP = FIELD_DEFINITIONS.reduce<Record<string, FieldDefinition>>(
  (acc, field) => {
    acc[field.id] = field;
    return acc;
  },
  {}
);

const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  eq: "等于",
  ne: "不等于",
  in: "在列表中",
  notIn: "不在列表中",
  gt: "大于",
  gte: "大于等于",
  lt: "小于",
  lte: "小于等于",
  contains: "包含",
  regex: "正则匹配"
};

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  all: "全部满足",
  any: "任意满足"
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
    return value ? "是" : "否";
  }
  if (value === "" || value === null || value === undefined) {
    return "-";
  }
  return String(value);
};

const formatCondition = (condition: Condition) => {
  const fieldLabel = FIELD_MAP[condition.field]?.label ?? condition.field;
  const opLabel = OPERATOR_LABELS[condition.op] ?? condition.op;
  return `${fieldLabel} ${opLabel} ${formatConditionValue(condition.value)}`;
};

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
        setError("API 不可用，显示模拟规则集。");
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
    if (!window.confirm(`确认删除规则集 ${ruleSet.id}？`)) {
      return;
    }
    setError(null);
    try {
      await deleteRuleset(ruleSet.id);
      setRuleSets((prev) => prev.filter((item) => item.id !== ruleSet.id));
    } catch (deleteError) {
      if (shouldUseFallback(deleteError)) {
        setRuleSets((prev) => prev.filter((item) => item.id !== ruleSet.id));
        setError("API 不可用，已在本地删除规则集。");
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
        setError("API 不可用，已在本地更新优先级。");
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
      setError("placement_id 和 variant_id 为必填。");
      return;
    }
    if (!form.conditions.length) {
      setError("请至少添加一个条件。");
      return;
    }
    if (!form.conditions.every(isConditionValid)) {
      setError("每个条件都需要字段、操作符和值。");
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
        setError("API 不可用，已在本地保存规则集。");
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
          新建规则集
        </button>
        <button className="ghost" type="button" onClick={loadData}>
          刷新
        </button>
      </div>

      {loading && <div className="banner">正在加载规则集...</div>}
      {error && <div className="banner error">{error}</div>}

      <div className="card-grid two">
        <div className="card">
          <div className="card-header">
            <div>
              <h3>规则构建器</h3>
              <p>使用结构化条件构建规则，并预览 DSL。</p>
            </div>
          </div>
          <ul className="stack-list">
            <li>匹配模式：全部满足 / 任意满足</li>
            <li>
              字段：国家/地区、区域、语言/地区、渠道、应用版本、系统版本、首次启动、
              已有权益、会话次数、安装天数、RC 权益
            </li>
            <li>
              操作符：等于、不等于、在列表中、不在列表中、大于、大于等于、小于、小于等于、
              包含、正则匹配
            </li>
            <li>优先级：数值越小越优先</li>
          </ul>
        </div>
        <div className="card">
          <div className="card-header">
            <div>
              <h3>匹配测试</h3>
              <p>模拟特定用户属性的规则匹配结果。</p>
            </div>
          </div>
          <form className="stack-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              投放位 ID
              <select
                name="test_placement_id"
                value={testPlacementId}
                onChange={(event) => setTestPlacementId(event.target.value)}
              >
                <option value="">全部</option>
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
                        <option value="">未设置</option>
                        <option value="true">是</option>
                        <option value="false">否</option>
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
              运行测试
            </button>
          </form>
          {testResult && (
            <div
              className={`banner ${testResult.matched ? "success" : "error"}`}
            >
              {testResult.matched
                ? `匹配到规则集 ${testResult.matched.id}（变体 ${testResult.matched.variant_id}）。`
                : `在 ${testResult.evaluated.length} 个候选规则集中未匹配到结果。`}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>规则集列表</h3>
            <p>按优先级展示各投放位的规则集。</p>
          </div>
          <form className="inline-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              投放位 ID
              <select
                name="placement_id"
                value={filterPlacementId}
                onChange={(event) => setFilterPlacementId(event.target.value)}
              >
                <option value="">全部</option>
                {placements.map((placement) => (
                  <option key={placement.placement_id} value={placement.placement_id}>
                    {placement.placement_id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              匹配模式
              <select
                name="match_type"
                value={filterMatchType}
                onChange={(event) =>
                  setFilterMatchType(event.target.value as "" | MatchType)
                }
              >
                <option value="">全部</option>
                <option value="all">全部满足</option>
                <option value="any">任意满足</option>
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
              重置
            </button>
          </form>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>规则集 ID</th>
                <th>应用 ID</th>
                <th>投放位 ID</th>
                <th>变体 ID</th>
                <th>优先级</th>
                <th>匹配模式</th>
                <th>条件</th>
                <th>创建时间</th>
                <th>操作</th>
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
                  <td>{MATCH_TYPE_LABELS[ruleSet.match_type]}</td>
                  <td>{ruleSet.conditions.map(formatCondition).join(" | ")}</td>
                  <td>{ruleSet.created_at}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => openEdit(ruleSet)}
                      >
                        编辑
                      </button>
                      <button
                        className="ghost small"
                        type="button"
                        onClick={() => handleDelete(ruleSet)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRuleSets.length && !loading && (
                <tr>
                  <td colSpan={9}>未找到规则集。</td>
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
              <h3>{editingRuleSet ? "编辑规则集" : "新建规则集"}</h3>
              <button className="ghost small" type="button" onClick={closeModal}>
                关闭
              </button>
            </div>
            <div className="modal-body">
              <form className="stack-form" onSubmit={handleSubmit}>
                <label>
                  投放位 ID
                  <select
                    name="placement_id"
                    value={form.placement_id}
                    onChange={(event) => handleFormPlacementChange(event.target.value)}
                  >
                    <option value="">选择投放位</option>
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
                  变体 ID
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
                    <option value="">选择变体</option>
                    {formVariants.map((variant) => (
                      <option key={variant.id} value={variant.id}>
                        {variant.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  优先级
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
                  匹配模式
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
                    <option value="all">全部满足</option>
                    <option value="any">任意满足</option>
                  </select>
                </label>
                <div>
                  <div className="form-hint">条件</div>
                  {form.conditions.map((condition, index) => {
                    const field = FIELD_MAP[condition.field] ?? FIELD_DEFINITIONS[0];
                    const supportedOps = OPERATORS_BY_TYPE[field.type];
                    const showListInput = isListOperator(condition.op);
                    return (
                      <div className="inline-form" key={`${condition.field}-${index}`}>
                        <label>
                          字段
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
                          操作符
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
                          值
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
                              <option value="true">是</option>
                              <option value="false">否</option>
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
                          移除
                        </button>
                      </div>
                    );
                  })}
                  <button className="ghost small" type="button" onClick={handleAddCondition}>
                    添加条件
                  </button>
                </div>
                <div>
                  <div className="form-hint">DSL 预览</div>
                  <pre className="code-block">
                    {JSON.stringify(ruleDslPreview, null, 2)}
                  </pre>
                </div>
                <div className="modal-actions">
                  <button className="ghost" type="button" onClick={closeModal}>
                    取消
                  </button>
                  <button className="primary" type="submit">
                    {editingRuleSet ? "保存" : "新建"}
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
