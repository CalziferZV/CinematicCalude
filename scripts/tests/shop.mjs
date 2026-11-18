// Prueba del lector de tiendas Shopify con una respuesta simulada.
import { getShopifyStore } from '../../server/catalog.js';
import { colorNameToHex } from '../../server/colornames.js';
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => (url.includes('page=1') ? { products: [
    { title: 'PLA Silk Dual Color Filament 1.75mm', handle: 'silk-dual', product_type: 'Filament', tags: [], options: [{ name: 'Color' }, { name: 'Size' }],
      variants: [{ option1: 'Gold/Silver', option2: '1kg', available: true, price: '19.99' }, { option1: 'Red & Blue', option2: '1kg', available: false, price: '19.99' }] },
    { title: 'PETG Matte Black', handle: 'petg', options: [{ name: 'Title' }], variants: [{ title: 'Default Title', available: true, price: '15' }] },
    { title: 'Filament Dryer S2', handle: 'dryer', options: [], variants: [] },
  ] } : { products: [] }),
});
const r = await getShopifyStore('demo-tienda-test.com', { force: true });
console.log(r.name, r.origin, JSON.stringify(r.lines.map((l) => [l.name, l.category, l.finish, l.colors.map((c) => c.name + ' ' + (c.hexes || [c.hex]).join('+') + (c.available === false ? ' (agotado)' : ''))]), null, 1));
console.log(colorNameToHex('Negro mate'), colorNameToHex('Rainbow'), colorNameToHex('Azul cielo'));
