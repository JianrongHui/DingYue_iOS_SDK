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

export type AnalyticsSink =
  | {
      id: string;
      app_id: string;
      type: "ga4";
      config: {
        measurement_id: string;
        api_secret: string;
      };
      enabled: boolean;
      created_at: string;
      updated_at: string;
    }
  | {
      id: string;
      app_id: string;
      type: "firebase";
      config: {
        app_id: string;
        api_secret: string;
      };
      enabled: boolean;
      created_at: string;
      updated_at: string;
    };

export const seedApps: App[] = [
  {
    id: "app_9f21",
    app_id: "app_9f21",
    app_key: "key_8d3f",
    name: "Nova Reader",
    env: "prod",
    status: "active",
    created_at: "2023-11-02"
  },
  {
    id: "app_7a10",
    app_id: "app_7a10",
    app_key: "key_1ce2",
    name: "Mint Studio",
    env: "staging",
    status: "active",
    created_at: "2024-01-06"
  },
  {
    id: "app_4c77",
    app_id: "app_4c77",
    app_key: "key_4a77",
    name: "Orbit Notes",
    env: "prod",
    status: "disabled",
    created_at: "2024-02-04"
  }
];

export const seedPlacements: Placement[] = [
  {
    id: "plc_201",
    app_id: "app_9f21",
    placement_id: "plc_201",
    type: "guide",
    enabled: true,
    default_variant_id: "var_401",
    created_at: "2024-01-02"
  },
  {
    id: "plc_202",
    app_id: "app_9f21",
    placement_id: "plc_202",
    type: "paywall",
    enabled: true,
    default_variant_id: "var_402",
    created_at: "2024-01-06"
  },
  {
    id: "plc_203",
    app_id: "app_7a10",
    placement_id: "plc_203",
    type: "guide",
    enabled: false,
    default_variant_id: null,
    created_at: "2024-02-01"
  }
];

export const seedVariants: Variant[] = [
  {
    id: "var_401",
    app_id: "app_9f21",
    placement_id: "plc_201",
    package_id: "pkg_810",
    offering_id: "offer_monthly",
    product_ids: ["prod_basic", "prod_plus"],
    priority: 1,
    enabled: true,
    page_options: {
      auto_close_on_success: true,
      auto_close_on_restore: false
    },
    created_at: "2024-01-03"
  },
  {
    id: "var_404",
    app_id: "app_9f21",
    placement_id: "plc_201",
    package_id: "pkg_811",
    offering_id: "offer_annual",
    product_ids: ["prod_annual", "prod_plus"],
    priority: 2,
    enabled: true,
    page_options: {
      auto_close_on_success: true,
      auto_close_on_restore: false
    },
    created_at: "2024-01-10"
  },
  {
    id: "var_402",
    app_id: "app_9f21",
    placement_id: "plc_202",
    package_id: "pkg_812",
    offering_id: "offer_promo",
    product_ids: ["prod_trial", "prod_annual"],
    priority: 1,
    enabled: true,
    page_options: {
      auto_close_on_success: true,
      auto_close_on_restore: true
    },
    created_at: "2024-01-08"
  },
  {
    id: "var_405",
    app_id: "app_9f21",
    placement_id: "plc_202",
    package_id: "pkg_814",
    offering_id: "offer_discount",
    product_ids: ["prod_discount"],
    priority: 2,
    enabled: true,
    page_options: {
      auto_close_on_success: true,
      auto_close_on_restore: true
    },
    created_at: "2024-01-18"
  },
  {
    id: "var_403",
    app_id: "app_7a10",
    placement_id: "plc_203",
    package_id: "pkg_820",
    offering_id: "offer_edu",
    product_ids: ["prod_edu"],
    priority: 2,
    enabled: false,
    page_options: {
      auto_close_on_success: false,
      auto_close_on_restore: false
    },
    created_at: "2024-02-02"
  },
  {
    id: "var_406",
    app_id: "app_7a10",
    placement_id: "plc_203",
    package_id: "pkg_821",
    offering_id: "offer_monthly",
    product_ids: ["prod_basic"],
    priority: 3,
    enabled: false,
    page_options: {
      auto_close_on_success: false,
      auto_close_on_restore: false
    },
    created_at: "2024-02-05"
  }
];

export const seedAnalyticsSinks: AnalyticsSink[] = [
  {
    id: "sink_001",
    app_id: "app_9f21",
    type: "ga4",
    config: {
      measurement_id: "G-12345ABC",
      api_secret: "ga4_secret_123"
    },
    enabled: true,
    created_at: "2024-02-01",
    updated_at: "2024-02-10"
  },
  {
    id: "sink_002",
    app_id: "app_7a10",
    type: "firebase",
    config: {
      app_id: "1:1234567890:ios:abc123def456",
      api_secret: "fb_secret_456"
    },
    enabled: false,
    created_at: "2024-02-08",
    updated_at: "2024-02-08"
  }
];
