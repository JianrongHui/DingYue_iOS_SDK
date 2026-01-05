import { apiRequest, buildQuery } from "./client";
import type { EventDetail } from "./types";

export type EventsQuery = {
  app_id: string;
  event_name?: string | string[];
  placement_id?: string;
  from: string;
  to: string;
};

export const queryEvents = async (query: EventsQuery): Promise<EventDetail[]> => {
  const eventNames =
    Array.isArray(query.event_name) && query.event_name.length
      ? query.event_name
      : typeof query.event_name === "string" && query.event_name
        ? [query.event_name]
        : undefined;

  const queryString = buildQuery({
    app_id: query.app_id,
    event_name: eventNames,
    placement_id: query.placement_id,
    from: query.from,
    to: query.to
  });

  return apiRequest<EventDetail[]>("GET", `/v1/admin/events${queryString}`);
};
