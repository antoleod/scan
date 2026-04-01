const fs = require('fs');
const path = require('path');

const pluginPath = path.join(process.cwd(), 'node_modules', 'react-native-worklets', 'plugin', 'index.js');
const pkgPath = path.join(process.cwd(), 'node_modules', 'react-native-worklets', 'package.json');
const entryPath = path.join(process.cwd(), 'node_modules', 'react-native-worklets', 'index.js');

if (fs.existsSync(pluginPath)) {
  process.exit(0);
}

fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
fs.writeFileSync(
  pkgPath,
  JSON.stringify({ name: 'react-native-worklets', version: '0.8.0', main: 'index.js' }, null, 2)
);
fs.writeFileSync(
  pluginPath,
  "module.exports = function () { return { name: 'react-native-worklets-plugin-shim', visitor: {} }; };\n"
);
fs.writeFileSync(entryPath, 'module.exports = {};\n');
console.log('[postinstall] created local react-native-worklets plugin shim');
