import "server-only";

export type PolicyInput = { organizationId: string; clientId: string; entityId?: string | null; workItemType: string; riskLevel: string; priority?: string | null; amount: number; currencyCode: string };
export type PolicyDecision = { requires_checker: boolean; requires_approver: boolean; approval_requirement: string; required_approval_level: number; policy_id: string; policy_version: number; rule_id: string };

export async function evaluateApprovalPolicy(admin: unknown, input: PolicyInput): Promise<PolicyDecision | null> {
  const client = admin as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: PolicyDecision[] | null; error: { message: string } | null }> };
  const result = await client.rpc("evaluate_approval_policy", { p_organization_id: input.organizationId, p_client_id: input.clientId, p_entity_id: input.entityId ?? null, p_work_item_type: input.workItemType, p_risk_level: input.riskLevel, p_priority: input.priority ?? null, p_amount: input.amount, p_currency_code: input.currencyCode });
  if (result.error) throw result.error;
  return result.data?.[0] ?? null;
}
