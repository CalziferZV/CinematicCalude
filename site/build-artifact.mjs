// Versión de la web para publicarla como artifact de claude.ai: el mismo index.html sin las
// etiquetas <html>/<head>/<body> (el artifact pone su propio esqueleto).
// Uso: node site/build-artifact.mjs  ->  site/artifact.html
import fs from 'node:fs';
const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const head = src.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset[^>]*>\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = src.match(/<body>([\s\S]*?)<\/body>/)[1];
fs.writeFileSync(new URL('./artifact.html', import.meta.url), `${head.trim()}\n${body.trim()}\n`);
console.log('site/artifact.html', fs.statSync(new URL('./artifact.html', import.meta.url)).size, 'bytes');
