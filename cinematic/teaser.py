"""Teaser épico de 33 s para OBEKET: el modelo 3D real de Yampi en cortes rápidos,
la foto real de la figura en la mano y, de apertura y cierre, el símbolo y el
logotipo de OBEKET con @obeket.co.

Uso:
    python -m cinematic.audio_teaser --out build/score_teaser.wav
    python -m cinematic.teaser --audio build/score_teaser.wav --out video/YAMPI_OBEKET_teaser_1080p.mp4
    python -m cinematic.teaser --stills 1.2,6,9,30
"""
from __future__ import annotations

import argparse
import functools
import math
import os
import subprocess
import time
from multiprocessing import Pool
from pathlib import Path

import cv2
import numpy as np

from . import film4  # noqa: F401  (apunta el montaje a los renders del modelo real)
from . import film2 as F2
from .core import (ROOT, Grain, bloom, draw_text, ease_in_out_cubic, ease_in_out_sine, ease_out_cubic, finalize,
                   lin, mix, place_layer, smooth, smoother, screen, text_layer, vignette_mask)

W, H, FPS = 1920, 1080, 24
BAR5 = 4 * 60 / 90          # 90 BPM: compás de 2,67 s


def bar(n):
    return n * BAR5


T5 = dict(
    logo=0.0, ojos=bar(1), antena=bar(1.5), imp=bar(2), despiece=bar(3), orbita=bar(4), cara=bar(5),
    clavijero=bar(5.5), cuerdas=bar(6), contrapicado=bar(6.5), presentamos=bar(7), revelacion=bar(8),
    realidad=bar(9.5), marca=bar(11), fin=bar(12.5),
)
DURATION5 = T5["fin"]
# golpes de montaje (destello y empujón de cámara en cada corte)
HITS = {T5[k]: a for k, a in (("ojos", 0.30), ("antena", 0.26), ("imp", 0.22), ("orbita", 0.26), ("cara", 0.28),
                              ("clavijero", 0.24), ("cuerdas", 0.24), ("contrapicado", 0.30),
                              ("revelacion", 0.55))}

IVORY, GOLD = F2.IVORY, F2.GOLD
SILVER = np.float32([0.86, 0.86, 0.85])
LOGO_SYM = ROOT / "assets" / "source" / "obeket_simbolo.png"
LOGO_TXT = ROOT / "assets" / "source" / "obeket_logo.png"
HANDLE = "@obeket.co"


