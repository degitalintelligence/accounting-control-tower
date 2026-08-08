import { describe, expect, it } from "vitest";
import { isOperationalMessage, messageSenderId, providerMessageId } from "@/lib/whatsapp/payload";

describe("WAHA payload handling", () => {
  it("ignores encryption system events", () => {
    expect(isOperationalMessage({ type: "e2e_notification", body: "", _data: { type: "e2e_notification" } })).toBe(false);
  });

  it("keeps media messages without text", () => {
    expect(isOperationalMessage({ type: "image", body: "", hasMedia: true })).toBe(true);
  });

  it("prefers author and supports LID sender fallback", () => {
    expect(messageSenderId({ author: "628111@g.us", lid: "123@lid" })).toBe("628111@g.us");
    expect(messageSenderId({ _data: { lid: "123@lid" } })).toBe("123@lid");
  });

  it("reads serialized provider IDs", () => {
    expect(providerMessageId({ _data: { id: { _serialized: "false_abc@g.us_1" } } })).toBe("false_abc@g.us_1");
  });
});
