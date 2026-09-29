/**
 * Connection error detection utilities for determining when to trigger offline fallback.
 */

/**
 * Keywords that indicate a connection-related error.
 * Used to detect when a remote query has failed due to network issues
 * and should trigger automatic offline fallback.
 */
const CONNECTION_ERROR_KEYWORDS = [
  'connection',
  'network',
  'timeout',
  'econnrefused',
  'enotfound',
  'unreachable',
  'offline',
  'ssh',
  'failed to connect',
] as const;

/**
 * Check if an error is a connection-related error that should trigger offline fallback.
 *
 * @param err - The error to check (can be any type)
 * @returns true if the error indicates a connection problem
 *
 * @example
 * ```ts
 * try {
 *   await queryRemoteJournal(hostId, filter);
 * } catch (err) {
 *   if (isConnectionError(err)) {
 *     useOfflineStore.getState().setOfflineMode(true);
 *   }
 * }
 * ```
 */
export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return CONNECTION_ERROR_KEYWORDS.some((keyword) => message.includes(keyword));
}
