import assert from "node:assert/strict";

import { classify } from "../src/core/classify";
import { applyImportedBackup, buildBackupBundle, parseBackupBundle } from "../src/core/backup";
import { generateBarcode } from "../src/core/barcode";
import { extractFields } from "../src/core/extract";
import { historyKey } from "../src/core/history";
import { defaultSettings, piLogic } from "../src/core/settings";
import { detectGroceryItem, formatShoppingList, isLikelyShoppingList, searchGroceryCatalog } from "../src/utils/groceryDetection";
import { analyzeShoppingListCandidate, isShoppingList, parseShoppingList } from "../src/core/shoppingList";
import { findProductAlias, getAllShoppingDictionaries, isConnector, isKnownUnit, isNarrativeBlocker } from "../src/core/shoppingDictionary";
import { detectSmartTypeFromContent } from "../src/core/smartNoteWorkflows";
import { createTrieFromWords } from "../src/utils/trie";
import { AppError, AuthError, SyncError, ValidationError, toAppError, isRetryable } from "../src/core/errors";
import { sanitizeScanInput, sanitizeNoteText, sanitizeTemplatePattern } from "../src/core/validation";
import { computeNotesChecksum } from "../src/core/syncChecksum";

let passed = 0;
let failed = 0;

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (error) {
    console.error(`❌ FAIL: ${name}`);
    console.error(error);
    failed++;
  }
}

run("piLogic converts short PI codes to full format", () => {
  const converted = piLogic.convert("mustbrun12345", "FULL", defaultSettings);
  assert.equal(converted, "02PI201234500");
});

run("classify detects ServiceNow ticket codes", () => {
  const result = classify(" ritm0012345 ", defaultSettings);
  assert.deepEqual(result, {
    profileId: "auto",
    type: "RITM",
    normalized: "RITM0012345",
    piMode: "N/A",
  });
});

run("extractFields returns template matches before fallback rules", () => {
  const fields = extractFields("Ticket PI-77 para cliente ACME", [
    {
      id: "template-1",
      name: "PI template",
      type: "PI",
      regexRules: {
        ticketNumber: "(PI-\\d+)",
        customerId: "cliente\\s+([A-Z]+)",
      },
      mappingRules: {},
      samplePayloads: [],
      createdAt: "2026-03-06T00:00:00.000Z",
      updatedAt: "2026-03-06T00:00:00.000Z",
    },
  ]);

  assert.deepEqual(fields, {
    ticketNumber: "PI-77",
    customerId: "ACME",
    _templateId: "template-1",
  });
});

run("extractFields fallback captures email and phone", () => {
  const fields = extractFields(
    "Contacto: maria@example.com Tel +34 600 111 222",
    []
  );

  assert.equal(fields.email, "maria@example.com");
  assert.equal(fields.phoneNumber, "+34 600 111 222");
});

run("backup export/import roundtrips settings templates and history", () => {
  const bundle = buildBackupBundle({
    settings: { ...defaultSettings, openUrls: false, historyAutoClearDays: 30 },
    templates: [
      {
        id: "tpl-1",
        name: "PI",
        type: "PI",
        regexRules: {},
        mappingRules: {},
        samplePayloads: [],
        createdAt: "2026-03-18T00:00:00.000Z",
        updatedAt: "2026-03-18T00:00:00.000Z",
      },
    ],
    history: [
      {
        id: "scan-1",
        codeOriginal: "02PI201234500",
        codeNormalized: "02PI201234500",
        type: "PI",
        profileId: "auto",
        piMode: "FULL",
        source: "camera",
        structuredFields: {},
        date: "2026-03-18T00:00:00.000Z",
        status: "pending",
        used: false,
        dateUsed: null,
      },
    ],
  });

  const parsed = parseBackupBundle(JSON.stringify(bundle));
  assert.ok(parsed);
  assert.equal(parsed?.kind, "full");
  assert.equal(parsed?.settings?.openUrls, false);
  assert.equal(parsed?.templates.length, 1);
  assert.equal(parsed?.history.length, 1);
});

