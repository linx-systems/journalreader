/**
 * Check if an error message indicates SSH host key verification is required.
 * This covers both first-time connection (unknown host) and host key change scenarios.
 */
export function isHostKeyVerificationError(errorMessage: string): boolean {
  return (
    errorMessage.includes('Host key verification required') ||
    errorMessage.includes('HOST KEY HAS CHANGED')
  );
}

/**
 * Check if an error message indicates authentication failure.
 */
export function isAuthenticationError(errorMessage: string): boolean {
  return (
    errorMessage.includes('auth') ||
    errorMessage.includes('Authentication')
  );
}

/**
 * Extract an error message string from an unknown error value.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
