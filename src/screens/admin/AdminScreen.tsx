/**
 * Admin Analytics Center — full dashboard (Phase 3).
 *
 * Sections:
 *  1. Overview — top-level KPIs with period filter
 *  2. Users   — user table with role/stats
 *  3. Notes   — types breakdown, counts
 *  4. Features — module usage breakdown
 *  5. Errors  — error codes breakdown
 *  6. Controls — cloud relay placeholder (Phase 4)
 *
 * Access: admin or tester only. Enforced by useAdminRole() + AdminAccessGate.
 * Private note content is never shown here — only aggregated counters.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAdminRole } from '../../hooks/useAdminRole';
import { useAuth } from '../../auth/useAuth';
import {
  loadOverviewStats,
  loadUserList,
  type OverviewStats,
  type UserRow,
} from '../../core/adminAnalyticsReader';
import {
  getGlobalRelayState,
} from '../../core/transferQuotaService';
import {
  loadAdminAlerts,
  markAlertRead,
  resolveAlert,
} from '../../core/adminAlertsService';
import type { GlobalRelayState, AdminAlert } from '../../core/cloudRelayConfig';
import {
  enableCloudRelay,
  disableCloudRelay,
  setEmergencyStop,
  resetGlobalQuotaPeriod,
  resetUserQuota,
  blockUserCloudTransfer,
  unblockUserCloudTransfer,
  forceCleanupExpiredTransfers,
} from '../../core/adminRelayActions';
import { MB, GB } from '../../core/cloudRelayConfig';

type Palette = {
  bg: string; fg: string; accent: string;
  muted: string; card: string; border: string;
};
type Section = 'overview' | 'users' | 'notes' | 'features' | 'errors' | 'controls';
type Period = 1 | 7 | 30;

// ── Root ─────────────────────────────────────────────────────────────────────

export function AdminScreen({ palette, onClose }: { palette: Palette; onClose: () => void }) {
  const { user } = useAuth();
  const { role, isAdmin, isTester, isLoading: roleLoading } = useAdminRole();

  if (roleLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.accent} />
        <Text style={{ color: palette.muted, fontSize: 13, marginTop: 12 }}>Checking access…</Text>
      </View>
    );
  }

  if (!isTester) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <AdminHeader palette={palette} title="Admin Center" onClose={onClose} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#EF444414', borderWidth: 1, borderColor: '#EF444430', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed-outline" size={28} color="#EF4444" />
          </View>
          <Text style={{ color: palette.fg, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Access Denied</Text>
          <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, maxWidth: 280 }}>
            Admin Analytics Center is restricted to administrators and testers.
          </Text>
          <Text style={{ color: palette.muted, fontSize: 11, fontFamily: 'monospace' }}>uid: {user?.uid ?? '—'}</Text>
        </View>
      </View>
    );
  }

  return <Dashboard palette={palette} onClose={onClose} uid={user!.uid} role={role} isAdmin={isAdmin} />;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ palette, onClose, uid, role, isAdmin }: {
  palette: Palette; onClose: () => void;
  uid: string; role: string; isAdmin: boolean;
}) {
  const [section, setSection] = useState<Section>('overview');
  const [period, setPeriod] = useState<Period>(7);
  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [relayState, setRelayState] = useState<GlobalRelayState | null>(null);
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [ov, ul, rs, al] = await Promise.all([
        loadOverviewStats(period),
        loadUserList(uid),
        getGlobalRelayState(),
        loadAdminAlerts({ unreadOnly: false, maxResults: 50 }),
      ]);
      setOverview(ov);
      setUsers(ul);
      setRelayState(rs);
      setAlerts(al);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [uid, period]);

  useEffect(() => { void load(); }, [load]);

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.uidPrefix.includes(q) ||
      (u.username ?? '').toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q)
    );
  });

  const SECTIONS: { key: Section; icon: React.ComponentProps<typeof Ionicons>['name']; label: string }[] = [
    { key: 'overview', icon: 'stats-chart-outline', label: 'Overview' },
    { key: 'users',    icon: 'people-outline',      label: 'Users' },
    { key: 'notes',    icon: 'document-text-outline', label: 'Notes' },
    { key: 'features', icon: 'grid-outline',         label: 'Features' },
    { key: 'errors',   icon: 'warning-outline',      label: 'Errors' },
    { key: 'controls', icon: 'cloud-outline',        label: 'Controls' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <AdminHeader palette={palette} title="Admin Analytics Center" onClose={onClose}>
        <RoleBadge role={role} />
      </AdminHeader>

      {/* Section tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: 6, flexDirection: 'row' }}>
        {SECTIONS.map((s) => {
          const active = section === s.key;
          return (
            <Pressable key={s.key} onPress={() => setSection(s.key)}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', gap: 5,
                paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                backgroundColor: active ? palette.accent : palette.card,
                borderWidth: 1, borderColor: active ? palette.accent : palette.border,
                opacity: pressed ? 0.7 : 1,
              })}>
              <Ionicons name={s.icon} size={14} color={active ? palette.bg : palette.muted} />
              <Text style={{ color: active ? palette.bg : palette.fg, fontSize: 12, fontWeight: '700' }}>{s.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Period filter */}
      {(section === 'overview' || section === 'notes' || section === 'features' || section === 'errors') ? (
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingBottom: 8 }}>
          {([1, 7, 30] as Period[]).map((p) => (
            <Pressable key={p} onPress={() => setPeriod(p)}
              style={({ pressed }) => ({
                paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
                backgroundColor: period === p ? palette.accent + '22' : 'transparent',
                borderWidth: 1, borderColor: period === p ? palette.accent : palette.border,
                opacity: pressed ? 0.7 : 1,
              })}>
              <Text style={{ color: period === p ? palette.accent : palette.muted, fontSize: 11, fontWeight: '700' }}>
                {p === 1 ? 'Today' : p === 7 ? '7 days' : '30 days'}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Content */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <ActivityIndicator color={palette.accent} />
          <Text style={{ color: palette.muted, fontSize: 13 }}>Loading analytics…</Text>
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={32} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => void load()} style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: palette.accent }}>
            <Text style={{ color: palette.bg, fontWeight: '700' }}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={palette.accent} />}
          contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 80 }}>

          {section === 'overview' && overview && (
            <OverviewSection palette={palette} data={overview} />
          )}
          {section === 'users' && (
            <UsersSection palette={palette} users={filteredUsers} search={userSearch} onSearch={setUserSearch} />
          )}
          {section === 'notes' && overview && (
            <NotesSection palette={palette} data={overview} />
          )}
          {section === 'features' && overview && (
            <FeaturesSection palette={palette} data={overview} />
          )}
          {section === 'errors' && overview && (
            <ErrorsSection palette={palette} data={overview} />
          )}
          {section === 'controls' && (
            <ControlsSection
              palette={palette}
              isAdmin={isAdmin}
              uid={uid}
              relayState={relayState}
              alerts={alerts}
              users={users}
              actionBusy={actionBusy}
              actionMsg={actionMsg}
              onAction={async (fn) => {
                setActionBusy(true);
                setActionMsg(null);
                try {
                  await fn();
                  setActionMsg({ text: 'Done', ok: true });
                  void load(true);
                } catch (e) {
                  setActionMsg({ text: e instanceof Error ? e.message : 'Action failed', ok: false });
                } finally {
                  setActionBusy(false);
                }
              }}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Overview section ──────────────────────────────────────────────────────────

function OverviewSection({ palette, data }: { palette: Palette; data: OverviewStats }) {
  return (
    <>
      <SectionTitle palette={palette} icon="stats-chart-outline" title="Overview" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard palette={palette} label="Active today" value={data.activeUsersToday} color={palette.accent} />
        <StatCard palette={palette} label="Active this week" value={data.activeUsersWeek} color="#4DA3FF" />
        <StatCard palette={palette} label="Active this month" value={data.activeUsersMonth} color="#A855F7" />
        <StatCard palette={palette} label="App opens" value={data.appOpens} />
        <StatCard palette={palette} label="Logins" value={data.loginCount} />
        <StatCard palette={palette} label="Notes created" value={data.noteCreatedCount} color="#22C55E" />
        <StatCard palette={palette} label="Notes updated" value={data.noteUpdatedCount} />
        <StatCard palette={palette} label="Notes deleted" value={data.noteDeletedCount} />
        <StatCard palette={palette} label="Scans" value={data.scanCount} color="#4DA3FF" />
        <StatCard palette={palette} label="Scan failures" value={data.scanFailedCount} color="#EF4444" />
        <StatCard palette={palette} label="Transfers" value={data.transferCount} color="#F59E0B" />
        <StatCard palette={palette} label="Transfer fails" value={data.transferFailedCount} color="#EF4444" />
      </View>
    </>
  );
}

// ── Users section ─────────────────────────────────────────────────────────────

function UsersSection({ palette, users, search, onSearch }: {
  palette: Palette; users: UserRow[];
  search: string; onSearch: (v: string) => void;
}) {
  return (
    <>
      <SectionTitle palette={palette} icon="people-outline" title={`Users (${users.length})`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 12, paddingVertical: 8, gap: 8, marginBottom: 4 }}>
        <Ionicons name="search-outline" size={14} color={palette.muted} />
        <TextInput
          value={search}
          onChangeText={onSearch}
          placeholder="Search by uid, username or email…"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, color: palette.fg, fontSize: 13 }}
        />
      </View>
      {users.length === 0 ? (
        <EmptyState palette={palette} message="No user data yet. Analytics events will populate this list." />
      ) : (
        users.map((u) => <UserRow key={u.uid} palette={palette} user={u} />)
      )}
    </>
  );
}