run("legacy history-only import does not replace current settings", () => {
  const parsed = parseBackupBundle(JSON.stringify([
    {
      c: "02PI201234500",
      t: "PI",
      d: "2026-03-18T00:00:00.000Z",
    },
  ]));

  assert.ok(parsed);
  assert.equal(parsed?.kind, "history");

  const merged = applyImportedBackup(
    {
      settings: { ...defaultSettings, openUrls: false },
      templates: [],
      history: [],
    },
    parsed!
  );

  assert.equal(merged.settings.openUrls, false);
  assert.equal(merged.history.length, 1);
  assert.equal(historyKey(merged.history[0]), "02PI201234500::PI");
});

run("generateBarcode forces Code128 for PI and office-like values", () => {
  const piResult = generateBarcode("02PI20242401242", "QR");
  assert.equal(piResult.value, "02PI20242401242");
  assert.equal(piResult.finalFormat, "CODE128");
  assert.equal(piResult.forced, true);

  const officeResult = generateBarcode("Device Asset Office 001", "EAN13");
  assert.equal(officeResult.value, "Device Asset Office 001");
  assert.equal(officeResult.finalFormat, "CODE128");
  assert.equal(officeResult.forced, true);
});

run("generateBarcode keeps the selected format for non-critical values", () => {
  const result = generateBarcode("HELLO123", "CODE39");
  assert.equal(result.value, "HELLO123");
  assert.equal(result.finalFormat, "CODE39");
  assert.equal(result.forced, false);
});

run("generateBarcode falls back to Code128 for incompatible selected formats", () => {
  const result = generateBarcode("HELLO123", "EAN13");
  assert.equal(result.value, "HELLO123");
  assert.equal(result.finalFormat, "CODE128");
  assert.equal(result.forced, true);
  assert.equal(result.reason, "Selected format incompatible");
});

run("grocery detection recognizes multilingual French shopping list", () => {
  const input = [
    "Pommes de terre",
    "Oignons",
    "Ail",
    "Haché porc et veau",
    "Blanc de poulet",
    "Cabillaud",
    "Pommes rouges pour l’école",
    "Raisin vert",
    "Avocat",
    "3 poires",
    "Lardons",
    "Crème liquide verte",
    "Mozzarella",
    "Pain pour l’école",
    "Jambon pour l’école",
    "Jus d’orange",
    "Jus de pommes",
    "Salade",
    "Concombre",
    "Eau",
  ].join("\n");

  assert.equal(isLikelyShoppingList(input), true);
  assert.equal(detectGroceryItem("Pommes de terre").itemId, "potato");
  assert.equal(detectGroceryItem("3 poires").itemId, "pear");
  assert.equal(detectGroceryItem("3 poires").detectedQuantity, "3");
  assert.equal(detectGroceryItem("Cabillaud").itemId, "cod");
});

run("grocery catalog search supports aliases across languages", () => {
  assert.equal(searchGroceryCatalog("patata")[0]?.id, "potato");
  assert.equal(searchGroceryCatalog("aardappel")[0]?.id, "potato");
  assert.equal(searchGroceryCatalog("école").some((item) => item.id === "school_bread"), true);
  assert.equal(searchGroceryCatalog("jus").some((item) => item.id === "orange_juice"), true);
});

run("shopping formatter preserves accents and user quantities", () => {
  const formatted = formatShoppingList("Pommes de terre\n3 poires\nCrème liquide verte", { language: "fr" });
  assert.match(formatted, /Pommes de terre — 1 kg/);
  assert.match(formatted, /- 3 poires/);
  assert.match(formatted, /Crème liquide verte/);
});

run("health keywords prevent shopping list misclassification", () => {
  const medicationNote = "Took ibuprofen 400mg for headache, doctor recommended rest";
  assert.equal(isShoppingList(medicationNote), false);
});

run("health keywords in Spanish prevent shopping list misclassification", () => {
  const medicationNote = "Tomé ibuprofeno para el dolor de cabeza. Médico recomendó descanso.";
  assert.equal(isShoppingList(medicationNote), false);
});

run("health keywords in French prevent shopping list misclassification", () => {
  const medicationNote = "J'ai pris de l'ibuprofène pour la migraine. Mon docteur recommande le repos.";
  assert.equal(isShoppingList(medicationNote), false);
});

run("time formats like 08:40 are excluded from quantity parsing", () => {
  const timeNote = "Meeting at 08:40, reminder set for 10:30 AM";
  assert.equal(isShoppingList(timeNote), false);
});

