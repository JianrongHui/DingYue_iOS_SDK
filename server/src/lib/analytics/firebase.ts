import { mapToGA4 } from './mapper';
import { SDKEvent } from './types';

export interface FirebaseConfig {
  appId: string;
  apiSecret: string;
  firebaseAppInstanceId?: string;
}

export class FirebaseForwarder {
  private readonly config: FirebaseConfig;

  constructor(config: FirebaseConfig) {
    this.config = config;
  }

  async forward(event: SDKEvent): Promise<boolean> {
    const appInstanceId =
      readString(event.firebase_app_instance_id) ??
      readString(event.app_instance_id) ??
      this.config.firebaseAppInstanceId;

    if (!appInstanceId) {
      console.debug('Firebase forward skipped: missing app_instance_id', {
        event_id: event.event_id,
        event_name: event.event_name
      });
      return false;
    }

    const firebaseEvent = mapToGA4(event);

    if (!firebaseEvent) {
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
          app_instance_id: appInstanceId,
          events: [firebaseEvent]
        })
      });

      if (!response.ok) {
        const responseText = await safeReadResponseText(response);
        console.warn('Firebase forward failed', {
          status: response.status,
          body: responseText,
          event_id: event.event_id,
          event_name: event.event_name
        });
        return false;
      }

      return true;
    } catch (error) {
      console.warn('Firebase forward failed', {
        error,
        event_id: event.event_id,
        event_name: event.event_name
      });
      return false;
    }
  }
}

function buildEndpoint(config: FirebaseConfig): string {
  const appId = encodeURIComponent(config.appId);
  const apiSecret = encodeURIComponent(config.apiSecret);
  return `https://www.google-analytics.com/mp/collect?firebase_app_id=${appId}&api_secret=${apiSecret}`;
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
