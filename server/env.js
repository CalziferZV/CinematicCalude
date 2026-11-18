// Carga variables desde archivos .env (sin dependencias). Debe importarse lo primero.
import fs from 'node:fs';
import { envFiles } from './runtime.js';

export function loadEnvFile(file, { override = false } = {}) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (line.trim().startsWith('#')) continue;
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!m) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v && (override || process.env[m[1]] === undefined)) process.env[m[1]] = v;
    }
  } catch {
    /* sin archivo */
  }
}

for (const f of envFiles) loadEnvFile(f);