function UserRow({ palette, user: u }: { palette: Palette; user: UserRow }) {
  const roleColor = u.role === 'admin' ? '#F59E0B' : u.role === 'tester' ? '#4DA3FF' : palette.muted;
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: palette.accent + '18', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14 }}>{u.platform === 'ios' ? '🍎' : u.platform === 'android' ? '🤖' : '🌐'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '700' }} numberOfLines={1}>
            {u.username ?? u.email ?? `uid:${u.uidPrefix}…`}
          </Text>
          {u.email && u.username ? (
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{u.email}</Text>
          ) : null}
        </View>
        <View style={{ paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: roleColor + '18', borderWidth: 1, borderColor: roleColor + '44' }}>
          <Text style={{ color: roleColor, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{u.role}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip palette={palette} label="Logins" value={u.totalLogins ?? 0} />
        <Chip palette={palette} label="Notes" value={u.totalNotesCreated ?? 0} />
        <Chip palette={palette} label="Scans" value={u.totalScans ?? 0} />
        <Chip palette={palette} label="Transfers" value={u.totalTransfers ?? 0} />
        {u.lastActiveAt ? (
          <Chip palette={palette} label="Last active" value={relativeTime(u.lastActiveAt)} />
        ) : null}
        {u.appVersion ? (
          <Chip palette={palette} label="v" value={u.appVersion} />
        ) : null}
      </View>
    </View>
  );
}

