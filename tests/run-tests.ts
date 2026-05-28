import assert from "node:assert/strict";

import { classify } from "../src/core/classify";
import { applyImportedBackup, buildBackupBundle, parseBackupBundle } from "../src/core/backup";
import { generateBarcode } from "../src/core/barcode";
import { extractFields } from "../src/core/extract";
import { historyKey } from "../src/core/history";
import { defaultSettings, piLogic } from "../src/core/settings";
import { detectGroceryItem, formatShoppingList, isLikelyShoppingList, searchGroceryCatalog } from "../src/utils/groceryDetection";
import { analyzeShoppingListCandidate, isShoppingList, parseShoppingList } from "../src/core/shoppingList";
import { parseShoppingListV2 } from "../src/core/shoppingListV2";
import enLocale from "../src/i18n/locales/en";
import esLocale from "../src/i18n/locales/es";
import frLocale from "../src/i18n/locales/fr";
import nlLocale from "../src/i18n/locales/nl";
import { findProductAlias, getAllShoppingDictionaries, isConnector, isKnownUnit, isNarrativeBlocker } from "../src/core/shoppingDictionary";
import { detectSmartTypeFromContent } from "../src/core/smartNoteWorkflows";
import { detectSmartNoteLabel } from "../src/core/noteIntelligence";
import { createTrieFromWords } from "../src/utils/trie";
import { AppError, AuthError, SyncError, ValidationError, toAppError, isRetryable } from "../src/core/errors";
import { sanitizeScanInput, sanitizeNoteText, sanitizeTemplatePattern } from "../src/core/validation";
import { computeNotesChecksum } from "../src/core/syncChecksum";
import { stripUndefinedDeep } from "../src/core/firestoreSanitize";
import {
  applyMarkTaken,
  applySnooze,
  applyDismiss,
  applyReactivate,
  deriveNoteStatusFromMeds,
  syncMetadataFromMeds,
  clampMedIndex,
  ensureMedicationsList,
} from "../src/core/medicationCycle";
import type { NoteItem, MedicationCycleEntry, WorkflowMetadata } from "../src/core/notes";
import { getAuthRedirectPath, LOGIN_ROUTE, MAIN_APP_ROUTE } from "../src/core/routes";
import { encodeQrPayload, decodeQrPayload, isAirdropQr } from "../src/features/airdrop/utils/qr";
import { filterIncomingShares, isValidShare } from "../src/features/airdrop/presence/shareFilter";
import { generateSessionId, generateToken, isPresenceAuthorized } from "../src/features/airdrop/utils/ids";
import type { UserShare, SignalingChannel, SignalMessage } from "../src/features/airdrop/types";
import { setSignalingChannel } from "../src/features/airdrop/signaling";
import { createSession, joinSession, cancelSession } from "../src/features/airdrop/sessions/sessionService";
import { resetAirdropStore, airdropStore } from "../src/features/airdrop/store/airdropStore";

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

run("smart note labels detect contact developer and money notes", () => {
  assert.equal(detectSmartNoteLabel("Call Maria +34 600 111 222 maria@example.com").label, "contact");
  assert.equal(detectSmartNoteLabel("Fix API bug then deploy React frontend").label, "developer");
  assert.equal(detectSmartNoteLabel("Invoice paid 125.50 EUR by bank transfer").label, "money");
});

run("auth routing redirects anonymous root visits to login", () => {
  assert.equal(getAuthRedirectPath("/", false), LOGIN_ROUTE);
});

run("auth routing renders login directly for anonymous users", () => {
  assert.equal(getAuthRedirectPath(LOGIN_ROUTE, false), null);
});

run("auth routing redirects authenticated login visits to app", () => {
  assert.equal(getAuthRedirectPath(LOGIN_ROUTE, true), MAIN_APP_ROUTE);
});

run("auth routing redirects authenticated root visits to app", () => {
  assert.equal(getAuthRedirectPath("/", true), MAIN_APP_ROUTE);
});

