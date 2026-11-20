# OBEKET · contenido para Instagram

Reels (MP4 1080×1920 con música original), posts del feed (PNG 1080×1350) e historias (PNG 1080×1920) para la
marca OBEKET y su campaña de Navidad. Las piezas 3D se generan con three.js e "imprimen" capa a capa.

- Resultados: `out/` (reels) y `out/posts/` (imágenes). Textos, captions y calendario: `TEXTOS.md`.
- Cambiar usuario, fecha límite o nombres: `config.js`. Cambiar textos de los posts: `posts-list.mjs`.
- Regenerar: `npm install` y luego `node render.mjs` (todo), `node render.mjs reel-navidad` o `node render.mjs posts`.
  Vista previa de fotogramas: `node render.mjs reel-navidad --preview 1,5,9`. Necesita ffmpeg y Playwright.
