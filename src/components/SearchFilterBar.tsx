import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  chipBorder: string;
};

type FilterKey = 'all' | 'work' | 'pinned' | 'archived';

// ─── Mini Calendar (exported so Clipboard & History can reuse it) ────────────

const DAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildCalendar(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  // Monday-based week: 0=Mon … 6=Sun
  let startDow = first.getDay(); // 0=Sun
  startDow = startDow === 0 ? 6 : startDow - 1;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(startDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function MiniCalendar({
  selected,
  palette,
  onSelect,
  onClose,
}: {
  selected: string | null;
  palette: Palette;
  onSelect: (ymd: string | null) => void;
  onClose: () => void;
}) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(
    selected ? Number(selected.slice(0, 4)) : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    selected ? Number(selected.slice(5, 7)) - 1 : today.getMonth(),
  );

  const rows = useMemo(() => buildCalendar(viewYear, viewMonth), [viewYear, viewMonth]);
  const todayYMD = toYMD(today);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => undefined}
          style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 20, padding: 18, width: '100%', maxWidth: 360, gap: 14 }}
        >
          {/* Month navigation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={prevMonth} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-back" size={16} color={palette.textBody} />
            </Pressable>
            <Text style={{ color: palette.textBody, fontWeight: '700', fontSize: 15 }}>
              {MONTHS[viewMonth]} {viewYear}
            </Text>
            <Pressable onPress={nextMonth} hitSlop={12} style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chevron-forward" size={16} color={palette.textBody} />
            </Pressable>
          </View>

          {/* Day headers */}
          <View style={{ flexDirection: 'row' }}>
            {DAYS_SHORT.map((d) => (
              <View key={d} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '600' }}>{d}</Text>
              </View>
            ))}
          </View>

          {/* Day cells */}
          <View style={{ gap: 4 }}>
            {rows.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {row.map((date, di) => {
                  if (!date) return <View key={di} style={{ flex: 1 }} />;
                  const ymd = toYMD(date);
                  const isSelected = ymd === selected;
                  const isToday = ymd === todayYMD;
                  return (
                    <Pressable
                      key={di}
                      onPress={() => onSelect(isSelected ? null : ymd)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? palette.accent : pressed ? palette.surfaceAlt : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: palette.accent,
                      })}
                    >
                      <Text style={{
                        color: isSelected ? '#000' : isToday ? palette.accent : palette.textBody,
                        fontSize: 13,
                        fontWeight: isSelected || isToday ? '700' : '400',
                      }}>
                        {date.getDate()}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4, borderTopWidth: 1, borderTopColor: palette.border }}>
            {selected ? (
              <Pressable
                onPress={() => onSelect(null)}
                style={{ flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={{ flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: '#000', fontSize: 13, fontWeight: '700' }}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── SearchFilterBar ──────────────────────────────────────────────────────────

export function SearchFilterBar({
  palette,
  value,
  count,
  filter,
  dateFilter,
  onChange,
  onChangeFilter,
  onChangeDateFilter,
}: {
  palette: Palette;
  value: string;
  count: number;
  filter: FilterKey;
  dateFilter?: string | null;
  onChange: (text: string) => void;
  onChangeFilter: (filter: FilterKey) => void;
  onChangeDateFilter?: (ymd: string | null) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all',      label: 'All' },
    { key: 'work',     label: 'Work' },
    { key: 'pinned',   label: 'Pinned' },
    { key: 'archived', label: 'Archived' },
  ];

  const dateLabel = dateFilter
    ? new Date(dateFilter + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })
    : null;

  return (
    <View style={{ width: '100%', gap: 8 }}>
      {/* Search input */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, position: 'relative' }}>
          <Ionicons name="search" size={16} color={palette.textDim} style={{ position: 'absolute', left: 12, top: 12, zIndex: 2 }} />
          <TextInput
            value={value}
            onChangeText={onChange}
            placeholder="Search notes…"
            placeholderTextColor={palette.textMuted}
            style={{
              height: 40,
              width: '100%',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surface,
              paddingLeft: 36,
              paddingRight: 12,
              color: palette.textBody,
              fontSize: 14,
            }}
          />
        </View>

        {/* Calendar button */}
        {onChangeDateFilter ? (
          <Pressable
            onPress={() => setCalendarOpen(true)}
            style={({ pressed }) => ({
              width: 40,
              height: 40,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: dateFilter ? palette.accent : palette.border,
              backgroundColor: dateFilter ? `${palette.accent}22` : palette.surface,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="calendar-outline" size={18} color={dateFilter ? palette.accent : palette.textDim} />
          </Pressable>
        ) : null}

        {/* Count badge */}
        <View style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: palette.surfaceAlt, borderWidth: 1, borderColor: palette.border }}>
          <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '600' }}>{count}</Text>
        </View>
      </View>

      {/* Filter chips row */}
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChangeFilter(item.key)}
              hitSlop={8}
              style={({ pressed }) => ({
                height: 28,
                paddingHorizontal: 12,
                borderRadius: 99,
                borderWidth: 1,
                borderColor: active ? palette.accent : palette.chipBorder,
                backgroundColor: active ? palette.accent : 'transparent',
                justifyContent: 'center',
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ color: active ? '#000' : palette.textDim, fontSize: 12, fontWeight: active ? '700' : '500' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}

        {/* Active date chip */}
        {dateLabel ? (
          <Pressable
            onPress={() => onChangeDateFilter?.(null)}
            style={{ height: 28, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1, borderColor: palette.accent, backgroundColor: `${palette.accent}22`, flexDirection: 'row', alignItems: 'center', gap: 5 }}
          >
            <Ionicons name="calendar" size={11} color={palette.accent} />
            <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>{dateLabel}</Text>
            <Ionicons name="close" size={12} color={palette.accent} />
          </Pressable>
        ) : null}
      </View>

      {calendarOpen ? (
        <MiniCalendar
          selected={dateFilter ?? null}
          palette={palette}
          onSelect={(ymd) => { onChangeDateFilter?.(ymd); }}
          onClose={() => setCalendarOpen(false)}
        />
      ) : null}
    </View>
  );
}
