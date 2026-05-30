import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CalendarEventInput,
  GoogleCalendar,
  type GoogleCredentials,
  type TokenCache,
} from "../src/actions/calendar";

const creds: GoogleCredentials = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token-abc",
  calendarId: "primary",
};

const sampleEvent: CalendarEventInput = {
  summary: "Dentist",
  start: "2026-06-04T14:00:00-04:00",
  end: "2026-06-04T15:00:00-04:00",
};

function createCache(): TokenCache {
  let value: { accessToken: string; expiresAt: number } | undefined;
  return {
    read: () => value,
    write: (accessToken, expiresAt) => {
      value = { accessToken, expiresAt };
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function isTokenRequest(input: RequestInfo | URL): boolean {
  return String(input) === TOKEN_URL;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GoogleCalendar token caching", () => {
  it("fetches the token once and reuses the cached value", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (isTokenRequest(input)) {
        return Promise.resolve(
          jsonResponse({ access_token: "tok-1", expires_in: 3600 })
        );
      }
      return Promise.resolve(jsonResponse({ id: "evt-1" }));
    });

    const cal = new GoogleCalendar(creds, createCache());
    await cal.insertEvent(sampleEvent);
    await cal.insertEvent(sampleEvent);

    const tokenCalls = fetchMock.mock.calls.filter(([input]) =>
      isTokenRequest(input)
    );
    expect(tokenCalls).toHaveLength(1);

    const tokenBody = String((tokenCalls[0][1] as RequestInit).body);
    expect(tokenBody).toContain("grant_type=refresh_token");
    expect(tokenBody).toContain("refresh-token-abc");
  });
});

describe("GoogleCalendar.insertEvent", () => {
  it("POSTs to the events URL with auth and the event body", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (isTokenRequest(input)) {
        return Promise.resolve(
          jsonResponse({ access_token: "tok-xyz", expires_in: 3600 })
        );
      }
      return Promise.resolve(
        jsonResponse({ id: "evt-99", htmlLink: "https://cal/evt-99" })
      );
    });

    const cal = new GoogleCalendar(creds, createCache());
    const result = await cal.insertEvent(sampleEvent);

    expect(result.id).toBe("evt-99");

    const eventCall = fetchMock.mock.calls.find(
      ([input]) => !isTokenRequest(input)
    );
    if (!eventCall) {
      throw new Error("expected an event request");
    }
    const [url, init] = eventCall as [string, RequestInit];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events"
    );
    expect(init.method).toBe("POST");

    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-xyz");

    const body = JSON.parse(String(init.body));
    expect(body.summary).toBe("Dentist");
    expect(body.start.dateTime).toBe("2026-06-04T14:00:00-04:00");
    expect(body.end.dateTime).toBe("2026-06-04T15:00:00-04:00");
  });

  it("refreshes the token once and retries after a 401", async () => {
    let eventAttempts = 0;
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (isTokenRequest(input)) {
        return Promise.resolve(
          jsonResponse({ access_token: "tok-fresh", expires_in: 3600 })
        );
      }
      eventAttempts += 1;
      if (eventAttempts === 1) {
        return Promise.resolve(jsonResponse({ error: "unauthorized" }, 401));
      }
      return Promise.resolve(jsonResponse({ id: "evt-retry" }));
    });

    const cal = new GoogleCalendar(creds, createCache());
    const result = await cal.insertEvent(sampleEvent);

    expect(result.id).toBe("evt-retry");
    expect(eventAttempts).toBe(2);

    const tokenCalls = fetchMock.mock.calls.filter(([input]) =>
      isTokenRequest(input)
    );
    expect(tokenCalls).toHaveLength(2);
  });
});
