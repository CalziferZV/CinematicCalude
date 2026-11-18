// Se ejecuta ANTES que el servidor cuando la app corre como FilamentStudio.exe (Node SEA).
// Indica al servidor dónde guardar datos y cómo leer los archivos incrustados en el ejecutable.
import sea from 'node:sea';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inSea = sea.isSea();
const exeDir = path.dirname(process.execPath);
const base = process.env.LOCALAPPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : path.join(os.homedir(), '.local', 'share'));
const userDir = path.join(base, 'FilamentStudio');
try {
  fs.mkdirSync(userDir, { recursive: true });
} catch {
  /* sin permisos: la caché no se guardará en disco */
}

// Para probar el paquete sin incrustar (node build/server.cjs), los recursos se leen de build/assets
// eslint-disable-next-line no-undef
const devAssets = path.join(typeof __dirname === 'string' ? __dirname : process.cwd(), 'assets');
const cache = new Map();

globalThis.__FS_RUNTIME__ = {
  exeDir,
  userDir,
  getAsset(key) {
    if (cache.has(key)) return cache.get(key);
    let buf = null;
    try {
      buf = inSea ? Buffer.from(sea.getAsset(key)) : fs.readFileSync(path.join(devAssets, key));
    } catch {
      buf = null;
    }
    cache.set(key, buf);
    return buf;
  },
};

process.title = 'Filament Studio';

// Si algo falla al arrancar, que la ventana no se cierre de golpe y se pueda leer el error
process.on('uncaughtException', (err) => {
  console.error('\n  Error inesperado:', err && err.stack ? err.stack : err);
  console.error('  La ventana se cerrara en 60 segundos.');
  setTimeout(() => process.exit(1), 60000);
});
