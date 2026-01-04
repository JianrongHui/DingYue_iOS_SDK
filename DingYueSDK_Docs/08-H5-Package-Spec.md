# H5 包规范

## 包结构
- Zip 根目录必须包含 manifest.json
- entry_path 支持多层目录
- 资源必须使用相对路径

示例：
```
/manifest.json
/dist/index.html
/dist/assets/app.js
/dist/assets/style.css
```

## Manifest
必填字段：
- manifest_version (int)
- placement_type (guide|paywall)
- package_version (string)
- entry_path (string)
- checksum (string, sha256)

示例：
```json
{
  "manifest_version": 1,
  "placement_type": "paywall",
  "package_version": "2.1.0",
  "entry_path": "dist/index.html",
  "checksum": "sha256:..."
}
```

## 资源要求
- 使用相对路径，禁止引用未知外链
- 外链脚本必须来自白名单域名
- Zip 建议 <= 10MB，单资源 <= 2MB
- 首屏渲染目标 < 1.5s

## Native -> H5 Payload
SDK 调用 iostojs(base64Payload) 注入数据。

示例：
```json
{
  "system_language": "zh-Hans-CN",
  "products": [
    {
      "platformProductId": "com.app.weekly",
      "price": "4.99",
      "currency": "USD",
      "period": "WEEK",
      "type": "SUBSCRIPTION",
      "name": "Weekly"
    }
  ],
  "extra": { "campaign": "spring" },
  "page_options": { "auto_close_on_success": true }
}
```

## H5 -> Native Bridge
Paywall (vip_*):
- vip_close
- vip_restore
- vip_terms
- vip_privacy
- vip_purchase
- vip_choose
- vip_page_options

Guide (guide_*):
- guide_close
- guide_restore
- guide_terms
- guide_privacy
- guide_purchase
- guide_continue
- guide_page_options

自定义事件：
- track { name, params }

## 自动关闭控制
默认：购买/恢复成功后自动关闭。
H5 可以关闭自动关闭：

```js
window.webkit.messageHandlers.vip_page_options.postMessage({
  auto_close_on_success: false,
  auto_close_on_restore: false
});
```

Guide 页同样支持 guide_page_options。

## 失败处理
- entry_path 不存在：上报 H5_ENTRY_NOT_FOUND 并回退
- checksum 不一致：丢弃包并回退
