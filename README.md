# Filament Studio

Personalizador de color **en tiempo real** para piezas de impresión 3D. Subes el modelo «en blanco» (STL, 3MF, OBJ…), la app detecta sus partes (base, texto, relieve, figura, piezas sueltas, escalones de altura…) y le pones a cada parte un **filamento real** (marca → tipo → color) desde un catálogo conectado a internet. Está pensada para usarla **compartiendo pantalla en una videollamada con tu cliente**: cambias colores al momento y le enseñas el resultado.

![flujo](docs/flujo.png)

## ¿Qué hace?

| Función | Detalle |
|---|---|
| **Abrir modelos** | STL, 3MF (incluidos los de Bambu Studio / Orca / Prusa), OBJ, PLY, GLB. Arrastrar y soltar. |
| **Detección automática de partes** | ✨ *Inteligente*: piezas sueltas, **base**, **texto / relieve** (también cuando el texto está fundido en la misma malla), placas y **escalones de altura** (p. ej. copa sobre columna). Pone nombres claros según la forma: *Base, Copa, Columna, Placa, Tapa, Pomo, Texto…* También *Piezas sueltas*, *Por caras* (aristas vivas) y *Por capas*. |
| **Partes como capas** | Lista de partes con color, % de superficie, ocultar/mostrar, renombrar (doble clic, se puede deshacer), unir, quitar y **Aislar** (ver solo la selección, tecla **H**). **Tab** salta a la siguiente parte sin color. |
| **Herramientas** | **Seleccionar** · **Pincel** (pinta zonas libres) · **Relleno inteligente** (una cara plana, una letra, un borde…) · **Capas** (franjas de color por altura, con ajuste a altura de capa) · **Mover / Girar** cada parte por separado con flechas y aros, como en Bambu Studio (con *Apoyar en la cama* y *Separar partes*). **Subdividir** la malla para pintar con más detalle. Deshacer/rehacer ilimitado. |
| **Texto 3D** | Tecla **T**. Escribe un nombre, una fecha o una dedicatoria (con tildes, ñ, ¿¡ y €), elige letra (Moderna, Gruesa, Deportiva o Clásica), altura y relieve, y haz clic en la pieza: el texto aparece en relieve sobre esa cara, derecho según la vista, como una parte nueva lista para darle su color. La IA también sabe ponerlo («pon MARÍA en el frente de la base»). |
| **✂ Cortar en piezas con anclajes automáticos** | Tecla **X**. Corta la pieza por donde quieras para imprimirla por partes: porque **no cabe en la impresora**, para **imprimir cada parte de su color sin AMS** (y sin purga) o para evitar soportes. El plano se coloca **a la selección** (justo donde la parte elegida se une al resto: la copa, la tapa, el texto…), horizontal, vertical o como quieras (flecha para moverlo, aros para inclinarlo). La app cierra los cortes y **calcula sola los anclajes según la forma de la sección**: tamaño (~30 % del grosor), cuántos (dos para que no gire, más en secciones grandes) y dónde (lo más separados posible, con pared suficiente y sin tocar escalones, huecos ni otros cuerpos). Tipos: **pasadores sueltos** (recomendado: las dos piezas se imprimen apoyadas en el corte), **espigas** (si un lado es demasiado fino, salen de ese lado solas), **imanes** (huecos para imanes de 3 a 12 mm, para tapas) o ninguno. Holgura justa / normal / holgada. Puedes añadir o quitar anclajes con un clic, y **🔎 Mejor sitio** busca cerca una zona más gruesa si en el corte no caben. Después: **Separar** (ver cómo encaja), **Montar** y **Colocar para imprimir** (cada pieza tumbada por su cara plana y repartidas en la cama). Se puede cortar varias veces y deshacer. |
| **Catálogo de filamentos en vivo** | **Bambu Lab** (base oficial de colores de Bambu Studio, con HEX y código de cada bobina) + **más de 85 marcas** (Sunlu, eSun, Polymaker, Elegoo, Prusament, Overture, Jayo, Eryone, Creality, Anycubic…). Categorías: PLA Básico, PLA Matte, **PLA Silk**, PLA+/Tough, Translúcido, Especial (marble, sparkle, galaxy, bicolor…), Glow, Wood, Fibra, **PETG**, **ASA**, ABS, TPU, PC, PA/Nylon… Buscador en español/inglés («dorado», «negro mate», «silk rojo»). |
| **Favoritos, recientes y Mis bobinas** | Los colores que usas aparecen a mano encima del catálogo. Clic derecho en un color = favorito ★. Marca **🧵 La tengo** en los colores que tienes en el taller: la lista **Mis bobinas** (en el selector de marcas) reúne tus bobinas de todas las marcas, y la app avisa ⚠ si el cliente elige un color que no tienes. Se guarda en el ordenador (`prefs.json`). |
| **Equivalencias entre marcas** | Para el color activo, la app busca el más parecido **en tus bobinas** y en otras marcas (misma familia de material), con la diferencia de color que percibe el ojo (ΔE CIEDE2000: «idéntico a la vista», «muy parecido»…). También puedes **buscar en todas las marcas a la vez**. |
| **Cuentagotas** | Botón 💧 (tecla **I**): haz clic en una parte de la pieza y su color pasa a ser el color activo. |
| **Presupuesto instantáneo** | **€ Presupuesto** (tecla **Q**): peso de cada color, **purga de los cambios de color capa a capa**, tiempo de impresión, coste de material y máquina, preparación, margen e IVA → precio para el cliente, actualizado al momento cuando cambias colores o tamaño. **Unidades** para pedidos de varias copias: calcula cuántas caben en la cama y reparte la purga y la preparación (el precio por unidad baja). Botón **Copiar mensaje** con el presupuesto listo para WhatsApp, y opción de enseñar el precio en el modo cliente y en la imagen. Todos los valores (€/kg, relleno, velocidad, margen…) se ajustan a tu taller. |
| **Tamaño en mm** | **Tamaño…** (tecla **S**): ancho, fondo y alto en milímetros, con candado de proporción, y el precio con el nuevo tamaño antes de aplicarlo. Avisa si no cabe en la cama. |
| **Tiendas online** | Pega la dirección de cualquier tienda Shopify (p. ej. de una marca) y lee sus colores y disponibilidad en vivo. |
| **Aspecto realista** | Silk brillante, Matte, translúcido, metálico, sparkle, glow, y filamentos **bicolor / tricolor / degradado**. Opción **Líneas de capa** para que, de cerca, la pieza se vea como impresa. |
| **Asistente IA** | Ve la pieza, reconoce base/texto/trofeo, pone nombres, divide por alturas, **corta en piezas con anclajes**, busca filamentos reales y los aplica. Le hablas normal: *«la base en negro mate y el texto dorado silk»*, *«córtala para que quepa en mi A1 mini»*. |
| **Propuestas A / B / C** | Guarda varias combinaciones de colores y cambia entre ellas con un clic delante del cliente. **Exportar → Comparar propuestas** crea una sola imagen con todas lado a lado para que elija. |
| **Vista por capas** | Deslizador que recorta la pieza a cualquier altura, como la vista previa del laminador (tecla **L**). Con la herramienta *Capas* activa, mueve también el plano de corte. |
| **Modo cliente** | Oculta los paneles y deja la pieza, la leyenda de colores y las propuestas, ideal para compartir pantalla (tecla **P**). |
| **Autoguardado** | Si se cierra o recarga la página durante la llamada, al volver aparece «Recuperar» con todo tal cual estaba. |
| **Abrir en Bambu Studio / OrcaSlicer** | Un clic en **Exportar → Abrir en Bambu Studio**: guarda el 3MF en `Documentos\Filament Studio` y abre el laminador instalado con él. |
| **Visor 3D para el cliente** | **Exportar → Visor 3D para el cliente (HTML)**: un solo archivo que el cliente abre en el navegador para girar su pieza con los colores elegidos, comparar las propuestas A/B/C y ver el precio (si activas «Enseñar el precio al cliente»). Pesa poco (unos 300 KB para un trofeo). Para girarla hace falta abrirlo en el navegador con internet; si no (por ejemplo, en la vista previa de WhatsApp del iPhone), se ve una imagen de la pieza con la leyenda y el precio. |
| **Vídeo 360°** | **Exportar → Vídeo 360°**: la pieza da una vuelta con los colores elegidos (cuadrado, vertical u horizontal, con rótulo y el nombre de tu taller) y se guarda en MP4 para enviarla por WhatsApp. |
| **Exportar** | Imagen de propuesta para el cliente (PNG o copiar al portapapeles) · **3MF para Bambu Studio** (al abrirlo, Bambu Studio 2.5+ crea los filamentos con los colores exactos) · **3MF pintado** (cada zona con su número de filamento, para OrcaSlicer, PrusaSlicer y Bambu Studio antiguo) · **OBJ con colores** (Bambu Studio y OrcaSlicer convierten sus colores en filamentos) · **STL por color** (ZIP) · **STL por pieza** (cada pieza cortada ya tumbada para imprimir, los pasadores y un LÉEME para montarla) · Ficha de filamentos · Proyecto `.fsproj`. Si la pieza está cortada, el 3MF lleva **cada pieza como un objeto** separado y ya colocadas para imprimir. Al exportar, la app muestra **qué color va en cada número de filamento** y los pasos a seguir en el laminador. |
| **Limpieza automática** | Al abrir un archivo se quitan los trocitos sueltos minúsculos que estén fuera de la pieza (errores del archivo que hacen que el laminador diga que «supera el límite de la placa»). |

