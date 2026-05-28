// Minimal react-native shim for the Node.js test runner.
// Only mocks the APIs actually used by the AirDrop modules under test.
"use strict";
const Platform = { OS: "web" };
module.exports = { Platform, default: { Platform } };
