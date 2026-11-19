// Abre un archivo 3MF directamente en el laminador instalado (Bambu Studio, OrcaSlicer, PrusaSlicer).
// El archivo se guarda en Documentos\Filament Studio y se lanza el programa con esa ruta.
// Si el laminador no aparece, se abre con el programa predeterminado del sistema o se muestra la carpeta.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { userDir } from './runtime.js';

export const SLICERS = {
  bambu: { name: 'Bambu Studio', exe: ['bambu-studio.exe'], dirs: ['Bambu Studio', 'BambuStudio'], mac: ['BambuStudio', 'Bambu Studio'], linux: ['bambu-studio', 'BambuStudio'] },
  orca: { name: 'OrcaSlicer', exe: ['orca-slicer.exe', 'OrcaSlicer.exe'], dirs: ['OrcaSlicer', 'Orca Slicer'], mac: ['OrcaSlicer'], linux: ['orca-slicer', 'OrcaSlicer'] },
  prusa: { name: 'PrusaSlicer', exe: ['prusa-slicer.exe'], dirs: [path.join('Prusa3D', 'PrusaSlicer'), 'PrusaSlicer'], mac: ['PrusaSlicer', 'Original Prusa Drivers/PrusaSlicer'], linux: ['prusa-slicer', 'PrusaSlicer'] },
};

const run = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    execFile(cmd, args, { windowsHide: true, timeout: 8000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, stdout) => resolve(err ? '' : String(stdout)));
  });

// ---------------------------------------------------------------- dónde guardar
let docsCache = null;
async function documentsDir() {
  if (docsCache) return docsCache;
  let dir = null;
  if (process.platform === 'win32') {
    // La carpeta Documentos real (puede estar en OneDrive o con otro nombre)
    const out = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders', '/v', 'Personal']);
    const m = out.match(/Personal\s+REG_(?:EXPAND_)?SZ\s+(.+)/);
    if (m) dir = m[1].trim().replace(/%([^%]+)%/g, (_, v) => process.env[v] ?? process.env[v.toUpperCase()] ?? `%${v}%`);
  }
  if (!dir || dir.includes('%') || !fs.existsSync(dir)) dir = path.join(os.homedir(), 'Documents');
  if (!fs.existsSync(dir)) dir = null;
  docsCache = dir ? path.join(dir, 'Filament Studio') : path.join(userDir, 'exportados');
  return docsCache;
}

export function safeFileName(name, ext = '.3mf') {
  let base = String(name || 'modelo').replace(/\.[^.]*$/, '');
  base = base.normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 80) || 'modelo';
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `_${base}`;
  return base + ext;
}

async function saveFile(buf, name) {
  const dir = await documentsDir();
  fs.mkdirSync(dir, { recursive: true });
  let file = path.join(dir, safeFileName(name));
  try {
    fs.writeFileSync(file, buf);
  } catch {
    // ocupado (p. ej. abierto en otro programa): se guarda con la hora
    const stamp = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
    file = path.join(dir, safeFileName(`${path.basename(file, '.3mf')}_${stamp}`));
    fs.writeFileSync(file, buf);
  }
  return file;
}

// ---------------------------------------------------------------- buscar el laminador
const found = new Map();

async function findWindows(s) {
  const bases = [process.env.ProgramW6432, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs')].filter(Boolean);
  for (const b of [...new Set(bases)]) {
    for (const d of s.dirs) {
      for (const e of s.exe) {
        const p = path.join(b, d, e);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  // Programas instalados (registro): icono o carpeta de instalación
  const keys = [
    'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ];
  const exeNames = s.exe.map((e) => e.toLowerCase());
  for (const k of keys) {
    for (const v of ['DisplayIcon', 'InstallLocation']) {
      const out = await run('reg', ['query', k, '/s', '/v', v]);
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/REG_(?:EXPAND_)?SZ\s+(.+)$/);
        if (!m) continue;
        let p = m[1].trim().replace(/^"|"$/g, '').replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '');
        if (v === 'InstallLocation') {
          for (const e of s.exe) {
            const c = path.join(p, e);
            if (fs.existsSync(c)) return c;
          }
        } else if (exeNames.includes(path.basename(p).toLowerCase()) && fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

async function findMac(s) {
  for (const n of s.mac) {
    for (const base of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      const p = path.join(base, `${n}.app`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function findLinux(s) {
  for (const n of s.linux) {
    const out = await run('which', [n]);
    if (out.trim()) return out.trim().split('\n')[0];
  }
  return null;
}

export async function findSlicer(id) {
  const s = SLICERS[id];
  if (!s) return null;
  if (found.has(id)) return found.get(id);
  let p = null;
  try {
    p = process.platform === 'win32' ? await findWindows(s) : process.platform === 'darwin' ? await findMac(s) : await findLinux(s);
  } catch {
    p = null;
  }
  found.set(id, p);
  return p;
}

export async function slicerStatus() {
  const out = {};
  for (const id of Object.keys(SLICERS)) out[id] = { name: SLICERS[id].name, found: Boolean(await findSlicer(id)) };
  return out;
}

// ---------------------------------------------------------------- abrir
function launch(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...opts });
      let done = false;
      child.once('error', () => { if (!done) { done = true; resolve(false); } });
      child.once('spawn', () => { if (!done) { done = true; child.unref(); resolve(true); } });
    } catch {
      resolve(false);
    }
  });
}

function openDefault(file) {
  if (process.platform === 'win32') return launch('explorer.exe', [file], { windowsHide: true });
  if (process.platform === 'darwin') return launch('open', [file]);
  return launch('xdg-open', [file]);
}

function showInFolder(file) {
  if (process.platform === 'win32') return launch('explorer.exe', [`/select,"${file}"`], { windowsVerbatimArguments: true });
  if (process.platform === 'darwin') return launch('open', ['-R', file]);
  return launch('xdg-open', [path.dirname(file)]);
}

export async function openInSlicer(id, buf, name) {
  const s = SLICERS[id] || SLICERS.bambu;
  if (!buf || !buf.length) throw new Error('Archivo vacío');
  const file = await saveFile(buf, name);
  const exe = await findSlicer(id in SLICERS ? id : 'bambu');
  if (exe) {
    const ok = process.platform === 'darwin' ? await launch('open', ['-a', exe, file]) : await launch(exe, [file]);
    if (ok) return { ok: true, file, launched: 'slicer', slicer: s.name };
  }
  if (await openDefault(file)) return { ok: true, file, launched: 'default', slicer: s.name };
  await showInFolder(file);
  return { ok: true, file, launched: 'folder', slicer: s.name };
}