// ── Notes section ─────────────────────────────────────────────────────────────

function NotesSection({ palette, data }: { palette: Palette; data: OverviewStats }) {
  const types = data.noteTypesBreakdown;
  const total = Object.values(types).reduce((s, v) => s + v, 0);
  return (
    <>
      <SectionTitle palette={palette} icon="document-text-outline" title="Notes Analytics" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard palette={palette} label="Created" value={data.noteCreatedCount} color="#22C55E" />
        <StatCard palette={palette} label="Updated" value={data.noteUpdatedCount} />
        <StatCard palette={palette} label="Deleted" value={data.noteDeletedCount} color="#EF4444" />
      </View>
      {total > 0 ? (
        <>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 4 }}>Types breakdown</Text>
          {Object.entries(types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <ProgressRow key={type} palette={palette} label={type} value={count} max={Math.max(1, total)} color={noteTypeColor(type)} />
          ))}
        </>
      ) : (
        <EmptyState palette={palette} message="No note type data for this period." />
      )}
    </>
  );
}

// ── Features section ──────────────────────────────────────────────────────────

function FeaturesSection({ palette, data }: { palette: Palette; data: OverviewStats }) {
  const features = data.topFeatures;
  const total = Object.values(features).reduce((s, v) => s + v, 0);
  return (
    <>
      <SectionTitle palette={palette} icon="grid-outline" title="Feature Usage" />
      {total > 0 ? (
        Object.entries(features).sort((a, b) => b[1] - a[1]).map(([feat, count]) => (
          <ProgressRow key={feat} palette={palette} label={feat} value={count} max={Math.max(1, total)} color={palette.accent} />
        ))
      ) : (
        <EmptyState palette={palette} message="No feature usage data for this period." />
      )}
    </>
  );
}

