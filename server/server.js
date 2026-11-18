// Servidor local de Filament Studio.
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBrandList, getBrand, getShopifyStore, CATEGORY_ORDER } from './catalog.js';
import { aiStatus, aiTurn, aiErrorMessage } from './ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const app = express();
app.use(express.json({ limit: '40mb' }));

app.use('/', express.static(path.join(root, 'public')));
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));
app.use('/vendor/three-mesh-bvh', express.static(path.join(root, 'node_modules', 'three-mesh-bvh')));

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
app.get('/api/categories', (req, res) => res.json(CATEGORY_ORDER));

app.get('/api/ai/status', (req, res) => res.json(aiStatus()));
app.post('/api/ai', async (req, res) => {
  try {
    res.json(await aiTurn(req.body.messages));
  } catch (e) {
    console.error('[IA]', e);
    res.status(500).json({ error: aiErrorMessage(e) });
  }
});

const PORT = Number(process.env.PORT) || 5173;
app.listen(PORT, () => {
  const ai = aiStatus();
  console.log(`\n  Filament Studio listo →  http://localhost:${PORT}\n`);
  console.log(ai.enabled ? `  IA activada (${ai.model})` : '  IA desactivada: añade ANTHROPIC_API_KEY en el archivo .env para activarla');
});
