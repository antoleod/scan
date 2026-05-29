/**
 * Internet Transfer — cloud relay send/receive screen (Phase 8 MVP).
 *
 * This is the Firebase Storage-backed transfer path. It is separate from the
 * WebRTC AirDrop path and gated behind the quota system.
 *
 * The screen shows:
 *  - Send: pick file → preflight check → upload progress → share code
 *  - Receive: enter session code → download → save
 *
 * ENCRYPTION NOTE: transfers are currently unencrypted (Phase 11 pending).
 * The UI does NOT claim E2E encryption.
 *
 * Hard rule: cloud relay starts DISABLED. This screen shows a clear
 * "unavailable" state when the relay is off — it NEVER blocks notes/scan/login.
 */
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Palette } from '../../../theme/theme';
import { pickFile } from '../transfer/filePicker';
import { sendFile, receiveFile, buildStoragePath, type TransferState } from '../../../core/transferService';
import { getGlobalRelayState } from '../../../core/transferQuotaService';
import { USER_FACING_MESSAGES, type CloudRelayErrorCode, MB } from '../../../core/cloudRelayConfig';
import { useAuth } from '../../../auth/useAuth';
import type { SelectedFile } from '../types';

// ── Main screen ───────────────────────────────────────────────────────────────

export function InternetTransferScreen({
  palette,
  onClose,
}: {
  palette: Palette;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'choose' | 'send' | 'receive'>('choose');

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}>
        <Pressable onPress={mode === 'choose' ? onClose : () => setMode('choose')} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Back"
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chevron-back" size={18} color={palette.fg} />
        </Pressable>
        <Ionicons name="cloud-upload-outline" size={16} color={palette.accent} />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', flex: 1 }}>Internet Transfer</Text>
        <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F59E0B14', borderWidth: 1, borderColor: '#F59E0B33' }}>
          <Text style={{ color: '#F59E0B', fontSize: 10, fontWeight: '800' }}>UNENCRYPTED MVP</Text>
        </View>
      </View>

      {mode === 'choose' ? (
        <ChooseMode palette={palette} onSend={() => setMode('send')} onReceive={() => setMode('receive')} />
      ) : mode === 'send' ? (
        <SendMode palette={palette} />
      ) : (
        <ReceiveMode palette={palette} />
      )}
    </View>
  );
}

// ── Choose mode ───────────────────────────────────────────────────────────────