// ── Errors section ────────────────────────────────────────────────────────────

function ErrorsSection({ palette, data }: { palette: Palette; data: OverviewStats }) {
  const errors = data.errorsBreakdown;
  const total = Object.values(errors).reduce((s, v) => s + v, 0);
  return (
    <>
      <SectionTitle palette={palette} icon="warning-outline" title="Errors & Quality" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <StatCard palette={palette} label="Scan failures" value={data.scanFailedCount} color="#EF4444" />
        <StatCard palette={palette} label="Transfer failures" value={data.transferFailedCount} color="#EF4444" />
      </View>
      {total > 0 ? (
        <>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 4 }}>Error breakdown</Text>
          {Object.entries(errors).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
            <ProgressRow key={code} palette={palette} label={code} value={count} max={Math.max(1, total)} color="#EF4444" />
          ))}
        </>
      ) : (
        <EmptyState palette={palette} message="No errors recorded for this period." />
      )}
    </>
  );
}

// ── Controls section (Phase 5) ────────────────────────────────────────────────

function ControlsSection({ palette, isAdmin, uid, relayState, alerts, users, actionBusy, actionMsg, onAction }: {
  palette: Palette;
  isAdmin: boolean;
  uid: string;
  relayState: GlobalRelayState | null;
  alerts: AdminAlert[];
  users: UserRow[];
  actionBusy: boolean;
  actionMsg: { text: string; ok: boolean } | null;
  onAction: (fn: () => Promise<void>) => void;
}) {
  const [blockTargetUid, setBlockTargetUid] = useState('');
  const [blockReason, setBlockReason] = useState('admin_decision');
  const unreadAlerts = alerts.filter((a) => !a.read);

  const relayEnabled = relayState?.enabled ?? false;
  const emergencyStop = relayState?.emergencyStop ?? false;
  const globalUsed = relayState?.globalUsedBytes ?? 0;
  const globalReserved = relayState?.globalReservedBytes ?? 0;
  const globalLimit = relayState?.globalLimitBytes ?? (5 * GB);
  const globalPct = Math.round(((globalUsed + globalReserved) / globalLimit) * 100);
  const statusColor = emergencyStop ? '#EF4444' : relayEnabled ? '#22C55E' : palette.muted;

  return (
    <>
      <SectionTitle palette={palette} icon="cloud-outline" title="Cloud Relay Control" />

      {/* Status card */}
      <View style={{ padding: 14, borderRadius: 14, backgroundColor: palette.card, borderWidth: 1, borderColor: statusColor + '33', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor }} />
          <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '800', flex: 1 }}>
            {emergencyStop ? 'EMERGENCY STOP' : relayEnabled ? 'Relay enabled' : 'Relay disabled'}
          </Text>
          {unreadAlerts.length > 0 ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: '#EF444420', borderWidth: 1, borderColor: '#EF444440' }}>
              <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '800' }}>{unreadAlerts.length} alerts</Text>
            </View>
          ) : null}
        </View>
        {relayState ? (
          <>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: palette.muted, fontSize: 12 }}>Global usage</Text>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>
                  {formatBytes(globalUsed + globalReserved)} / {formatBytes(globalLimit)} ({globalPct}%)
                </Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.border, overflow: 'hidden' }}>
                <View style={{ width: `${Math.min(globalPct, 100)}%`, height: '100%', borderRadius: 3, backgroundColor: globalPct >= 90 ? '#EF4444' : globalPct >= 70 ? '#F59E0B' : '#22C55E' }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip palette={palette} label="Used" value={formatBytes(globalUsed)} />
              <Chip palette={palette} label="Reserved" value={formatBytes(globalReserved)} />
              <Chip palette={palette} label="Active transfers" value={relayState.activeTransfersCount} />
              <Chip palette={palette} label="Period" value={relayState.currentPeriodKey} />
            </View>
          </>
        ) : (
          <Text style={{ color: palette.muted, fontSize: 12 }}>No relay config found. Cloud relay has never been initialized.</Text>
        )}
      </View>

      {/* Action message */}
      {actionMsg ? (
        <View style={{ padding: 10, borderRadius: 10, backgroundColor: actionMsg.ok ? '#22C55E14' : '#EF444414', borderWidth: 1, borderColor: actionMsg.ok ? '#22C55E33' : '#EF444433' }}>
          <Text style={{ color: actionMsg.ok ? '#22C55E' : '#EF4444', fontSize: 12, fontWeight: '700' }}>{actionMsg.text}</Text>
        </View>
      ) : null}

      {/* Admin-only controls */}
      {isAdmin ? (
        <>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 4 }}>Relay controls</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <ActionButton palette={palette} label="Enable relay" color="#22C55E" busy={actionBusy}
              onPress={() => onAction(() => enableCloudRelay(uid))} />
            <ActionButton palette={palette} label="Disable relay" color="#EF4444" busy={actionBusy}
              onPress={() => onAction(() => disableCloudRelay(uid))} />
            <ActionButton palette={palette} label="Emergency stop ON" color="#EF4444" busy={actionBusy}
              onPress={() => onAction(() => setEmergencyStop(uid, true))} />
            <ActionButton palette={palette} label="Emergency stop OFF" color="#F59E0B" busy={actionBusy}
              onPress={() => onAction(() => setEmergencyStop(uid, false))} />
            <ActionButton palette={palette} label="Reset global quota" color="#F59E0B" busy={actionBusy}
              onPress={() => onAction(() => resetGlobalQuotaPeriod(uid))} />
            <ActionButton palette={palette} label="Cleanup expired" color="#4DA3FF" busy={actionBusy}
              onPress={() => onAction(async () => { const r = await forceCleanupExpiredTransfers(uid); void r; })} />
          </View>

          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 4 }}>Block / unblock user</Text>
          <View style={{ gap: 8 }}>
            <TextInput
              value={blockTargetUid}
              onChangeText={setBlockTargetUid}
              placeholder="Target user UID"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ color: palette.fg, fontSize: 13, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}
            />
            <TextInput
              value={blockReason}
              onChangeText={setBlockReason}
              placeholder="Reason"
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              style={{ color: palette.fg, fontSize: 13, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ActionButton palette={palette} label="Block user" color="#EF4444" busy={actionBusy || !blockTargetUid}
                onPress={() => onAction(() => blockUserCloudTransfer(uid, blockTargetUid, blockReason || 'admin_decision'))} />
              <ActionButton palette={palette} label="Unblock user" color="#22C55E" busy={actionBusy || !blockTargetUid}
                onPress={() => onAction(() => unblockUserCloudTransfer(uid, blockTargetUid))} />
              <ActionButton palette={palette} label="Reset quota" color="#F59E0B" busy={actionBusy || !blockTargetUid}
                onPress={() => onAction(() => resetUserQuota(uid, blockTargetUid))} />
            </View>
          </View>
        </>
      ) : (
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>Admin role required to manage relay controls. You can view alerts below.</Text>
      )}

      {/* Alerts */}
      {alerts.length > 0 ? (
        <>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', marginTop: 4 }}>
            Alerts ({alerts.length}, {unreadAlerts.length} unread)
          </Text>
          {alerts.slice(0, 20).map((a) => (
            <AlertRow key={a.alertId} palette={palette} alert={a} isAdmin={isAdmin}
              onRead={() => void markAlertRead(a.alertId)}
              onResolve={() => void resolveAlert(a.alertId)} />
          ))}
        </>
      ) : (
        <EmptyState palette={palette} message="No alerts yet. Alerts fire when quota thresholds are crossed." />
      )}
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function AdminHeader({ palette, title, onClose, children }: {
  palette: Palette; title: string; onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.border }}>
      <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"
        style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="chevron-back" size={18} color={palette.fg} />
      </Pressable>
      <Ionicons name="shield-checkmark-outline" size={16} color={palette.accent} />
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', flex: 1 }} numberOfLines={1}>{title}</Text>
      {children}
    </View>
  );
}

