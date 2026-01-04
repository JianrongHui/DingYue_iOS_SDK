import { GA4Event, SDKEvent } from './types';

const EVENT_NAME_MAP: Record<string, string> = {
  PAYWALL_ENTER: 'view_item_list',
  GUIDE_ENTER: 'view_promotion',
  PURCHASE_START: 'begin_checkout',
  PURCHASE_SUCCESS: 'purchase',
  PURCHASE_FAIL: 'purchase_error',
  RESTORE_SUCCESS: 'restore_purchase',
  H5_CUSTOM_EVENT: 'custom_event'
};

export function mapToGA4(event: SDKEvent): GA4Event | null {
  const eventName = readString(event.event_name);

  if (!eventName) {
    console.debug('GA4 mapping skipped: missing event_name', { event_id: event.event_id });
    return null;
  }

  const ga4Name = EVENT_NAME_MAP[eventName];

  if (!ga4Name) {
    console.debug('No GA4 mapping for event', { event_name: eventName, event_id: event.event_id });
    return null;
  }

  const params: Record<string, unknown> = {};
  const placementId = readString(event.placement_id);
  const placementVersion = readString(event.placement_version);
  const currency = readString(event.currency);

  if (placementId) {
    params.item_list_name = placementId;
  }

  if (placementVersion) {
    params.item_list_id = placementVersion;
  }

  if (currency) {
    params.currency = currency;
  }

  const item = buildItem(event);

  if (item) {
    params.items = [item];
  }

  if (ga4Name === 'purchase') {
    const value = readNumber(event.price);

    if (value !== undefined) {
      params.value = value;
    }
  }

  return { name: ga4Name, params };
}

function buildItem(event: SDKEvent): Record<string, string | number> | null {
  const item: Record<string, string | number> = {};
  const productId = readString(event.product_id);
  const productName = readString(event.product_name);
  const offeringId = readString(event.offering_id);
  const price = readNumber(event.price);

  if (productId) {
    item.item_id = productId;
  }

  if (productName) {
    item.item_name = productName;
  }

  if (offeringId) {
    item.item_variant = offeringId;
  }

  if (price !== undefined) {
    item.price = price;
  }

  return Object.keys(item).length > 0 ? item : null;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return;
    }

    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  return;
}