# --------------------------------------------------------------------------- #
# Marca: logotipos de OBEKET y cuenta de Instagram
# --------------------------------------------------------------------------- #
@functools.lru_cache(maxsize=4)
def logo_alpha(path):
    """Alfa del logotipo (claro sobre negro), recortado a su caja."""
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
    lum = im[..., :3].max(2)
    if im.shape[2] == 4:
        lum = lum * im[..., 3]
    lum = np.clip(lum / max(lum.max(), 1e-6), 0, 1)
    ys, xs = np.where(lum > 0.03)
    pad = 16
    y0, y1 = max(0, ys.min() - pad), min(lum.shape[0], ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(lum.shape[1], xs.max() + pad)
    return np.ascontiguousarray(lum[y0:y1, x0:x1])


def place_logo(f, a, cx, cy, height, opacity, color=SILVER, glint=None, blur=0.0, glint_gain=0.9):
    """Coloca un logotipo centrado en (cx, cy) con altura 'height' y un brillo que lo cruza."""
    if opacity <= 0.003:
        return f
    h, w = a.shape
    rgb = None
    if glint is not None and 0 < glint < 1:
        xs = np.arange(w, dtype=np.float32)[None, :] / w
        ys = np.arange(h, dtype=np.float32)[:, None] / h
        band = np.exp(-(((xs + ys * 0.35) - (-0.25 + 1.6 * glint)) / 0.06) ** 2)
        rgb = (np.asarray(color, np.float32)[None, None, :] * (1 + glint_gain * band[..., None])).astype(np.float32)
    return place_layer(f, a, color, cx, cy, (w / 2, h / 2), height / h, 0.0, opacity, blur_sigma=blur, rgb=rgb)


@functools.lru_cache(maxsize=2)
def ig_icon(size=44, ss=4):
    """Glifo sencillo de Instagram (cuadrado redondeado, círculo y punto), en alfa."""
    S = size * ss
    img = np.zeros((S + 8 * ss, S + 8 * ss), np.uint8)
    o = 4 * ss
    r = int(S * 0.27)
    th = max(1, int(S * 0.075))
    x0, y0, x1, y1 = o, o, o + S, o + S
    for (p, q) in (((x0 + r, y0), (x1 - r, y0)), ((x0 + r, y1), (x1 - r, y1)),
                   ((x0, y0 + r), (x0, y1 - r)), ((x1, y0 + r), (x1, y1 - r))):
        cv2.line(img, p, q, 255, th, cv2.LINE_AA)
    for (c, a0) in (((x0 + r, y0 + r), 180), ((x1 - r, y0 + r), 270), ((x1 - r, y1 - r), 0), ((x0 + r, y1 - r), 90)):
        cv2.ellipse(img, c, (r, r), 0, a0, a0 + 90, 255, th, cv2.LINE_AA)
    cv2.circle(img, (o + S // 2, o + S // 2), int(S * 0.22), 255, th, cv2.LINE_AA)
    cv2.circle(img, (int(x1 - S * 0.22), int(y0 + S * 0.22)), max(2, int(S * 0.045)), 255, -1, cv2.LINE_AA)
    a = img.astype(np.float32) / 255
    return cv2.resize(a, (a.shape[1] // ss, a.shape[0] // ss), interpolation=cv2.INTER_AREA)


# --------------------------------------------------------------------------- #
# Tipografía épica: Cinzel en versalitas + Cormorant cursiva
# --------------------------------------------------------------------------- #
def _text(f, text, t, t0, t1, x, y, size, font, wght, align, tracking, fade, out, rise=10):
    """Rótulo con entrada suave (subida y desenfoque) y una sombra difusa que lo separa del fondo."""
    op = F2.env(t, t0, t0 + fade, t1 - out, t1)
    if op <= 0.003:
        return f
    k = ease_out_cubic(lin(t, t0, t0 + fade * 1.6))
    yy = y + (1 - k) * rise
    f = draw_text(f, text, font, size, x, yy + 2, color=(0.0, 0.0, 0.0), wght=wght, tracking=tracking,
                  align=align, opacity=op * 0.55, blur_sigma=7.0)
    return draw_text(f, text, font, size, x, yy, color=IVORY, wght=wght, tracking=tracking, align=align,
                     opacity=op, blur_sigma=4.0 * (1 - k))


def head(f, text, t, t0, t1, x, y, size=62, align="left", fade=0.45, out=0.35, tracking=0.10):
    return _text(f, text, t, t0, t1, x, y, size, "cinzel", 600, align, tracking, fade, out)


def sub(f, text, t, t0, t1, x, y, size=56, align="left", fade=0.45, out=0.35):
    return _text(f, text, t, t0, t1, x, y, size, "cormorant_it", 400, align, 0.02, fade, out)


def punch(t, t0, amt=0.035, tau=0.16):
    d = t - t0
    return 1.0 + amt * math.exp(-d / tau) if d >= 0 else 1.0


# --------------------------------------------------------------------------- #
# Planos
# --------------------------------------------------------------------------- #
def sc_logo(t):
    f = F2.black()
    a = logo_alpha(LOGO_SYM)
    k = ease_out_cubic(lin(t, 0.30, 1.35))
    op = smooth(lin(t, 0.30, 0.90)) * (1 - smooth(lin(t, 2.05, 2.60)))
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W / 2) / (W * 0.30)) ** 2 + ((y - H / 2) / (H * 0.42)) ** 2)).astype(np.float32)
    f = screen(f, (g * 0.05 * op)[..., None] * np.float32([1.0, 0.85, 0.65]))
    return place_logo(f, a, W / 2, H / 2, 285 * (1.07 - 0.07 * k), op, glint=lin(t, 0.85, 2.0),
                      blur=4.0 * (1 - k))


def sc_ojos(t):
    k = lin(t, T5["ojos"], T5["antena"])
    z = punch(t, T5["ojos"])
    f = F2.still("ojos", k, 1.02 * z, 1.12 * z, (0.53, 0.52), (0.55, 0.50))
    return F2.light_sweep(f, lin(t, T5["ojos"] - 0.1, T5["antena"] + 0.2), 28, 0.25, 0.12)


def sc_antena(t):
    k = lin(t, T5["antena"], T5["imp"])
    z = punch(t, T5["antena"])
    f = F2.still("antena", k, 1.05 * z, 1.16 * z, (0.56, 0.50), (0.50, 0.46))
    return F2.light_sweep(f, lin(t, T5["antena"] - 0.1, T5["imp"] + 0.1), 150, 0.25, 0.10)


IMP_Z1 = 1.06


def sc_imp(t):
    full, empty, a, ad, y_top, y_bot = F2._print_assets()
    h, w = a.shape
    p = ease_in_out_sine(lin(t, T5["imp"] + 0.10, T5["imp"] + 2.20))
    yl = y_bot + 3 - p * (y_bot - y_top + 8)
    ys = np.arange(h, dtype=np.float32)[:, None]
    r = np.clip((ys - yl) / 2.5 + 0.5, 0, 1)
    comp = empty * (1 - r[..., None]) + full * r[..., None]
    if 0.0 < p < 1.0:
        below = np.clip((ys - yl) / 46.0, 0, 1)
        stripes = (0.5 + 0.5 * np.cos(2 * np.pi * (ys - yl) / 4.2)) * (1 - below) * (ys > yl)
        comp = comp * (1 - 0.07 * (stripes * a)[..., None])
        band = np.exp(-((ys - yl) / 1.8) ** 2) * ad
        glow = cv2.GaussianBlur(band, (0, 0), 8) * 2.6 + cv2.GaussianBlur(band, (0, 0), 26) * 1.5
        warm = np.exp(-np.clip(ys - yl, 0, None) / 28.0) * (ys > yl) * a * 0.12
        comp = comp + (band * 2.4 + glow + warm)[..., None] * np.float32([1.0, 0.76, 0.42]) * 0.65
    k = lin(t, T5["imp"], T5["despiece"])          # quieto durante el fundido con el despiece
    z = punch(t, T5["imp"], 0.03)
    f = F2.still(None, k, 1.0 * z, IMP_Z1 * z, (0.5, 0.52), (0.5, 0.5), img=comp)
    f = head(f, "MÁS DE DOS DÍAS", t, T5["imp"] + 0.35, T5["despiece"] + 0.15, 150, 790, size=56)
    f = sub(f, "de impresión", t, T5["imp"] + 0.60, T5["despiece"] + 0.15, 152, 860, size=54)
    return f


# despiece: entra enlazado con la impresión y sale enlazado con la órbita (mismo tamaño de figura)
Z_IN = F2.Z_IN * IMP_Z1 / 1.045


DESP_HOLD = 0.30   # el despiece espera a que termine el fundido (sin imagen doble)


def _sep5(t):
    d0, o = T5["despiece"] + DESP_HOLD, T5["orbita"]
    if t < o - 0.6:
        return ease_out_cubic(lin(t, d0, d0 + 0.85))
    return 1.0 - ease_in_out_cubic(lin(t, o - 0.55, o - 0.04))


def _desp_cam5(t):
    d0, o = T5["despiece"] + DESP_HOLD, T5["orbita"]
    if t < d0 + 1.0:
        e = ease_in_out_cubic(lin(t, d0, d0 + 1.0))
        return mix(Z_IN, 1.0, e), mix(F2.P_IN, 0.5, e)
    if t < o - 0.6:
        return 1.0 + 0.025 * lin(t, d0 + 1.0, o - 0.6), 0.5
    e = ease_in_out_cubic(lin(t, o - 0.6, o))
    return mix(1.025, F2.Z_OUT, e), mix(0.5, F2.P_OUT, e)


def sc_despiece(t):
    bg = F2.R("capa_fondo")[..., :3]
    h, w = bg.shape[:2]
    kr = h / 1080.0
    s = _sep5(t)
    comp = bg.copy()
    for p in F2.PART_ORDER:
        L = F2.R(f"capa_{p}")
        dy = (F2.PART_SEP[p] * 1.12 * s + 3.0 * math.sin(t * 2.0 + F2.hash01(p) * 6) * s) * kr
        M = np.float32([[1, 0, 0], [0, 1, dy]])
        rgba = cv2.warpAffine(L, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        al = rgba[..., 3:4]
        comp = comp * (1 - al) + rgba[..., :3] * al
    kf = smooth(lin(t, T5["orbita"] - 0.16, T5["orbita"] - 0.02))
    if kf > 0:
        full = F2.R("capa_todo")
        comp = comp * (1 - kf) + (bg * (1 - full[..., 3:4]) + full[..., :3] * full[..., 3:4]) * kf
    z, pyn = _desp_cam5(t)
    f = F2.still(None, 0.0, z, z, (0.5, pyn), (0.5, pyn), img=comp)
    f = head(f, "TRES SEMANAS", t, T5["despiece"] + 0.35, T5["orbita"] - 0.45, 150, 515, size=58)
    f = sub(f, "de trabajo intenso", t, T5["despiece"] + 0.60, T5["orbita"] - 0.45, 152, 588, size=54)
    return f


def sc_orbita(t):
    fr = F2._orbit_frames()
    u = lin(t, T5["orbita"], T5["cara"])
    x = (len(fr) - 1) * (1 - (1 - u) ** 2)       # arranca con impulso y frena
    i0 = int(math.floor(x))
    i1 = min(len(fr) - 1, i0 + 1)
    a = x - i0
    img = F2._read(fr[i0])[..., :3]
    if a > 0.02 and i1 != i0:
        img = img * (1 - a) + F2._read(fr[i1])[..., :3] * a
    f = F2.still(None, u, 1.0, 1.05, (0.5, 0.5), (0.5, 0.49), img=img)
    f = head(f, "PARA CREAR", t, T5["orbita"] + 0.30, T5["cara"] - 0.05, 150, 790, size=56)
    f = sub(f, "una figura…", t, T5["orbita"] + 0.55, T5["cara"] - 0.05, 152, 860, size=54)
    return f


def _macro(name, t, t0, t1, z0, z1, p0, p1, sweep=None):
    z = punch(t, t0)
    f = F2.still(name, lin(t, t0, t1), z0 * z, z1 * z, p0, p1)
    if sweep:
        f = F2.light_sweep(f, lin(t, t0 - 0.1, t1 + 0.2), sweep, 0.28, 0.08)
    return f


def sc_cara(t):
    return _macro("cara34", t, T5["cara"], T5["clavijero"], 1.0, 1.09, (0.50, 0.50), (0.52, 0.47), 20)


def sc_clavijero(t):
    return _macro("clavijero", t, T5["clavijero"], T5["cuerdas"], 1.03, 1.12, (0.44, 0.52), (0.54, 0.48))


def sc_cuerdas(t):
    return _macro("cuerdas_boca", t, T5["cuerdas"], T5["contrapicado"], 1.0, 1.10, (0.46, 0.50), (0.42, 0.47), 35)


def sc_contrapicado(t):
    f = _macro("contrapicado", t, T5["contrapicado"], T5["presentamos"], 1.0, 1.07, (0.5, 0.56), (0.5, 0.48))
    return f * (1 - smooth(lin(t, T5["presentamos"] - 0.25, T5["presentamos"] + 0.15)))


def sc_presentamos(t):
    f = F2.black()
    return F2.title(f, "PRESENTAMOS", t, T5["presentamos"] + 0.30, T5["revelacion"] - 0.45, W / 2, H / 2 + 20,
                    size=54, font="cinzel", wght=500, align="center", tracking=0.34, rise=6, fade=0.8, out=0.4)


def sc_revelacion(t):
    tl = t - T5["revelacion"]
    k = lin(t, T5["revelacion"], T5["realidad"] + 0.6)
    z = punch(t, T5["revelacion"], 0.05, 0.25)
    f = F2.still("heroe_izq", k, 1.0 * z, 1.06 * z, (0.5, 0.5), (0.47, 0.49))
    rise = smoother(lin(tl, 0.0, 0.55))
    halo = smooth(lin(tl, 0.1, 2.5))
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W * 0.34) / (W * 0.33)) ** 2 + ((y - H * 0.42) / (H * 0.55)) ** 2)).astype(np.float32)
    f = screen(f * (0.15 + 0.85 * rise), (g * 0.12 * halo)[..., None] * np.float32([1.0, 0.78, 0.52]))
    ta = t - (T5["revelacion"] + 0.30)
    if ta > 0:
        sw = lin(t, T5["revelacion"] + 2.4, T5["revelacion"] + 3.6)
        f = F2.wordmark(f, W * 0.685, H * 0.50, 150, ta * 1.25, opacity=1.0, sweep=sw,
                        tagline="IMPRESO EN 3D  ·  CAPA A CAPA", tag_t=ta * 1.25 - 1.9)
    return f


