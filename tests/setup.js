// Pre-loads shims for modules that are unavailable in Node.js (no browser, no native).
// Loaded via `node -r tests/setup.js` before the compiled test runner.
"use strict";
const Module = require("module");
const path = require("path");

const SHIMS = {
  "react-native": path.resolve(__dirname, "shims/react-native.js"),
  "@react-native-async-storage/async-storage": path.resolve(__dirname, "shims/async-storage.js"),
};

const _resolveFilename = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, parent, isMain, options) {
  if (Object.prototype.hasOwnProperty.call(SHIMS, request)) {
    return SHIMS[request];
  }
  return _resolveFilename(request, parent, isMain, options);
};
