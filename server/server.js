// Servidor local de Filament Studio.
import './env.js';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { getBrandList, getBrand, getAllBrands, getShopifyStore, CATEGORY_ORDER } from './catalog.js';
import { aiStatus, aiTurn, aiErrorMessage, saveApiKey } from './ai.js';
import { openInSlicer, slicerStatus } from './slicer.js';
import { isExe, rootDir, userDir, readResource } from './runtime.js';

const app = express();
app.disable('x-powered-by');

// Solo se aceptan peticiones de la propia app (evita que otras webs usen este servidor local)
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
});
app.use(express.json({ limit: '40mb' }));

// ---------------------------------------------------------------- archivos de la interfaz
if (isExe) {
  // Dentro del .exe: la interfaz va incrustada en el propio ejecutable
  const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.stl': 'model/stl', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  };
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let p;
    try { p = decodeURIComponent(req.path); } catch { return next(); }
    if (p.includes('..')) return next();
    if (p.endsWith('/')) p += 'index.html';
    const buf = readResource(`public${p}`);
    if (!buf) return next();
    res.setHeader('Content-Type', TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
} else {
  app.use('/', express.static(path.join(rootDir, 'public')));
  app.use('/vendor/three', express.static(path.join(rootDir, 'node_modules', 'three')));
  app.use('/vendor/three-mesh-bvh', express.static(path.join(rootDir, 'node_modules', 'three-mesh-bvh')));
}

// ---------------------------------------------------------------- API
const force = (req) => req.query.refresh === '1';

app.get('/api/brands', async (req, res) => {
  try {
    res.json(await getBrandList({ force: force(req) }));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/brands/:id', async (req, res) => {
  try {
    res.json(await getBrand(req.params.id, { force: force(req) }));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/shop', async (req, res) => {
  try {
    res.json(await getShopifyStore(String(req.query.url || ''), { force: force(req) }));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});
app.get('/api/catalog/all', (req, res) => {
  try {
    res.json(getAllBrands());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/categories', (req, res) => res.json(CATEGORY_ORDER));
app.get('/api/ping', (req, res) => res.json({ app: 'filament-studio' }));

// ---------------------------------------------------------------- preferencias del usuario
// Favoritos, bobinas que tienes, recientes y ajustes del presupuesto. Se guardan en este
// ordenador (no en el navegador) para que no se pierdan si cambia el puerto o el navegador.
const PREFS_FILE = path.join(userDir, 'prefs.json');
app.get('/api/prefs', (req, res) => {
  try {
    res.json(JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')));
  } catch {
    res.json({});
  }
});
const savePrefs = (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Formato no válido' });
  const txt = JSON.stringify(body);
  if (txt.length > 4_000_000) return res.status(413).json({ error: 'Preferencias demasiado grandes' });
  try {
    fs.mkdirSync(path.dirname(PREFS_FILE), { recursive: true });
    fs.writeFileSync(`${PREFS_FILE}.tmp`, txt);
    fs.renameSync(`${PREFS_FILE}.tmp`, PREFS_FILE);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
app.put('/api/prefs', savePrefs);
app.post('/api/prefs', savePrefs); // navigator.sendBeacon al cerrar la pestaña

// ---------------------------------------------------------------- abrir en el laminador
app.get('/api/slicers', async (req, res) => res.json(await slicerStatus()));
app.post('/api/open-in-slicer', express.raw({ type: 'application/octet-stream', limit: '400mb' }), async (req, res) => {
  try {
    const id = String(req.query.slicer || 'bambu');
    res.json(await openInSlicer(id, req.body, String(req.query.name || 'modelo')));
  } catch (e) {
    console.error('[laminador]', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/status', (req, res) => res.json(aiStatus()));
app.post('/api/ai/key', (req, res) => {
  try {
    res.json(saveApiKey(req.body?.key));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/api/ai', async (req, res) => {
  try {
    res.json(await aiTurn(req.body.messages));
  } catch (e) {
    console.error('[IA]', e);
    res.status(500).json({ error: aiErrorMessage(e) });
  }
});

// ---------------------------------------------------------------- arranque
const HOST = process.env.HOST || '127.0.0.1'; // solo accesible desde este ordenador
const BASE_PORT = Number(process.env.PORT) || 5173;
const shouldOpen = (isExe || process.argv.includes('--open')) && !process.env.FS_NO_BROWSER;

function openBrowser(url) {
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// ¿Ya hay un Filament Studio abierto en ese puerto?
async function isOurApp(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(1500) });
    return (await r.json()).app === 'filament-studio';
  } catch {
    return false;
  }
}

function listen(port, attempt = 0) {
  const server = app.listen(port, HOST, () => {
    const url = `http://localhost:${port}`;
    const ai = aiStatus();
    // Mensajes sin tildes: la consola clásica de Windows no siempre muestra bien los acentos
    console.log('');
    console.log(`  Filament Studio listo  ->  ${url}`);
    console.log(ai.enabled ? `  IA activada (${ai.model})` : '  IA desactivada: puedes poner tu clave desde el panel de la IA');
    if (isExe) console.log('\n  No cierres esta ventana mientras uses la app (al cerrarla, la app se detiene).');
    console.log('');
    if (shouldOpen) openBrowser(url);
  });
  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE' && attempt < 10) {
      if (await isOurApp(port)) {
        // ya estaba abierta: solo abrimos el navegador
        console.log(`  Filament Studio ya estaba abierto en http://localhost:${port}`);
        if (shouldOpen) openBrowser(`http://localhost:${port}`);
        setTimeout(() => process.exit(0), 1500);
        return;
      }
      listen(port + 1, attempt + 1);
    } else {
      console.error('  No se pudo arrancar el servidor:', err.message);
      if (isExe) setTimeout(() => process.exit(1), 30000);
      else process.exit(1);
    }
  });
}
listen(BASE_PORT);