function SectionTitle({ palette, icon, title }: { palette: Palette; icon: React.ComponentProps<typeof Ionicons>['name']; title: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 }}>
      <Ionicons name={icon} size={16} color={palette.accent} />
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

function StatCard({ palette, label, value, color }: { palette: Palette; label: string; value: number; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 100, padding: 12, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
      <Text style={{ color: color ?? palette.fg, fontSize: 22, fontWeight: '900', letterSpacing: -0.5 }}>{formatNum(value)}</Text>
      <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

function ProgressRow({ palette, label, value, max, color }: {
  palette: Palette; label: string; value: number; max: number; color: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{label}</Text>
        <Text style={{ color: palette.muted, fontSize: 12 }}>{formatNum(value)} ({pct}%)</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: palette.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

function Chip({ palette, label, value }: { palette: Palette; label: string; value: number | string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: palette.border + '44' }}>
      <Text style={{ color: palette.muted, fontSize: 10 }}>{label}</Text>
      <Text style={{ color: palette.fg, fontSize: 10, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function RoleBadge({ role }: { role: string }) {
  const color = role === 'admin' ? '#F59E0B' : '#4DA3FF';
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: color + '18', borderWidth: 1, borderColor: color + '44' }}>
      <Text style={{ color, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }}>{role}</Text>
    </View>
  );
}

function EmptyState({ palette, message }: { palette: Palette; message: string }) {
  return (
    <View style={{ alignItems: 'center', padding: 24, gap: 8 }}>
      <Ionicons name="bar-chart-outline" size={28} color={palette.muted} />
      <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 18 }}>{message}</Text>
    </View>
  );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionButton({ palette, label, color, busy, onPress }: {
  palette: Palette; label: string; color: string; busy: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={busy ? undefined : onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10,
        backgroundColor: busy ? palette.border : color + '18',
        borderWidth: 1, borderColor: busy ? palette.border : color + '44',
        opacity: pressed || busy ? 0.6 : 1,
      })}>
      {busy
        ? <ActivityIndicator size="small" color={color} />
        : <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>}
    </Pressable>
  );
}

