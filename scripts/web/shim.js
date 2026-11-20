// Versión web de Filament Studio (sin servidor). Se carga antes que la app y responde, dentro del
// propio navegador, a lo que la app le pide al servidor local (/api/...):
//  - catálogo de filamentos: la copia incluida en api/catalog.json (se genera al montar la versión web)
//  - piezas de ejemplo: samples/*.stl.json (claude.ai no sirve archivos .stl)
//  - preferencias (favoritos, bobinas, recientes, ajustes del presupuesto): en este navegador
//  - abrir en Bambu Studio / OrcaSlicer, asistente IA y tiendas Shopify: solo en la versión de Windows
// Las descargas pasan por el visor de claude.ai: la página no puede descargar archivos por su cuenta.
(() => {
  'use strict';
  const PREFS_KEY = 'filament-studio:prefs';
  const ONLY_WINDOWS = 'Esto solo está en la versión de Windows de Filament Studio.';
  const nativeFetch = window.fetch.bind(window);
  document.documentElement.classList.add('web');

  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const toast = (msg, ms = 6000) => (window.FS && window.FS.toast ? window.FS.toast(msg, ms) : console.warn(msg));

  // ------------------------------------------------------------ preferencias
  const readPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch { return {}; }
  };
  const writePrefs = (txt) => {
    try { if (typeof txt === 'string' && txt.length < 4e6) localStorage.setItem(PREFS_KEY, txt); } catch { /* navegador sin almacenamiento */ }
  };

  // ------------------------------------------------------------ catálogo
  let catalog = null;
  const loadCatalog = () =>
    (catalog ||= nativeFetch('api/catalog.json').then((r) => {
      if (!r.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${r.status})`);
      return r.json();
    }));
  // mismo formato que getAllBrands() en server/catalog.js
  const allBrands = (c) => ({
    at: c.at,
    brands: Object.entries(c.brands).map(([id, d]) => ({
      id,
      name: d.name || id,
      lines: d.lines.map((l) => ({
        name: l.name,
        category: l.category,
        finish: l.finish,
        colors: l.colors.map((x) => ({ name: x.name, nameEn: x.nameEn, hex: x.hex, hexes: x.hexes, alpha: x.alpha, kind: x.kind, code: x.code })),
      })),
    })),
  });

  // ------------------------------------------------------------ la "API" en el navegador
  async function api(raw, init) {
    const url = new URL(raw, location.href);
    const p = url.pathname.slice(url.pathname.indexOf('/api/'));
    const method = (init.method || 'GET').toUpperCase();
    if (p === '/api/ping') return json({ app: 'filament-studio', web: true });
    if (p === '/api/prefs') {
      if (method === 'GET') return json(readPrefs());
      writePrefs(typeof init.body === 'string' ? init.body : init.body && (await new Response(init.body).text()));
      return json({ ok: true });
    }
    if (p === '/api/categories') return json((await loadCatalog()).list.categories);
    if (p === '/api/brands') return json((await loadCatalog()).list);
    if (p === '/api/catalog/all') return json(allBrands(await loadCatalog()));
    const m = p.match(/^\/api\/brands\/([^/]+)$/);
    if (m) {
      const c = await loadCatalog();
      const d = c.brands[decodeURIComponent(m[1])];
      return d ? json({ ...d, origin: 'snapshot' }) : json({ error: 'Esa marca no está en la copia del catálogo' }, 404);
    }
    if (p === '/api/slicers') return json({});
    if (p === '/api/ai/status') return json({ enabled: false, web: true });
    return json({ error: ONLY_WINDOWS }, 501); // tiendas, IA, abrir en el laminador
  }

  // piezas de ejemplo: van publicadas como JSON (base64) y se devuelven como el STL original
  const sample = async (name) => {
    const r = await nativeFetch(`samples/${name}.json`);
    if (!r.ok) return new Response('', { status: r.status });
    const bytes = Uint8Array.from(atob((await r.json()).base64), (c) => c.charCodeAt(0));
    return new Response(bytes, { headers: { 'Content-Type': 'model/stl' } });
  };

  window.fetch = (input, init) => {
    const s = typeof input === 'string' ? input : input instanceof URL ? input.href : null;
    if (s && s.startsWith('/api/')) return api(s, init || {}).catch((e) => json({ error: e.message }, 500));
    const m = s && s.match(/^(?:\.\/)?samples\/([\w.-]+\.stl)$/i);
    if (m) return sample(m[1]);
    return nativeFetch(input, init);
  };

  // al cerrar la pestaña la app guarda las preferencias con sendBeacon
  const nativeBeacon = navigator.sendBeacon ? navigator.sendBeacon.bind(navigator) : null;
  navigator.sendBeacon = (url, data) => {
    if (String(url).startsWith('/api/')) {
      if (String(url).startsWith('/api/prefs') && data) {
        if (typeof data === 'string') writePrefs(data);
        else if (typeof data.text === 'function') data.text().then(writePrefs);
      }
      return true;
    }
    return nativeBeacon ? nativeBeacon(url, data) : false;
  };

  // ------------------------------------------------------------ descargas
  // Formatos que el visor deja guardar; el resto (3MF, proyecto) los prepara saveFile() en exporters.js.
  const CAN_SAVE = /\.(gif|png|jpe?g|webp|mp4|webm|txt|json|md|csv|html|svg|pdf|zip)$/i;
  let downloads = null;
  const downloadsApi = () => {
    if (!window.claude || typeof window.claude.use !== 'function') return Promise.resolve(null);
    return (downloads ||= window.claude.use('downloads').catch(() => null));
  };
  downloadsApi(); // se prepara al abrir; el permiso se pide al descargar

  window.FS_WEB = {
    canSave: (name) => CAN_SAVE.test(name),
    async save(blob, name) {
      const dl = await downloadsApi();
      if (!dl) {
        if (window.claude) {
          toast('Desde aquí no se pueden descargar archivos. Abre el enlace en claude.ai o usa la versión de Windows.', 7000);
          return false;
        }
        // fuera de claude.ai (por ejemplo, probando la versión web en local): descarga normal
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
        return true;
      }
      try {
        await dl.save({ filename: name, data: blob });
        return true;
      } catch (e) {
        const code = e && e.code;
        if (code === 'declined') return false;
        if (code === 'rate_limited') toast('Ya hay una descarga esperando a que la confirmes.');
        else if (code === 'rejected_extension' || code === 'extension_not_enabled') toast(`Este visor no deja guardar archivos «${name.split('.').pop()}».`);
        else toast(`No se pudo descargar: ${(e && e.message) || code || e}`);
        return false;
      }
    },
  };
})();
