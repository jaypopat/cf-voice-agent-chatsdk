import { describe, expect, it } from "vitest";
import { mapEventParams, summarizePending } from "../src/confirm/gate";
import type { PendingActionRow } from "../src/memory/schema";

const row = (
  type: "event" | "reminder",
  params: Record<string, unknown>
): PendingActionRow => ({
  id: "a1",
  batchId: "b1",
  type,
  params: JSON.stringify(params),
  status: "pending",
  externalRef: null,
  createdAt: 0,
});

describe("confirm gate helpers", () => {
  it("maps an event proposal, defaulting end to one hour after start", () => {
    const mapped = mapEventParams({
      title: "Dentist",
      start: "2026-06-04T14:00:00Z",
      location: "Main St",
      notes: "bring card",
    });
    expect(mapped.summary).toBe("Dentist");
    expect(mapped.location).toBe("Main St");
    expect(mapped.description).toBe("bring card");
    expect(mapped.end).toBe("2026-06-04T15:00:00.000Z");
  });

  it("keeps an explicit end time", () => {
    const mapped = mapEventParams({
      title: "Sync",
      start: "2026-06-04T14:00:00Z",
      end: "2026-06-04T14:30:00Z",
    });
    expect(mapped.end).toBe("2026-06-04T14:30:00Z");
  });

  it("summarizes event and reminder rows distinctly", () => {
    expect(
      summarizePending(row("event", { title: "Dentist", start: "Thu 2pm" }))
    ).toBe("📅 Dentist — Thu 2pm");
    expect(
      summarizePending(
        row("reminder", { text: "insurance card", when: "Thu 1pm" })
      )
    ).toBe("⏰ insurance card — Thu 1pm");
  });
});
