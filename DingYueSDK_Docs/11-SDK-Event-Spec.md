# SDK 事件字段规范 (iOS)

## 必填字段
| 字段 | 必填 | 类型 | 示例 |
|---|---|---|---|
| event_id | 是 | string | uuid |
| event_name | 是 | string | PURCHASE_SUCCESS |
| timestamp | 是 | string | 2025-01-01T00:00:00Z |
| app_id | 是 | string | app_x |
| placement_id | 是 | string | paywall_main |
| variant_id | 是 | string | v_2025_01 |
| placement_version | 是 | string | 2.1.0 |
| sdk_version | 是 | string | 1.0.0 |
| app_version | 是 | string | 2.3.1 |
| rc_app_user_id | 是 | string | rc_123 |
| device_id | 是 | string | idfv_xxx |
| session_id | 是 | string | s_789 |
| locale | 是 | string | zh-Hans-CN |

## 标准可选字段
| 字段 | 必填 | 类型 | 示例 |
|---|---|---|---|
| app_user_id | 否 | string | u_456 |
| country | 否 | string | CN |
| network_type | 否 | string | wifi |
| offering_id | 否 | string | default |
| product_id | 否 | string | com.app.weekly |
| product_ids | 否 | array | ["com.app.weekly"] |
| price | 否 | number | 4.99 |
| currency | 否 | string | USD |
| error_code | 否 | string | RC_PURCHASE_FAILED |
| error_message | 否 | string | purchase failed |
| http_status | 否 | number | 500 |
| customer_info_summary | 条件必填 | object | 见 04-Events-Dictionary |
| extra | 否 | object | {"price":4.99} |

## 规则
- 同一会话内所有事件使用相同 session_id
- 购买与恢复事件必须包含 customer_info_summary
- 失败事件必须包含 error_code 与 error_message
- extra 总大小建议 <= 2KB

## 伪代码
```swift
func track(eventName: String, extra: [String: Any]?) {
  var event = buildBaseEvent()
  event["event_name"] = eventName
  event["extra"] = extra
  queue.append(event)
  persistQueue()
}

func flushIfNeeded() {
  if queue.count < batchSize { return }
  postEvents(queue.prefix(batchSize)) { ok in
    if ok { removeSent(); backoff.reset() }
    else { backoff.increase(); scheduleRetry() }
  }
}

func onPurchaseSuccess(result: Summary) {
  track(eventName: "PURCHASE_SUCCESS", extra: result.toDict())
  if pageOptions.autoCloseOnSuccess && !h5Override {
    dismiss()
  }
}
```
