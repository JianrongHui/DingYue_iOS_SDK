# 分群与实验

## 规则输入字段 (snake_case)
- country
- region
- locale
- app_version
- os_version
- channel
- is_first_launch
- session_count
- install_days
- has_entitlement
- rc_entitlements
- custom (object)

## 支持的运算符
- eq, ne
- in, notIn
- gt, gte
- lt, lte
- contains
- regex

## 规则 DSL
规则采用 JSON，支持 all/any 组合。

示例：
```json
{
  "all": [
    {"field": "country", "op": "in", "value": ["US", "CA"]},
    {"field": "is_first_launch", "op": "eq", "value": true},
    {"field": "app_version", "op": "gte", "value": "2.0.0"}
  ]
}
```

## 评估顺序
1. ruleset 按 priority 降序排序
2. 第一个命中的 ruleset 选中 variant_id
3. 若 ruleset 关联 experiment_id，则进入实验分流
4. 若未命中规则，使用 placement 默认 variant

## 实验分流
- traffic 取值 0-100
- 分桶 key: seed + rc_app_user_id（缺失则用 device_id）
- bucket = hash(key) % 100
- bucket >= traffic 时走默认 variant
- 否则按权重选择实验 variant

## 版本比较
- app_version 与 os_version 采用语义化版本比较
- 无效版本号默认不匹配

## Debug 模式
- 支持 X-Debug-Token 返回命中链路
- 响应包含 rule_set_id 与 experiment_id
