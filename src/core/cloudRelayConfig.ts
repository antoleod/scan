/**
 * Cloud Relay Config — central constants and types for the quota system.
 *
 * These values are the SAFE MVP defaults. They are NOT embedded in the app
 * binary — the live config is read from Firestore `cloudRelay/globalState`
 * (admin-writable) so limits can be changed without an app release.
 *
 * Hard rules enforced here:
 *  - Cloud relay is DISABLED by default.
 *  - Normal users start at 50 MB max file size.
 *  - Admin/tester users start at 300 MB max file size.
 *  - Global cap: 5 GB per period.
 *  - Per-user cap: 500 MB per period.
 *  - Files are deleted after download.
 *  - Transfer session expires in 30 minutes.
 */

// ── Limits ────────────────────────────────────────────────────────────────────

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const DEFAULT_MAX_FILE_SIZE_USER   = 50 * MB;    // 50 MB — normal users
export const DEFAULT_MAX_FILE_SIZE_TESTER = 300 * MB;   // 300 MB — admin/tester
export const DEFAULT_USER_QUOTA_BYTES     = 500 * MB;   // 500 MB per period
export const DEFAULT_GLOBAL_QUOTA_BYTES   = 5 * GB;     // 5 GB per period
export const DEFAULT_MAX_ACTIVE_TRANSFERS = 1;
export const DEFAULT_TRANSFER_EXPIRY_MIN  = 30;
export const DEFAULT_QUOTA_PERIOD         = 'monthly' as QuotaPeriod;
export const DELETE_AFTER_DOWNLOAD        = true;

/** Warning thresholds (fraction of limit, 0-1). */
export const WARNING_THRESHOLDS = [0.6, 0.8, 0.9, 1.0] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type QuotaPeriod = 'monthly' | 'daily';
export type TransferStatus =
  | 'reserved'
  | 'uploading'
  | 'ready'
  | 'downloading'
  | 'completed'
  | 'expired'
  | 'failed'
  | 'deleted'
  | 'blocked';

export type CloudRelayErrorCode =
  | 'USER_QUOTA_EXCEEDED'
  | 'GLOBAL_QUOTA_EXCEEDED'
  | 'CLOUD_RELAY_DISABLED'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_ACTIVE_TRANSFERS'
  | 'TRANSFER_EXPIRED'
  | 'CLOUD_LIMIT_REACHED'
  | 'TRANSFER_PERMISSION_DENIED';

export type AlertSeverity = 'info' | 'warn' | 'critical';
export type AlertType =
  | 'user_quota_warning'
  | 'user_quota_exceeded'
  | 'global_quota_warning'
  | 'global_quota_exceeded'
  | 'relay_auto_disabled'
  | 'cleanup_failed'
  | 'delete_failed'
  | 'suspicious_failures';

// ── Firestore data shapes ─────────────────────────────────────────────────────

export interface GlobalRelayState {
  enabled: boolean;
  emergencyStop: boolean;
  quotaPeriod: QuotaPeriod;
  currentPeriodKey: string;          // e.g. '2026-05' for monthly
  globalUsedBytes: number;
  globalReservedBytes: number;
  globalLimitBytes: number;
  activeTransfersCount: number;
  lastUpdatedAt: number;
  disabledReason?: string;
  disabledAt?: number;
  disabledBy?: string;
  // Derived config (admin-editable)
  maxFileSizeBytesUser: number;
  maxFileSizeBytesTester: number;
  maxUserBytesPerPeriod: number;
  maxActiveTransfersPerUser: number;
  transferExpiryMinutes: number;
  deleteAfterDownload: boolean;
}

export interface UserRelayUsage {
  uid: string;
  periodKey: string;
  usedBytes: number;
  reservedBytes: number;
  limitBytes: number;
  activeTransfersCount: number;
  lastTransferAt?: number;
  blocked: boolean;
  blockedReason?: string;
  role: string;
}

export interface TransferSession {
  sessionId: string;
  ownerUid: string;
  receiverUid?: string;
  filename: string;
  sizeBytes: number;
  storagePath: string;
  provider: 'firebase_storage';
  status: TransferStatus;
  reservedBytes: number;
  createdAt: number;
  expiresAt: number;
  uploadedAt?: number;
  downloadedAt?: number;
  deletedAt?: number;
  errorCode?: CloudRelayErrorCode;
  blockedReason?: string;
}

export interface AdminAlert {
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  code: CloudRelayErrorCode | string;
  uid?: string;
  sessionId?: string;
  usedBytes?: number;
  limitBytes?: number;
  threshold?: number;
  createdAt: number;
  read: boolean;
  resolved: boolean;
}

// ── User-facing messages ──────────────────────────────────────────────────────

export const USER_FACING_MESSAGES: Record<CloudRelayErrorCode, string> = {
  USER_QUOTA_EXCEEDED:
    'You have reached your internet transfer limit for this period.\nPlease contact the administrator and include this code: USER_QUOTA_EXCEEDED.',
  GLOBAL_QUOTA_EXCEEDED:
    'Internet transfer is temporarily unavailable.\nPlease contact the administrator and include this code: GLOBAL_QUOTA_EXCEEDED.',
  CLOUD_RELAY_DISABLED:
    'Internet transfer is currently disabled.\nPlease contact the administrator and include this code: CLOUD_RELAY_DISABLED.',
  FILE_TOO_LARGE:
    'This file is too large for internet transfer.\nPlease try a smaller file or contact the administrator.\nCode: FILE_TOO_LARGE.',
  TOO_MANY_ACTIVE_TRANSFERS:
    'You already have an active transfer in progress.\nPlease wait for it to finish.',
  TRANSFER_EXPIRED:
    'This transfer session has expired.\nPlease start a new transfer.',
  CLOUD_LIMIT_REACHED:
    'Internet transfer is temporarily unavailable.\nPlease contact the administrator and include this code: CLOUD_LIMIT_REACHED.',
  TRANSFER_PERMISSION_DENIED:
    'You do not have permission to use internet transfer.\nCode: TRANSFER_PERMISSION_DENIED.',
};

// ── Period key helpers ────────────────────────────────────────────────────────

export function currentPeriodKey(period: QuotaPeriod = 'monthly'): string {
  const d = new Date();
  if (period === 'monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  // daily
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function defaultGlobalState(): GlobalRelayState {
  return {
    enabled: false,                       // DISABLED by default — must be explicitly enabled
    emergencyStop: false,
    quotaPeriod: DEFAULT_QUOTA_PERIOD,
    currentPeriodKey: currentPeriodKey(),
    globalUsedBytes: 0,
    globalReservedBytes: 0,
    globalLimitBytes: DEFAULT_GLOBAL_QUOTA_BYTES,
    activeTransfersCount: 0,
    lastUpdatedAt: Date.now(),
    maxFileSizeBytesUser: DEFAULT_MAX_FILE_SIZE_USER,
    maxFileSizeBytesTester: DEFAULT_MAX_FILE_SIZE_TESTER,
    maxUserBytesPerPeriod: DEFAULT_USER_QUOTA_BYTES,
    maxActiveTransfersPerUser: DEFAULT_MAX_ACTIVE_TRANSFERS,
    transferExpiryMinutes: DEFAULT_TRANSFER_EXPIRY_MIN,
    deleteAfterDownload: DELETE_AFTER_DOWNLOAD,
  };
}
