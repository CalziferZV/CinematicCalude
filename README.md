# YAMPI — Cinemática de presentación

Spot de 67 segundos para presentar **Yampi**, una figura impresa en 3D en cuatro placas, con más de dos días de impresión y tres semanas de trabajo. Tiene el tono de un anuncio de producto de alta gama: luz cálida, cámara lenta, tipografía serif y música de piano, guitarra y cuerdas.

- 🎬 **Vídeo final:** [`video/YAMPI_cinematica_1080p.mp4`](video/YAMPI_cinematica_1080p.mp4). 1920×1080, 24 fps, H.264 + AAC estéreo
- ⚡ **Teaser épico de 33 s para OBEKET:** [`video/YAMPI_OBEKET_teaser_1080p.mp4`](video/YAMPI_OBEKET_teaser_1080p.mp4). Abre con el símbolo de OBEKET, termina con la foto real de la figura y cierra con el logotipo y @obeket.co
- 📱 **Teaser en vertical 9:16 (Reels y TikTok), máxima calidad:** [`video/YAMPI_OBEKET_teaser_vertical_1080x1920.mp4`](video/YAMPI_OBEKET_teaser_vertical_1080x1920.mp4). Todos los planos 3D se renderizan en vertical a resolución nativa. Copia ligera para ver en el móvil: [`video/YAMPI_OBEKET_teaser_vertical_movil.mp4`](video/YAMPI_OBEKET_teaser_vertical_movil.mp4)
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

1. **El modelo 3D real** (`tools/load3mf.py`, `cinematic3d/real.py`). La geometría sale del proyecto de impresión de Bambu Studio (`YAMPI_200mm_COMPLETO_CORREGIDO_COLOR_P1S.3mf`: 200 mm, 1,9 millones de triángulos). Del 3MF solo se usan la forma y las zonas pintadas, que separan los materiales; los colores se miden en las fotos de la figura impresa. También se corrigen las zonas que no coinciden con la figura real: iris, cejas y puente de la guitarra en negro, laterales de la guitarra en marrón oscuro, franja oscura bajo el flequillo y motas sueltas. El color va por vértice, así los bordes quedan suaves.
2. **Las cuatro piezas.** El modelo se corta por el cuello y por el bajo de la camiseta, y el pelo se separa por su zona, con tapas en los cortes y un casquete oscuro bajo el pelo. Así se obtienen las cuatro placas de impresión del despiece: cabeza; pelo con antenas; torso, brazos y guitarra; piernas y zapatos.
3. **Plató y planos** (`cinematic3d/studio.py`, `cinematic3d/shots.py`). Ciclorama oscuro, peana mate, luz principal cálida, contraluces y objetivos de 38 a 100 mm con profundidad de campo real, renderizados con Cycles. La órbita se renderiza a 12 fps y se interpola a 24 fps con flujo óptico.
4. **Montaje y acabado** (`cinematic/film4.py` sobre `cinematic/film2.py`). Movimientos lentos sobre los renders, efecto "capa a capa", despiece animado, tipografía Cormorant Garamond y Montserrat, etalonaje cálido, halo en las altas luces, grano fino y viñeta suave.
5. **Música original** (`cinematic/audio2.py`). Piano por síntesis aditiva, guitarra Karplus-Strong afinada, cuerdas y chelo, a 72 BPM en Re mayor. Mezcla con reverb de sala y sonoridad de -16 LUFS.
6. **Teaser para OBEKET** (`cinematic/teaser.py`, `cinematic/audio_teaser.py`). Montaje rápido de 33 s a 90 BPM sobre los mismos renders: cortes con destello en cada golpe, rótulos en Cinzel y Cormorant, revelación de YAMPI, la foto real de la figura en la mano y cierre con los logotipos de OBEKET (`assets/source/obeket_*.png`) y la cuenta @obeket.co. Música de tráiler (tambores, ostinato de cuerdas, metales graves, subida, silencio y gran golpe) a -14 LUFS. La versión vertical (`cinematic/teaser_v.py`) usa los mismos tiempos y música con planos 3D renderizados en 9:16 (`v_*` en `cinematic3d/shots.py`), la órbita fotograma a fotograma a 24 fps y la foto real, que ya es vertical.

## Regenerar el vídeo

Requisitos: Python 3.10+, `ffmpeg` y las dependencias de `requirements.txt` (incluye `bpy`, Blender como módulo de Python). El 3MF no está en el repositorio: cópialo en `assets/source/`.

```bash
pip install -r requirements.txt

# 1. Modelo: geometría y zonas pintadas del 3MF
python -I tools/load3mf.py assets/source/YAMPI_200mm_COMPLETO_CORREGIDO_COLOR_P1S.3mf build/real/yampi_mesh.npz

# 2. Renders 3D (unos 50 min en 4 núcleos)
python -m cinematic3d.shots build/3d_real ojos antena entero entero_fondo entero_alfa cara34 clavijero \
    cuerdas_boca contrapicado heroe_izq capa_cabeza capa_pelo capa_torso capa_piernas capa_todo capa_fondo
python -m cinematic3d.shots build/3d_real/orbita --orbita
python -m cinematic.film4 --prepare-orbit

# 3. Música
python -m cinematic.audio2 --out build/score2.wav

# 4. Vídeo final
python -m cinematic.film4 --audio build/score2.wav --out video/YAMPI_cinematica_1080p.mp4

# 5. Teaser de 33 s para OBEKET (mismos renders, música propia)
python -m cinematic.audio_teaser --out build/score_teaser.wav
python -m cinematic.teaser --audio build/score_teaser.wav --out video/YAMPI_OBEKET_teaser_1080p.mp4

# 6. Teaser vertical 9:16 (planos 3D en vertical, órbita nativa a 24 fps)
python -m cinematic3d.shots build/3d_real v_ojos v_antena v_entero v_entero_fondo v_entero_alfa v_cara34 \
    v_clavijero v_cuerdas v_contrapicado v_heroe v_capa_cabeza v_capa_pelo v_capa_torso v_capa_piernas \
    v_capa_todo v_capa_fondo
python -m cinematic3d.shots build/3d_real/v_orbita --orbita-v
python -m cinematic.teaser_v --audio build/score_teaser.wav --out video/YAMPI_OBEKET_teaser_vertical_1080x1920.mp4

# Vistas rápidas del modelo y fotogramas sueltos
python -m cinematic3d.real_preview build/real/prev
python -m cinematic.film4 --stills 2,18,50
```

Versiones anteriores: la v1 (estilo tráiler tecnológico) está en `cinematic/scenes.py`, `cinematic/render.py` y `cinematic/audio.py`; la v2 usaba un modelo procedural (`cinematic3d/model.py`) en lugar del modelo real. La v4 reutiliza el montaje de la v2 y la composición de la foto real del epílogo.

## Créditos

- Figura, diseño e impresión: el autor de Yampi.
- Tipografías (SIL Open Font License): Cormorant Garamond, Montserrat, Cinzel, Bebas Neue, JetBrains Mono y Fredoka.
