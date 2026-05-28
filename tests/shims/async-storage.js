// No-op AsyncStorage shim for Node.js test runner.
// The real package calls window.localStorage which doesn't exist in Node.
"use strict";
const store = new Map();
const AsyncStorage = {
  getItem:    async (key)        => store.get(key) ?? null,
  setItem:    async (key, value) => { store.set(key, value); },
  removeItem: async (key)        => { store.delete(key); },
  clear:      async ()           => { store.clear(); },
  getAllKeys:  async ()           => [...store.keys()],
};
module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