**Tutorial para empezar**: la primera vez que abres la app aparece un recorrido de un minuto por todo lo importante (se puede repetir desde **?** → *Ver el tutorial*).

## Programa para Windows (.exe) — lo más fácil

`FilamentStudio.exe` lleva todo dentro (también Node.js), así que **no hay que instalar nada**:

1. Descarga `FilamentStudio-Windows.zip`. Se genera solo en GitHub: pestaña **Actions** → «Ejecutable de Windows» → la ejecución más reciente → sección **Artifacts**.
2. **Antes de descomprimir**: clic derecho sobre el ZIP → *Propiedades* → marca **Desbloquear** → *Aceptar*. Así Windows no lo bloquea.
3. Descomprime y haz doble clic en **FilamentStudio.exe**. Se abre una ventana negra (el motor; no la cierres) y el navegador con la app.
4. Si aun así aparece «Windows protegió su PC»: *Más información* → *Ejecutar de todas formas*. Sale porque el programa no está firmado con un certificado de pago.

La clave de la IA se puede pegar directamente en el panel **✦ IA**. Los datos (caché del catálogo, favoritos, bobinas y ajustes del presupuesto) se guardan en `%LOCALAPPDATA%\FilamentStudio`.

Para generarlo tú mismo: `npm run build:exe` (crea `dist/FilamentStudio-Windows.zip`; funciona desde Windows, Mac o Linux).

