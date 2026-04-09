import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RECENT_KEY = '@oryxen_smart_recent_v1';
const MAX_RECENT = 8;

type NoteCategory = 'general' | 'work';

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

export type SmartSuggestion = {
  text: string;
  category: NoteCategory;
};

// ─── Suggestion engine ────────────────────────────────────────────────────────

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function detectCategory(keyword: string): NoteCategory {
  const k = keyword.toLowerCase();
  const workWords = [
    'laptop','computer','pc','desktop','workstation','printer','scanner',
    'phone','mobile','tablet','monitor','keyboard','mouse','headset','headphones',
    'charger','cable','dock','docking','webcam','camera',
    'vpn','access','account','password','login','credential','badge','id card','mfa','2fa',
    'email','mailbox','outlook','mail','inbox','distribution',
    'network','wifi','wi-fi','internet','router','switch','ethernet','lan',
    'meeting','call','conference','standup','sync','interview','presentation',
    'ticket','incident','request','issue','case','task','ritm','inc','req',
    'server','deploy','deployment','software','app','application','update','patch',
    'report','document','contract','form','invoice','purchase','order',
  ];
  return workWords.some((w) => k.includes(w)) ? 'work' : 'general';
}

function generateSuggestions(keyword: string): SmartSuggestion[] {
  const raw = keyword.trim();
  if (!raw) return [];

  const k = raw.toLowerCase();
  const K = cap(raw);
  const cat = detectCategory(k);

  // ── IT Hardware (laptop / desktop / tablet / monitor) ───────────────────
  if (/laptop|computer|pc|desktop|workstation|monitor|screen|tablet|ipad|surface/.test(k)) {
    return [
      { text: `${K} delivered to user successfully`, category: 'work' },
      { text: `${K} retrieved from user`, category: 'work' },
      { text: `${K} setup and configuration completed`, category: 'work' },
      { text: `${K} sent to repair — awaiting return`, category: 'work' },
      { text: `${K} assigned to new employee`, category: 'work' },
      { text: `${K} replaced — old unit returned to IT`, category: 'work' },
      { text: `${K} not powering on — troubleshooting in progress`, category: 'work' },
      { text: `${K} ready for pickup at IT desk`, category: 'work' },
      { text: `${K} imaging in progress`, category: 'work' },
      { text: `${K} upgrade completed — user notified`, category: 'work' },
    ];
  }

  // ── Peripherals ──────────────────────────────────────────────────────────
  if (/keyboard|mouse|headset|headphones|charger|cable|dock|docking|webcam|camera/.test(k)) {
    return [
      { text: `${K} issued to user`, category: 'work' },
      { text: `${K} replaced — defective unit returned`, category: 'work' },
      { text: `${K} requested and ordered`, category: 'work' },
      { text: `${K} not detected — driver issue resolved`, category: 'work' },
      { text: `${K} delivered and tested`, category: 'work' },
      { text: `${K} setup completed`, category: 'work' },
      { text: `${K} inventory updated`, category: 'work' },
      { text: `${K} returned to stock`, category: 'work' },
    ];
  }

  // ── Printer / Scanner ────────────────────────────────────────────────────
  if (/printer|scanner|copier|fax|toner|cartridge|ink/.test(k)) {
    return [
      { text: `${K} jam cleared — back online`, category: 'work' },
      { text: `${K} installed and tested`, category: 'work' },
      { text: `${K} replaced — old unit removed`, category: 'work' },
      { text: `${K} network connection restored`, category: 'work' },
      { text: `${K} driver updated on user machine`, category: 'work' },
      { text: `${K} toner replaced — print quality restored`, category: 'work' },
      { text: `${K} out of service — escalated to vendor`, category: 'work' },
      { text: `${K} calibration completed`, category: 'work' },
    ];
  }

  // ── Phone / Mobile ───────────────────────────────────────────────────────
  if (/phone|mobile|iphone|android|smartphone|cell/.test(k)) {
    return [
      { text: `${K} provisioned and activated`, category: 'work' },
      { text: `${K} assigned to user`, category: 'work' },
      { text: `${K} retrieved — user offboarded`, category: 'work' },
      { text: `${K} screen damaged — sent for repair`, category: 'work' },
      { text: `${K} MDM enrollment completed`, category: 'work' },
      { text: `${K} factory reset performed`, category: 'work' },
      { text: `${K} data wiped — user confirmed`, category: 'work' },
      { text: `${K} plan upgraded`, category: 'work' },
    ];
  }

  // ── Access / Accounts / Passwords ────────────────────────────────────────
  if (/access|account|password|login|credential|badge|id card|mfa|2fa/.test(k)) {
    return [
      { text: `${K} reset completed — user notified`, category: 'work' },
      { text: `${K} created for new employee`, category: 'work' },
      { text: `${K} deactivated per HR offboarding request`, category: 'work' },
      { text: `${K} granted per manager approval`, category: 'work' },
      { text: `${K} permissions updated`, category: 'work' },
      { text: `${K} locked — unlock processed`, category: 'work' },
      { text: `${K} expiring — renewal submitted`, category: 'work' },
      { text: `${K} issue resolved`, category: 'work' },
      { text: `${K} audit completed — no changes needed`, category: 'work' },
      { text: `${K} revoked — user confirmed`, category: 'work' },
    ];
  }

  // ── VPN ──────────────────────────────────────────────────────────────────
  if (/vpn/.test(k)) {
    return [
      { text: `${K} connection issue resolved`, category: 'work' },
      { text: `${K} credentials updated`, category: 'work' },
      { text: `${K} access granted to user`, category: 'work' },
      { text: `${K} access revoked — offboarding`, category: 'work' },
      { text: `${K} client reinstalled — connection stable`, category: 'work' },
      { text: `${K} split tunneling configured`, category: 'work' },
      { text: `${K} performance issue escalated`, category: 'work' },
      { text: `${K} setup completed on user device`, category: 'work' },
    ];
  }

  // ── Email / Mailbox ──────────────────────────────────────────────────────
  if (/email|mailbox|outlook|mail|inbox|distribution/.test(k)) {
    return [
      { text: `${K} created and configured`, category: 'work' },
      { text: `${K} migrated to new server`, category: 'work' },
      { text: `${K} quota exceeded — storage cleaned up`, category: 'work' },
      { text: `${K} shared access granted`, category: 'work' },
      { text: `${K} auto-reply configured`, category: 'work' },
      { text: `${K} not syncing — issue resolved`, category: 'work' },
      { text: `${K} deactivated — forwarding set up`, category: 'work' },
      { text: `${K} backup completed`, category: 'work' },
    ];
  }

  // ── Network / WiFi ───────────────────────────────────────────────────────
  if (/network|wifi|wi-fi|internet|router|switch|ethernet|lan/.test(k)) {
    return [
      { text: `${K} connectivity restored`, category: 'work' },
      { text: `${K} configuration updated`, category: 'work' },
      { text: `${K} outage reported — escalated to NOC`, category: 'work' },
      { text: `${K} speed issue resolved`, category: 'work' },
      { text: `${K} new connection set up for user`, category: 'work' },
      { text: `${K} troubleshooting completed — no action needed`, category: 'work' },
      { text: `${K} firmware updated`, category: 'work' },
      { text: `${K} SSID credentials changed — users notified`, category: 'work' },
    ];
  }

  // ── Meetings / Calls ─────────────────────────────────────────────────────
  if (/meeting|call|conference|standup|sync|interview|presentation/.test(k)) {
    return [
      { text: `${K} scheduled — invite sent`, category: 'work' },
      { text: `${K} completed — notes attached`, category: 'work' },
      { text: `${K} cancelled — attendees notified`, category: 'work' },
      { text: `${K} rescheduled to next available slot`, category: 'work' },
      { text: `${K} follow-up action items assigned`, category: 'work' },
      { text: `${K} recording shared with team`, category: 'work' },
      { text: `${K} summary sent to participants`, category: 'work' },
      { text: `${K} no show — follow-up email sent`, category: 'work' },
    ];
  }

  // ── Tickets / Incidents / Requests ───────────────────────────────────────
  if (/ticket|incident|request|issue|case|task|ritm|inc\b|req\b/.test(k)) {
    return [
      { text: `${K} opened and assigned to support team`, category: 'work' },
      { text: `${K} resolved — user confirmed fix`, category: 'work' },
      { text: `${K} escalated to L2 support`, category: 'work' },
      { text: `${K} pending user response`, category: 'work' },
      { text: `${K} closed — no further action needed`, category: 'work' },
      { text: `${K} re-opened — issue recurred`, category: 'work' },
      { text: `${K} on hold — awaiting parts`, category: 'work' },
      { text: `${K} root cause identified and documented`, category: 'work' },
    ];
  }

  // ── Software / App / Deployment ──────────────────────────────────────────
  if (/software|app|application|update|patch|deploy|deployment|install/.test(k)) {
    return [
      { text: `${K} installed on user machine`, category: 'work' },
      { text: `${K} update deployed — no issues reported`, category: 'work' },
      { text: `${K} rollback performed — previous version restored`, category: 'work' },
      { text: `${K} license assigned to user`, category: 'work' },
      { text: `${K} crash issue resolved`, category: 'work' },
      { text: `${K} uninstalled per user request`, category: 'work' },
      { text: `${K} compatibility issue fixed`, category: 'work' },
      { text: `${K} testing completed — approved for production`, category: 'work' },
    ];
  }

  // ── Delivery / Package ───────────────────────────────────────────────────
  if (/delivery|package|parcel|shipment|order|box/.test(k)) {
    return [
      { text: `${K} received at front desk`, category: cat },
      { text: `${K} delivered to recipient`, category: cat },
      { text: `${K} missing — investigation opened`, category: cat },
      { text: `${K} damaged — claim submitted`, category: cat },
      { text: `${K} signed and logged in register`, category: cat },
      { text: `${K} returned to sender`, category: cat },
      { text: `${K} awaiting pickup`, category: cat },
      { text: `${K} tracking number updated`, category: cat },
    ];
  }

  // ── Generic fallback ─────────────────────────────────────────────────────
  return [
    { text: `${K} completed successfully`, category: cat },
    { text: `${K} in progress — follow-up scheduled`, category: cat },
    { text: `${K} pending approval`, category: cat },
    { text: `${K} submitted for review`, category: cat },
    { text: `${K} received and acknowledged`, category: cat },
    { text: `${K} delivered as requested`, category: cat },
    { text: `${K} cancelled — user notified`, category: cat },
    { text: `${K} escalated — awaiting response`, category: cat },
    { text: `${K} approved and actioned`, category: cat },
    { text: `${K} on hold — awaiting confirmation`, category: cat },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function SmartNoteGeneratorModal({
  visible,
  palette,
  onClose,
  onSelect,
  onCreateTemplate,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
  /** Called with the chosen note text + category. The parent creates the note. */
  onSelect: (suggestion: SmartSuggestion) => void;
  onCreateTemplate: (suggestion: SmartSuggestion) => void;
}) {
  const [keyword, setKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<SmartSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentKeywords, setRecentKeywords] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Clear state + load recents when modal opens
  useEffect(() => {
    if (visible) {
      setKeyword('');
      setSuggestions([]);
      setLoading(false);
      AsyncStorage.getItem(RECENT_KEY)
        .then((raw) => setRecentKeywords(raw ? JSON.parse(raw) : []))
        .catch(() => undefined);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [visible]);

  async function saveRecent(kw: string) {
    const trimmed = kw.trim().toLowerCase();
    if (!trimmed) return;
    const next = [trimmed, ...recentKeywords.filter((r) => r !== trimmed)].slice(0, MAX_RECENT);
    setRecentKeywords(next);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => undefined);
  }

  // Debounced suggestion generation — 350ms delay gives the "thinking" feel
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const trimmed = keyword.trim();
    if (!trimmed) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(() => {
      setSuggestions(generateSuggestions(trimmed));
      setLoading(false);
    }, 350);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [keyword]);

  const handleSelect = (s: SmartSuggestion) => {
    saveRecent(keyword).catch(() => undefined);
    onSelect(s);
    onClose();
  };

  const catColor = (c: NoteCategory) => (c === 'work' ? '#2563eb' : '#059669');

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        {/* Bottom sheet — stops touch propagation to backdrop */}
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: palette.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: palette.border,
            paddingTop: 12,
            paddingBottom: 32,
            maxHeight: '85%',
          }}
        >
          {/* Drag handle */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder, marginBottom: 20 }} />

          {/* Header */}
          <View style={{ paddingHorizontal: 20, gap: 4, marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 8,
                backgroundColor: `${palette.accent}20`,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="sparkles" size={16} color={palette.accent} />
              </View>
              <Text style={{ color: palette.textBody, fontSize: 16, fontWeight: '700' }}>
                Smart Note Generator
              </Text>
            </View>
            <Text style={{ color: palette.textDim, fontSize: 12, marginLeft: 40 }}>
              Type a keyword and tap a suggestion to create a note instantly.
            </Text>
          </View>

          {/* Input */}
          <View style={{
            marginHorizontal: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            borderColor: keyword ? palette.accent : palette.border,
            borderRadius: 12,
            backgroundColor: palette.bg,
            paddingHorizontal: 12,
            paddingVertical: 2,
            marginBottom: 16,
          }}>
            <Ionicons
              name="search-outline"
              size={16}
              color={keyword ? palette.accent : palette.textMuted}
            />
            <TextInput
              ref={inputRef}
              value={keyword}
              onChangeText={setKeyword}
              placeholder="e.g. laptop, meeting, badge, access..."
              placeholderTextColor={palette.textMuted}
              style={{
                flex: 1,
                color: palette.textBody,
                fontSize: 14,
                paddingVertical: 10,
              }}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {keyword.length > 0 && (
              <Pressable onPress={() => setKeyword('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={palette.textMuted} />
              </Pressable>
            )}
          </View>

          {/* Recent keywords */}
          {recentKeywords.length > 0 && !keyword ? (
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Recent
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {recentKeywords.map((kw) => (
                  <Pressable
                    key={kw}
                    onPress={() => setKeyword(kw)}
                    style={({ pressed }) => ({
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: palette.border,
                      backgroundColor: pressed ? `${palette.accent}18` : palette.surfaceAlt,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                    })}
                  >
                    <Ionicons name="time-outline" size={11} color={palette.textMuted} />
                    <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '500' }}>{kw}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {/* Suggestions list */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}
            style={{ flexGrow: 0 }}
          >
            {loading ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
                <ActivityIndicator size="small" color={palette.accent} />
                <Text style={{ color: palette.textMuted, fontSize: 12 }}>Generating suggestions…</Text>
              </View>
            ) : suggestions.length === 0 && keyword.trim().length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 10 }}>
                <Ionicons name="bulb-outline" size={32} color={palette.textMuted} />
                <Text style={{ color: palette.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                  Start typing a keyword — {'\n'}laptop, meeting, password, delivery…
                </Text>
              </View>
            ) : suggestions.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center', gap: 10 }}>
                <Ionicons name="search-outline" size={28} color={palette.textMuted} />
                <Text style={{ color: palette.textMuted, fontSize: 13, textAlign: 'center' }}>
                  No suggestions for "{keyword}" yet.{'\n'}Try a different keyword.
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 }}>
                  {suggestions.length} suggestions · tap to create
                </Text>
                {suggestions.map((s, index) => (
                  <Pressable
                    key={index}
                    onPress={() => handleSelect(s)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: pressed ? palette.accent : palette.border,
                      backgroundColor: pressed ? `${palette.accent}10` : palette.surfaceAlt,
                    })}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={palette.accent} />
                    <Text style={{ color: palette.textBody, fontSize: 13, flex: 1, lineHeight: 18 }}>
                      {s.text}
                    </Text>
                      <View style={{
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        backgroundColor: `${catColor(s.category)}18`,
                      }}>
                        <Text style={{ color: catColor(s.category), fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {s.category}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => onCreateTemplate(s)}
                        hitSlop={8}
                        style={({ pressed }) => ({
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: palette.border,
                          backgroundColor: pressed ? `${palette.accent}14` : palette.surface,
                        })}
                      >
                        <Text style={{ color: palette.textDim, fontSize: 10, fontWeight: '700' }}>Template</Text>
                      </Pressable>
                    </Pressable>
                  ))}
              </>
            )}
          </ScrollView>

          {/* Dismiss */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              marginHorizontal: 20,
              marginTop: 12,
              height: 44,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: palette.border,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: palette.textDim, fontSize: 13, fontWeight: '600' }}>Dismiss</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
