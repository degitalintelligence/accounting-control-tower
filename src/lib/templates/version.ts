export function resolveChecklistTemplateId(
  requestedChecklistTemplateId: string | null | undefined,
  activeChecklistTemplateId: string | null | undefined
) {
  return requestedChecklistTemplateId ?? activeChecklistTemplateId ?? null;
}
