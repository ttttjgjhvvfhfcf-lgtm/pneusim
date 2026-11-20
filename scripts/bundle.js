#!/usr/bin/env node
/* Bündelt die App zu EINER HTML-Datei (CSS und JS inline).
 *   node scripts/bundle.js [ausgabe.html] [--fragment]
 * --fragment: ohne <!doctype>/<html>/<head>/<body>-Rahmen (für Hosting-Umgebungen, die die Seite selbst einbetten) */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const out = args.find((a) => !a.startsWith('--')) || path.join(root, 'dist', 'pneusim.html');

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_, f) => `<style>\n${fs.readFileSync(path.join(root, f), 'utf8')}\n</style>`);
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, f) => {
  const js = fs.readFileSync(path.join(root, f), 'utf8');
  if (/<\/script/i.test(js)) throw new Error(f + ' enthält </script');
  return `<script>\n${js}\n</script>`;
});
if (fragment) {
  html = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<meta charset[^>]*>\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<meta name="description"[^>]*>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body[^>]*>\s*/i, '')
    .replace(/<\/body>\s*/i, '')
    .replace(/<\/html>\s*/i, '');
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${out} (${(html.length / 1024).toFixed(0)} kB${fragment ? ', Fragment' : ''})`);
