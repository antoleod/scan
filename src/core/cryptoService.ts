/**
 * CryptoService — placeholder for Phase 11 client-side encryption.
 *
 * STATUS: ENCRYPTION PENDING — all transfers are currently unencrypted.
 * Do NOT claim end-to-end encryption in the UI until this is implemented.
 *
 * Architecture is designed so Phase 11 can drop in real implementations
 * without changing the TransferService call sites.
 */

export interface TransferKey {
  keyId: string;
  // Real: CryptoKey or raw bytes. Placeholder: null.
  key: null;
}

export interface EncryptedPayload {
  data: Uint8Array;
  iv: Uint8Array;
  keyId: string;
}

/**
 * Generate a per-transfer key. Phase 11: returns a real AES-GCM key.
 * Phase 7 (now): returns a placeholder.
 */
export async function generateTransferKey(): Promise<TransferKey> {
  return {
    keyId: `key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    key: null, // encryption pending
  };
}

/**
 * Encrypt file data before upload. Phase 11: real AES-GCM encryption.
 * Phase 7 (now): passes through unchanged.
 */
export async function encryptFileToTemp(
  data: Uint8Array,
  _key: TransferKey,
): Promise<EncryptedPayload> {
  // ENCRYPTION PENDING: data is returned as-is.
  return {
    data,
    iv: new Uint8Array(12), // placeholder IV (all zeros — not used without encryption)
    keyId: _key.keyId,
  };
}

/**
 * Decrypt file data after download. Phase 11: real AES-GCM decryption.
 * Phase 7 (now): passes through unchanged.
 */
export async function decryptFileFromTemp(
  payload: EncryptedPayload,
  _key: TransferKey,
): Promise<Uint8Array> {
  // ENCRYPTION PENDING: data is returned as-is.
  return payload.data;
}

/**
 * Prepare encryption context for a new transfer.
 * Phase 11: derive/exchange keys with the receiver's public key.
 */
export async function prepareEncryption(_receiverDeviceId?: string): Promise<{
  key: TransferKey;
  encryptionEnabled: false; // will be true in Phase 11
}> {
  return {
    key: await generateTransferKey(),
    encryptionEnabled: false, // ENCRYPTION PENDING
  };
}
