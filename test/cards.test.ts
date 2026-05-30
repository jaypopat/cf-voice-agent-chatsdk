import { describe, expect, it } from "vitest";
import { buildConfirmCard } from "../src/messenger/cards";

describe("buildConfirmCard", () => {
  it("renders the summaries and confirm/cancel buttons carrying the batch id", () => {
    const card = buildConfirmCard("b1abc", ["📅 Dentist — Thu 2pm"]);
    const json = JSON.stringify(card);
    expect(json).toContain("📅 Dentist — Thu 2pm");
    expect(json).toContain("confirm");
    expect(json).toContain("cancel");
    // Both buttons carry the batch id so onAction can route the whole batch.
    expect(json.match(/b1abc/g)?.length).toBe(2);
  });
});
