# YAMPI — Cinemática de presentación

Spot de 67 segundos para presentar **Yampi**, una figura impresa en 3D en cuatro placas, con más de dos días de impresión y tres semanas de trabajo. Tiene el tono de un anuncio de producto de alta gama: luz cálida, cámara lenta, tipografía serif y música de piano, guitarra y cuerdas.

- 🎬 **Vídeo final:** [`video/YAMPI_cinematica_1080p.mp4`](video/YAMPI_cinematica_1080p.mp4). 1920×1080, 24 fps, H.264 + AAC estéreo
- 📝 **Guion plano a plano:** [`GUION.md`](GUION.md)
- 🖼️ **Fotogramas clave:** [`video/fotogramas/`](video/fotogramas/)

## Estructura

| Tiempo | Bloque | Texto |
|---|---|---|
| 0:00 | Apertura: los ojos y la antena salen de la oscuridad | — |
| 0:07 | Capa a capa: una línea dorada "imprime" la figura | *Más de dos días de impresión* |
| 0:13 | Las cuatro piezas (las cuatro placas) despiezadas y ensambladas | *Tres semanas de trabajo intenso* |
| 0:23 | Órbita de cámara alrededor de Yampi | *Para crear una figura…* |
| 0:30 | Detalles: rostro, clavijero, cuerdas, contrapicado | *…con un detalle perfecto · y una calidad impoluta.* |
| 0:43 | Respiración en negro | *Presentamos* |
| 0:47 | Revelación y logotipo | **YAMPI** · *Impreso en 3D · capa a capa* |
| 0:57 | Epílogo con la foto real | *Del render… a la realidad.* |

## Cómo está hecho

1. **Modelo 3D de Yampi** (`cinematic3d/model.py`). Se construye por código en Blender a partir de la foto de la figura real: proporciones, colores medidos en la foto, pelo peinado en mechones diagonales, antenas, orejas, guitarra con seis clavijas y las cuatro piezas de impresión separadas (cabeza; pelo con antenas; torso, brazos y guitarra; piernas y zapatos).
2. **Plató y planos** (`cinematic3d/studio.py`, `cinematic3d/shots.py`). Ciclorama oscuro, peana mate, luz principal cálida, contraluces y objetivos de 38 a 100 mm con profundidad de campo real, renderizados con Cycles. La órbita se renderiza a 12 fps y se interpola a 24 fps con flujo óptico.
3. **Montaje y acabado** (`cinematic/film2.py`). Movimientos lentos sobre los renders, efecto "capa a capa", despiece animado, tipografía Cormorant Garamond y Montserrat, etalonaje cálido, halo en las altas luces, grano fino y viñeta suave.
4. **Música original** (`cinematic/audio2.py`). Piano por síntesis aditiva, guitarra Karplus-Strong afinada, cuerdas y chelo, a 72 BPM en Re mayor. Mezcla con reverb de sala y sonoridad de -16 LUFS.

## Regenerar el vídeo

Requisitos: Python 3.10+, `ffmpeg` y las dependencias de `requirements.txt` (incluye `bpy`, Blender como módulo de Python).

```bash
pip install -r requirements.txt

# 1. Renders 3D (unos 40 min en 4 núcleos)
python -m cinematic3d.shots build/3d ojos antena cara34 clavijero cuerdas_boca contrapicado entero \
    entero_fondo entero_alfa heroe_izq capa_todo capa_cabeza capa_pelo capa_torso capa_piernas capa_fondo
python -m cinematic3d.shots build/3d/orbita --orbita
python -m cinematic.film2 --prepare-orbit

# 2. Música
python -m cinematic.audio2 --out build/score2.wav

# 3. Vídeo final
python -m cinematic.film2 --audio build/score2.wav --out video/YAMPI_cinematica_1080p.mp4

# Vistas rápidas del modelo y fotogramas sueltos
python -m cinematic3d.preview build/preview frente cara tresc
python -m cinematic.film2 --stills 2,18,50
```

La primera versión (estilo tráiler tecnológico) sigue en `cinematic/scenes.py`, `cinematic/render.py` y `cinematic/audio.py`. La v2 reutiliza de ella las herramientas comunes y la composición de la foto real del epílogo.

## Créditos

- Figura, diseño e impresión: el autor de Yampi.
- Tipografías (SIL Open Font License): Cormorant Garamond, Montserrat, Cinzel, Bebas Neue, JetBrains Mono y Fredoka.
