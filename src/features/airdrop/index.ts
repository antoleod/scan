/**
 * AirDrop feature — public API.
 *
 * This barrel is the ONLY surface other features (e.g. Notes) should import
 * from. Anything not re-exported here is considered internal to AirDrop. This
 * enforces the dependency direction:  Notes → AirDrop  (never the reverse).
 */

// Screen (mounted by the AirDrop tab).
export { AirDropScreen } from './screens/AirDropScreen';

// Session orchestration — lets other features start a share programmatically.
export {
  createSession,
  joinSession,
  joinUserShare,
  cancelSession,
  dismissSession,
  acceptIncomingFile,
  declineIncomingFile,
  getSessionPeer,
} from './sessions/sessionService';
export type { CreateSessionOptions } from './sessions/sessionService';

// File picking + transfer surface.
export { pickFile } from './transfer/filePicker';
export type { ReceiverHandlers } from './transfer/transferService';

// Store hooks for read access.
export {
  useSessions,
  useActiveSessions,
  useSession,
  useTransfer,
  useNearbyDevices,
  useUserShares,
  useSelf,
} from './hooks/useAirdrop';

// QR helpers (encode/decode/pair).
export { encodeQrPayload, decodeQrPayload, isAirdropQr, pairFromQrString } from './qr/qrPairing';

// Capability probe.
export { isWebRtcSupported } from './webrtc';

// Public types.
export type {
  ShareSession,
  SharePayloadDescriptor,
  SharePayloadKind,
  SessionTtlPreset,
  SessionStatus,
  PeerInfo,
  NearbyDevice,
  UserShare,
  SelectedFile,
  FileMeta,
  TransferProgress,
  TransferStatus,
} from './types';