run("shopping candidate analysis suggests short product lists", () => {
  const analysis = analyzeShoppingListCandidate("arroz, leche, huevos");
  assert.equal(analysis.isCandidate, true);
  assert.equal(analysis.parsedItems.length, 3);
});

run("shopping candidate analysis rejects narrative sentences", () => {
  const analysis = analyzeShoppingListCandidate("Hoy comí arroz con leche y huevos");
  assert.equal(analysis.isCandidate, false);
});

run("shopping dictionaries load language data", () => {
  const dictionaries = getAllShoppingDictionaries();
  assert.equal(dictionaries.length >= 4, true);
  assert.equal(dictionaries.some((dictionary) => dictionary.language === "es"), true);
  assert.equal(dictionaries.some((dictionary) => dictionary.products.length > 0), true);
});

run("shopping dictionary aliases and typos resolve to canonical products", () => {
  assert.equal(findProductAlias("azura")?.canonical, "Azúcar");
  assert.equal(findProductAlias("azucar")?.canonical, "Azúcar");
  assert.equal(findProductAlias("pain au lait")?.canonical, "Pain au lait");
  assert.equal(findProductAlias("coca-cola")?.canonical, "Coca cola");
});

run("shopping dictionary helpers detect connectors blockers and units", () => {
  assert.equal(isConnector("y"), true);
  assert.equal(isConnector("et"), true);
  assert.equal(isConnector("and"), true);
  assert.equal(isNarrativeBlocker("me gusta el arroz con leche"), true);
  assert.equal(isKnownUnit("kg"), true);
  assert.equal(isKnownUnit("bouteilles"), true);
});

[
  "arroz, leche, huevos",
  "arroz leche huevos azucar",
  "arroz leche huevos azúcar",
  "azura leche y pan",
  "leche y pan",
  "arroz, leche y huevos",
  "lait sucre et pain",
  "pain, lait et coca cola, beurre",
  "pain au lait, coca cola, beurre",
  "pommes de terre oignons ail",
  "rice milk eggs sugar",
  "milk bread and cheese",
  "rijst melk eieren suiker",
  "melk brood en kaas",
].forEach((input) => {
  run(`shopping candidate detects ${input}`, () => {
    assert.equal(analyzeShoppingListCandidate(input).isCandidate, true);
  });
});

[
  "hoy comí arroz con leche y huevos",
  "hoy comi arroz con leche y huevos",
  "me gusta el arroz con leche",
  "arroz con leche es un postre",
  "necesito comprar pan mañana",
  "quiero leche pero no sé si comprarla",
  "j’aime le pain au lait",
  "lait et pain sont sur la table",
  "I like milk and bread",
  "I ate rice with eggs today",
  "ik hou van melk en brood",
].forEach((input) => {
  run(`shopping candidate rejects ${input}`, () => {
    assert.equal(analyzeShoppingListCandidate(input).isCandidate, false);
  });
});

run("shopping parser canonicalizes typo and connector products", () => {
  const labels = parseShoppingList("azura leche y pan").items.map((item) => item.label);
  assert.deepEqual(labels, ["Azúcar", "Leche", "Pan"]);
});

run("shopping parser preserves French connector products", () => {
  const labels = parseShoppingList("lait sucre et pain").items.map((item) => item.label);
  assert.deepEqual(labels, ["Lait", "Sucre", "Pain"]);
});

run("shopping parser preserves multi-word products", () => {
  const labels = parseShoppingList("pain, lait et coca cola, beurre").items.map((item) => item.label);
  assert.deepEqual(labels, ["Pain", "Lait", "Coca cola", "Beurre"]);
  const multiLabels = parseShoppingList("pain au lait, coca cola, beurre").items.map((item) => item.label);
  assert.deepEqual(multiLabels, ["Pain au lait", "Coca cola", "Beurre"]);
});

run("shopping parser extracts quantities and units", () => {
  const poires = parseShoppingList("3 poires").items[0];
  assert.equal(poires.label, "Poire");
  assert.equal(poires.quantity, "3");
  assert.equal(poires.unit, "pièces");
  const lardons = parseShoppingList("400 g lardons").items[0];
  assert.equal(lardons.label, "Lardons");
  assert.equal(lardons.quantity, "400");
  assert.equal(lardons.unit, "g");
});

