// Posts del feed (1080 × 1350, 4:5), carruseles e historias (1080 × 1920). Cada uno: fondo, textos
// (HTML) y piezas 3D por nombre. Los textos editables generales están en config.js; {fecha}, {usuario},
// {marca} y {contacto} se sustituyen solos.
const F = [1080, 1350], ST = [1080, 1920];
const P = (id, size, def) => ({ id, w: size[0], h: size[1], ...def });

export const POSTS = [
  // ── MARCA ──────────────────────────────────────────────────────────────────────────────
  P('marca-01-lema', F, {
    bg: 'bg-dark', dark: true,
    html: `<div class="abs center kicker" style="top:110px">Impresión 3D a medida</div>
      <div class="abs center h-xl white" style="top:170px">Lo imaginas.</div>
      <div class="abs center h-xl" style="top:300px"><span class="grad">Lo imprimimos.</span></div>`,
    objs: [{ make: 'vase', print: 0.72, rot: 0.6 }], nozzle: true, glow: true,
    cam: [7.2, 0.6, 0.42, 0.15, 1.2],
  }),
  P('marca-02-como-1', F, {
    bg: 'bg-light', page: '1/5',
    html: `<div class="abs center kicker" style="top:110px">Cómo funciona</div>
      <div class="abs center h-l" style="top:170px">De una idea<br>a un <span class="grad">objeto real</span></div>
      <div class="abs center sub" style="top:390px">en 4 pasos. Desliza →</div>`,
    objs: [{ make: 'vase', rot: 0.4, scale: 0.8 }], shadow: true, cam: [7.6, 0.64, 0.32, 0, 0.6],
  }),
  P('marca-02-como-2', F, {
    bg: 'bg-warm', page: '2/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num">01</div></div>
      <div class="abs h-l" style="left:90px;top:250px">Nos cuentas<br>tu idea</div>
      <div class="abs sub" style="left:90px;top:470px;max-width:880px">Una foto, un boceto, un archivo STL o solo una descripción. Nos vale todo.</div>`,
    objs: [{ make: 'tag', text: 'TU IDEA', plate: 0x1d1d1f, letters: 0xff6a13, scale: 0.6, rot: -0.25 }], shadow: true, cam: [7.4, 0.3, 0.4, 0, 0.3],
  }),
  P('marca-02-como-3', F, {
    bg: 'bg-light', page: '3/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num">02</div></div>
      <div class="abs h-l" style="left:90px;top:250px">Lo diseñamos<br>y te damos precio</div>
      <div class="abs sub" style="left:90px;top:470px;max-width:880px">Te enseñamos cómo quedará antes de imprimir. Sin sorpresas.</div>`,
    objs: [{ make: 'star', color: 0x1e88e5, metal: 0.1, scale: 0.6, rot: 0.35, x: -0.55 }, { make: 'star', color: 0xff6a13, metal: 0.1, scale: 0.45, rot: -0.4, x: 0.6 }],
    shadow: true, cam: [7.4, 0.42, 0.42, 0, 0.3],
  }),
  P('marca-02-como-4', F, {
    bg: 'bg-dark', dark: true, page: '4/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num">03</div></div>
      <div class="abs h-l white" style="left:90px;top:250px">Lo imprimimos<br><span class="grad">capa a capa</span></div>
      <div class="abs sub white" style="left:90px;top:470px;max-width:880px">En el material y el color que elijas, con acabado cuidado.</div>`,
    objs: [{ make: 'vase', print: 0.55, rot: 0.9, color: 0x2bb673, scale: 0.85 }], nozzle: true, glow: true, cam: [7.4, 0.42, 0.4, 0.1, 1.3],
  }),
  P('marca-02-como-5', F, {
    bg: 'bg-orange', dark: true, page: '5/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num" style="color:#fff;border-color:#fff">04</div></div>
      <div class="abs h-l white" style="left:90px;top:250px">Y lo recibes<br>en casa</div>
      <div class="abs" style="left:90px;top:490px"><span class="btn" style="background:#fff;color:#ff6a13;box-shadow:0 20px 50px rgba(0,0,0,.2)">Pide tu presupuesto</span></div>`,
    objs: [{ make: 'gift', color: 0xffffff, ribbon: 0x1d1d1f, scale: 0.7, rot: 0.6 }], cam: [7.4, 0.45, 0.4, 0, 1.0],
  }),

  // ── NAVIDAD ────────────────────────────────────────────────────────────────────────────
  P('navidad-01-portada', F, {
    bg: 'bg-pine', dark: true, snow: true,
    html: `<div class="abs center kicker gold-k" style="top:110px">Campaña de Navidad</div>
      <div class="abs center h-xl white" style="top:170px">Navidad</div>
      <div class="abs center h-xl" style="top:290px"><span class="gold">impresa en 3D</span></div>
      <div class="abs row" style="top:1110px;color:#f2c14e"><span class="pill"><i></i>Pedidos hasta el {fecha}</span></div>`,
    objs: [{ make: 'bauble', color: 0xc8102e, rot: 0.3, scale: 0.85 }], glow: 'gold', cam: [7.2, 0.6, 0.3, 0, 0.6],
  }),
  P('navidad-02-ideas-1', F, {
    bg: 'bg-wine', dark: true, page: '1/5', snow: true,
    html: `<div class="abs center kicker gold-k" style="top:110px">Guía de regalos</div>
      <div class="abs center h-l white" style="top:170px">4 regalos que<br><span class="gold">no verás en tiendas</span></div>
      <div class="abs center sub white" style="top:420px">Desliza →</div>`,
    objs: [{ make: 'gift', scale: 0.62, rot: 0.6, x: -0.55, color: 0xf5f1e8, ribbon: 0xc8102e }, { make: 'bauble', color: 0xf2c14e, scale: 0.5, rot: 0.2, x: 0.62, z: 0.3 }],
    glow: 'gold', cam: [7.4, 0.42, 0.34, 0, 0.6],
  }),
  P('navidad-02-ideas-2', F, {
    bg: 'bg-cream', page: '2/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num red">01</div></div>
      <div class="abs h-l" style="left:90px;top:250px">Adornos con<br><span style="color:#c8102e">su nombre</span></div>
      <div class="abs sub" style="left:90px;top:470px;max-width:880px">Uno para cada persona de la familia. Este año, el árbol lleva vuestros nombres.</div>`,
    objs: [{ make: 'tag', text: 'n0', plate: 0xf5f1e8, letters: 0xc8102e, scale: 0.5, rot: 0.25, x: -0.5, y: 0.35 }, { make: 'tag', text: 'n2', plate: 0x1f7a4d, letters: 0xf2c14e, scale: 0.5, rot: -0.25, x: 0.55, y: -0.15 }],
    shadow: false, cam: [7.4, 0.25, 0.4, 0, 0.2],
  }),
  P('navidad-02-ideas-3', F, {
    bg: 'bg-pine', dark: true, page: '3/5', snow: true,
    html: `<div class="abs" style="left:90px;top:110px"><div class="num gold-n">02</div></div>
      <div class="abs h-l white" style="left:90px;top:250px">Decoración<br><span class="gold">diferente</span></div>
      <div class="abs sub white" style="left:90px;top:470px;max-width:880px">Árboles, estrellas y bolas en los colores de tu casa.</div>`,
    objs: [{ make: 'tree', scale: 0.62, rot: 0.3, z: -0.3 }, { make: 'bauble', color: 0xc8102e, scale: 0.4, x: -0.7, z: 0.3 }, { make: 'star', color: 0xf2c14e, scale: 0.32, x: 0.72, z: 0.3, rot: -0.3 }],
    glow: 'gold', cam: [7.6, 0.45, 0.38, 0, 0.5],
  }),
  P('navidad-02-ideas-4', F, {
    bg: 'bg-cream', page: '4/5',
    html: `<div class="abs" style="left:90px;top:110px"><div class="num red">03</div></div>
      <div class="abs h-l" style="left:90px;top:250px">Regalos<br><span style="color:#c8102e">a medida</span></div>
      <div class="abs sub" style="left:90px;top:470px;max-width:880px">Llaveros, figuras, lámparas o lo que se te ocurra. Tú lo imaginas.</div>`,
    objs: [{ make: 'vase', color: 0xc8102e, scale: 0.55, rot: 0.4, x: -0.5 }, { make: 'gift', color: 0x1f7a4d, ribbon: 0xf2c14e, scale: 0.5, rot: 0.7, x: 0.6, z: 0.2 }],
    shadow: true, cam: [7.4, 0.45, 0.4, 0, 0.5],
  }),
  P('navidad-02-ideas-5', F, {
    bg: 'bg-wine', dark: true, page: '5/5', snow: true,
    html: `<div class="abs" style="left:90px;top:110px"><div class="num gold-n">04</div></div>
      <div class="abs h-l white" style="left:90px;top:250px">Regalos<br><span class="gold">de empresa</span></div>
      <div class="abs sub white" style="left:90px;top:470px;max-width:880px">Con tu logo, para clientes y equipo. Desde pocas unidades.</div>
      <div class="abs row" style="top:1090px;color:#f2c14e"><span class="pill"><i></i>Pide antes del {fecha}</span></div>`,
    objs: [{ make: 'tag', text: 'TU LOGO', plate: 0x1d1d1f, letters: 0xf2c14e, scale: 0.5, rot: -0.2, metalL: true }], glow: 'gold', cam: [7.4, 0.28, 0.2, 0, 0.3],
  }),
  P('navidad-03-ultimos-dias', F, {
    bg: 'bg-wine', dark: true, snow: true,
    html: `<div class="abs row" style="top:110px;color:#f2c14e"><span class="pill"><i></i>Aviso de Navidad</span></div>
      <div class="abs center h-xl white" style="top:200px">Últimos <span class="gold">días</span></div>
      <div class="abs center sub white" style="top:340px">para pedir y recibir antes de Navidad</div>
      <div class="abs row" style="top:1090px"><span class="btn goldb">Hasta el {fecha}</span></div>`,
    objs: [{ make: 'gift', color: 0xf5f1e8, ribbon: 0xc8102e, scale: 0.72, rot: 0.6 }], glow: 'gold', cam: [7.4, 0.45, 0.25, 0, 1.0],
  }),

  // ── HISTORIAS ──────────────────────────────────────────────────────────────────────────
  P('historia-navidad-abierta', ST, {
    bg: 'bg-pine', dark: true, snow: true, story: true,
    html: `<div class="abs center kicker gold-k" style="top:280px">{marca}</div>
      <div class="abs center h-xl white" style="top:350px">Ya está aquí<br>la <span class="gold">Navidad</span></div>
      <div class="abs center sub white" style="top:630px">Adornos y regalos personalizados impresos en 3D</div>
      <div class="abs row" style="top:1430px;color:#f2c14e"><span class="pill"><i></i>Pedidos hasta el {fecha}</span></div>`,
    objs: [{ make: 'bauble', color: 0xc8102e, scale: 0.75, rot: 0.3 }], glow: 'gold', cam: [7.4, 0.55, 0.12, 0, 0.6],
  }),
  P('historia-encuesta-nombre', ST, {
    bg: 'bg-cream', story: true,
    html: `<div class="abs center kicker" style="top:280px;color:#c8102e">Juguemos</div>
      <div class="abs center h-l" style="top:350px">¿Qué nombre<br>pondrías en<br>tu <span style="color:#c8102e">adorno</span>?</div>
      <div class="abs" style="left:140px;right:140px;top:1260px;height:240px;border:4px dashed rgba(200,16,46,.35);border-radius:40px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:600;color:rgba(200,16,46,.6)">Pon aquí la caja de preguntas</div>`,
    objs: [{ make: 'tag', text: 'n1', plate: 0xc8102e, letters: 0xf5f1e8, scale: 0.55, rot: 0.2 }], cam: [7.4, 0.3, 0.12, 0, 0.2],
  }),
  P('historia-presupuesto', ST, {
    bg: 'bg-dark', dark: true, story: true,
    html: `<div class="abs center kicker" style="top:280px">Impresión 3D a medida</div>
      <div class="abs center h-xl white" style="top:350px">¿Tienes<br>una <span class="grad">idea</span>?</div>
      <div class="abs center sub white" style="top:640px">Cuéntanosla y te decimos cuánto cuesta</div>
      <div class="abs row" style="top:1430px"><span class="btn">Escríbenos por DM</span></div>`,
    objs: [{ make: 'vase', print: 0.68, rot: 0.6, scale: 0.75 }], nozzle: true, glow: true, cam: [7.4, 0.42, 0.2, 0.1, 1.2],
  }),
  // ── NUEVOS: para publicar cada día ─────────────────────────────────────────────────────
  P('marca-03-sabias-que', F, {
    bg: 'bg-dark', dark: true,
    html: `<div class="abs center kicker" style="top:110px">¿Sabías que…?</div>
      <div class="abs center h-l white" style="top:170px">Esta pieza tiene<br><span class="grad">más de 1.000 capas</span></div>
      <div class="abs center sub white" style="top:420px">Cada una mide 0,2 mm, más fina que una tarjeta de crédito.</div>`,
    objs: [{ make: 'vase', print: 0.62, rot: 0.6, scale: 0.85 }], nozzle: true, glow: true, cam: [7.4, 0.52, 0.4, 0.1, 1.2],
  }),
  P('marca-04-elige-color', F, {
    bg: 'bg-light',
    html: `<div class="abs center kicker" style="top:110px">Tú eliges</div>
      <div class="abs center h-l" style="top:170px">¿De qué color<br><span class="grad">lo quieres?</span></div>
      <div class="abs center sub" style="top:420px">Dinos tu favorito en comentarios</div>`,
    objs: [{ make: 'vase', color: 0x1e88e5, scale: 0.5, x: -0.95, rot: 0.3 }, { make: 'vase', color: 0xff6a13, scale: 0.6, x: 0, z: 0.25, rot: 0.6 },
      { make: 'vase', color: 0x2bb673, scale: 0.5, x: 0.95, rot: 0.9 }], shadow: true, cam: [7.6, 0.45, 0.45, 0, 0.5],
  }),
  P('historia-encuesta-que-imprimirias', ST, {
    bg: 'bg-light', story: true,
    html: `<div class="abs center kicker" style="top:280px">Encuesta</div>
      <div class="abs center h-l" style="top:350px">¿Qué te<br>imprimirías<br>tú?</div>
      <div class="abs" style="left:140px;right:140px;top:1300px;height:260px;border:4px dashed rgba(255,106,19,.4);border-radius:40px;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:600;color:rgba(255,106,19,.75)">Pon aquí el sticker de encuesta</div>`,
    objs: [{ make: 'star', color: 0xff6a13, metal: 0.1, scale: 0.42, x: -0.75, rot: 0.3 }, { make: 'tag', text: 'TU IDEA', plate: 0x1d1d1f, letters: 0xff6a13, scale: 0.42, x: 0.5, y: 0.1, rot: -0.3 }],
    cam: [10, 0.3, 0.1, 0, 0.3],
  }),
  P('historia-teaser-navidad', ST, {
    bg: 'bg-pine', dark: true, snow: true, story: true,
    html: `<div class="abs center kicker gold-k" style="top:280px">Mañana</div>
      <div class="abs center h-xl white" style="top:350px">Algo <span class="gold">bonito</span><br>se está<br>imprimiendo…</div>
      <div class="abs center sub white" style="top:820px">Activa las notificaciones</div>`,
    objs: [{ make: 'bauble', color: 0xc8102e, print: 0.55, scale: 0.75, rot: 0.3 }], nozzle: true, glow: 'gold', cam: [8.6, 0.4, 0.3, 0, 0.9],
  }),
  P('navidad-04-por-persona-1', F, {
    bg: 'bg-pine', dark: true, page: '1/5', snow: true,
    html: `<div class="abs center kicker gold-k" style="top:110px">Guía de regalos</div>
      <div class="abs center h-l white" style="top:170px">Un regalo para<br><span class="gold">cada persona</span></div>
      <div class="abs center sub white" style="top:420px">Desliza →</div>`,
    objs: [{ make: 'tree', scale: 0.55, z: -0.3, rot: 0.3 }, { make: 'gift', color: 0xc8102e, ribbon: 0xf2c14e, scale: 0.42, x: -0.75, z: 0.3, rot: 0.6 }, { make: 'bauble', color: 0xf2c14e, scale: 0.36, x: 0.75, z: 0.3 }],
    glow: 'gold', cam: [7.6, 0.42, 0.4, 0, 0.5],
  }),
  P('navidad-04-por-persona-2', F, {
    bg: 'bg-cream', page: '2/5',
    html: `<div class="abs kicker" style="left:90px;top:110px;color:#c8102e">Para la familia</div>
      <div class="abs h-l" style="left:90px;top:170px">Un adorno con<br><span style="color:#c8102e">cada nombre</span></div>
      <div class="abs sub" style="left:90px;top:400px;max-width:880px">Para colgar todos juntos en el árbol.</div>`,
    objs: [{ make: 'tag', text: 'n0', plate: 0xc8102e, letters: 0xf5f1e8, scale: 0.42, x: -0.55, y: 0.45, rot: 0.2 }, { make: 'tag', text: 'n1', plate: 0xf5f1e8, letters: 0x1f7a4d, scale: 0.42, x: 0.5, y: 0.15, rot: -0.2 }, { make: 'tag', text: 'n2', plate: 0x1f7a4d, letters: 0xf2c14e, scale: 0.42, x: -0.2, y: -0.2, rot: 0.1 }],
    cam: [7.4, 0.25, 0.4, 0, 0.2],
  }),
  P('navidad-04-por-persona-3', F, {
    bg: 'bg-light', page: '3/5',
    html: `<div class="abs kicker" style="left:90px;top:110px">Para los peques</div>
      <div class="abs h-l" style="left:90px;top:170px">Su estrella,<br><span class="grad">en su color</span></div>
      <div class="abs sub" style="left:90px;top:400px;max-width:880px">Que la elijan ellos y la pongan en lo alto del árbol.</div>`,
    objs: [{ make: 'star', color: 0xe63e6d, metal: 0.1, scale: 0.55, x: -0.45, rot: 0.3 }, { make: 'star', color: 0x1e88e5, metal: 0.1, scale: 0.42, x: 0.65, z: 0.2, rot: -0.35 }],
    shadow: true, cam: [7.4, 0.4, 0.45, 0, 0.3],
  }),
  P('navidad-04-por-persona-4', F, {
    bg: 'bg-wine', dark: true, page: '4/5', snow: true,
    html: `<div class="abs kicker gold-k" style="left:90px;top:110px">Para el amigo invisible</div>
      <div class="abs h-l white" style="left:90px;top:170px">Algo pequeño,<br><span class="gold">pero suyo</span></div>
      <div class="abs sub white" style="left:90px;top:400px;max-width:880px">Un llavero o un adorno con su nombre o sus iniciales.</div>`,
    objs: [{ make: 'tag', text: 'n1', plate: 0xf2c14e, letters: 0x5a0817, scale: 0.55, rot: -0.2 }], glow: 'gold', cam: [7.4, 0.28, 0.42, 0, 0.3],
  }),
  P('navidad-04-por-persona-5', F, {
    bg: 'bg-dark', dark: true, page: '5/5',
    html: `<div class="abs kicker" style="left:90px;top:110px">Para tu empresa</div>
      <div class="abs h-l white" style="left:90px;top:170px">Regalos con<br><span class="grad">tu logo</span></div>
      <div class="abs sub white" style="left:90px;top:400px;max-width:880px">Para clientes y equipo. Escríbenos por DM y te damos precio.</div>
      <div class="abs row" style="top:1090px;color:#ff9a3c"><span class="pill"><i></i>Pide antes del {fecha}</span></div>`,
    objs: [{ make: 'tag', text: 'TU LOGO', plate: 0x1d1d1f, letters: 0xff6a13, scale: 0.5, rot: 0.2 }], glow: true, cam: [7.4, 0.28, 0.25, 0, 0.3],
  }),
  ...[[10, 'Quedan', '10 días'], [7, 'Quedan', '7 días'], [5, 'Quedan', '5 días'], [3, 'Quedan', '3 días'], [1, 'Mañana es', 'el último día'], [0, 'Hoy es', 'el último día']].map(([n, a, b]) =>
    P(`historia-cuenta-atras-${n}`, ST, {
      bg: n <= 1 ? 'bg-wine' : 'bg-pine', dark: true, snow: true, story: true,
      html: `<div class="abs center kicker gold-k" style="top:280px">Pedidos de Navidad</div>
        <div class="abs center h-xl white" style="top:350px">${a}<br><span class="gold">${b}</span></div>
        <div class="abs center sub white" style="top:650px">para pedir y recibir antes de Navidad</div>
        <div class="abs row" style="top:1430px"><span class="btn goldb">Escríbenos por DM</span></div>`,
      objs: [{ make: n % 2 ? 'gift' : 'bauble', color: n % 2 ? 0xf5f1e8 : 0xc8102e, ribbon: 0xc8102e, scale: n % 2 ? 0.62 : 0.68, rot: 0.6 }],
      glow: 'gold', cam: [7.6, 0.45, 0.12, 0, 0.9],
    })),
  P('reyes-01-campana', F, {
    bg: 'bg-dark', dark: true,
    html: `<div class="abs center kicker gold-k" style="top:110px">Navidad, cerrada. ¡Gracias!</div>
      <div class="abs center h-xl white" style="top:170px">Y ahora…</div>
      <div class="abs center h-xl" style="top:300px"><span class="gold">¡Reyes!</span></div>
      <div class="abs row" style="top:1100px;color:#f2c14e"><span class="pill"><i></i>Pedidos hasta el {reyes}</span></div>`,
    objs: [{ make: 'star', color: 0xf2c14e, metal: 0.8, scale: 0.6, rot: 0.3 }], glow: 'gold', cam: [7.4, 0.45, 0.3, 0, 0.4],
  }),
  P('historia-reyes-quedan', ST, {
    bg: 'bg-dark', dark: true, story: true,
    html: `<div class="abs center kicker gold-k" style="top:280px">¿Aún sin regalo de Reyes?</div>
      <div class="abs center h-xl white" style="top:350px">Llegas<br><span class="gold">a tiempo</span></div>
      <div class="abs center sub white" style="top:650px">Pedidos para Reyes hasta el {reyes}</div>
      <div class="abs row" style="top:1430px"><span class="btn goldb">Escríbenos por DM</span></div>`,
    objs: [{ make: 'star', color: 0xf2c14e, metal: 0.8, scale: 0.5, rot: 0.3 }, { make: 'gift', color: 0x1d1d1f, ribbon: 0xf2c14e, scale: 0.4, x: 0.62, z: 0.3, rot: 0.6 }], glow: 'gold', cam: [8.6, 0.4, 0.12, 0, 0.5],
  }),
  P('navidad-05-feliz-navidad', F, {
    bg: 'bg-pine', dark: true, snow: true,
    html: `<div class="abs center kicker gold-k" style="top:110px">De parte de todo el equipo</div>
      <div class="abs center h-xl white" style="top:170px">¡Feliz</div>
      <div class="abs center h-xl" style="top:300px"><span class="gold">Navidad!</span></div>
      <div class="abs center sub white" style="top:1110px">Gracias por imprimir vuestras ideas con nosotros</div>`,
    objs: [{ make: 'tree', scale: 0.62, z: -0.2, rot: 0.3 }, { make: 'gift', color: 0xc8102e, ribbon: 0xf2c14e, scale: 0.36, x: -0.72, z: 0.35, rot: 0.6 }, { make: 'bauble', color: 0xf2c14e, scale: 0.34, x: 0.72, z: 0.35 }],
    glow: 'gold', cam: [7.6, 0.45, 0.3, 0, 0.5],
  }),
];
