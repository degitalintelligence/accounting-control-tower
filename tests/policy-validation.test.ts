import { describe, expect, it } from "vitest";
import { validateEscalationRules } from "@/lib/validation/policy";

describe("validasi policy administrasi", () => {
  it("menerima rule escalation yang kompatibel dengan engine", () => {
    const result = validateEscalationRules([
      { threshold_hours: 24, level: "team_leader", priority: "high", recipient_roles: ["team_leader"] },
      { threshold_hours: 48, level: "owner", priority: "critical", recipient_roles: ["owner"] },
    ]);

    expect(result.error).toBeNull();
    expect(result.rules).toHaveLength(2);
  });

  it.each([
    { name: "threshold tidak meningkat", rules: [{ threshold_hours: 48, level: "team_leader", priority: "high" }, { threshold_hours: 24, level: "owner", priority: "critical" }], message: "threshold_hours harus meningkat" },
    { name: "level menurun", rules: [{ threshold_hours: 24, level: "owner", priority: "high" }, { threshold_hours: 48, level: "team_leader", priority: "critical" }], message: "level eskalasi tidak boleh menurun" },
    { name: "threshold invalid", rules: [{ threshold_hours: 0, level: "maker", priority: "low" }], message: "threshold_hours harus" },
  ])("menolak $name", ({ rules, message }) => {
    expect(validateEscalationRules(rules).error).toContain(message);
  });
});