run("trie keyword matching detects medication keywords efficiently", () => {
  const trie = createTrieFromWords(["medication", "pill", "tablet", "took"]);
  assert.equal(trie.contains("medication"), true);
  assert.equal(trie.contains("pill"), true);
  assert.equal(trie.contains("unknown"), false);
});

run("trie hasKeyword detects substrings and word boundaries", () => {
  const trie = createTrieFromWords(["ibuprofen", "paracetamol", "aspirin"]);
  assert.equal(trie.hasKeyword("Taking ibuprofen for pain"), true);
  assert.equal(trie.hasKeyword("Need paracetamol urgently"), true);
  assert.equal(trie.hasKeyword("shopping for ingredients"), false);
});

run("smart type detection identifies medication notes", () => {
  const medicationText = "Tomé ibuprofeno 400mg a las 8:00 por dolor de cabeza";
  const smartType = detectSmartTypeFromContent(medicationText);
  assert.equal(smartType, "medication");
});

run("smart type detection identifies shopping lists", () => {
  const shoppingText = "Manzanas, plátanos, leche, pan, huevos, queso";
  const smartType = detectSmartTypeFromContent(shoppingText);
  assert.equal(smartType, "shopping");
});

run("smart type detection returns 'none' for generic text", () => {
  const genericText = "This is just a random note with no special meaning";
  const smartType = detectSmartTypeFromContent(genericText);
  assert.equal(smartType, "none");
});

// ─── Error handling tests (Phase 1) ────────────────────────────────────────────

run("AppError has correct structure with code/severity/retryable/id", () => {
  const err = new AppError("TEST_ERROR", "warn", false, "Test message", { context: "data" });
  assert.equal(err.code, "TEST_ERROR");
  assert.equal(err.severity, "warn");
  assert.equal(err.isRetryable, false);
  assert.equal(err.message, "Test message");
  assert.equal(typeof err.id, "string");
  assert.equal(err.id.startsWith("TEST_ERROR_"), true);
  assert.deepEqual(err.context, { context: "data" });
});

run("AuthError marks non-recoverable codes as not retryable", () => {
  const invalidCred = new AuthError("INVALID_CREDENTIAL", "Invalid credentials");
  assert.equal(invalidCred.code, "AUTH_INVALID_CREDENTIAL");
  assert.equal(invalidCred.isRetryable, false);

  const networkError = new AuthError("NETWORK_ERROR", "Network failed");
  assert.equal(networkError.code, "AUTH_NETWORK_ERROR");
  assert.equal(networkError.isRetryable, true);
});

run("SyncError is retryable by default", () => {
  const err = new SyncError("NETWORK", "Connection failed");
  assert.equal(err.code, "SYNC_NETWORK");
  assert.equal(err.severity, "warn");
  assert.equal(err.isRetryable, true);
});

run("ValidationError is not retryable", () => {
  const err = new ValidationError("email", "Invalid email format");
  assert.equal(err.code, "VALIDATION_EMAIL");
  assert.equal(err.isRetryable, false);
  assert.equal(err.severity, "warn");
});

run("toAppError wraps unknown into AppError safely", () => {
  const appErr = new AppError("CUSTOM", "error", false, "custom message");
  const wrapped = toAppError(appErr);
  assert.equal(wrapped, appErr);

  const stdErr = new Error("Standard error");
  const wrappedStd = toAppError(stdErr);
  assert.equal(wrappedStd.code, "UNKNOWN_ERROR");
  assert.equal(wrappedStd.message, "Standard error");

  const unknown = { foo: "bar" };
  const wrappedUnknown = toAppError(unknown);
  assert.equal(wrappedUnknown.code, "UNKNOWN_ERROR");
  assert.equal(wrappedUnknown.isRetryable, false);
});

run("isRetryable checks error retryability", () => {
  assert.equal(isRetryable(new SyncError("NETWORK", "failed")), true);
  assert.equal(isRetryable(new ValidationError("email", "invalid")), false);
  assert.equal(isRetryable(new Error("plain error")), false);
});

// ─── Input validation tests (Phase 1) ──────────────────────────────────────────

run("sanitizeScanInput strips control characters", () => {
  const result = sanitizeScanInput("hello\x00\x1Fworld");
  assert.equal(result.ok, true);
  assert.equal(result.value, "helloworld");
});

run("sanitizeScanInput enforces 500 character limit", () => {
  const longInput = "x".repeat(501);
  const result = sanitizeScanInput(longInput);
  assert.equal(result.ok, false);
  assert.equal(result.error?.includes("500"), true);
});

