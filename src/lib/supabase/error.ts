export type StructuredSupabaseError = {
  message: string;
  code: string | undefined;
  hint: string | undefined;
  details: string | undefined;
};

export function structuredSupabaseError(error: unknown): StructuredSupabaseError {
  const details = error as {
    message?: unknown;
    code?: unknown;
    hint?: unknown;
    details?: unknown;
  };

  return {
    message: typeof details.message === "string" ? details.message : "Unknown Supabase error.",
    code: typeof details.code === "string" ? details.code : undefined,
    hint: typeof details.hint === "string" ? details.hint : undefined,
    details: typeof details.details === "string" ? details.details : undefined,
  };
}
