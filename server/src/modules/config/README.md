# Config Module

registerConfigRoutes(app) registers POST /v1/sdk/config and returns a sample
configuration payload that matches the backend API docs.

Minimal request validation:
- sdk.version
- app.bundle_id
- device.model
- at least one of user.rc_app_user_id, user.app_user_id, user.device_id

Sample response (fields are snake_case):
```json
{
  "ttl_seconds": 3600,
  "placements": [
    {
      "placement_id": "paywall_main",
      "type": "paywall",
      "enabled": true,
      "variant": {
        "variant_id": "v_2025_01",
        "package": {
          "version": "2.1.0",
          "cdn_url": "https://cdn.your.com/paywall_2_1_0.zip",
          "checksum": "sha256:...",
          "entry_path": "dist/index.html",
          "size_bytes": 1234567
        },
        "offering": {
          "offering_id": "default",
          "product_ids": ["com.app.weekly", "com.app.yearly"],
          "fallback_to_current_offering": true
        },
        "page_options": {
          "auto_close_on_success": true,
          "auto_close_on_restore": true
        }
      },
      "rule_hit": {
        "rule_set_id": "rule_us_new",
        "experiment_id": "exp_q1"
      }
    }
  ],
  "server_time": "2025-01-01T00:00:00Z"
}
```