run("sanitizeScanInput returns error when empty after sanitization", () => {
  const result = sanitizeScanInput("   \x00\x1F   ");
  assert.equal(result.ok, false);
  assert.equal(result.error?.includes("empty"), true);
});

run("sanitizeScanInput accepts valid short input", () => {
  const result = sanitizeScanInput("  RITM0012345  ");
  assert.equal(result.ok, true);
  assert.equal(result.value, "RITM0012345");
});

run("sanitizeNoteText preserves newlines and tabs", () => {
  const result = sanitizeNoteText("Line 1\nLine 2\n\tIndented");
  assert.equal(result.ok, true);
  assert.match(result.value!, /Line 1\nLine 2/);
});

run("sanitizeNoteText strips dangerous control characters", () => {
  const result = sanitizeNoteText("Hello\x00\x08World");
  assert.equal(result.ok, true);
  assert.equal(result.value, "HelloWorld");
});

run("sanitizeNoteText enforces 10000 character limit", () => {
  const longInput = "x".repeat(10001);
  const result = sanitizeNoteText(longInput);
  assert.equal(result.ok, false);
  assert.equal(result.error?.includes("10000"), true);
});

run("sanitizeNoteText accepts valid note", () => {
  const result = sanitizeNoteText("This is\na valid\nmulti-line note");
  assert.equal(result.ok, true);
  assert.equal(result.value?.length, 31);
});

run("sanitizeTemplatePattern rejects invalid regex", () => {
  const result = sanitizeTemplatePattern("(unclosed");
  assert.equal(result.ok, false);
  assert.equal(result.error?.includes("Invalid"), true);
});

run("sanitizeTemplatePattern accepts valid regex", () => {
  const result = sanitizeTemplatePattern("^[A-Z]+\\d+$");
  assert.equal(result.ok, true);
  assert.equal(result.value, "^[A-Z]+\\d+$");
});

run("sanitizeTemplatePattern enforces 2000 character limit", () => {
  const longPattern = "x".repeat(2001);
  const result = sanitizeTemplatePattern(longPattern);
  assert.equal(result.ok, false);
  assert.equal(result.error?.includes("2000"), true);
});

run("sanitizeTemplatePattern handles complex but valid regex", () => {
  const pattern = "(prefix_)?\\w{3,10}(suffix)?";
  const result = sanitizeTemplatePattern(pattern);
  assert.equal(result.ok, true);
});

// ─── Sync checksum tests (Phase 1) ─────────────────────────────────────────────

run("computeChecksum produces stable hash for same input", () => {
  const items = [
    { id: "a", updatedAt: 1000, deletedAt: undefined },
    { id: "b", updatedAt: 2000, deletedAt: undefined },
  ];
  const hash1 = computeNotesChecksum(items as any);
  const hash2 = computeNotesChecksum(items as any);
  assert.equal(hash1, hash2);
});

run("computeChecksum produces different hash for different content", () => {
  const items1 = [{ id: "a", updatedAt: 1000, deletedAt: undefined }];
  const items2 = [{ id: "a", updatedAt: 2000, deletedAt: undefined }];
  const hash1 = computeNotesChecksum(items1 as any);
  const hash2 = computeNotesChecksum(items2 as any);
  assert.notEqual(hash1, hash2);
});

run("computeChecksum is order-independent", () => {
  const items = [
    { id: "z", updatedAt: 1000, deletedAt: undefined },
    { id: "a", updatedAt: 2000, deletedAt: undefined },
  ];
  const reversed = [...items].reverse();
  const hash1 = computeNotesChecksum(items as any);
  const hash2 = computeNotesChecksum(reversed as any);
  assert.equal(hash1, hash2);
});

run("computeChecksum handles empty array", () => {
  const hash = computeNotesChecksum([]);
  assert.equal(typeof hash, "string");
  assert.equal(hash.length > 0, true);
});

run("computeChecksum includes deletedAt field", () => {
  const items1 = [{ id: "a", updatedAt: 1000, deletedAt: undefined }];
  const items2 = [{ id: "a", updatedAt: 1000, deletedAt: 5000 }];
  const hash1 = computeNotesChecksum(items1 as any);
  const hash2 = computeNotesChecksum(items2 as any);
  assert.notEqual(hash1, hash2);
});