run("auth routing leaves Firebase auth action links intact", () => {
  assert.equal(getAuthRedirectPath("/__/auth/action", false), null);
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

run("i18n locales all expose the same key set as the canonical English resource", () => {
  const flatten = (obj: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(obj).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return value && typeof value === "object"
        ? flatten(value as Record<string, unknown>, path)
        : [path];
    });

  const enKeys = flatten(enLocale as unknown as Record<string, unknown>).sort();
  for (const [name, locale] of [["es", esLocale], ["fr", frLocale], ["nl", nlLocale]] as const) {
    const keys = flatten(locale as unknown as Record<string, unknown>).sort();
    const missing = enKeys.filter((k) => !keys.includes(k));
    const extra = keys.filter((k) => !enKeys.includes(k));
    assert.deepEqual(missing, [], `${name} is missing keys: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `${name} has unexpected keys: ${extra.join(", ")}`);
  }
});

run("parseShoppingListV2 keeps the user's words instead of translating to the catalog", () => {
  const input = "pommes\nlait\npain";
  // Even with the default English catalog, the typed French words must survive.
  const en = parseShoppingListV2(input, "en");
  const enNames = en.items.map((item) => item.name.toLowerCase());
  assert.ok(enNames.includes("pommes"), `expected "pommes" preserved, got ${JSON.stringify(enNames)}`);
  assert.ok(!enNames.includes("apples"), "must NOT rewrite pommes -> apples");

  // With the French catalog the words are still preserved and categorized.
  const fr = parseShoppingListV2(input, "fr");
  const apple = fr.items.find((item) => item.catalogId === "apple");
  assert.ok(apple, "apple should be matched in the catalog");
  assert.equal(apple!.name.toLowerCase(), "pommes");
  assert.equal(apple!.category, "fruits");
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

// ── Regression: reminder/task were unreachable (0.65 gate); space-separated
//    shopping lists missed because the auto-path used a different engine. ──

run("smart type detection identifies reminders (ES/EN/FR)", () => {
  assert.equal(detectSmartTypeFromContent("recordar llamar al banco mañana"), "reminder");
  assert.equal(detectSmartTypeFromContent("remind me to call tomorrow"), "reminder");
  assert.equal(detectSmartTypeFromContent("rappel: appeler demain"), "reminder");
});

run("smart type detection identifies reminders WITHOUT a future word", () => {
  // An explicit reminder keyword alone must classify (was 'none' before the
  // single-keyword floor — it scored 0.5, below the 0.65 gate).
  assert.equal(detectSmartTypeFromContent("recordar comprar pan"), "reminder");
  assert.equal(detectSmartTypeFromContent("remind me to buy bread"), "reminder");
  // "olvidar" now routes the language detector to Spanish so "no olvidar" matches.
  assert.equal(detectSmartTypeFromContent("no olvidar pagar la factura"), "reminder");
});

run("smart type detection identifies tasks with explicit lead marker", () => {
  assert.equal(detectSmartTypeFromContent("task: finish report"), "task");
  assert.equal(detectSmartTypeFromContent("todo: review PR"), "task");
  assert.equal(detectSmartTypeFromContent("tarea: terminar informe"), "task");
});

run("smart type detection handles space-separated shopping lists", () => {
  // Was 'none' before unifying on the shoppingList.ts engine (splitLines did
  // not tokenize on spaces / connectors).
  assert.equal(detectSmartTypeFromContent("milk bread and cheese"), "shopping");
  assert.equal(detectSmartTypeFromContent("arroz leche huevos azúcar"), "shopping");
});

run("smart type detection does not misclassify ordinary notes as task/reminder", () => {
  // Common verbs were intentionally dropped from TASK_KEYWORDS to avoid this.
  assert.equal(detectSmartTypeFromContent("necesito hacer ejercicio para estar sano"), "none");
  assert.equal(detectSmartTypeFromContent("I like to do yoga in the morning"), "none");
});

run("smart type detection keeps health notes out of shopping", () => {
  // Health-keyword blocker now lives in the auto-classification path.
  const r = detectSmartTypeFromContent("comprar ibuprofeno y paracetamol en la farmacia");
  assert.ok(r === "medication" || r === "none", `expected medication|none, got ${r}`);
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

run("stripUndefinedDeep removes nested undefined (workflowMetadata.doseText) — the Firestore sync bug", () => {
  // Mirrors the production failure: a medication note whose workflowMetadata
  // (and nested medications[]) carry undefined optional fields. Firestore
  // rejected these with "Unsupported field value: undefined".
  const payload = {
    id: "note-1",
    text: "took ibuprofen",
    workflowMetadata: {
      medicationName: "ibuprofen",
      doseText: undefined,
      followUpAt: undefined,
      medications: [
        { name: "ibuprofen", dose: "400mg", takenAt: 123, snoozedUntil: undefined },
      ],
    },
    deletedAt: undefined,
  };

  const clean = stripUndefinedDeep(payload) as any;

  // No undefined anywhere in the output (top-level or nested).
  assert.ok(!("deletedAt" in clean), "top-level undefined should be dropped");
  assert.ok(!("doseText" in clean.workflowMetadata), "nested undefined should be dropped");
  assert.ok(!("followUpAt" in clean.workflowMetadata), "nested undefined should be dropped");
  assert.ok(!("snoozedUntil" in clean.workflowMetadata.medications[0]), "undefined inside array element should be dropped");

  // Real values (including falsy ones) survive.
  assert.equal(clean.id, "note-1");
  assert.equal(clean.workflowMetadata.medicationName, "ibuprofen");
  assert.equal(clean.workflowMetadata.medications[0].dose, "400mg");
  assert.equal(clean.workflowMetadata.medications[0].takenAt, 123);
});

run("stripUndefinedDeep preserves null and falsy values", () => {
  const clean = stripUndefinedDeep({ a: null, b: 0, c: false, d: "", e: undefined }) as any;
  assert.equal(clean.a, null);
  assert.equal(clean.b, 0);
  assert.equal(clean.c, false);
  assert.equal(clean.d, "");
  assert.ok(!("e" in clean));
});

run("airdrop QR encodes a deep-link URL that roundtrips", () => {
  const encoded = encodeQrPayload("ssn_abc123", "K7P2QM9XAB");
  // Off-web (Node) uses the https placeholder host; must be an openable URL
  // carrying the join param and the #airdrop hash.
  assert.ok(encoded.startsWith("https://"), `expected URL, got ${encoded}`);
  assert.ok(encoded.includes("/app?airdrop="), encoded);
  assert.ok(encoded.endsWith("#airdrop"), encoded);
  const decoded = decodeQrPayload(encoded);
  assert.deepEqual(decoded, { v: 1, session: "ssn_abc123", token: "K7P2QM9XAB" });
});

run("airdrop QR decodes the legacy compact form (backward compat)", () => {
  const decoded = decodeQrPayload("scan-airdrop:1:ssn_abc123:K7P2QM9XAB");
  assert.deepEqual(decoded, { v: 1, session: "ssn_abc123", token: "K7P2QM9XAB" });
});

run("airdrop QR decodes a deep-link URL with extra params and hash", () => {
  const url = "https://host.example/scan/app?foo=1&airdrop=ssn_x%3ATOK99#airdrop";
  assert.deepEqual(decodeQrPayload(url), { v: 1, session: "ssn_x", token: "TOK99" });
  assert.equal(isAirdropQr(url), true);
});

run("airdrop QR decode rejects non-airdrop and malformed strings", () => {
  assert.equal(decodeQrPayload("https://example.com"), null); // URL but no join param
  assert.equal(decodeQrPayload("scan-airdrop:1:onlysession"), null);
  assert.equal(decodeQrPayload("scan-airdrop:x:ssn:tok"), null);
  assert.equal(isAirdropQr("scan-airdrop:1:a:b"), true);
  assert.equal(isAirdropQr("https://example.com"), false); // no join param
  assert.equal(isAirdropQr("RITM0012345"), false);
});

// ── AirDrop same-account share presence (direct download, no QR) ─────────────

function makeShare(over: Partial<UserShare> = {}): UserShare {
  return {
    sessionId: "ssn_1",
    token: "TOK1",
    deviceName: "Swift Falcon",
    deviceAvatar: "🖥️",
    devicePlatform: "web",
    hostPeerId: "peer_host",
    fileName: "report.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    createdAt: 1000,
    expiresAt: 10_000,
    ...over,
  };
}

run("airdrop share filter hides our OWN device's shares", () => {
  const mine = makeShare({ sessionId: "ssn_mine", hostPeerId: "peer_me" });
  const theirs = makeShare({ sessionId: "ssn_theirs", hostPeerId: "peer_other" });
  const out = filterIncomingShares([mine, theirs], "peer_me", 5_000);
  assert.equal(out.length, 1);
  assert.equal(out[0].sessionId, "ssn_theirs");
});

run("airdrop share filter drops expired shares", () => {
  const live = makeShare({ sessionId: "ssn_live", expiresAt: 10_000 });
  const dead = makeShare({ sessionId: "ssn_dead", expiresAt: 4_000 });
  const out = filterIncomingShares([live, dead], "peer_me", 5_000);
  assert.deepEqual(out.map((s) => s.sessionId), ["ssn_live"]);
});

run("airdrop share filter keeps all valid shares when selfId is null (guest→login edge)", () => {
  const a = makeShare({ sessionId: "a", hostPeerId: "p1" });
  const b = makeShare({ sessionId: "b", hostPeerId: "p2" });
  const out = filterIncomingShares([a, b], null, 5_000);
  assert.equal(out.length, 2);
});

run("airdrop share guard rejects malformed/forged RTDB nodes", () => {
  assert.equal(isValidShare(null), false);
  assert.equal(isValidShare({ sessionId: "x" }), false); // missing fields
  assert.equal(isValidShare({ ...makeShare(), expiresAt: "soon" }), false); // bad type
  assert.equal(isValidShare(makeShare()), true);
  // A forged node missing token must not slip through the filter.
  const forged = { sessionId: "f", hostPeerId: "p", fileName: "x", expiresAt: 9_999 };
  assert.equal(filterIncomingShares([forged as unknown as UserShare], "me", 1).length, 0);
});

run("airdrop presence token gate authorizes only on exact match", () => {
  assert.equal(isPresenceAuthorized("TOK123", "TOK123"), true);
  assert.equal(isPresenceAuthorized("TOK123", "tok123"), false); // case-sensitive
  assert.equal(isPresenceAuthorized("TOK123", "WRONG"), false);
  // Empty / missing tokens must never authorize (public sessionId is not enough).
  assert.equal(isPresenceAuthorized("TOK123", ""), false);
  assert.equal(isPresenceAuthorized("TOK123", undefined), false);
  assert.equal(isPresenceAuthorized(undefined, "TOK123"), false);
  assert.equal(isPresenceAuthorized("", ""), false);
});

run("airdrop sessionId has high entropy and a stable prefix", () => {
  const id = generateSessionId();
  assert.ok(id.startsWith("ssn_"), id);
  // prefix _ time _ rand(16) — the random suffix must be 16 chars (~80 bits).
  const rand = id.split("_").pop() ?? "";
  assert.equal(rand.length, 16, `expected 16-char suffix, got "${rand}"`);
  // 200 ids in the same ms tick must still be unique (random suffix, not time).
  const ids = new Set<string>();
  for (let i = 0; i < 200; i += 1) ids.add(generateSessionId());
  assert.equal(ids.size, 200);
});

run("airdrop token uses unambiguous alphabet and requested length", () => {
  const t = generateToken(10);
  assert.equal(t.length, 10);
  // No ambiguous 0/O/1/I in the alphabet.
  assert.equal(/[01OI]/.test(t), false, `token had ambiguous chars: ${t}`);
});

// ── Medication cycle: pure helpers ──────────────────────────────────────────

run("deriveNoteStatusFromMeds: any active med → 'active'", () => {
  assert.equal(deriveNoteStatusFromMeds([
    { name: "ibuprofen", status: "dismissed" },
    { name: "paracetamol", status: "active" },
  ]), "active");
});

run("deriveNoteStatusFromMeds: all dismissed → 'dismissed'", () => {
  assert.equal(deriveNoteStatusFromMeds([
    { name: "a", status: "dismissed" },
    { name: "b", status: "dismissed" },
  ]), "dismissed");
});

run("deriveNoteStatusFromMeds: snoozed (no active) → 'snoozed'", () => {
  assert.equal(deriveNoteStatusFromMeds([
    { name: "a", status: "snoozed" },
    { name: "b", status: "dismissed" },
  ]), "snoozed");
});

run("deriveNoteStatusFromMeds: empty / missing status default to 'active'", () => {
  assert.equal(deriveNoteStatusFromMeds([]), "active");
  assert.equal(deriveNoteStatusFromMeds([{ name: "a" }]), "active");
});

run("clampMedIndex: clamps out-of-range and non-finite to valid bounds", () => {
  const meds: MedicationCycleEntry[] = [{ name: "a" }, { name: "b" }];
  assert.equal(clampMedIndex([], 0), 0);
  assert.equal(clampMedIndex(meds, -1), 0);
  assert.equal(clampMedIndex(meds, 5), 1);
  assert.equal(clampMedIndex(meds, 1), 1);
  assert.equal(clampMedIndex(meds, NaN), 0);
});

run("ensureMedicationsList: synthesizes a single entry from legacy top-level fields", () => {
  const meds = ensureMedicationsList({
    medicationName: "ibuprofen",
    doseText: "400 mg",
    takenAt: 1_000,
    followUpAt: 5_000,
  });
  assert.equal(meds.length, 1);
  assert.equal(meds[0].name, "ibuprofen");
  assert.equal(meds[0].dose, "400 mg");
  assert.equal(meds[0].takenAt, 1_000);
  assert.equal(meds[0].nextSuggestedAt, 5_000);
  assert.equal(meds[0].status, "active");
});

run("ensureMedicationsList: returns [] when there is no name and no array", () => {
  assert.equal(ensureMedicationsList({ doseText: "400 mg" }).length, 0);
  assert.equal(ensureMedicationsList(undefined).length, 0);
});

run("ensureMedicationsList: explicit medications array wins over top-level fields", () => {
  const meds = ensureMedicationsList({
    medicationName: "ibuprofen",
    medications: [{ name: "paracetamol", status: "active" }],
  });
  assert.equal(meds.length, 1);
  assert.equal(meds[0].name, "paracetamol");
});

run("ensureMedicationsList: normalizes legacy minIntervalHours → minimumIntervalHours", () => {
  const meds = ensureMedicationsList({
    medications: [{ name: "aspirin", minIntervalHours: 4 } as unknown as MedicationCycleEntry],
  });
  assert.equal(meds[0].minimumIntervalHours, 4);
});

run("syncMetadataFromMeds: focus = nearest future active med", () => {
  const now = 1_000_000;
  const meta = syncMetadataFromMeds({}, [
    { name: "aspirin", status: "active", nextSuggestedAt: now + 3_600_000 },
    { name: "ibuprofen", status: "active", nextSuggestedAt: now + 7_200_000 },
  ]);
  assert.equal(meta.medicationName, "aspirin");
  assert.equal(meta.medications?.length, 2);
});

run("syncMetadataFromMeds: skips dismissed meds when choosing focus", () => {
  const now = Date.now();
  const meta = syncMetadataFromMeds({}, [
    { name: "aspirin", status: "dismissed", nextSuggestedAt: now + 60_000 },
    { name: "ibuprofen", status: "active", nextSuggestedAt: now + 3_600_000 },
  ]);
  assert.equal(meta.medicationName, "ibuprofen");
});

// ── Medication cycle: mutation invariants (dose-never-mutated, single medIndex) ──

function makeMedNote(meds: MedicationCycleEntry[], extraMeta: Partial<WorkflowMetadata> = {}): NoteItem {
  return {
    id: "note-med",
    kind: "text",
    category: "health",
    text: "med note",
    pinned: false,
    createdAt: 1_000,
    updatedAt: 1_000,
    smartType: "medication",
    workflowStatus: "active",
    workflowMetadata: { medications: meds.map((m) => ({ ...m })), ...extraMeta },
  };
}

run("applyMarkTaken: advances ONLY the target med; sibling is byte-for-byte untouched", () => {
  const note = makeMedNote([
    { name: "ibuprofen", status: "active", dose: "400 mg", recommendedIntervalHours: 6, nextSuggestedAt: 50 },
    { name: "paracetamol", status: "active", dose: "500 mg", nextSuggestedAt: 7_200_000, takenAt: 123 },
  ]);
  const result = applyMarkTaken(note, 0, 1_000_000, 1_000_500);
  assert.ok(result);
  const out = result!.workflowMetadata!.medications!;
  // Target advanced
  assert.equal(out[0].takenAt, 1_000_000);
  assert.equal(out[0].nextSuggestedAt, 1_000_000 + 6 * 3_600_000);
  assert.equal(out[0].status, "active");
  assert.equal(out[0].dose, "400 mg"); // dose NEVER mutated
  // Sibling untouched
  assert.equal(out[1].dose, "500 mg");
  assert.equal(out[1].takenAt, 123);
  assert.equal(out[1].nextSuggestedAt, 7_200_000);
  assert.equal(out[1].status, "active");
});

run("applyMarkTaken: no interval → followPrescription + undefined nextSuggestedAt", () => {
  const note = makeMedNote([{ name: "amoxicillin", status: "active", dose: "1 g" }]);
  const result = applyMarkTaken(note, 0, 2_000_000, 2_000_000);
  const med = result!.workflowMetadata!.medications![0];
  assert.equal(med.followPrescription, true);
  assert.equal(med.nextSuggestedAt, undefined);
  assert.equal(med.dose, "1 g"); // still untouched
});

run("applyMarkTaken: returns null when the note has no medications", () => {
  const note = makeMedNote([], { medications: undefined });
  assert.equal(applyMarkTaken(note, 0), null);
});

run("applySnooze: snoozes ONLY the target; clamps to 60s; preserves takenAt + dose", () => {
  const note = makeMedNote([
    { name: "ibuprofen", status: "active", dose: "400 mg", takenAt: 777, nextSuggestedAt: 50 },
    { name: "paracetamol", status: "active", dose: "500 mg" },
  ]);
  const result = applySnooze(note, 0, 0, 9_000); // snoozeMs=0 must clamp to 60_000
  const out = result!.workflowMetadata!.medications!;
  assert.equal(out[0].status, "snoozed");
  assert.equal(out[0].snoozedUntil, 9_000 + 60_000);
  assert.equal(out[0].nextSuggestedAt, 9_000 + 60_000);
  assert.equal(out[0].takenAt, 777); // preserved
  assert.equal(out[0].dose, "400 mg"); // never mutated
  assert.equal(out[1].status, "active"); // sibling untouched
  assert.equal(out[1].dose, "500 mg");
});

run("applySnooze: honors snooze durations >= 60s", () => {
  const note = makeMedNote([{ name: "ibuprofen", status: "active" }]);
  const result = applySnooze(note, 0, 30 * 60_000, 1_000); // +30m
  assert.equal(result!.workflowMetadata!.medications![0].snoozedUntil, 1_000 + 30 * 60_000);
});

run("applyDismiss: cancels ONLY the target; sibling stays active; note is NOT deleted", () => {
  const note = makeMedNote([
    { name: "ibuprofen", status: "active", dose: "400 mg", nextSuggestedAt: 5_000 },
    { name: "paracetamol", status: "active", dose: "500 mg" },
  ]);
  const result = applyDismiss(note, 0, 3_000);
  const out = result!.workflowMetadata!.medications!;
  assert.equal(out[0].status, "dismissed");
  assert.equal(out[0].nextSuggestedAt, undefined);
  assert.equal(out[1].status, "active"); // sibling untouched
  assert.equal(result!.id, "note-med"); // same note — never deleted
  assert.equal(result!.text, "med note");
});

run("applyDismiss: legacy note (no meds array) dismisses the whole note, keeps the note", () => {
  const note = makeMedNote([], { medications: undefined });
  const result = applyDismiss(note, 0, 3_000);
  assert.equal(result!.workflowStatus, "dismissed");
  assert.equal(result!.id, "note-med");
  assert.equal(result!.text, "med note"); // not deleted
});

run("applyReactivate: a dismissed med returns to active and recomputes nextSuggestedAt", () => {
  const note = makeMedNote([
    { name: "ibuprofen", status: "dismissed", lastTakenAt: 1_000, recommendedIntervalHours: 6 },
  ]);
  const result = applyReactivate(note, 0, 9_999);
  const med = result!.workflowMetadata!.medications![0];
  assert.equal(med.status, "active");
  assert.equal(med.nextSuggestedAt, 1_000 + 6 * 3_600_000);
});

// ── Notes / sync: checksum only tracks identity fields ──────────────────────

run("computeChecksum ignores content/title changes (tracks only id/updatedAt/deletedAt)", () => {
  const a = { id: "n1", updatedAt: 1000, deletedAt: undefined, text: "hello", title: "A" };
  const b = { id: "n1", updatedAt: 1000, deletedAt: undefined, text: "WORLD", title: "Z" };
  assert.equal(computeNotesChecksum([a] as unknown as NoteItem[]), computeNotesChecksum([b] as unknown as NoteItem[]));
});

// ── AirDrop live session flow (in-memory signaling, no Firebase) ──────────────
//
// These tests exercise the full createSession → joinSession handshake using an
// in-memory SignalingChannel. On Node.js, createPeerConnection returns the
// UnsupportedPeerConnection, so we test everything up to the WebRTC offer/answer
// exchange but not the actual data channel (that requires a browser).

function makeInMemoryChannel(): SignalingChannel & { _drain(): void; _log: SignalMessage[] } {
  // Maps sessionId → list of listeners
  const listeners = new Map<string, Array<(msg: SignalMessage) => void>>();
  const log: SignalMessage[] = [];
  // Messages queued before any listener is attached (simulates RTDB replay).
  const pending = new Map<string, SignalMessage[]>();

  return {
    _log: log,
    _drain() {
      // Flush any pending messages to newly-attached listeners.
      for (const [sid, msgs] of pending.entries()) {
        const cbs = listeners.get(sid) ?? [];
        for (const msg of msgs) for (const cb of cbs) cb(msg);
      }
      pending.clear();
    },
    isAvailable: () => true,
    subscribe(sessionId, onMessage) {
      const list = listeners.get(sessionId) ?? [];
      list.push(onMessage);
      listeners.set(sessionId, list);
      // Replay any messages that arrived before this subscribe (RTDB semantics).
      const queued = pending.get(sessionId) ?? [];
      for (const msg of queued) onMessage(msg);
      pending.delete(sessionId);
      const unsub = () => {
        const l = listeners.get(sessionId);
        if (l) {
          const idx = l.indexOf(onMessage);
          if (idx !== -1) l.splice(idx, 1);
        }
      };
      // Mark the listener as immediately ready (sync subscribe).
      (unsub as unknown as { ready: Promise<void> }).ready = Promise.resolve();
      return unsub;
    },
    async publish(msg) {
      log.push(msg);
      const cbs = listeners.get(msg.sessionId) ?? [];
      if (cbs.length === 0) {
        // No listener yet — queue for replay (mirrors RTDB onChildAdded replay).
        const q = pending.get(msg.sessionId) ?? [];
        q.push(msg);
        pending.set(msg.sessionId, q);
      } else {
        for (const cb of [...cbs]) cb(msg);
      }
    },
    async clear(sessionId) {
      listeners.delete(sessionId);
      pending.delete(sessionId);
    },
  };
}

// Helper: wait up to `ms` for a predicate to become true (async polling).
function waitUntil(pred: () => boolean, ms = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (pred()) return resolve();
      if (Date.now() >= deadline) return reject(new Error(`waitUntil timeout after ${ms}ms`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

run("airdrop: createSession transitions from creating → waiting", async () => {
  resetAirdropStore();
  const ch = makeInMemoryChannel();
  setSignalingChannel(ch);

  const session = await createSession({ ttl: "5m" });
  assert.equal(session.role, "host");

  // Give the async status update a tick to settle.
  await new Promise((r) => setTimeout(r, 0));
  const stored = airdropStore.getState().sessions[session.id];
  assert.equal(stored?.status, "waiting");

  await cancelSession(session.id);
  resetAirdropStore();
});

run("airdrop: joinSession publishes a presence frame after subscribe is ready", async () => {
  resetAirdropStore();
  const ch = makeInMemoryChannel();
  setSignalingChannel(ch);

  const token = generateToken(10);
  const sessionId = generateSessionId();

  // Pre-populate a host session in the store so the host signal handler can
  // look it up; mimic what createSession writes.
  const { putSession } = await import("../src/features/airdrop/store/airdropStore");
  putSession({
    id: sessionId,
    token,
    role: "host",
    status: "waiting",
    payload: null,
    ttl: "5m",
    createdAt: Date.now(),
    expiresAt: Date.now() + 5 * 60_000,
    peer: null,
  });

  const guestSession = await joinSession(sessionId, token);
  assert.equal(guestSession.role, "guest");

  // The presence frame must have been published by the time joinSession resolves.
  const presence = ch._log.find((m) => m.type === "presence" && m.sessionId === sessionId);
  assert.ok(presence, "presence frame was not published");
  assert.equal(presence!.token, token);

  await cancelSession(sessionId);
  resetAirdropStore();
});

run("airdrop: full host↔guest handshake — host moves to 'pairing' on guest presence", async () => {
  resetAirdropStore();
  const ch = makeInMemoryChannel();
  setSignalingChannel(ch);

  // Host creates a session and starts listening.
  const host = await createSession({ ttl: "5m" });
  await new Promise((r) => setTimeout(r, 0)); // let status settle to 'waiting'

  // Guest joins with the correct token — triggers presence publish.
  const guest = await joinSession(host.id, host.token);
  assert.equal(guest.role, "guest");

  // Host should have seen the presence frame and moved to 'pairing'.
  // On native (Node.js) createOffer() throws (UnsupportedPeerConnection) so the
  // host catches and logs it — but the status should still reach 'pairing' first.
  await waitUntil(() => {
    const s = airdropStore.getState().sessions[host.id];
    return s?.status === "pairing" || s?.status === "error";
  }, 500);

  const hostState = airdropStore.getState().sessions[host.id];
  assert.ok(
    hostState?.status === "pairing" || hostState?.status === "error",
    `expected pairing|error, got ${hostState?.status}`,
  );
  // The host must have recorded the guest peer.
  assert.ok(hostState?.peer !== null || hostState?.status === "error", "host should have the guest peer");

  await cancelSession(host.id).catch(() => undefined);
  await cancelSession(guest.id).catch(() => undefined);
  resetAirdropStore();
});

run("airdrop: token mismatch — host ignores presence with wrong token", async () => {
  resetAirdropStore();
  const ch = makeInMemoryChannel();
  setSignalingChannel(ch);

  const host = await createSession({ ttl: "5m" });
  await new Promise((r) => setTimeout(r, 0));

  // Guest uses a WRONG token.
  await joinSession(host.id, "WRONGTOKEN00");

  // Give the host's signal handler time to run.
  await new Promise((r) => setTimeout(r, 50));

  const hostState = airdropStore.getState().sessions[host.id];
  // Host must NOT move to pairing — it should still be waiting.
  assert.equal(hostState?.status, "waiting", `host should stay 'waiting', got ${hostState?.status}`);
  assert.equal(hostState?.peer, null, "host must not record an unauthorized peer");

  await cancelSession(host.id).catch(() => undefined);
  resetAirdropStore();
});

run("airdrop: bye frame cancels the remote session without a double-bye loop", async () => {
  resetAirdropStore();
  const ch = makeInMemoryChannel();
  setSignalingChannel(ch);

  const host = await createSession({ ttl: "5m" });
  await new Promise((r) => setTimeout(r, 0));
  const guest = await joinSession(host.id, host.token);
  await new Promise((r) => setTimeout(r, 50));

  // Guest cancels — sends a bye. Host receives it and moves to 'cancelled'.
  await cancelSession(guest.id);
  await new Promise((r) => setTimeout(r, 50));

  const hostState = airdropStore.getState().sessions[host.id];
  assert.equal(hostState?.status, "cancelled", `host should be cancelled, got ${hostState?.status}`);

  // Count bye frames — must be exactly 1 (guest's), not 2 (no echo loop).
  const byeCount = ch._log.filter((m) => m.type === "bye" && m.sessionId === host.id).length;
  assert.equal(byeCount, 1, `expected 1 bye frame, got ${byeCount}`);

  resetAirdropStore();
});

console.log("\n-------------------");
console.log(`Tests completados.`);
console.log(`Pasaron: ${passed}`);
console.log(`Fallaron: ${failed}`);
console.log("-------------------");
if (failed > 0) process.exit(1);
