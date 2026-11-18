// Genera data/snapshot/catalog.json.gz (catálogo sin conexión). Uso: npm run snapshot
import { buildSnapshot } from '../server/catalog.js';
const out = await buildSnapshot();
console.log(`\nInstantánea creada: ${Object.keys(out.brands).length} marcas`);