function ChooseMode({ palette, onSend, onReceive }: { palette: Palette; onSend: () => void; onReceive: () => void }) {
  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#F59E0B0d', borderWidth: 1, borderColor: '#F59E0B33' }}>
        <Text style={{ color: '#F59E0B', fontSize: 12, lineHeight: 17 }}>
          Files are uploaded to cloud storage temporarily. They are NOT encrypted end-to-end in this version.
          Do not transfer sensitive documents until Phase 11 encryption is complete.
        </Text>
      </View>

      <Pressable onPress={onSend} accessibilityRole="button" accessibilityLabel="Send a file"
        style={({ pressed }) => ({ padding: 20, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="cloud-upload-outline" size={32} color={palette.accent} />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800' }}>Send a file</Text>
        <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center' }}>
          Upload a file and share a download code with the receiver.
        </Text>
      </Pressable>

      <Pressable onPress={onReceive} accessibilityRole="button" accessibilityLabel="Receive a file"
        style={({ pressed }) => ({ padding: 20, borderRadius: 16, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="cloud-download-outline" size={32} color="#4DA3FF" />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800' }}>Receive a file</Text>
        <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center' }}>
          Enter a download code to retrieve a file from cloud storage.
        </Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Send mode ─────────────────────────────────────────────────────────────────

function SendMode({ palette }: { palette: Palette }) {
  const { user } = useAuth();
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [picking, setPicking] = useState(false);
  const [state, setState] = useState<TransferState | null>(null);
  const [relayAvailable, setRelayAvailable] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const checkRelay = async () => {
    const global = await getGlobalRelayState();
    setRelayAvailable(global?.enabled === true && global.emergencyStop === false);
  };

  React.useEffect(() => { void checkRelay(); }, []);

  const pick = async () => {
    setPicking(true);
    try {
      const picked = await pickFile();
      if (picked) {
        setFile(picked);
        setState(null);
      }
    } finally { setPicking(false); }
  };

  const send = async () => {
    if (!file || !user?.uid) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const data = await file.getBytes();
    await sendFile({
      uid: user.uid,
      filename: file.name,
      data,
      mimeType: file.mimeType,
      onState: setState,
      signal: ctrl.signal,
    });
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const cancel = () => { abortRef.current?.abort(); setState(null); };

  if (relayAvailable === false) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }}>
        <Ionicons name="cloud-offline-outline" size={40} color={palette.muted} />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>Internet transfer unavailable</Text>
        <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', lineHeight: 18, maxWidth: 280 }}>
          {USER_FACING_MESSAGES.CLOUD_RELAY_DISABLED}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
      {/* File picker */}
      {file ? (
        <View style={{ padding: 12, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Ionicons name="document-outline" size={24} color={palette.accent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.fg, fontWeight: '700' }} numberOfLines={1}>{file.name}</Text>
            <Text style={{ color: palette.muted, fontSize: 12 }}>{(file.size / MB).toFixed(2)} MB · {file.mimeType}</Text>
          </View>
        </View>
      ) : null}

      <Pressable onPress={() => void pick()} disabled={picking}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, opacity: pressed || picking ? 0.6 : 1 })}>
        {picking ? <ActivityIndicator color={palette.accent} /> : <Ionicons name="folder-open-outline" size={20} color={palette.accent} />}
        <Text style={{ color: palette.fg, fontWeight: '700' }}>{file ? 'Change file' : 'Choose file'}</Text>
      </Pressable>

      {/* Transfer state */}
      {state ? <TransferStateView palette={palette} state={state} /> : null}

      {/* Send / Cancel */}
      {file && (!state || state.phase === 'error' || state.phase === 'denied') ? (
        <Pressable onPress={() => void send()}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14, backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 })}>
          <Ionicons name="cloud-upload-outline" size={20} color={palette.bg} />
          <Text style={{ color: palette.bg, fontWeight: '800' }}>Upload & share</Text>
        </Pressable>
      ) : null}

      {state && (state.phase === 'uploading' || state.phase === 'preflight' || state.phase === 'encrypting') ? (
        <Pressable onPress={cancel}
          style={({ pressed }) => ({ padding: 14, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ color: palette.fg, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// ── Receive mode ──────────────────────────────────────────────────────────────

function ReceiveMode({ palette }: { palette: Palette }) {
  const { user } = useAuth();
  const [code, setCode] = useState('');
  const [state, setState] = useState<TransferState | null>(null);

  const receive = async () => {
    if (!code.trim() || !user?.uid) return;
    // Code format: sessionId::storagePath
    const [sessionId, ...pathParts] = code.trim().split('::');
    const storagePath = pathParts.join('::');
    if (!sessionId || !storagePath) {
      setState({ phase: 'error', errorCode: 'INVALID_CODE', userMessage: 'Invalid download code. Expected format: sessionId::storagePath', encryptionEnabled: false });
      return;
    }
    const { state: finalState } = await receiveFile({
      uid: user.uid,
      sessionId,
      storagePath,
      onState: setState,
    });
    if (finalState.phase === 'done') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 80 }}>
      <View style={{ gap: 10 }}>
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '700' }}>Download code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="Paste the download code from the sender…"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={{ color: palette.fg, fontSize: 13, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: code ? palette.accent + '66' : palette.border, backgroundColor: palette.card, minHeight: 80 }}
        />
      </View>

      {state ? <TransferStateView palette={palette} state={state} /> : null}

      <Pressable onPress={() => void receive()} disabled={!code.trim()}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, borderRadius: 14, backgroundColor: '#4DA3FF', opacity: pressed || !code.trim() ? 0.6 : 1 })}>
        <Ionicons name="cloud-download-outline" size={20} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800' }}>Download</Text>
      </Pressable>
    </ScrollView>
  );
}

// ── Transfer state view ───────────────────────────────────────────────────────

function TransferStateView({ palette, state }: { palette: Palette; state: TransferState }) {
  const PHASE_LABELS: Partial<Record<TransferState['phase'], string>> = {
    preflight: 'Checking quota…',
    encrypting: 'Preparing…',
    uploading: 'Uploading…',
    waiting_receiver: 'Waiting for receiver…',
    downloading: 'Downloading…',
    decrypting: 'Processing…',
    done: 'Done',
    error: 'Transfer failed',
    denied: 'Transfer denied',
  };

  const isError = state.phase === 'error' || state.phase === 'denied';
  const isDone = state.phase === 'done';
  const color = isError ? '#EF4444' : isDone ? '#22C55E' : palette.accent;

  return (
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: color + '33', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {(!isDone && !isError) ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={isDone ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={18} color={color} />}
        <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{PHASE_LABELS[state.phase] ?? state.phase}</Text>
      </View>
      {state.progress && state.phase === 'uploading' ? (
        <View style={{ gap: 4 }}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.border, overflow: 'hidden' }}>
            <View style={{ width: `${Math.round(state.progress.fraction * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: palette.accent }} />
          </View>
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            {(state.progress.bytesTransferred / MB).toFixed(1)} / {(state.progress.totalBytes / MB).toFixed(1)} MB ({Math.round(state.progress.fraction * 100)}%)
          </Text>
        </View>
      ) : null}
      {state.userMessage ? (
        <Text style={{ color: isError ? '#EF4444' : palette.muted, fontSize: 12, lineHeight: 17 }}>{state.userMessage}</Text>
      ) : null}
      {isDone && state.sessionId ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.muted, fontSize: 11 }}>Share this download code with the receiver:</Text>
          <Text selectable style={{ color: palette.fg, fontSize: 11, fontFamily: 'monospace', backgroundColor: palette.border + '44', padding: 8, borderRadius: 8 }}>
            {state.sessionId}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
