"""Carga y prepara el material visual (una vez por proceso)."""
from __future__ import annotations

import functools

import cv2
import numpy as np
from PIL import Image

from .core import ROOT, blur

SRC = ROOT / "assets" / "source"
GEN = ROOT / "assets" / "generated"

# Coordenadas útiles en la foto final (1512x2016)
FIG_TOP = 268      # punta de las antenas
FIG_BOTTOM = 1832  # suela de los zapatos
FIG_CX = 690       # centro horizontal aproximado de la figura

PLATES = [
    dict(file="placa01_cabeza.png", num="01", name="CABEZA COMPLETA", tag="01_CABEZA_COMPLETA",
         focus=(0.47, 0.42)),
    dict(file="placa02_pelo.png", num="02", name="PELO CON ANTENAS", tag="02_PELO_CON_ANTENAS",
         focus=(0.42, 0.42)),
    dict(file="placa03_torso_guitarra.png", num="03", name="TORSO, BRAZOS Y GUITARRA",
         tag="03_TORSO_BRAZOS_GUITARRA", focus=(0.40, 0.45)),
    dict(file="placa04_piernas.png", num="04", name="PIERNAS Y ZAPATOS", tag="04_PIERNAS_Y_ZAPATOS",
         focus=(0.45, 0.38)),
]


def _load_rgb(path):
    return np.asarray(Image.open(path).convert("RGB"), np.float32) / 255.0


def _load_gray(path):
    return np.asarray(Image.open(path).convert("L"), np.float32) / 255.0


def decontaminate(img, alpha):
    """Extiende los colores interiores de la figura hacia el borde para
    eliminar el halo del fondo original al componer sobre otro fondo."""
    w = (alpha > 0.97).astype(np.float32)
    out = img.copy()
    filled = np.zeros_like(img)
    have = np.zeros(alpha.shape, np.float32)
    for sigma in (1.5, 3, 6, 12, 24):
        num = cv2.GaussianBlur(img * w[..., None], (0, 0), sigma)
        den = cv2.GaussianBlur(w, (0, 0), sigma)
        est = num / np.maximum(den, 1e-4)[..., None]
        take = (den > 0.02) & (have < 0.5)
        filled[take] = est[take]
        have[take] = 1
    edge = alpha < 0.97
    out[edge] = filled[edge]
    return out


@functools.lru_cache(maxsize=1)
def photo_assets():
    photo = _load_rgb(SRC / "yampi_final.jpg")
    H, W = photo.shape[:2]
    fig_a = _load_gray(GEN / "mask_figure.png")
    fg_a = _load_gray(GEN / "mask_fg.png")
    fig_rgb = decontaminate(photo, fig_a)
    fg_rgb = decontaminate(photo, fg_a)

    # contorno de la figura (para luz de contorno / holograma)
    edge = cv2.morphologyEx((fig_a > 0.5).astype(np.uint8), cv2.MORPH_GRADIENT,
                            np.ones((5, 5), np.uint8)).astype(np.float32)
    edge = cv2.GaussianBlur(edge, (0, 0), 1.2)

    # fondo limpio (sin figura ni mano) por inpainting a baja resolución
    u8 = (photo * 255).astype(np.uint8)
    m = cv2.dilate((fg_a > 0.04).astype(np.uint8), np.ones((31, 31), np.uint8))
    sw, sh = W // 4, H // 4
    small = cv2.resize(u8, (sw, sh), interpolation=cv2.INTER_AREA)
    ms = cv2.resize(m, (sw, sh), interpolation=cv2.INTER_NEAREST)
    inp = cv2.inpaint(small, ms, 12, cv2.INPAINT_TELEA)
    inp = cv2.GaussianBlur(inp, (0, 0), 3)
    clean = cv2.resize(inp, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32) / 255
    mb = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 12)[..., None]
    clean_bg = photo * (1 - mb) + clean * mb

    # fondo extendido (mitad de resolución): reflejo + desenfoque creciente
    ext = extended_background(clean_bg)
    return dict(photo=photo, fig_a=fig_a, fg_a=fg_a, fig_rgb=fig_rgb, fg_rgb=fg_rgb,
                edge=edge, clean_bg=clean_bg, ext=ext, W=W, H=H)


EXT_PAD = 2400  # píxeles (resolución completa) añadidos a cada lado


def extended_background(clean_bg, sharp_until=980, sharp_from=None):
    """Lienzo ancho a media resolución: la foto en el centro y los lados
    rellenados estirando sus bordes, con un desenfoque que crece al alejarse
    de la figura (como una profundidad de campo muy corta) y una caída de
    exposición que deja sitio al título."""
    H, W = clean_bg.shape[:2]
    half = cv2.resize(clean_bg, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    p = EXT_PAD // 2
    big = cv2.copyMakeBorder(half, 0, 0, p, p, cv2.BORDER_REPLICATE)
    Wb = big.shape[1]
    levels = [big, blur(big, 6), blur(big, 16), blur(big, 40), blur(big, 90)]
    x = np.arange(Wb, dtype=np.float32)
    xr = (x - p) * 2  # coordenada x en la foto a resolución completa
    left_edge = 80 if sharp_from is None else sharp_from
    d = np.maximum(left_edge - xr, xr - sharp_until)
    d = np.clip(d, 0, None)
    t = np.clip(d / 900.0, 0, 1) ** 0.8 * (len(levels) - 1)
    out = np.zeros_like(big)
    for i in range(len(levels)):
        wgt = np.clip(1 - np.abs(t - i), 0, 1)[None, :, None]
        out += levels[i] * wgt
    fall = (1 - 0.62 * np.clip((xr - 1050) / 1500.0, 0, 1) ** 0.9)
    fall = np.minimum(fall, 1 - 0.5 * np.clip((-xr) / 1400.0, 0, 1))
    return (out * fall[None, :, None]).astype(np.float32)


@functools.lru_cache(maxsize=1)
def plate_assets():
    out = []
    for p in PLATES:
        img = _load_rgb(GEN / p["file"])
        out.append(dict(p, img=img))
    return out