## Versión web (con un enlace, sin instalar)

La misma app funcionando en el navegador, sin servidor: `npm run build:web` la monta en `dist/web` y se publica como artifact de claude.ai (privado hasta que lo compartas desde su menú *Compartir*). Funciona igual: abrir piezas, detectar partes, colores reales de las 87 marcas (copia del catálogo del día en que se montó), presupuesto, cortar con anclajes, texto 3D, propuestas, modo cliente, vídeo 360° y todas las exportaciones. También se adapta al móvil.

Diferencias con la de Windows:
- **Abrir en Bambu Studio / OrcaSlicer** descarga el 3MF para abrirlo a mano (el navegador no puede abrir programas).
- Las descargas las confirma el visor de claude.ai. El 3MF va dentro de un ZIP y el proyecto se guarda como `.fsproj.json` (se abre igual).
- Favoritos, bobinas y ajustes del presupuesto se guardan en ese navegador.
- Sin asistente IA ni lectura de tiendas Shopify en vivo.

El adaptador está en `scripts/web/shim.js`. three.js se carga de cdn.jsdelivr.net con la versión exacta instalada; con `node scripts/build-web.mjs --vendor` se copia al lado para alojar la web sin depender del CDN. `dist/web/preview.html` sirve para probarla en local con cualquier servidor de archivos.

## Instalación desde el código (alternativa)

1. Instala **Node.js 20.12 o superior**: <https://nodejs.org>
2. Descarga esta carpeta.
3. **Windows**: doble clic en `iniciar.bat` · **macOS**: doble clic en `iniciar.command` · **Linux / terminal**:

```bash
npm install
```

```bash
npm start
```

Se abre el navegador en <http://localhost:5173>.

### Activar la IA (opcional)

1. Crea una clave en <https://console.anthropic.com>.
2. Abre el panel **✦ IA** de la app y pégala (se guarda solo en tu ordenador). También puedes copiar `.env.example` como `.env` y poner `ANTHROPIC_API_KEY=tu_clave`.
3. Sin clave, todo lo demás funciona igual.

## Cómo usarla en una videollamada

