/**
 * Centralized error logging utility.
 *
 * Provides a consistent way to log errors throughout the application.
 * Can be extended to support external logging services.
 */

export interface ErrorContext {
  component?: string;
  action?: string;
  [key: string]: unknown;
}

export interface AppError {
  id: string;
  message: string;
  error?: Error;
  context?: ErrorContext;
  timestamp: Date;
}

let errorIdCounter = 0;

function generateErrorId(): string {
  return `err_${Date.now()}_${++errorIdCounter}`;
}

/**
 * Logs an error to the console with consistent formatting.
 * Returns an AppError object for use with the error store.
 */
export function logError(
  error: unknown,
  context?: ErrorContext
): AppError {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  const message = errorObj.message || 'An unknown error occurred';

  const appError: AppError = {
    id: generateErrorId(),
    message,
    error: errorObj,
    context,
    timestamp: new Date(),
  };

  // Format the console output
  const prefix = '[JournalReader]';
  const contextStr = context
    ? ` [${context.component || 'Unknown'}${context.action ? `:${context.action}` : ''}]`
    : '';

  console.error(`${prefix}${contextStr}`, errorObj);

  if (context) {
    const { component, action, ...rest } = context;
    if (Object.keys(rest).length > 0) {
      console.error(`${prefix} Additional context:`, rest);
    }
  }

  return appError;
}

/**
 * Logs a warning to the console.
 */
export function logWarning(message: string, context?: ErrorContext): void {
  const prefix = '[JournalReader]';
  const contextStr = context
    ? ` [${context.component || 'Unknown'}${context.action ? `:${context.action}` : ''}]`
    : '';

  console.warn(`${prefix}${contextStr}`, message);
}