def sc_realidad(t):
    """La figura real en la mano (foto de la ventana): del render a la realidad."""
    A, V1 = F2._epilogue_parts()
    r0 = T5["realidad"]
    e = ease_in_out_sine(lin(t, r0, T5["marca"] + 0.45))
    s = mix(0.585, 0.615, e)
    cx, cy = 960 / s + 18, mix(1052, 1034, e)
    f = V1.reveal_base(V1.C["reveal"] + 3.0, s, cx, cy)
    f = f * np.float32([1.0, 0.985, 0.95])
    f = head(f, "DEL RENDER…", t, r0 + 0.45, T5["marca"] + 0.1, W * 0.70, 505, size=54, align="center",
             tracking=0.12)
    return sub(f, "a la realidad.", t, r0 + 1.05, T5["marca"] + 0.1, W * 0.70, 585, size=62, align="center")


def sc_marca(t):
    m0 = T5["marca"]
    f = F2.black()
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W / 2) / (W * 0.36)) ** 2 + ((y - H * 0.47) / (H * 0.45)) ** 2)).astype(np.float32)
    f = screen(f, (g * 0.06 * smooth(lin(t, m0, m0 + 1.5)))[..., None] * np.float32([1.0, 0.84, 0.62]))
    # símbolo
    k1 = ease_out_cubic(lin(t, m0 + 0.40, m0 + 1.40))
    f = place_logo(f, logo_alpha(LOGO_SYM), W / 2, 318, 150 * (1.08 - 0.08 * k1), smooth(lin(t, m0 + 0.40, m0 + 1.0)),
                   glint=lin(t, m0 + 1.1, m0 + 2.0), blur=4 * (1 - k1))
    # logotipo
    k2 = ease_out_cubic(lin(t, m0 + 0.65, m0 + 1.75))
    a = logo_alpha(LOGO_TXT)
    hgt = 860 * a.shape[0] / a.shape[1]
    f = place_logo(f, a, W / 2, 545 + 14 * (1 - k2), hgt, smooth(lin(t, m0 + 0.65, m0 + 1.35)),
                   color=np.float32([0.97, 0.96, 0.94]), glint=lin(t, m0 + 1.7, m0 + 2.8), blur=5 * (1 - k2),
                   glint_gain=0.6)
    # filete dorado
    kl = ease_out_cubic(lin(t, m0 + 1.25, m0 + 2.1))
    if kl > 0:
        f = F2.hairline(f, W / 2 - 150 * kl, W / 2 + 150 * kl, 668, GOLD, 0.9 * kl, 1.2)
    # Instagram
    op = smooth(lin(t, m0 + 1.55, m0 + 2.3))
    if op > 0.003:
        size = 44
        _, _, adv = text_layer(HANDLE, "montserrat", size, 400, 0.08)
        icon = ig_icon(48)
        gap = 22
        total = icon.shape[1] + gap + adv
        x0 = W / 2 - total / 2
        yy = 752 + 8 * (1 - ease_out_cubic(lin(t, m0 + 1.55, m0 + 2.5)))
        f = place_layer(f, icon, IVORY, x0 + icon.shape[1] / 2, yy - 15, (icon.shape[1] / 2, icon.shape[0] / 2),
                        1.0, 0.0, op * 0.95)
        f = draw_text(f, HANDLE, "montserrat", size, x0 + icon.shape[1] + gap, yy, color=IVORY, wght=400,
                      tracking=0.08, align="left", opacity=op * 0.95)
    return f


