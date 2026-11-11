# YAMPI — Cinemática de presentación

Tráiler cinematográfico de 72 segundos para presentar **Yampi**, una figura impresa en 3D en cuatro placas, con más de 48 horas de impresión y tres semanas de trabajo.

- 🎬 **Vídeo final:** [`video/YAMPI_cinematica_1080p.mp4`](video/YAMPI_cinematica_1080p.mp4) — 1920×1080, 24 fps, H.264 + AAC estéreo, -14 LUFS
- 📝 **Guion plano a plano:** [`GUION.md`](GUION.md)
- 🖼️ **Fotogramas clave:** [`video/fotogramas/`](video/fotogramas/)

## Estructura del vídeo

| Tiempo | Acto | Qué pasa |
|---|---|---|
| 0:00 | **I · El gancho** | *"Lo que estás a punto de ver… no es un render."* + destellos macro de detalles |
| 0:08 | **II · Lo digital** | *3 semanas de trabajo intenso*: las 4 placas de Bambu Studio como pantallas flotantes, el dato de **+1.000.000 de triángulos** |
| 0:24 | **III · Lo físico** | *Más de 2 días de impresión*: la silueta de Yampi se imprime capa a capa mientras el reloj llega a 48:00:00 y el holograma se materializa en la figura real |
| 0:36 | **IV · El detalle** | *Para crear una figura… con un detalle perfecto y una calidad impoluta*: planos macro con barridos de luz |
| 0:52 | **V · La revelación** | *Presentamos…* silencio, golpe, se abren las bandas negras, guitarra en Re mayor y **YAMPI** |

## Cómo está hecho

Todo se genera por código a partir de las dos fotos originales (`assets/source/`). No hay plantillas ni metraje de stock.

```
assets/
  source/        fotos originales (figura final + captura de Bambu Studio)
  generated/     máscaras de la figura y placas recortadas una a una
  fonts/         tipografías libres (licencia OFL)
cinematic/
  core.py        cámara, tipografía, etalonaje y efectos (grano, bloom, destellos, bandas…)
  scenes.py      las escenas de cada acto
  logo.py        logotipo YAMPI con extrusión "impresa en 3D" y antenas
  timeline.py    puntos de sincronía compartidos por imagen y sonido
  audio.py       banda sonora original sintetizada (dron, pulso, impactos, guitarra Karplus-Strong)
  render.py      composición de fotogramas y codificación con ffmpeg
tools/
  segment.py         máscara de la figura con un modelo ISNet (ONNX)
  refine_mask.py     limpieza de la máscara (separa a Yampi de la mano)
  extract_plates.py  recorta, endereza y limpia cada placa por separado
```

### Detalles técnicos

- **Placas de Bambu Studio**: cada una se recorta por separado de la foto del monitor, se corrige la rotación de la pantalla curva, se elimina el moiré y se realza. La foto completa de la pantalla no aparece en el vídeo.
- **Silueta holográfica**: la máscara de la figura (sin la mano) alimenta la impresión capa a capa, los barridos de luz y la luz de contorno.
- **Revelación**: el fondo de la foto se extiende con un desenfoque progresivo para dejar sitio al logotipo, con un cambio de foco que hace "saltar" a la figura.
- **Sonido**: todo sintetizado (sin muestras externas). Re menor durante el proceso y Re mayor en la revelación.

## Regenerar el vídeo

Requisitos: Python 3.10+, `ffmpeg` y las dependencias de `requirements.txt`.

```bash
pip install -r requirements.txt

# 1. Banda sonora (≈10 s)
python -m cinematic.audio --out build/soundtrack.wav

# 2. Vídeo con sonido (≈5 min con 4 núcleos)
python -m cinematic.render --audio build/soundtrack.wav --out video/YAMPI_cinematica_1080p.mp4

# Fotogramas sueltos para revisar (segundos separados por comas)
python -m cinematic.render --stills 3.0,30.0,60.0
```

Las máscaras y las placas ya están en `assets/generated/`. Para regenerarlas:

```bash
python tools/extract_plates.py assets/source/bambu_studio_placas.jpg assets/generated 2.5
# la máscara necesita un modelo ISNet en ONNX (no incluido en el repositorio)
python tools/segment.py isnet.onnx assets/source/yampi_final.jpg assets/generated/yampi_mask_isnet.png
python tools/refine_mask.py assets/source/yampi_final.jpg assets/generated/yampi_mask_isnet.png assets/generated
```

## Créditos

- Figura, diseño e impresión: el autor de Yampi.
- Tipografías (SIL Open Font License): Cinzel, Montserrat, Bebas Neue, JetBrains Mono y Fredoka.
