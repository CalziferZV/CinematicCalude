# Soporte de manillar para marcador Koso

Diseño propio, paramétrico, inspirado en las fotos de referencia (no es una copia del modelo de pago de Cults3D).

Tres piezas, unidas con 2 tornillos M5x40 (allen) y 2 tuercas M5:

| Pieza | Descripción | Orientación de impresión |
|---|---|---|
| `Bandeja` | Caja de fondo plano con escalón interior, agujero de cable en el fondo y orejetas a ras de la base | Fondo sobre la cama (sin soportes) |
| `Abrazadera_Superior` | Bloque de techo plano con media caña y extremos redondeados | Boca abajo (`stl/clamp_upper.stl` ya viene girada) |
| `Abrazadera_Inferior` | Bloque con media caña y alojamientos hexagonales para las tuercas | Hexágonos sobre la cama |

![preview](preview.png)

## Fusion 360
1. Copia la carpeta `fusion360/KosoManillarSoporte` en tu carpeta de scripts o añádela desde **Utilidades > Complementos > Scripts y complementos > +**.
2. Ejecuta `KosoManillarSoporte`: crea un diseño nuevo con los 3 cuerpos montados.
3. Clic derecho en cada cuerpo y elige **Guardar como malla** para exportar el STL.

Para cambiar las medidas, edita el bloque `P` al principio del script y vuelve a ejecutarlo.

## Medidas clave (por defecto)
- Manillar: Ø28 mm (`bar_d`).
- Interior de la bandeja: 71,2 × 40 × 14,5 mm. **Mide tu Koso** y ajusta `tray_in_x`, `tray_in_y` y `tray_depth` (deja unos 0,5 mm de holgura).
- Separación entre tornillos: 60 mm. Hueco de 1 mm entre las mitades para que apriete.

## STL sin Fusion
`python3 preview_build.py preview.png` regenera los STL en `stl/` y la imagen de vista previa (necesita `manifold3d`, `trimesh` y `matplotlib`).
Recomendado: PETG o ASA (aguantan sol y vibración), 4 perímetros, 30 % de relleno.