SHOTS5 = [
    (T5["logo"], T5["ojos"], 0.0, sc_logo),
    (T5["ojos"], T5["antena"], 0.0, sc_ojos),
    (T5["antena"], T5["imp"], 0.0, sc_antena),
    (T5["imp"], T5["despiece"] + 0.3, 0.0, sc_imp),
    (T5["despiece"], T5["orbita"], 0.3, sc_despiece),
    (T5["orbita"], T5["cara"], 0.0, sc_orbita),
    (T5["cara"], T5["clavijero"], 0.0, sc_cara),
    (T5["clavijero"], T5["cuerdas"], 0.0, sc_clavijero),
    (T5["cuerdas"], T5["contrapicado"], 0.0, sc_cuerdas),
    (T5["contrapicado"], T5["presentamos"] + 0.2, 0.0, sc_contrapicado),
    (T5["presentamos"], T5["revelacion"], 0.2, sc_presentamos),
    (T5["revelacion"], T5["realidad"] + 0.6, 0.0, sc_revelacion),
    (T5["realidad"], T5["marca"] + 0.45, 0.6, sc_realidad),
    (T5["marca"], DURATION5 + 1, 0.45, sc_marca),
]


def titles(f, t):
    f = head(f, "CON UN DETALLE", t, T5["cara"] + 0.25, T5["cuerdas"] - 0.05, 1810, 470, size=40, align="right",
             tracking=0.09)
    f = sub(f, "perfecto", t, T5["cara"] + 0.50, T5["cuerdas"] - 0.05, 1810, 535, size=50, align="right")
    f = head(f, "Y UNA CALIDAD", t, T5["cuerdas"] + 0.25, T5["presentamos"] - 0.05, 1810, 470, size=40,
             align="right", tracking=0.09)
    f = sub(f, "impoluta.", t, T5["cuerdas"] + 0.50, T5["presentamos"] - 0.05, 1810, 535, size=50, align="right")
    return f


