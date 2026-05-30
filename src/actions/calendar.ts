export interface GoogleCredentials {
  calendarId: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

/** Access-token cache. The Durable Object backs this with a Drizzle table; tests use an in-memory object. */
export interface TokenCache {
  read(): { accessToken: string; expiresAt: number } | undefined;
  write(accessToken: string, expiresAt: number): void;
}

/** Minimal event input (times are RFC3339 strings, e.g. "2026-06-04T14:00:00-04:00"). */
export interface CalendarEventInput {
  description?: string;
  end: string;
  location?: string;
  start: string;
  summary: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

interface EventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface EventResource {
  description?: string;
  end?: EventDateTime;
  htmlLink?: string;
  id: string;
  location?: string;
  start?: EventDateTime;
  summary?: string;
}

interface EventListResponse {
  items?: EventResource[];
}

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3/calendars";
const TOKEN_SAFETY_MARGIN_MS = 60_000;
const MILLISECONDS_PER_SECOND = 1000;
const HTTP_UNAUTHORIZED = 401;

export class GoogleCalendar {
  constructor(
    private readonly creds: GoogleCredentials,
    private readonly cache: TokenCache
  ) {}

  async insertEvent(
    input: CalendarEventInput
  ): Promise<{ id: string; htmlLink?: string }> {
    const res = await this.authedFetch(this.eventsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toEventBody(input)),
    });
    const event = (await res.json()) as EventResource;
    return { id: event.id, htmlLink: event.htmlLink };
  }

  async listEvents(
    timeMin: string,
    timeMax: string
  ): Promise<
    Array<{ id: string; summary?: string; start?: string; end?: string }>
  > {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
    });
    const url = `${this.eventsUrl()}?${params.toString()}`;
    const res = await this.authedFetch(url, { method: "GET" });
    const body = (await res.json()) as EventListResponse;
    return (body.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summary,
      start: readDateTime(item.start),
      end: readDateTime(item.end),
    }));
  }

  async patchEvent(
    eventId: string,
    patch: Partial<CalendarEventInput>
  ): Promise<{ id: string }> {
    const url = `${this.eventsUrl()}/${encodeURIComponent(eventId)}`;
    const res = await this.authedFetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toEventBody(patch)),
    });
    const event = (await res.json()) as EventResource;
    return { id: event.id };
  }

  async deleteEvent(eventId: string): Promise<void> {
    const url = `${this.eventsUrl()}/${encodeURIComponent(eventId)}`;
    await this.authedFetch(url, { method: "DELETE" });
  }

  private eventsUrl(): string {
    return `${CALENDAR_API_BASE}/${encodeURIComponent(this.creds.calendarId)}/events`;
  }

  private toEventBody(
    input: Partial<CalendarEventInput>
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {};
    if (input.summary !== undefined) {
      body.summary = input.summary;
    }
    if (input.location !== undefined) {
      body.location = input.location;
    }
    if (input.description !== undefined) {
      body.description = input.description;
    }
    if (input.start !== undefined) {
      body.start = { dateTime: input.start };
    }
    if (input.end !== undefined) {
      body.end = { dateTime: input.end };
    }
    return body;
  }

  private async authedFetch(url: string, init: RequestInit): Promise<Response> {
    let token = await this.getAccessToken(false);
    let res = await fetch(url, this.withAuth(init, token));
    if (res.status === HTTP_UNAUTHORIZED) {
      token = await this.getAccessToken(true);
      res = await fetch(url, this.withAuth(init, token));
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Google Calendar request failed (${res.status} ${res.statusText}): ${text}`
      );
    }
    return res;
  }

  private withAuth(init: RequestInit, token: string): RequestInit {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return { ...init, headers };
  }

  private async getAccessToken(forceRefresh: boolean): Promise<string> {
    if (!forceRefresh) {
      const cached = this.cache.read();
      if (cached && cached.expiresAt - TOKEN_SAFETY_MARGIN_MS > Date.now()) {
        return cached.accessToken;
      }
    }
    return await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.creds.clientId,
      client_secret: this.creds.clientSecret,
      refresh_token: this.creds.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Google OAuth token refresh failed (${res.status} ${res.statusText}): ${text}`
      );
    }
    const json = (await res.json()) as TokenResponse;
    const expiresAt = Date.now() + json.expires_in * MILLISECONDS_PER_SECOND;
    this.cache.write(json.access_token, expiresAt);
    return json.access_token;
  }
}

function readDateTime(slot: EventDateTime | undefined): string | undefined {
  if (!slot) {
    return;
  }
  return slot.dateTime ?? slot.date;
}
