"""Recorta cada placa de Bambu Studio por separado (nunca la pantalla completa).

Corrige la ligera rotación del monitor curvo, limpia ruido/moiré y realza.
Uso: python tools/extract_plates.py <foto_bambu> <dir_salida> [escala]
"""
import sys
import numpy as np
import cv2
from PIL import Image, ImageFilter, ImageEnhance

# (nombre, caja x0,y0,x1,y1 en la foto original, rotación en grados)
PLATES = [
    ("placa01_cabeza", (322, 868, 812, 1172), 1.4),
    ("placa02_pelo", (828, 878, 1272, 1166), 1.2),
    ("placa03_torso_guitarra", (250, 1168, 822, 1600), 0.5),
    ("placa04_piernas", (836, 1172, 1362, 1490), 0.2),
]


def process(src, box, rot, scale):
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = x1 - x0, y1 - y0
    M = cv2.getRotationMatrix2D((cx, cy), rot, 1.0)
    M[0, 2] -= x0
    M[1, 2] -= y0
    # escalar en el mismo paso (Lanczos)
    S = np.array([[scale, 0, 0], [0, scale, 0]], np.float64)
    M2 = S @ np.vstack([M, [0, 0, 1]])
    out = cv2.warpAffine(src, M2, (int(w * scale), int(h * scale)), flags=cv2.INTER_LANCZOS4,
                         borderMode=cv2.BORDER_REPLICATE)
    # limpieza: denoise suave (moiré de pantalla) + nitidez
    out = cv2.fastNlMeansDenoisingColored(out, None, 3, 3, 7, 21)
    pil = Image.fromarray(out)
    pil = pil.filter(ImageFilter.UnsharpMask(radius=2.2, percent=90, threshold=2))
    pil = ImageEnhance.Contrast(pil).enhance(1.08)
    return pil


def main(path, out_dir, scale=2.0):
    src = np.asarray(Image.open(path).convert("RGB"))
    for name, box, rot in PLATES:
        im = process(src, box, rot, float(scale))
        im.save(f"{out_dir}/{name}.png")
        print(name, im.size)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], *(sys.argv[3:4] or [2.0]))
