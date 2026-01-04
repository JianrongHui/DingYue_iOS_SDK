export const app_summary = {
  total_apps: 4,
  active_apps: 3,
  latest_release: "2024-02-14"
};

export const apps = [
  {
    app_id: "app_9f21",
    name: "Nova Reader",
    environment: "prod",
    status: "active",
    created_at: "2023-11-02",
    app_key: "key_8d3f"
  },
  {
    app_id: "app_7a10",
    name: "Mint Studio",
    environment: "staging",
    status: "active",
    created_at: "2024-01-06",
    app_key: "key_1ce2"
  },
  {
    app_id: "app_4c77",
    name: "Orbit Notes",
    environment: "prod",
    status: "paused",
    created_at: "2024-02-04",
    app_key: "key_4a77"
  },
  {
    app_id: "app_1c52",
    name: "Echo Planner",
    environment: "dev",
    status: "disabled",
    created_at: "2024-02-10",
    app_key: "key_0b1f"
  }
];

export const placements = [
  {
    placement_id: "plc_201",
    app_id: "app_9f21",
    name: "home_banner",
    status: "enabled",
    default_variant_id: "var_401",
    package_preview: "pkg_810"
  },
  {
    placement_id: "plc_202",
    app_id: "app_9f21",
    name: "paywall_offer",
    status: "enabled",
    default_variant_id: "var_402",
    package_preview: "pkg_812"
  },
  {
    placement_id: "plc_203",
    app_id: "app_7a10",
    name: "onboarding_modal",
    status: "disabled",
    default_variant_id: "var_403",
    package_preview: "pkg_820"
  }
];

export const variants = [
  {
    variant_id: "var_401",
    placement_id: "plc_201",
    package_id: "pkg_810",
    offering_id: "offer_monthly",
    product_ids: ["prod_basic", "prod_plus"],
    status: "enabled"
  },
  {
    variant_id: "var_402",
    placement_id: "plc_202",
    package_id: "pkg_812",
    offering_id: "offer_promo",
    product_ids: ["prod_trial", "prod_annual"],
    status: "enabled"
  },
  {
    variant_id: "var_403",
    placement_id: "plc_203",
    package_id: "pkg_820",
    offering_id: "offer_edu",
    product_ids: ["prod_edu"],
    status: "paused"
  }
];

export const rule_sets = [
  {
    rule_set_id: "rs_1001",
    placement_id: "plc_201",
    priority: 1,
    match_type: "all",
    conditions: ["country == US", "app_version >= 2.1.0"],
    updated_at: "2024-02-12"
  },
  {
    rule_set_id: "rs_1002",
    placement_id: "plc_202",
    priority: 2,
    match_type: "any",
    conditions: ["locale == en-US", "is_subscriber == false"],
    updated_at: "2024-02-10"
  },
  {
    rule_set_id: "rs_1003",
    placement_id: "plc_203",
    priority: 3,
    match_type: "all",
    conditions: ["device_os == iOS", "session_count > 2"],
    updated_at: "2024-02-08"
  }
];

export const experiments = [
  {
    experiment_id: "exp_701",
    placement_id: "plc_201",
    status: "running",
    traffic: "30%",
    seed: 4201,
    variants: ["var_401", "var_402"],
    start_at: "2024-02-01"
  },
  {
    experiment_id: "exp_702",
    placement_id: "plc_202",
    status: "paused",
    traffic: "15%",
    seed: 5177,
    variants: ["var_402"],
    start_at: "2024-01-20"
  },
  {
    experiment_id: "exp_703",
    placement_id: "plc_203",
    status: "ended",
    traffic: "10%",
    seed: 6120,
    variants: ["var_403"],
    start_at: "2023-12-10"
  }
];

export const packages = [
  {
    package_id: "pkg_810",
    version: "1.4.2",
    entry_path: "/index.html",
    checksum: "b9e1a0f",
    status: "active",
    uploaded_at: "2024-02-11"
  },
  {
    package_id: "pkg_812",
    version: "1.4.4",
    entry_path: "/main.html",
    checksum: "a4c0e2b",
    status: "active",
    uploaded_at: "2024-02-13"
  },
  {
    package_id: "pkg_820",
    version: "1.3.8",
    entry_path: "/entry.html",
    checksum: "e4d12c1",
    status: "rolled_back",
    uploaded_at: "2024-01-22"
  }
];

export const events = [
  {
    event_name: "paywall_view",
    placement_id: "plc_201",
    count: 1834,
    last_seen_at: "2024-02-14 10:40"
  },
  {
    event_name: "subscribe_click",
    placement_id: "plc_202",
    count: 642,
    last_seen_at: "2024-02-14 10:32"
  },
  {
    event_name: "trial_start",
    placement_id: "plc_202",
    count: 217,
    last_seen_at: "2024-02-14 09:55"
  }
];

export const funnels = [
  {
    funnel_name: "paywall_to_subscribe",
    steps: ["paywall_view", "subscribe_click", "trial_start"],
    conversion_rate: "11.8%"
  },
  {
    funnel_name: "onboarding_to_offer",
    steps: ["onboarding_view", "offer_impression", "offer_accept"],
    conversion_rate: "7.2%"
  }
];

export const forwarding = [
  {
    provider: "ga4",
    status: "healthy",
    last_success_at: "2024-02-14 10:30",
    failure_count: 0
  },
  {
    provider: "firebase",
    status: "warning",
    last_success_at: "2024-02-14 09:50",
    failure_count: 3
  }
];
