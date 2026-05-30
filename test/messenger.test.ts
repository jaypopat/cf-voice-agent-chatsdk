import { describe, expect, it } from "vitest";
import { dmThreadId, isAllowedSender } from "../src/messenger/chat";

describe("messenger allowlist", () => {
  it("accepts only the configured chat id (DM chat id == sender id)", () => {
    expect(isAllowedSender("12345", "12345")).toBe(true);
    expect(isAllowedSender("99999", "12345")).toBe(false);
  });

  it("builds the Telegram DM thread id for proactive pushes", () => {
    expect(dmThreadId("12345")).toBe("telegram:12345");
  });
});
