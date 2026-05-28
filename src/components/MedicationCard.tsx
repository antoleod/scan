import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { WorkflowMetadata, WorkflowStatus, MedicationCycleEntry } from '../core/notes';
import type { NotePalette as Palette } from '../theme/theme';

interface MedicationCardProps {
  noteText?: string;
  metadata?: WorkflowMetadata;
  workflowStatus?: WorkflowStatus;
  palette: Palette;
  expanded?: boolean;
  // Legacy callbacks (only used for the note-level "completed" placeholder)
  onComplete?: () => void;
  onDismiss?: () => void;
  // Cyclic per-medication callbacks
  onTaken?: (medIndex: number) => void;
  onSnooze?: (medIndex: number, snoozeMs: number) => void;
  onDismissCycle?: (medIndex: number) => void;
  onReactivate?: (medIndex: number) => void;
}

type CountdownTone = 'safe' | 'warn' | 'danger' | 'due' | 'snoozed';

const ACCENT = '#4DA3FF';
const TONE_COLORS: Record<CountdownTone, string> = {
  safe:    '#22c55e',
  warn:    '#f59e0b',
  danger:  '#ef4444',
  due:     '#f59e0b',
  snoozed: '#A970FF',
};

const HEADER_RE   = /^medication\s+follow[-\s]?up\b/i;
const VERIFY_RE   = /^verify\b/i;
const TAKEN_RE    = /^taken\b\s*/i;
const REASON_RE   = /^reason\s*[:：]/i;
const NEXT_RE     = /next\s+suggested\s+(\d{1,2}:\d{2})/i;
const FOLLOW_RX_RE= /follow\s+prescription/i;