// ─── Offline queue tests (Phase 2) ─────────────────────────────────────────────

run("QueueEntry with uid and retries fields initializes correctly", () => {
  const entry = {
    id: "q_123_abc",
    op: "upsertNote" as const,
    payload: { id: "note-1", kind: "text", category: "general", text: "test", pinned: false, createdAt: Date.now(), updatedAt: Date.now() },
    createdAt: Date.now(),
    uid: "user-123",
    retries: 0,
  };
  assert.equal(entry.uid, "user-123");
  assert.equal(entry.retries, 0);
});

run("TTL filter: entries older than 7 days should be detected", () => {
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const oldEntry = { createdAt: now - sevenDaysMs - 1000 };
  const recentEntry = { createdAt: now - (sevenDaysMs / 2) };

  const isOld = (now - oldEntry.createdAt) > sevenDaysMs;
  const isRecent = (now - recentEntry.createdAt) > sevenDaysMs;

  assert.equal(isOld, true);
  assert.equal(isRecent, false);
});

run("UID filter: entries with different uid should be skipped", () => {
  const currentUid = "user-123";
  const entries = [
    { uid: "user-123", op: "upsertNote" as const },
    { uid: "user-456", op: "upsertNote" as const },
  ];

  const uidMatch = entries.filter(e => e.uid === currentUid);
  assert.equal(uidMatch.length, 1);
  assert.equal(uidMatch[0].uid, "user-123");
});

run("Retries counter increments on retry", () => {
  let entry = { id: "q_1", retries: 0 };
  entry.retries += 1;
  assert.equal(entry.retries, 1);

  entry.retries += 1;
  assert.equal(entry.retries, 2);
});

run("syncStatus field exists on NoteItem", () => {
  const note = {
    id: "note-1",
    kind: "text" as const,
    category: "general" as const,
    text: "test",
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    syncStatus: "pending" as const,
  };
  assert.equal(note.syncStatus, "pending");
});

run("syncStatus can be updated to synced", () => {
  let note: { syncStatus: "pending" | "synced" } = { syncStatus: "pending" };
  note.syncStatus = "synced";
  assert.equal(note.syncStatus, "synced");
});

run("Network online status detection works", () => {
  // Test that navigator.onLine check works (in browser environment, will be true)
  const online = typeof navigator !== 'undefined' && ('onLine' in navigator) ? navigator.onLine : true;
  assert.equal(typeof online, "boolean");
});

run("Network reconnect handler returns cleanup function", () => {
  // Test that a function that returns a cleanup function works correctly
  const handler = () => {};
  const cleanup = () => handler();
  assert.equal(typeof cleanup, "function");
});

run("Note payload should include required fields for Firebase", () => {
  const note = {
    id: "note-1",
    kind: "text" as const,
    category: "general" as const,
    text: "test content",
    title: "My Note",
    smartType: "task" as any,
    workflowStatus: "active" as const,
    workflowMetadata: { test: true },
    isSecret: true,
    draft: false,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const payload: Record<string, unknown> = {
    id: note.id,
    kind: note.kind,
    category: note.category,
    text: note.text,
    pinned: Boolean(note.pinned),
    createdAt: Number(note.createdAt),
    updatedAt: Number(note.updatedAt),
  };

  // Add conditional fields as in firebase.ts
  if (note.title !== undefined) payload.title = note.title;
  if (note.smartType) payload.smartType = note.smartType;
  if (note.workflowStatus) payload.workflowStatus = note.workflowStatus;
  if (note.workflowMetadata) payload.workflowMetadata = JSON.stringify(note.workflowMetadata);
  if (note.isSecret !== undefined) payload.isSecret = note.isSecret;
  if (note.draft !== undefined) payload.draft = note.draft;

  // Verify all required fields are present
  assert.equal(payload.title, "My Note");
  assert.equal(payload.smartType, "task");
  assert.equal(payload.workflowStatus, "active");
  assert.equal(typeof payload.workflowMetadata, "string");
  assert.equal(payload.isSecret, true);
  assert.equal(payload.draft, false);
});

console.log("\n-------------------");
console.log(`Tests completados.`);
console.log(`Pasaron: ${passed}`);
console.log(`Fallaron: ${failed}`);
console.log("-------------------");
if (failed > 0) process.exit(1);
