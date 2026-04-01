const fs = require('fs');
const path = require('path');

const target = path.join(__dirname, '..', 'node_modules', '@expo', 'ngrok', 'src', 'client.js');

function patchSource(source) {
  let output = source;

  output = output.replace(
    'const response = JSON.parse(error.response.body);',
    'const response = JSON.parse((error.response && error.response.body) || "{}");'
  );

  output = output.replace(
    '        clientError = new NgrokClientError(\n          error.response.body,\n          error.response,\n          error.response.body\n        );',
    '        clientError = new NgrokClientError(\n          (error.response && error.response.body) || error.message || "Ngrok request failed",\n          error.response || null,\n          (error.response && error.response.body) || error.message || "Ngrok request failed"\n        );'
  );

  output = output.replace(
    '      const response = JSON.parse(error.response.body);',
    '      const response = JSON.parse((error.response && error.response.body) || "{}");'
  );

  output = output.replace(
    '      throw new NgrokClientError(response.msg, error.response, response);',
    '      throw new NgrokClientError((response && response.msg) || error.message || "Ngrok request failed", error.response || null, response);'
  );

  return output;
}

if (!fs.existsSync(target)) {
  process.exit(0);
}

const original = fs.readFileSync(target, 'utf8');
const patched = patchSource(original);

if (patched !== original) {
  fs.writeFileSync(target, patched, 'utf8');
  console.log('[patch-ngrok] patched @expo/ngrok/src/client.js');
} else {
  console.log('[patch-ngrok] no changes needed');
}
