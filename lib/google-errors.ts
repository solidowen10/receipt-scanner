export const GOOGLE_RECONNECT_REQUIRED_MESSAGE =
  "Google connection expired. Reconnect Google in Setup, then try again.";

export function isGoogleInvalidGrant(error: unknown) {
  if (error instanceof Error && /\binvalid_grant\b/i.test(error.message)) return true;
  if (!error || typeof error !== "object") return false;

  const responseData = (error as { response?: { data?: unknown } }).response?.data;
  if (!responseData || typeof responseData !== "object") return false;

  const googleError = (responseData as { error?: unknown }).error;
  if (googleError === "invalid_grant") return true;
  if (!googleError || typeof googleError !== "object") return false;

  return (googleError as { status?: unknown }).status === "invalid_grant";
}