def flashes(f, t):
    for h, amp in HITS.items():
        d = t - h
        if 0 <= d < 0.6:
            k = amp * math.exp(-d / 0.09)
            f = f + (1 - np.clip(f, 0, 1)) * k * np.float32([1.0, 0.93, 0.82])
    return f


def compose(t):
    f = None
    for a, b, fin, fn in SHOTS5:
        if a <= t < b:
            img = fn(t)
            w = 1.0 if fin <= 0 else smooth((t - a) / fin)
            f = img if f is None else f * (1 - w) + img * w
    if f is None:
        f = F2.black()
    if T5["cara"] <= t < T5["presentamos"]:
        f = titles(f, t)
    return flashes(f, t)


_GRAIN = None


def post(f, t, fi):
    global _GRAIN
    if _GRAIN is None:
        _GRAIN = Grain(W, H, n=10, seed=11)
    f = F2.grade(f)
    f = bloom(f, threshold=0.70, sigma=30, strength=0.24, tint=(1.0, 0.86, 0.70))
    f = f * vignette_mask(W, H, 0.30)[..., None]
    f = _GRAIN.apply(f, fi, 0.016)
    if t < 0.25:
        f = f * smooth(t / 0.25)
    return f * (1 - smooth(lin(t, DURATION5 - 1.3, DURATION5 - 0.05)))


