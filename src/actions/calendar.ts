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

interface EventResource {
  id: string;
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

  async insertEvent(input: CalendarEventInput): Promise<{ id: string }> {
    const res = await this.authedFetch(this.eventsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toEventBody(input)),
    });
    const event = (await res.json()) as EventResource;
    return { id: event.id };
  }

  private eventsUrl(): string {
    return `${CALENDAR_API_BASE}/${encodeURIComponent(this.creds.calendarId)}/events`;
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

function toEventBody(input: CalendarEventInput): Record<string, unknown> {
  return {
    summary: input.summary,
    start: { dateTime: input.start },
    end: { dateTime: input.end },
    ...(input.location === undefined ? {} : { location: input.location }),
    ...(input.description === undefined
      ? {}
      : { description: input.description }),
  };
}
