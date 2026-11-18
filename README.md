# Filament Studio

Personalizador de color **en tiempo real** para piezas de impresión 3D. Subes el modelo «en blanco» (STL, 3MF, OBJ…), la app detecta sus partes (base, texto, relieve, figura, piezas sueltas, escalones de altura…) y le pones a cada parte un **filamento real** (marca → tipo → color) desde un catálogo conectado a internet. Está pensada para usarla **compartiendo pantalla en una videollamada con tu cliente**: cambias colores al momento y le enseñas el resultado.

![flujo](docs/flujo.png)

## ¿Qué hace?

| Función | Detalle |
|---|---|
| **Abrir modelos** | STL, 3MF (incluidos los de Bambu Studio / Orca / Prusa), OBJ, PLY, GLB. Arrastrar y soltar. |
| **Detección automática de partes** | ✨ *Inteligente*: piezas sueltas, **base**, **texto / relieve** (también cuando el texto está fundido en la misma malla), placas y **escalones de altura** (p. ej. copa sobre columna). También *Piezas sueltas*, *Por caras* (aristas vivas) y *Por capas*. |
| **Partes como capas** | Lista de partes con color, % de superficie, ocultar/mostrar, renombrar (doble clic), unir y quitar. |
| **Herramientas** | **Seleccionar** · **Pincel** (pinta zonas libres) · **Relleno inteligente** (una cara plana, una letra, un borde…) · **Cortar por altura** con plano visible y ajuste a altura de capa. **Subdividir** la malla para pintar con más detalle. Deshacer/rehacer ilimitado. |
| **Catálogo de filamentos en vivo** | **Bambu Lab** (base oficial de colores de Bambu Studio, con HEX y código de cada bobina) + **más de 85 marcas** (Sunlu, eSun, Polymaker, Elegoo, Prusament, Overture, Jayo, Eryone, Creality, Anycubic…). Categorías: PLA Básico, PLA Matte, **PLA Silk**, PLA+/Tough, Translúcido, Especial (marble, sparkle, galaxy, bicolor…), Glow, Wood, Fibra, **PETG**, **ASA**, ABS, TPU, PC, PA/Nylon… Buscador en español/inglés («dorado», «negro mate», «silk rojo»). |
| **Tiendas online** | Pega la dirección de cualquier tienda Shopify (p. ej. de una marca) y lee sus colores y disponibilidad en vivo. |
| **Aspecto realista** | Silk brillante, Matte, translúcido, metálico, sparkle, glow, y filamentos **bicolor / tricolor / degradado**. |
| **Asistente IA** | Ve la pieza, reconoce base/texto/trofeo, pone nombres, divide por alturas, busca filamentos reales y los aplica. Le hablas normal: *«la base en negro mate y el texto dorado silk»*. |
| **Modo cliente** | Oculta los paneles y deja la pieza y la leyenda de colores, ideal para compartir pantalla (tecla **P**). |
| **Exportar** | Imagen de propuesta para el cliente (PNG o copiar al portapapeles) · **3MF pintado** que abre Bambu Studio / OrcaSlicer / PrusaSlicer con los colores por zonas · **STL por color** (ZIP) · Ficha de filamentos (incluye en qué capa cambiar de filamento si la pieza va por bandas) · Proyecto `.fsproj` para seguir otro día. |

## Instalación (una sola vez)

1. Instala **Node.js 18 o superior**: <https://nodejs.org>
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
2. Copia `.env.example` como `.env` y pon tu clave:

```
ANTHROPIC_API_KEY=tu_clave
```

3. Reinicia la app. Sin clave, todo lo demás funciona igual.

## Cómo usarla en una videollamada

1. **Abrir modelo** (o arrástralo). La app detecta las partes automáticamente.
2. Haz clic en una parte (en la pieza o en la lista) y después en un color del panel derecho: se aplica al instante.
3. ¿El cliente quiere otro color en una zona que no es una parte? Usa **Cortar** (por altura), **Relleno** o **Pincel**, o pídeselo a la IA.
4. Pulsa **Modo cliente** (tecla P) para enseñar solo la pieza y la leyenda de colores. Gira con el ratón o con ⟳.
5. **Exportar → Copiar imagen** y pégala en el chat de la llamada, o descarga el PNG.
6. Cuando esté aprobado: **Exportar → 3MF pintado** y ábrelo en Bambu Studio / OrcaSlicer. Asigna los filamentos en el orden de la ficha (filamento 1, 2, 3…).

### Imprimir

- **Con AMS / multimaterial**: el 3MF pintado ya trae cada zona asignada al filamento 1, 2, 3… Solo elige los colores en el laminador.
- **Sin AMS (cualquier impresora)**: si la pieza está dividida por alturas, la ficha te dice **en qué capa cambiar de filamento** (pausa / cambio de filamento en el laminador).
- **Piezas sueltas** (base + texto + figura): exporta **STL por color** e imprímelas por separado o como un objeto de varias partes.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| V / B / F / C | Seleccionar / Pincel / Relleno / Cortar |
| [ y ] | Tamaño del pincel |
| 1 – 7 | Vistas: 3D, frente, detrás, izquierda, derecha, arriba, abajo |
| P | Modo cliente |
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

## Estructura

```
server/          servidor local (catálogo en vivo + puente con la IA)
public/          la aplicación (three.js)
  js/meshcore.js   geometría: topología, detección de partes, cortes, subdivisión
  js/state.js      partes, colores, historial
  js/viewer.js     visor 3D, selección, pincel, capturas
  js/catalog.js    panel de filamentos
  js/ai.js         asistente IA (herramientas que ejecuta sobre la pieza)
  js/exporters.js  3MF pintado, STL por color, imagen, ficha, proyecto
scripts/         instantánea del catálogo, modelos de ejemplo y pruebas
```