// ── Alert row ─────────────────────────────────────────────────────────────────

function AlertRow({ palette, alert: a, isAdmin, onRead, onResolve }: {
  palette: Palette; alert: AdminAlert; isAdmin: boolean;
  onRead: () => void; onResolve: () => void;
}) {
  const sevColor = a.severity === 'critical' ? '#EF4444' : a.severity === 'warn' ? '#F59E0B' : '#4DA3FF';
  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: palette.card, borderWidth: 1, borderColor: sevColor + '33', gap: 6, opacity: a.resolved ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: sevColor }} />
        <Text style={{ color: sevColor, fontSize: 11, fontWeight: '800', flex: 1, textTransform: 'uppercase' }}>{a.type.replace(/_/g, ' ')}</Text>
        <Text style={{ color: palette.muted, fontSize: 10 }}>{relativeTime(a.createdAt)}</Text>
      </View>
      <Text style={{ color: palette.fg, fontSize: 12, lineHeight: 17 }}>{a.message}</Text>
      {a.uid ? <Text style={{ color: palette.muted, fontSize: 11 }}>uid: {a.uid.slice(0, 8)}…</Text> : null}
      {!a.read || (!a.resolved && isAdmin) ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!a.read ? (
            <Pressable onPress={onRead} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.border }}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>Mark read</Text>
            </Pressable>
          ) : null}
          {!a.resolved && isAdmin ? (
            <Pressable onPress={onResolve} style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#22C55E18' }}>
              <Text style={{ color: '#22C55E', fontSize: 11, fontWeight: '700' }}>Resolve</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toFixed(2)} GB`;
  if (n >= MB) return `${(n / MB).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function noteTypeColor(type: string): string {
  const map: Record<string, string> = {
    medication: '#EF4444',
    shopping: '#22C55E',
    reminder: '#F59E0B',
    task: '#4DA3FF',
    general: '#A855F7',
    work: '#0EA5E9',
    health: '#EC4899',
  };
  return map[type] ?? '#888';
}
