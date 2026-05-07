/**
 * Structured error hierarchy for MyKit.
 * Enables intelligent logging, retry logic, and user-facing feedback.
 * All errors carry: code (identifier), severity (level), isRetryable (flag), context (metadata), id (unique trace).
 */

export class AppError extends Error {
  readonly timestamp: number;
  readonly id: string;

  constructor(
    public code: string,
    public severity: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    public isRetryable: boolean,
    message: string,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
    this.timestamp = Date.now();
    this.id = `${code}_${this.timestamp}_${Math.random().toString(36).slice(2, 9)}`;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      message: this.message,
      severity: this.severity,
      isRetryable: this.isRetryable,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

/**
 * Authentication-specific errors.
 * Non-recoverable codes (invalid credential, user not found, weak password) are marked as not retryable.
 */
export class AuthError extends AppError {
  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    const unrecoverable = ['INVALID_CREDENTIAL', 'USER_NOT_FOUND', 'WEAK_PASSWORD', 'INVALID_EMAIL'];
    super(
      `AUTH_${code}`,
      'error',
      !unrecoverable.includes(code),
      message,
      context
    );
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

/**
 * Sync/Firebase-specific errors.
 * Most sync errors are retryable (network, timeout, quota exceeded).
 */
export class SyncError extends AppError {
  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(
      `SYNC_${code}`,
      'warn',
      true,
      message,
      context
    );
    Object.setPrototypeOf(this, SyncError.prototype);
  }
}

/**
 * Validation errors.
 * User input did not meet constraints; not retryable.
 */
export class ValidationError extends AppError {
  constructor(
    field: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(
      `VALIDATION_${field.toUpperCase()}`,
      'warn',
      false,
      message,
      { field, ...context }
    );
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Offline queue errors.
 * Operation queued for retry when connectivity restored.
 */
export class OfflineQueueError extends AppError {
  constructor(
    code: string,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(
      `QUEUE_${code}`,
      'warn',
      true,
      message,
      context
    );
    Object.setPrototypeOf(this, OfflineQueueError.prototype);
  }
}

/**
 * Convert any error to AppError safely.
 * If already AppError, return as-is. If Error, wrap. Otherwise, create generic.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError(
      'UNKNOWN_ERROR',
      'error',
      false,
      error.message,
      { originalError: error.toString(), stack: error.stack }
    );
  }

  return new AppError(
    'UNKNOWN_ERROR',
    'error',
    false,
    'An unexpected error occurred',
    { raw: String(error) }
  );
}

/**
 * Check if an error is retryable.
 * Convenience helper for catch blocks.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.isRetryable;
  }
  return false; // Unknown errors are not retryable by default
}
