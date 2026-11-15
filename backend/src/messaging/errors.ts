/** Safe, actionable responses for database setup/availability failures. Never include driver text. */
export function messagingDatabaseFailure(error: unknown): { status: number; error: string } | null {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42P01" || code === "42703") {
    return { status: 503, error: "Messaging setup is incomplete. Please ask the Borrowers team to apply the messaging database migration." };
  }
  if (code && (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "53300"].includes(code) || code.startsWith("08"))) {
    return { status: 503, error: "Messaging is temporarily unavailable. Please try again shortly." };
  }
  return null;
}