function safeStr(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function fmtDuration(ms: number): string {
  const totalMins = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMins / 60);
  const days  = Math.floor(hours / 24);
  if (days  > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${totalMins % 60}m`;
  return `${totalMins}m`;
}

function timeLabel(ts: number | undefined): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function timeTextToTimestamp(hhmm: string, base: Date = new Date()): number | undefined {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return undefined;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;
  const candidate = new Date(base);
  candidate.setSeconds(0, 0);
  candidate.setHours(hh, mm, 0, 0);
  if (candidate.getTime() < base.getTime() - 60_000) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate.getTime();
}

function parseLegacyMedicationNote(text: string, metadata?: WorkflowMetadata): {
  meds: MedicationCycleEntry[];
  takenAtFromText?: string;
  reason?: string;
} {
  const lines = safeStr(text)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meds: MedicationCycleEntry[] = [];
  let takenAtFromText: string | undefined;
  let reason: string | undefined;

  for (const line of lines) {
    if (HEADER_RE.test(line)) continue;
    if (VERIFY_RE.test(line)) continue;
    if (REASON_RE.test(line)) {
      reason = line.replace(REASON_RE, '').trim() || undefined;
      continue;
    }
    if (TAKEN_RE.test(line)) {
      takenAtFromText = line.replace(TAKEN_RE, '').trim() || undefined;
      continue;
    }

    const parts = line.split('·').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[0];
    if (!name) continue;
    let dose: string | undefined;
    let nextTimeText: string | undefined;

    for (let i = 1; i < parts.length; i += 1) {
      const seg = parts[i];
      const next = seg.match(NEXT_RE);
      if (next) {
        nextTimeText = next[1];
      } else if (FOLLOW_RX_RE.test(seg)) {
        nextTimeText = nextTimeText ?? undefined;
      } else if (!dose) {
        dose = seg;
      }
    }

    const baseNow = new Date();
    const nextSuggestedAt = nextTimeText ? timeTextToTimestamp(nextTimeText, baseNow) : undefined;
    meds.push({
      name,
      dose,
      nextSuggestedAt,
      followPrescription: !nextTimeText,
      status: 'active',
    });
  }

  if (!meds.length && metadata?.medicationName) {
    const takenAtMs = typeof metadata.takenAt === 'number' ? metadata.takenAt : undefined;
    meds.push({
      name: safeStr(metadata.medicationName).trim(),
      dose: safeStr(metadata.doseText).trim() || undefined,
      takenAt: takenAtMs,
      lastTakenAt: takenAtMs,
      nextSuggestedAt: typeof metadata.followUpAt === 'number' ? metadata.followUpAt : undefined,
      status: 'active',
    });
  }

  if (meds.length > 0 && !meds[0].nextSuggestedAt && typeof metadata?.followUpAt === 'number') {
    meds[0] = { ...meds[0], nextSuggestedAt: metadata.followUpAt };
  }
  if (!takenAtFromText && metadata?.takenAtText) takenAtFromText = safeStr(metadata.takenAtText).trim() || undefined;
  if (!reason && metadata?.reason) reason = safeStr(metadata.reason).trim() || undefined;

  return { meds, takenAtFromText, reason };
}

function resolveMedications(
  noteText: string,
  metadata?: WorkflowMetadata,
): { meds: MedicationCycleEntry[]; takenAtFromText?: string; reason?: string } {
  const fromMeta = Array.isArray(metadata?.medications) ? metadata!.medications! : [];
  if (fromMeta.length > 0) {
    return {
      meds: fromMeta,
      takenAtFromText: safeStr(metadata?.takenAtText).trim() || undefined,
      reason: safeStr(metadata?.reason).trim() || undefined,
    };
  }
  const legacy = parseLegacyMedicationNote(noteText, metadata);
  return {
    meds: legacy.meds,
    takenAtFromText: legacy.takenAtFromText,
    reason: legacy.reason,
  };
}

function describeCountdown(targetMs: number, snoozed: boolean, t: TFunction): { text: string; tone: CountdownTone } {
  const diff = targetMs - Date.now();
  if (snoozed) {
    if (Math.abs(diff) < 60_000) return { text: t('medication.snoozedDueNow'), tone: 'snoozed' };
    if (diff < 0) return { text: t('medication.snoozedOverdue', { duration: fmtDuration(-diff) }), tone: 'danger' };
    return { text: t('medication.snoozedIn', { duration: fmtDuration(diff) }), tone: 'snoozed' };
  }
  if (diff <= -60_000) return { text: t('medication.overdue', { duration: fmtDuration(-diff) }), tone: 'danger' };
  if (Math.abs(diff) < 60_000) return { text: t('medication.dueNow'), tone: 'due' };
  const tone: CountdownTone = diff <= 30 * 60_000 ? 'warn' : 'safe';
  return { text: t('medication.inTime', { duration: fmtDuration(diff) }), tone };
}

const SNOOZE_OPTIONS: { label: string; ms: number }[] = [
  { label: '+10m', ms: 10 * 60_000 },
  { label: '+30m', ms: 30 * 60_000 },
  { label: '+1h',  ms: 60 * 60_000 },
];

function checkTakenTooSoon(med: MedicationCycleEntry): { tooSoon: boolean; minutesUntilSafe?: number } {
  if (typeof med.lastTakenAt !== 'number' || typeof med.minimumIntervalHours !== 'number') {
    return { tooSoon: false };
  }
  const minMs = med.minimumIntervalHours * 3_600_000;
  const timeSince = Date.now() - med.lastTakenAt;
  if (timeSince < minMs) {
    const minutesUntilSafe = Math.ceil((minMs - timeSince) / 60_000);
    return { tooSoon: true, minutesUntilSafe };
  }
  return { tooSoon: false };
}

// ─── Per-medication row ──────────────────────────────────────────────────
interface MedRowProps {
  med: MedicationCycleEntry;
  index: number;
  fallbackTakenText?: string;
  reason?: string;
  expanded?: boolean;
  showSeparator: boolean;
  palette: Palette;
  onTaken?: (medIndex: number) => void;
  onSnooze?: (medIndex: number, snoozeMs: number) => void;
  onDismissCycle?: (medIndex: number) => void;
  onReactivate?: (medIndex: number) => void;
}

function MedRow({
  med,
  index,
  fallbackTakenText,
  reason,
  expanded,
  showSeparator,
  palette,
  onTaken,
  onSnooze,
  onDismissCycle,
  onReactivate,
}: MedRowProps) {
  const { t } = useTranslation();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [confirmTooSoon, setConfirmTooSoon] = useState(false);

  const status = med.status || 'active';
  const isSnoozed = status === 'snoozed';
  const isDismissed = status === 'dismissed';
  const followPrescription = !med.nextSuggestedAt || med.followPrescription;
  const countdown = (typeof med.nextSuggestedAt === 'number' && !isDismissed)
    ? describeCountdown(med.nextSuggestedAt, isSnoozed, t)
    : null;
  const countdownColor = countdown ? TONE_COLORS[countdown.tone] : palette.textDim;
  const nextTime = followPrescription ? '' : timeLabel(med.nextSuggestedAt);

  // Taken-at line: prefer per-med ms timestamp; fall back to note-level text.
  const takenStamp = typeof med.lastTakenAt === 'number'
    ? med.lastTakenAt
    : (typeof med.takenAt === 'number' ? med.takenAt : undefined);
  const takenTime = typeof takenStamp === 'number' ? timeLabel(takenStamp) : safeStr(fallbackTakenText).trim();

  const canAct = !isDismissed;

  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingTop: showSeparator ? 12 : 4,
        paddingBottom: 10,
        borderTopWidth: showSeparator ? 0.5 : 0,
        borderTopColor: `${palette.border}88`,
        opacity: isDismissed ? 0.55 : 1,
      }}
    >
      {/* Name + dose chip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <Text
          style={{ color: palette.textPrimary, fontSize: 15, fontWeight: '700', flexShrink: 1 }}
          numberOfLines={2}
        >
          {med.name || 'Medication'}
        </Text>
        {med.dose ? (
          <View
            style={{
              borderRadius: 6,
              backgroundColor: `${ACCENT}18`,
              borderWidth: 0.5,
              borderColor: `${ACCENT}55`,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: ACCENT, fontSize: 11, fontWeight: '600' }}>{med.dose}</Text>
          </View>
        ) : null}
        {isDismissed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Ionicons name="close-circle-outline" size={12} color={palette.textMuted} />
            <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700' }}>{t('medication.cancelled')}</Text>
          </View>
        ) : isSnoozed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Ionicons name="moon-outline" size={12} color={TONE_COLORS.snoozed} />
            <Text style={{ color: TONE_COLORS.snoozed, fontSize: 10, fontWeight: '700' }}>{t('medication.snoozed')}</Text>
          </View>
        ) : null}
      </View>

      {/* Next suggested + countdown */}
      {!isDismissed ? (
        <View style={{ gap: 2, marginBottom: 6 }}>
          {nextTime ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={11} color={palette.textDim} />
              <Text style={{ color: palette.textDim, fontSize: 12 }}>
                {t('medication.nextSuggested', { time: nextTime })}
              </Text>
            </View>
          ) : (
            <Text style={{ color: palette.textMuted, fontSize: 12, fontStyle: 'italic' }}>
              {t('medication.followPrescriptionSchedule')}
            </Text>
          )}
          {countdown ? (
            <Text
              style={{ color: countdownColor, fontSize: 16, fontWeight: '800', letterSpacing: 0.3 }}
              numberOfLines={1}
            >
              {countdown.text}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Taken meta + reason (subtle) */}
      {(takenTime || (reason && expanded && index === 0) || (med.safetyNote && expanded)) ? (
        <View style={{ marginBottom: 8, gap: 2 }}>
          {takenTime ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark-done-outline" size={10} color={palette.textMuted} />
              <Text style={{ color: palette.textMuted, fontSize: 11 }} numberOfLines={1}>
                {med.dose ? t('medication.takenAtDose', { time: takenTime, dose: med.dose }) : t('medication.takenAt', { time: takenTime })}
              </Text>
            </View>
          ) : null}
          {reason && expanded && index === 0 ? (
            <Text
              style={{ color: palette.textMuted, fontSize: 11, fontStyle: 'italic' }}
              numberOfLines={2}
            >
              {t('medication.reasonLabel', { reason })}
            </Text>
          ) : null}
          {med.safetyNote && expanded ? (
            <Text style={{ color: palette.textMuted, fontSize: 10, lineHeight: 14 }} numberOfLines={3}>
              {med.safetyNote}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Snooze options (inline) */}
      {snoozeOpen && canAct ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {SNOOZE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.label}
              onPress={() => { setSnoozeOpen(false); onSnooze?.(index, opt.ms); }}
              accessibilityRole="button"
              accessibilityLabel={`Snooze ${med.name} ${opt.label}`}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: TONE_COLORS.snoozed,
                backgroundColor: pressed ? `${TONE_COLORS.snoozed}33` : `${TONE_COLORS.snoozed}18`,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ color: TONE_COLORS.snoozed, fontSize: 12, fontWeight: '700' }}>{opt.label}</Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setSnoozeOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={`Cancel snooze for ${med.name}`}
            style={({ pressed }) => ({
              minHeight: 36,
              paddingHorizontal: 10,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: pressed ? `${palette.textDim}12` : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Ionicons name="close" size={14} color={palette.textDim} />
          </Pressable>
        </View>
      ) : null}

      {/* Dismiss confirmation (inline) */}
      {confirmDismiss && canAct ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: palette.textBody, fontSize: 12 }}>
            Dismiss reminder for <Text style={{ fontWeight: '700' }}>{med.name}</Text>? The note stays saved.
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Pressable
              onPress={() => { setConfirmDismiss(false); onDismissCycle?.(index); }}
              accessibilityRole="button"
              accessibilityLabel={t('medication.confirmDismissA11y', { name: med.name })}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 36,
                borderRadius: 8,
                backgroundColor: pressed ? '#ef4444cc' : '#ef4444',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('medication.dismiss')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmDismiss(false)}
              accessibilityRole="button"
              accessibilityLabel={t('medication.cancel')}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 36,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: pressed ? `${palette.textDim}12` : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '700' }}>{t('medication.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* "Taken too soon" confirmation (inline) */}
      {confirmTooSoon && canAct ? (() => {
        const check = checkTakenTooSoon(med);
        return (
          <View style={{ gap: 6 }}>
            <Text style={{ color: palette.textBody, fontSize: 12 }}>
              <Text style={{ fontWeight: '700' }}>{med.name}</Text> {t('medication.takenAgoConfirm', { minutes: check.minutesUntilSafe })}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable
                onPress={() => { setConfirmTooSoon(false); onTaken?.(index); }}
                accessibilityRole="button"
                accessibilityLabel={t('medication.confirmTakeA11y', { name: med.name })}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 36,
                  borderRadius: 8,
                  backgroundColor: pressed ? '#f59e0bcc' : '#f59e0b',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('medication.takeNow')}</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmTooSoon(false)}
                accessibilityRole="button"
                accessibilityLabel={t('medication.cancel')}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 36,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: palette.border,
                  backgroundColor: pressed ? `${palette.textDim}12` : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '700' }}>{t('medication.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })() : null}

      {/* Per-medication action row */}
      {!snoozeOpen && !confirmDismiss && !confirmTooSoon && canAct ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            onPress={() => {
              const check = checkTakenTooSoon(med);
              if (check.tooSoon) {
                setConfirmTooSoon(true);
              } else {
                onTaken?.(index);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={t('medication.markTakenA11y', { name: med.name })}
            style={({ pressed }) => ({
              flex: 1.4,
              minHeight: 38,
              borderRadius: 8,
              backgroundColor: pressed ? '#22c55ecc' : '#22c55e',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="checkmark" size={13} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('medication.taken')}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => { setConfirmDismiss(false); setSnoozeOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel={t('medication.snoozeReminderA11y', { name: med.name })}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 38,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: TONE_COLORS.snoozed,
              backgroundColor: pressed ? `${TONE_COLORS.snoozed}33` : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="moon-outline" size={12} color={TONE_COLORS.snoozed} />
              <Text style={{ color: TONE_COLORS.snoozed, fontSize: 12, fontWeight: '700' }}>{t('medication.snooze')}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => { setSnoozeOpen(false); setConfirmDismiss(true); }}
            accessibilityRole="button"
            accessibilityLabel={t('medication.dismissReminderA11y', { name: med.name })}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 38,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: pressed ? `${palette.textDim}12` : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="close" size={13} color={palette.textDim} />
              <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '700' }}>{t('medication.dismiss')}</Text>
            </View>
          </Pressable>
        </View>
      ) : null}

      {/* Reactivate dismissed medication */}
      {isDismissed ? (
        <Pressable
          onPress={() => onReactivate?.(index)}
          accessibilityRole="button"
          accessibilityLabel={t('medication.reactivateA11y', { name: med.name })}
          style={({ pressed }) => ({
            minHeight: 38,
            borderRadius: 8,
            backgroundColor: pressed ? '#4DA3FF88' : '#4DA3FF',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="refresh" size={13} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{t('medication.reactivate')}</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── MedicationCard (one or many medications, each with its own cycle) ──
export function MedicationCard({
  noteText,
  metadata,
  workflowStatus,
  palette,
  expanded,
  onComplete: _onComplete,
  onDismiss: _onDismiss,
  onTaken,
  onSnooze,
  onDismissCycle,
  onReactivate,
}: MedicationCardProps) {
  const { meds, takenAtFromText, reason } = useMemo(
    () => resolveMedications(safeStr(noteText), metadata),
    [noteText, metadata],
  );

  // Tick every 30s so countdowns refresh. 60s was too coarse: the ±60s
  // "Due now" window (120s wide) could fall entirely between two ticks, so a
  // med would jump from "in 30s" straight to "Overdue 30s" and never show
  // "Due now". 30s guarantees that window is sampled at least twice.
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((n) => (n + 1) & 0x7fffffff), 30_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // ── Empty / malformed ────────────────────────────────────────────────────
  if (!meds.length) {
    return (
      <Text style={{ color: palette.textBody, fontSize: 13 }} numberOfLines={3}>
        {safeStr(noteText)}
      </Text>
    );
  }

  // ── Note-level "completed" placeholder (legacy) ──────────────────────────
  if (workflowStatus === 'completed') {
    const focusName = meds[0]?.name || safeStr(metadata?.medicationName).trim() || 'Medication';
    return (
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#22c55e44',
          backgroundColor: '#22c55e12',
          padding: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700' }}>Completed</Text>
        </View>
        <Text style={{ color: palette.textMuted, fontSize: 12 }}>
          {focusName} — Good job staying on track.
        </Text>
      </View>
    );
  }

  // ── All medications dismissed → collapsed placeholder ────────────────────
  const allDismissed = meds.every((m) => (m.status || 'active') === 'dismissed');
  if (allDismissed) {
    return (
      <View style={{ opacity: 0.55 }}>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${palette.border}44`,
            backgroundColor: palette.surface,
            padding: 12,
            gap: 4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="close-circle-outline" size={14} color={palette.textMuted} />
            <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>
              All reminders dismissed
            </Text>
          </View>
          <Text style={{ color: palette.textDim, fontSize: 11 }} numberOfLines={2}>
            {meds.map((m) => m.name).filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
    );
  }

  const someSnoozed = meds.some((m) => (m.status || 'active') === 'snoozed') &&
                     !meds.some((m) => (m.status || 'active') === 'active');

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: `${ACCENT}44`,
        backgroundColor: palette.surface,
        overflow: 'hidden',
      }}
    >
      {/* Header label */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 4,
        }}
      >
        <Ionicons
          name={someSnoozed ? 'moon-outline' : 'alarm-outline'}
          size={13}
          color={someSnoozed ? TONE_COLORS.snoozed : ACCENT}
        />
        <Text
          style={{
            color: someSnoozed ? TONE_COLORS.snoozed : ACCENT,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          {meds.length > 1 ? `${meds.length} medication reminders` : 'Medication reminder'}
        </Text>
      </View>

      {/* Per-medication rows — each owns its own [Taken][Snooze][Dismiss] */}
      {meds.map((med, index) => (
        <MedRow
          key={`${med.name || 'med'}-${index}`}
          med={med}
          index={index}
          fallbackTakenText={takenAtFromText}
          reason={reason}
          expanded={expanded}
          showSeparator={index > 0}
          palette={palette}
          onTaken={onTaken}
          onSnooze={onSnooze}
          onDismissCycle={onDismissCycle}
          onReactivate={onReactivate}
        />
      ))}
    </View>
  );
}
