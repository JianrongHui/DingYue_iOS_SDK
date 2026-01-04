export type SDKEvent = {
  event_id?: string;
  event_name?: string;
  device_id?: string;
  product_id?: string;
  product_name?: string;
  placement_id?: string;
  placement_version?: string;
  offering_id?: string;
  price?: number;
  currency?: string;
  extra?: Record<string, unknown>;
  [key: string]: unknown;
};

export type GA4Event = {
  name: string;
  params: Record<string, unknown>;
};

export type AnalyticsForwarder = {
  forward(event: SDKEvent): Promise<boolean>;
};