1. **Abrir modelo** (o arrástralo). La app detecta las partes automáticamente.
2. Haz clic en una parte (en la pieza o en la lista) y después en un color del panel derecho: se aplica al instante.
3. ¿El cliente quiere otro color en una zona que no es una parte? Usa **Capas** (por altura), **Relleno** o **Pincel**, o pídeselo a la IA.
4. ¿Dudas entre varias combinaciones? Pulsa **+ Guardar** (arriba a la derecha del visor) para crear la propuesta A, cambia colores, guarda la B… y alterna entre ellas con un clic.
5. Pulsa **Modo cliente** (tecla P) para enseñar solo la pieza y la leyenda de colores. Gira con el ratón o con ⟳.
6. **Exportar → Copiar imagen** y pégala en el chat de la llamada, descarga el PNG, **Comparar propuestas** para mandar todas juntas, o **Vídeo 360°** para enviarle un vídeo por WhatsApp.
7. Pulsa **€ Presupuesto** (tecla Q) para darle el precio al momento. Si pregunta «¿y más grande?», abre **Tamaño…** (tecla S): verás el precio nuevo antes de aplicarlo. ¿Son 12 trofeos? Cambia **Unidades** y tendrás el total y el precio por unidad. **Copiar mensaje** deja el presupuesto listo para pegar en WhatsApp.
8. Cuando esté aprobado: **Exportar → Abrir en Bambu Studio** (o **3MF para Bambu Studio** y ábrelo tú). Aparece «Importar modelo: Simplificar colores» → **Siguiente** → «Completar todos los filamentos» → **Confirmar**, y los filamentos quedan creados con los colores exactos, cada uno en su zona.
   - **OrcaSlicer, PrusaSlicer o Bambu Studio anterior a 2.5**: usa **Exportar → 3MF pintado**. La app te muestra qué filamento va en cada número (1, 2, 3…): ponlos así en «Filamentos del proyecto».
   - **OBJ con colores** es otra opción para Bambu Studio y OrcaSlicer: también te pregunta los colores al importarlo.

> ¿Por qué hay dos 3MF? Bambu Studio solo lee los colores de un 3MF de otro programa si el archivo **no trae zonas pintadas**; si las trae, usa los filamentos que tengas puestos y los colores no coinciden. OrcaSlicer, en cambio, solo entiende la pintura.

### Imprimir

- **Con AMS / multimaterial**: el 3MF ya trae cada zona asignada a su filamento (en Bambu Studio, con su color). Empareja cada filamento con la bobina del AMS.
- **Sin AMS (cualquier impresora)**: si la pieza está dividida por alturas, la ficha te dice **en qué capa cambiar de filamento** (pausa / cambio de filamento en el laminador).
- **Piezas sueltas** (base + texto + figura): exporta **STL por color** e imprímelas por separado o como un objeto de varias partes.
- **No cabe en la cama, o quieres cada parte de un color sin AMS**: herramienta **✂ Cortar** (tecla X). Selecciona la parte, pulsa **◎ A la selección** (o un corte horizontal / vertical), revisa los anclajes que propone y **✂ Cortar aquí**. Con **⤓ Colocar para imprimir** cada pieza queda tumbada por la cara del corte; exporta el 3MF (una pieza por objeto) o **STL por pieza**. Imprime los pasadores de pie y pega con cianoacrilato.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| V / B / F / M | Seleccionar / Pincel / Relleno / Mover |
| T | Texto 3D (con Mover: mover) |
| X | Cortar en piezas (con anclajes) |
| C | Capas: dividir el color por altura |
| R | (con Mover) girar |
| [ y ] | Tamaño del pincel |
| 1 – 7 | Vistas: 3D, frente, detrás, izquierda, derecha, arriba, abajo |
| P | Modo cliente |
| L | Vista por capas |
| Alt + clic | Aplicar el color activo a la parte pulsada |
| I | Cuentagotas: copiar el color de una parte |
| H | Aislar la selección / ver todo |
| Tab / Mayús+Tab | Siguiente / anterior parte sin color |
| Q | Presupuesto |
| S | Tamaño en mm |
| ? | Lista de atajos |
| Ctrl+Z / Ctrl+Y | Deshacer / rehacer |
| Supr | Quitar la parte seleccionada |
| Esc | Quitar selección |
| Mayús + clic | Seleccionar varias partes |

## De dónde salen los colores

