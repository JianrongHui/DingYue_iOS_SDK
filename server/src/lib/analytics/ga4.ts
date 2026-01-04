import { mapToGA4 } from './mapper';
import { SDKEvent } from './types';

export interface GA4Config {
  measurementId: string;
  apiSecret: string;
}

export class GA4Forwarder {
  private readonly config: GA4Config;

  constructor(config: GA4Config) {
    this.config = config;
  }

  async forward(event: SDKEvent): Promise<boolean> {
    const clientId = readString(event.device_id);

    if (!clientId) {
      console.debug('GA4 forward skipped: missing device_id', {
        event_id: event.event_id,
        event_name: event.event_name
      });
      return false;
    }

    const ga4Event = mapToGA4(event);

    if (!ga4Event) {
      return false;
    }

    const endpoint = buildEndpoint(this.config);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          events: [ga4Event]
        })
      });

      if (!response.ok) {
        const responseText = await safeReadResponseText(response);
        console.warn('GA4 forward failed', {
          status: response.status,
          body: responseText,
          event_id: event.event_id,
          event_name: event.event_name
        });
        return false;
      }

      return true;
    } catch (error) {
      console.warn('GA4 forward failed', {
        error,
        event_id: event.event_id,
        event_name: event.event_name
      });
      return false;
    }
  }
}

function buildEndpoint(config: GA4Config): string {
  const measurementId = encodeURIComponent(config.measurementId);
  const apiSecret = encodeURIComponent(config.apiSecret);
  return `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;
}

function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function safeReadResponseText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  } catch (_error) {
    return;
  }
}