def render_frame(fi):
    t = fi / FPS
    return finalize(post(compose(t), t, fi))


def _worker(fi):
    return fi, render_frame(fi).tobytes()


def render_video(out, audio=None, workers=None, crf=18):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = int(round(DURATION5 * FPS))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", str(audio)]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-maxrate", "8M", "-bufsize", "16M",
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film", "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += [str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with Pool(workers or os.cpu_count() or 2) as pool:
        for k, (fi, data) in enumerate(pool.imap(_worker, range(n), chunksize=2)):
            proc.stdin.write(data)
            if k % 48 == 0:
                print(f"  fotograma {fi}/{n} ({(k + 1) / max(time.time() - t0, 1e-6):.1f} fps)", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"OK {out} ({time.time() - t0:.0f}s)")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="video/YAMPI_OBEKET_teaser_1080p.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--stills", default=None)
    ap.add_argument("--stills-dir", default="build/stills5")
    a = ap.parse_args(argv)
    film4.configure()
    if a.stills:
        from PIL import Image
        d = Path(a.stills_dir)
        d.mkdir(parents=True, exist_ok=True)
        for t in [float(x) for x in a.stills.split(",")]:
            p = d / f"still_{t:06.2f}.png"
            Image.fromarray(render_frame(int(round(t * FPS)))).save(p)
            print(p)
        return
    render_video(a.out, a.audio, a.workers, a.crf)


if __name__ == "__main__":
    main()
