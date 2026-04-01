import assert from "node:assert/strict";

import { classify } from "../src/core/classify";
import { applyImportedBackup, buildBackupBundle, parseBackupBundle } from "../src/core/backup";
import { generateBarcode } from "../src/core/barcode";
import { extractFields } from "../src/core/extract";
import { historyKey } from "../src/core/history";
import { defaultSettings, piLogic } from "../src/core/settings";

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

console.log("\n-------------------");
console.log(`Tests completados.`);
console.log(`Pasaron: ${passed}`);
console.log(`Fallaron: ${failed}`);
console.log("-------------------");
if (failed > 0) process.exit(1);