- **Bambu Lab**: archivo oficial de colores de filamento que Bambu Lab publica en el repositorio de Bambu Studio (los mismos HEX que muestra el AMS).
- **Resto de marcas**: [SpoolmanDB](https://github.com/Donkie/SpoolmanDB), base de datos abierta y mantenida por la comunidad con más de 85 fabricantes.
- **Tiendas Shopify**: lectura directa de la tienda (nombre, disponibilidad y precio; el tono se aproxima por el nombre del color).

La app consulta estas fuentes en vivo y guarda una copia durante 6 horas (botón ⟳ para forzar la actualización). Si no hay internet, usa una copia local incluida (`data/snapshot`), que se puede renovar con `npm run snapshot`. El indicador del panel muestra si los datos son **en vivo**, de **caché** o de la **copia local**.

> Los colores en pantalla son orientativos: cada monitor muestra los tonos de forma distinta.

## Vídeo de presentación y web

- **Vídeo** (`promo/`): composición HTML + 3D animada por tiempo y grabada fotograma a fotograma, sin tirones, con banda sonora sintetizada en el navegador. `node promo/make-assets.mjs` prepara el trofeo cortado, `node promo/render.mjs` graba `promo/out/filament-studio.mp4` (1080p, 30 fps; `--preview --at 12,40` saca fotogramas sueltos y `--from 35 --to 47` graba un tramo).
- **Reel para redes** (`promo/reel.html`): anuncio vertical de 26 s (1080×1920) para Instagram, TikTok y YouTube Shorts: «OBEKET presenta», el programa, sus funciones y «Próximamente». Música cuadrada con los cortes, volumen normalizado para redes (-14 LUFS) y lo importante dentro de la zona segura. Para usar el logo de Obeket en lugar del nombre en letra, deja `promo/assets/obeket-logo.svg` (o `.png`, con fondo transparente y en claro). `node promo/render.mjs --comp reel` → `promo/out/filament-studio-reel.mp4`.
- **Vídeo explicativo** (`promo/explica.html`): qué es y cómo se usa en 35 s, en vertical y con la app real (cámara que se acerca a cada botón, cursor y clics): abrir, colores reales, presupuesto, cortar, texto 3D y Bambu Studio. Con la app en marcha, `node promo/capture-app.mjs` hace las capturas de cada paso (`promo/assets/explica/`) y `node promo/render.mjs --comp explica` graba `promo/out/filament-studio-explica.mp4`.
- **Web** (`site/`): página estática; se abre con cualquier servidor de archivos (por ejemplo `npx serve site`). La portada deja colorear el trofeo con colores reales, el despiece se mueve con el scroll y el nombre en relieve se escribe en vivo. `node promo/stills.mjs` regenera las imágenes de respaldo y `node site/build-artifact.mjs` crea la versión para publicarla como artifact de claude.ai.

## Estructura

```
server/          servidor local (catálogo en vivo, preferencias, abrir en el laminador, puente con la IA)
  slicer.js        busca Bambu Studio / OrcaSlicer / PrusaSlicer y les abre el 3MF
public/          la aplicación (three.js)
  js/meshcore.js   geometría: topología, detección de partes, cortes por altura, subdivisión
  js/cut.js        corte en piezas: plano libre, tapas cerradas, anclajes automáticos, colocar para imprimir
  js/text3d.js     texto 3D en relieve (fuentes en public/fonts, generadas con scripts/make-fonts.mjs)
  js/tour.js       tutorial para la gente nueva
  js/share.js      visor 3D para el cliente (un HTML con la pieza, sus colores y las propuestas)
  js/state.js      partes, piezas, colores, historial
  js/viewer.js     visor 3D, selección, pincel, capturas, vídeo 360°
  js/catalog.js    panel de filamentos, favoritos, mis bobinas, equivalencias
  js/colorsci.js   diferencia de color (CIEDE2000) para las equivalencias
  js/quote.js      presupuesto instantáneo
  js/video.js      grabación del vídeo 360°
  js/prefs.js      preferencias del usuario (se guardan en el ordenador)
  js/ai.js         asistente IA (herramientas que ejecuta sobre la pieza)
  js/exporters.js  3MF (Bambu / pintado), OBJ con colores, STL por color, imagen, ficha, proyecto
scripts/         instantánea del catálogo, modelos de ejemplo, pruebas y build-exe.mjs (el .exe)
promo/           vídeo de presentación (composición, render fotograma a fotograma y banda sonora)
site/            web del producto (portada 3D interactiva, despiece al hacer scroll, texto en relieve)
```
