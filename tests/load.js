/* Lädt die UI-unabhängigen Module in den globalen Namespace (für Node-Tests) */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..', 'js');
globalThis.PS = {};
for (const f of ['util', 'valves', 'parts', 'engine', 'doc', 'examples']) {
  const file = path.join(root, f + '.js');
  if (!fs.existsSync(file)) continue;
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}
module.exports = globalThis.PS;
