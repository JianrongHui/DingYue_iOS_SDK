export type RawEvent = {
  id: string;
  app_id: string;
  event_name: string;
  payload: unknown;
  created_at: string | Date;
};

export type FactEvent = {
  id: string;
  event_id: string;
  event_name: string;
  event_ts: string;
  event_date: string;
  app_id: string;
  placement_id: string | null;
  variant_id: string | null;
  placement_version: string | null;
  rc_app_user_id: string | null;
  device_id: string | null;
  session_id: string | null;
  offering_id: string | null;
  product_id: string | null;
  price: number | null;
  currency: string | null;
  experiment_id: string | null;
  rule_set_id: string | null;
  sdk_version: string | null;
  app_version: string | null;
  os_version: string | null;
  device_model: string | null;
  locale: string | null;
  timezone: string | null;
  payload_json: string | null;
  etl_processed_at: string;
};

export type EtlCursor = {
  event_ts: string;
  event_id: string;
};

export type EtlRunOptions = {
  batchSize?: number;
  maxBatches?: number;
};

export type EtlRunResult = {
  batches: number;
  extracted: number;
  inserted: number;
  last_cursor?: EtlCursor;
};

export type EtlStatus = {
  last_cursor?: EtlCursor;
  fact_events_count: number;
  source_events_count: number;
};
