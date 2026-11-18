// Rutas y recursos de la app. Funciona igual en desarrollo (node server/server.js)
// y dentro del ejecutable de Windows (FilamentStudio.exe), donde todo va incrustado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// En el .exe, scripts/exe/runtime-setup.js define esto antes de cargar el servidor.
const R = globalThis.__FS_RUNTIME__ || null;

export const isExe = Boolean(R);

// Carpeta del proyecto (desarrollo) o del .exe
export const rootDir = R ? R.exeDir : path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carpeta con permiso de escritura para la caché del catálogo y la configuración
export const userDir = R ? R.userDir : path.join(rootDir, 'data');
export const cacheDir = path.join(userDir, 'cache');

// Archivos .env que se leen (el primero que defina una variable gana)
export const envFiles = R ? [path.join(R.exeDir, '.env'), path.join(R.userDir, 'config.env')] : [path.join(rootDir, '.env')];

// Archivo donde se guarda la clave de la IA cuando se introduce desde la app
export const keyFile = R ? path.join(R.userDir, 'config.env') : path.join(rootDir, '.env');

// Lee un recurso de la app (p. ej. 'data/snapshot/catalog.json.gz' o 'public/index.html').
// Devuelve un Buffer o null si no existe.
export function readResource(rel) {
  if (R) return R.getAsset(rel.replace(/\\/g, '/'));
  try {
    return fs.readFileSync(path.join(rootDir, rel));
  } catch {
    return null;
  }
}
