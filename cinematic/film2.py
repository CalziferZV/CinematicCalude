"""Cinemática v2: spot de producto elegante construido sobre los renders 3D de
Yampi (build/3d) y la foto real para el epílogo.

Uso:
    python -m cinematic.film2 --out video/YAMPI_cinematica_1080p.mp4 --audio build/score2.wav
    python -m cinematic.film2 --stills 2,10,30
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

from .core import (ROOT, Grain, bloom, draw_text, ease_in_out_cubic, ease_in_out_sine,
                   ease_out_cubic, env, finalize, hash01, lin, luma, mix, place_layer, screen,
                   smooth, smoother, text_layer, view, vignette_mask)

W, H = 1920, 1080
FPS = 24
# carpeta de renders (la v4 la cambia a build/3d_real; por variable de entorno para que
# también la vean los procesos del pool)
R3D = Path(os.environ.get("YAMPI_R3D", str(ROOT / "build" / "3d")))
ORBIT_DIR = R3D / "orbita_24"

IVORY = np.float32([0.955, 0.925, 0.865])
GOLD = np.float32([0.80, 0.66, 0.43])
RED = np.float32([0.78, 0.10, 0.12])
BLACK = np.float32([0.012, 0.009, 0.008])

BAR = 60.0 / 72 * 4  # 3.333 s (72 BPM)


def bar(n):
    return n * BAR


T = dict(
    ojos=0.0, antena=bar(1), imp=bar(2), despiece=bar(4), orbita=bar(7), cara=bar(9), clavijero=bar(10),
    cuerdas=bar(11), contrapicado=bar(12), presentamos=bar(13), revelacion=bar(14), epilogo=bar(17),
    final=bar(19), fin=bar(20) + 0.35,
)
DURATION = T["fin"]


# --------------------------------------------------------------------------- #
# Carga de renders
# --------------------------------------------------------------------------- #
def _read(path):
    im = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if im is None:
        raise FileNotFoundError(path)
    scale = 65535.0 if im.dtype == np.uint16 else 255.0
    im = im.astype(np.float32) / scale
    if im.ndim == 2:
        im = np.repeat(im[..., None], 3, 2)
    if im.shape[2] == 4:
        im = cv2.cvtColor(im, cv2.COLOR_BGRA2RGBA)
    else:
        im = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
    return im


@functools.lru_cache(maxsize=40)
def R(name):
    return _read(R3D / f"{name}.png")


def still(name, k, z0=1.0, z1=1.05, p0=(0.5, 0.5), p1=(0.5, 0.5), r0=0.0, r1=0.0, img=None, ease=None):
    """Movimiento de cámara lento sobre un render fijo (k: 0..1)."""
    img = R(name)[..., :3] if img is None else img
    h, w = img.shape[:2]
    base = max(W / w, H / h)
    e = (ease or ease_in_out_sine)(k)
    s = base * mix(z0, z1, e)
    px = mix(p0[0], p1[0], e) * w
    py = mix(p0[1], p1[1], e) * h
    hw, hh = W / (2 * s), H / (2 * s)
    px = min(max(px, hw), w - hw)
    py = min(max(py, hh), h - hh)
    return view(img, px, py, s, mix(r0, r1, e), out=(W, H), border=cv2.BORDER_REPLICATE)


def black():
    f = np.empty((H, W, 3), np.float32)
    f[...] = BLACK
    return f


# --------------------------------------------------------------------------- #
# Tipografía
# --------------------------------------------------------------------------- #
def title(f, text, t, t0, t1, x, y, size=62, font="cormorant", wght=500, align="left", tracking=0.02,
          color=IVORY, rise=14, fade=0.9, out=0.7, opacity=1.0):
    op = env(t, t0, t0 + fade, t1 - out, t1) * opacity
    if op <= 0.003:
        return f
    k = ease_out_cubic(lin(t, t0, t0 + fade * 1.6))
    return draw_text(f, text, font, size, x, y + (1 - k) * rise, color=color, wght=wght, tracking=tracking,
                     align=align, opacity=op, blur_sigma=4.0 * (1 - k))


def smallcaps(f, text, t, t0, t1, x, y, size=17, align="left", color=IVORY, opacity=0.78, tracking=0.38):
    op = env(t, t0, t0 + 0.8, t1 - 0.6, t1) * opacity
    if op <= 0.003:
        return f
    return draw_text(f, text.upper(), "montserrat", size, x, y, color=color, wght=300, tracking=tracking,
                     align=align, opacity=op)


def hairline(f, x0, x1, y, color=GOLD, opacity=1.0, th=1.0):
    if opacity <= 0.003 or x1 - x0 < 1:
        return f
    y0 = int(math.floor(y))
    frac = y - y0
    xa, xb = int(max(0, x0)), int(min(W, x1))
    if xb <= xa:
        return f
    c = np.asarray(color, np.float32) * opacity
    for yy, a in ((y0, (1 - frac) * th), (y0 + 1, frac * th)):
        if 0 <= yy < H and a > 0:
            row = f[yy, xa:xb]
            f[yy, xa:xb] = row + (c - row * opacity) * min(1.0, a)
    return f


def leader(f, pts, opacity, color=GOLD):
    """Filete fino (polilínea) con antialias."""
    if opacity <= 0.003:
        return f
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0 = int(max(0, min(xs) - 4)), int(max(0, min(ys) - 4))
    x1, y1 = int(min(W, max(xs) + 5)), int(min(H, max(ys) + 5))
    if x1 <= x0 or y1 <= y0:
        return f
    buf = np.zeros((y1 - y0, x1 - x0), np.uint8)
    P = np.array([[(p[0] - x0) * 16, (p[1] - y0) * 16] for p in pts], np.int32)
    cv2.polylines(buf, [P], False, 255, 1, cv2.LINE_AA, shift=4)
    m = buf.astype(np.float32) / 255 * opacity * 0.9
    roi = f[y0:y1, x0:x1]
    f[y0:y1, x0:x1] = roi + (np.asarray(color, np.float32) - roi) * m[..., None]
    return f


def dot(f, x, y, r, color, opacity):
    if opacity <= 0.003:
        return f
    n = int(r * 3) + 2
    x0, y0 = int(x) - n, int(y) - n
    yy, xx = np.mgrid[y0:y0 + 2 * n + 1, x0:x0 + 2 * n + 1].astype(np.float32)
    d = np.sqrt((xx - x) ** 2 + (yy - y) ** 2)
    a = np.clip(r + 0.5 - d, 0, 1) * opacity
    sl = (slice(max(0, y0), min(H, y0 + 2 * n + 1)), slice(max(0, x0), min(W, x0 + 2 * n + 1)))
    ay = slice(sl[0].start - y0, sl[0].stop - y0)
    ax = slice(sl[1].start - x0, sl[1].stop - x0)
    roi = f[sl]
    f[sl] = roi + (np.asarray(color, np.float32) - roi) * a[ay, ax][..., None]
    return f


# --------------------------------------------------------------------------- #
# Logotipo elegante: YAMPI en serif con dos antenas rojas finas sobre la M
# --------------------------------------------------------------------------- #
WM_FONT, WM_WGHT, WM_TRACK = "cormorant", 600, 0.17


@functools.lru_cache(maxsize=8)
def _wm_letters(size):
    track = WM_TRACK * size
    out = []
    x = 0.0
    for ch in "YAMPI":
        a, (ox, oy), adv = text_layer(ch, WM_FONT, size, WM_WGHT, 0.0)
        out.append(dict(ch=ch, a=a, ox=ox, oy=oy, adv=adv, x=x))
        x += adv + track
    return out, x - track


@functools.lru_cache(maxsize=8)
def _wm_peaks(size):
    letters, _ = _wm_letters(size)
    m = [l for l in letters if l["ch"] == "M"][0]
    a = m["a"]
    cols = np.where(a.max(0) > 0.5)[0]
    c0, c1 = cols.min(), cols.max()
    peaks = []
    for lo, hi in ((c0, c0 + (c1 - c0) * 0.42), (c0 + (c1 - c0) * 0.58, c1)):
        best = None
        for c in range(int(lo), int(hi) + 1):
            rows = np.where(a[:, c] > 0.5)[0]
            if len(rows) and (best is None or rows[0] < best[1]):
                best = (c, rows[0])
        peaks.append((best[0] - m["ox"] + m["x"], best[1] - m["oy"]))
    return peaks


def wordmark(f, cx, baseline, size, ta, opacity=1.0, sweep=None, tagline=None, tag_t=None):
    letters, total = _wm_letters(size)
    x0 = cx - total / 2
    for i, L in enumerate(letters):
        k = lin(ta, 0.10 * i, 0.10 * i + 1.3)
        if k <= 0:
            continue
        e = ease_out_cubic(k)
        rgb = None
        if sweep is not None and 0 < sweep < 1:
            h, w = L["a"].shape
            xs = (np.arange(w, dtype=np.float32) - L["ox"] + L["x"]) / total
            ys = np.arange(h, dtype=np.float32)[:, None] / h
            band = np.exp(-(((xs[None, :] + ys * 0.18) - (-0.2 + 1.4 * sweep)) / 0.07) ** 2)
            rgb = (IVORY[None, None, :] * (1 + 0.55 * band[..., None])).astype(np.float32)
        place_layer(f, L["a"], IVORY, x0 + L["x"] - L["ox"] + L["ox"], baseline + (1 - e) * size * 0.10,
                    (L["ox"], L["oy"]), 1.0, 0.0, opacity * smooth(k * 1.4), blur_sigma=5 * (1 - e), rgb=rgb)
    # antenas
    tk = lin(ta, 0.10 * 5 + 0.9, 0.10 * 5 + 1.7)
    if tk > 0:
        g = ease_out_cubic(tk)
        for j, (px, py) in enumerate(_wm_peaks(size)):
            bx, by = x0 + px, baseline + py + size * 0.004
            side = -1 if j == 0 else 1
            L_ = size * 0.27 * g
            ang = math.radians(11 * side)
            ex, ey = bx + math.sin(ang) * L_, by - math.cos(ang) * L_
            n = 24
            pts = [(bx + (ex - bx) * q / n, by + (ey - by) * q / n) for q in range(n + 1)]
            for th in (0.0, 0.7, -0.7, 1.2):
                leader(f, [(p[0] + th, p[1]) for p in pts], opacity * 0.95, RED)
            dot(f, ex, ey, size * 0.038 * ease_out_cubic(lin(tk, 0.35, 1.0)), RED, opacity)
    if tagline:
        tt = ta if tag_t is None else tag_t
        k = ease_out_cubic(lin(tt, 0.0, 1.2))
        if k > 0:
            half = total * 0.32 * k
            hairline(f, cx - half, cx + half, baseline + size * 0.24, GOLD, opacity * 0.85)
            draw_text(f, tagline, "montserrat", max(14, int(size * 0.112)), cx, baseline + size * 0.42,
                      color=IVORY, wght=300, tracking=0.42, align="center", opacity=opacity * 0.8 * smooth(k))
    return f


# --------------------------------------------------------------------------- #
# Escenas
# --------------------------------------------------------------------------- #
def light_sweep(f, k, angle=24.0, width=0.22, strength=0.10, color=(1.0, 0.86, 0.66)):
    if strength <= 0 or not (0 < k < 1):
        return f
    y, x = np.ogrid[0:H, 0:W]
    a = math.radians(angle)
    u = (x / W) * math.cos(a) + (y / H) * math.sin(a) * (H / W)
    band = np.exp(-((u - (-0.3 + 1.6 * k)) / width) ** 2).astype(np.float32)
    return f * (1 + band[..., None] * strength * np.float32(color))


def sc_ojos(t):
    k = lin(t, T["ojos"], T["antena"] + 0.6)
    f = still("ojos", k, 1.00, 1.07, (0.53, 0.52), (0.55, 0.50))
    f = f * (0.06 + 0.94 * smoother(lin(t, 0.0, 2.2)))
    return light_sweep(f, lin(t, 0.5, 3.6), 28, 0.25, 0.10)


def sc_antena(t):
    k = lin(t, T["antena"], T["imp"] + 0.6)
    f = still("antena", k, 1.03, 1.09, (0.56, 0.50), (0.50, 0.48))
    return light_sweep(f, lin(t, T["antena"], T["imp"] + 0.4), 150, 0.25, 0.08)


@functools.lru_cache(maxsize=1)
def _print_assets():
    full = R("entero")[..., :3]
    empty = R("entero_fondo")[..., :3]
    a = R("entero_alfa")[..., 3]
    rows = np.where(a.max(1) > 0.3)[0]
    ad = cv2.dilate(a, np.ones((5, 5), np.uint8))
    return full, empty, a, ad, int(rows.min()), int(rows.max())


def sc_impresion(t):
    full, empty, a, ad, y_top, y_bot = _print_assets()
    h, w = a.shape
    p = ease_in_out_sine(lin(t, T["imp"] + 0.55, T["imp"] + 5.6))
    yl = y_bot + 3 - p * (y_bot - y_top + 8)
    ys = np.arange(h, dtype=np.float32)[:, None]
    r = np.clip((ys - yl) / 2.5 + 0.5, 0, 1)
    comp = empty * (1 - r[..., None]) + full * r[..., None]
    if 0.0 < p < 1.0:
        # capas recién impresas: un leve rayado que se asienta
        below = np.clip((ys - yl) / 46.0, 0, 1)
        stripes = (0.5 + 0.5 * np.cos(2 * np.pi * (ys - yl) / 4.2)) * (1 - below) * (ys > yl)
        comp = comp * (1 - 0.06 * (stripes * a)[..., None])
        # línea dorada en el borde que crece
        band = np.exp(-((ys - yl) / 1.8) ** 2) * ad
        glow = cv2.GaussianBlur(band, (0, 0), 8) * 2.2 + cv2.GaussianBlur(band, (0, 0), 26) * 1.2
        warm = np.exp(-np.clip(ys - yl, 0, None) / 28.0) * (ys > yl) * a * 0.10
        comp = comp + (band * 2.2 + glow + warm)[..., None] * np.float32([1.0, 0.76, 0.42]) * 0.6
    k = lin(t, T["imp"], T["despiece"] + 0.7)
    f = still(None, k, 1.0, 1.045, (0.5, 0.52), (0.5, 0.5), img=comp)
    f = f * (0.55 + 0.45 * smooth(lin(t, T["imp"] - 0.2, T["imp"] + 0.8)))
    f = title(f, "Más de dos días", t, T["imp"] + 1.2, T["despiece"] + 0.2, 150, 515, size=74)
    f = title(f, "de impresión", t, T["imp"] + 1.55, T["despiece"] + 0.2, 150, 603, size=74,
              font="cormorant_it", wght=400)
    return f


# vista despiezada: desplazamientos verticales (px) en el estado separado
PART_ORDER = ("piernas", "torso", "cabeza", "pelo")
PART_SEP = dict(piernas=0.0, torso=-62.0, cabeza=-142.0, pelo=-236.0)
PART_CAP = dict(
    pelo=("II", "Pelo y antenas"), cabeza=("I", "Cabeza"), torso=("III", "Torso, brazos y guitarra"),
    piernas=("IV", "Piernas y zapatos"),
)


@functools.lru_cache(maxsize=1)
def _part_boxes():
    boxes = {}
    for p in PART_ORDER:
        a = R(f"capa_{p}")[..., 3]
        ys, xs = np.where(a > 0.4)
        boxes[p] = (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))
    return boxes


def _sep(t):
    a0, a1 = T["despiece"] + 0.3, T["despiece"] + 2.6
    b0, b1 = T["orbita"] - 3.4, T["orbita"] - 1.0
    if t < a1:
        return ease_in_out_cubic(lin(t, a0, a1))
    return 1.0 - ease_in_out_cubic(lin(t, b0, b1))


# zoom de enlace: encaja el tamaño de la figura con el plano anterior (impresión)
# y con el siguiente (órbita frontal), para que los fundidos no muestren dos figuras
Z_IN, P_IN = 1.868, 0.565
Z_OUT, P_OUT = 1.843, 0.557


def desp_cam(t):
    d0 = T["despiece"]
    o = T["orbita"]
    if t < d0 + 2.6:
        e = ease_in_out_cubic(lin(t, d0, d0 + 2.6))
        return mix(Z_IN, 1.0, e), 0.5, mix(P_IN, 0.5, e)
    if t < o - 2.2:
        k = lin(t, d0 + 2.6, o - 2.2)
        return 1.0 + 0.02 * k, 0.5, 0.5
    e = ease_in_out_cubic(lin(t, o - 2.2, o + 0.3))
    z = mix(1.02, Z_OUT, e) * (1 + 0.012 * lin(t, o + 0.3, o + 0.6))
    return z, 0.5, mix(0.5, P_OUT, e)


def sc_despiece(t):
    bg = R("capa_fondo")[..., :3]
    h, w = bg.shape[:2]
    kr = h / 1080.0
    s = _sep(t)
    comp = bg.copy()
    for p in PART_ORDER:
        L = R(f"capa_{p}")
        dy = (PART_SEP[p] * s + 3.0 * math.sin(t * 1.3 + hash01(p) * 6) * s) * kr
        M = np.float32([[1, 0, 0], [0, 1, dy]])
        rgba = cv2.warpAffine(L, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        al = rgba[..., 3:4]
        comp = comp * (1 - al) + rgba[..., :3] * al
    kf = smooth(lin(t, T["orbita"] - 1.2, T["orbita"] - 0.6))
    if kf > 0:
        full = R("capa_todo")
        comp = comp * (1 - kf) + (bg * (1 - full[..., 3:4]) + full[..., :3] * full[..., 3:4]) * kf
    z, pxn, pyn = desp_cam(t)
    f = still(None, 0.0, z, z, (pxn, pyn), (pxn, pyn), img=comp)
    f = f * (0.6 + 0.4 * smooth(lin(t, T["despiece"] - 0.3, T["despiece"] + 0.5)))
    # transformación capa -> pantalla (para las notas)
    sc = max(W / w, H / h) * z
    cxp, cyp = pxn * w, pyn * h
    to_scr = lambda x, y: (W / 2 + (x - cxp) * sc, H / 2 + (y - cyp) * sc)
    boxes = _part_boxes()
    cap_op = smooth(lin(t, T["despiece"] + 2.4, T["despiece"] + 3.4)) * (1 - smooth(lin(t, T["orbita"] - 3.6,
                                                                                            T["orbita"] - 2.9)))
    xcap = 1235
    for i, p in enumerate(("pelo", "cabeza", "torso", "piernas")):
        x0, y0, x1, y1 = boxes[p]
        ex, cy = to_scr(x1, (y0 + y1) / 2 + PART_SEP[p] * s * kr)
        ex += 18
        op = cap_op * smooth(lin(t, T["despiece"] + 2.4 + i * 0.18, T["despiece"] + 3.2 + i * 0.18))
        if op <= 0.003:
            continue
        kk = ease_out_cubic(lin(t, T["despiece"] + 2.4 + i * 0.18, T["despiece"] + 3.6 + i * 0.18))
        lx = ex + (xcap - 38 - ex) * kk
        f = leader(f, [(ex, cy), (lx, cy)], op * 0.8)
        f = dot(f, ex, cy, 2.2, GOLD, op)
        num, name = PART_CAP[p]
        f = draw_text(f, num, "cormorant", 36, xcap, cy + 12, color=GOLD, wght=500, align="left", opacity=op)
        f = draw_text(f, name.upper(), "montserrat", 19, xcap + 58, cy + 7, color=IVORY, wght=300,
                      tracking=0.30, align="left", opacity=op * 0.88)
    f = title(f, "Tres semanas", t, T["despiece"] + 0.9, T["orbita"] - 1.4, 150, 515, size=74)
    f = title(f, "de trabajo intenso", t, T["despiece"] + 1.25, T["orbita"] - 1.4, 150, 603, size=74,
              font="cormorant_it", wght=400)
    return f


@functools.lru_cache(maxsize=1)
def _orbit_frames():
    return sorted(ORBIT_DIR.glob("o_*.png"))


ORBIT_FRONT = int(os.environ.get("YAMPI_ORBIT_FRONT", "86"))  # fotograma (24 fps) con la cámara de frente


def sc_orbita(t):
    fr = _orbit_frames()
    u = lin(t, T["orbita"], T["cara"] + 0.35)
    x = ORBIT_FRONT + (len(fr) - 1 - ORBIT_FRONT) * u
    i0 = int(math.floor(x))
    i1 = min(len(fr) - 1, i0 + 1)
    a = x - i0
    img = _read(fr[i0])[..., :3]
    if a > 0.02 and i1 != i0:
        img = img * (1 - a) + _read(fr[i1])[..., :3] * a
    k = lin(t, T["orbita"], T["cara"] + 0.35)
    f = still(None, k, 1.0, 1.035, (0.5, 0.5), (0.5, 0.49), img=img)
    f = title(f, "Para crear", t, T["orbita"] + 0.7, T["cara"] + 0.1, 150, 515, size=74)
    f = title(f, "una figura…", t, T["orbita"] + 1.05, T["cara"] + 0.1, 150, 603, size=74,
              font="cormorant_it", wght=400)
    return f


def sc_cara(t):
    k = lin(t, T["cara"], T["clavijero"] + 0.6)
    f = still("cara34", k, 1.0, 1.07, (0.50, 0.50), (0.52, 0.47))
    return light_sweep(f, lin(t, T["cara"], T["clavijero"] + 0.6), 20, 0.3, 0.06)


def sc_clavijero(t):
    k = lin(t, T["clavijero"], T["cuerdas"] + 0.6)
    return still("clavijero", k, 1.02, 1.08, (0.44, 0.52), (0.56, 0.48))


def sc_cuerdas(t):
    k = lin(t, T["cuerdas"], T["contrapicado"] + 0.6)
    f = still("cuerdas_boca", k, 1.0, 1.08, (0.46, 0.50), (0.42, 0.47))
    return light_sweep(f, lin(t, T["cuerdas"] - 0.2, T["contrapicado"] + 0.6), 35, 0.25, 0.07)


def sc_contrapicado(t):
    k = lin(t, T["contrapicado"], T["presentamos"] + 0.5)
    f = still("contrapicado", k, 1.0, 1.06, (0.5, 0.56), (0.5, 0.46))
    return f * (1 - smooth(lin(t, T["presentamos"] - 0.2, T["presentamos"] + 0.5)))


def detail_titles(f, t):
    f = title(f, "con un detalle", t, T["cara"] + 0.45, T["clavijero"] + 0.15, 1795, 470, size=60,
              font="cormorant_it", wght=400, align="right")
    f = title(f, "perfecto", t, T["cara"] + 0.75, T["clavijero"] + 0.15, 1795, 545, size=60,
              font="cormorant_it", wght=400, align="right")
    f = title(f, "y una calidad impoluta.", t, T["contrapicado"] + 0.35, T["presentamos"] - 0.1, 1800, 470,
              size=64, font="cormorant_it", wght=400, align="right")
    return f


def sc_presentamos(t):
    f = black()
    return title(f, "Presentamos", t, T["presentamos"] + 0.75, T["revelacion"] - 0.35, W / 2, H / 2 + 18,
                 size=60, align="center", font="cormorant_it", wght=400, tracking=0.10, rise=8, fade=1.1, out=0.6)


def sc_revelacion(t):
    tl = t - T["revelacion"]
    k = lin(t, T["revelacion"], T["epilogo"] + 0.7)
    f = still("heroe_izq", k, 1.0, 1.05, (0.5, 0.5), (0.47, 0.49))
    # la luz sube con el acorde
    rise = smoother(lin(tl, 0.0, 1.4))
    halo = smooth(lin(tl, 0.3, 4.0))
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W * 0.34) / (W * 0.33)) ** 2 + ((y - H * 0.42) / (H * 0.55)) ** 2)).astype(np.float32)
    f = screen(f * rise, (g * 0.10 * halo)[..., None] * np.float32([1.0, 0.78, 0.52]))
    ta = t - (T["revelacion"] + 1.6)
    if ta > 0:
        sw = lin(t, T["revelacion"] + 4.2, T["revelacion"] + 5.4)
        f = wordmark(f, W * 0.685, H * 0.50, 150, ta, opacity=1.0, sweep=sw,
                     tagline="IMPRESO EN 3D  ·  CAPA A CAPA", tag_t=ta - 1.9)
    return f


@functools.lru_cache(maxsize=1)
def _epilogue_parts():
    from .assets import photo_assets
    from . import scenes as V1
    return photo_assets(), V1


def sc_epilogo(t):
    A, V1 = _epilogue_parts()
    k = lin(t, T["epilogo"], T["final"] + 0.6)
    e = ease_in_out_sine(k)
    s = mix(0.585, 0.612, e)
    cx, cy = 960 / s + 18, mix(1052, 1036, e)
    f = V1.reveal_base(V1.C["reveal"] + 3.0, s, cx, cy)
    f = f * np.float32([1.0, 0.985, 0.95])
    f = title(f, "Del render…", t, T["epilogo"] + 0.8, T["final"] + 0.2, W * 0.70, 500, size=64,
              align="center", font="cormorant_it", wght=400)
    f = title(f, "a la realidad.", t, T["epilogo"] + 2.0, T["final"] + 0.2, W * 0.70, 585, size=64,
              align="center", font="cormorant", wght=500)
    return f


def sc_final(t):
    f = black()
    ta = t - T["final"] + 3.0
    op = smooth(lin(t, T["final"] + 0.2, T["final"] + 1.2))
    return wordmark(f, W / 2, H / 2 + 20, 96, ta, opacity=op, tagline="IMPRESO EN 3D  ·  CAPA A CAPA", tag_t=ta)


# (inicio, fin, fundido de entrada, escena)
SHOTS = [
    (T["ojos"], T["antena"] + 0.6, 0.0, sc_ojos),
    (T["antena"], T["imp"] + 0.6, 0.6, sc_antena),
    (T["imp"], T["despiece"] + 0.7, 0.6, sc_impresion),
    (T["despiece"], T["orbita"] + 0.6, 0.7, sc_despiece),
    (T["orbita"], T["cara"] + 0.35, 0.6, sc_orbita),
    (T["cara"], T["clavijero"] + 0.35, 0.35, sc_cara),
    (T["clavijero"], T["cuerdas"] + 0.35, 0.35, sc_clavijero),
    (T["cuerdas"], T["contrapicado"] + 0.35, 0.35, sc_cuerdas),
    (T["contrapicado"], T["presentamos"] + 0.5, 0.35, sc_contrapicado),
    (T["presentamos"], T["revelacion"] + 0.05, 0.0, sc_presentamos),
    (T["revelacion"], T["epilogo"] + 0.7, 0.0, sc_revelacion),
    (T["epilogo"], T["final"] + 0.6, 0.7, sc_epilogo),
    (T["final"], DURATION + 1, 0.6, sc_final),
]


def compose(t):
    f = None
    for a, b, fin, fn in SHOTS:
        if a <= t < b:
            img = fn(t)
            w = 1.0 if fin <= 0 else smooth((t - a) / fin)
            f = img if f is None else f * (1 - w) + img * w
    if f is None:
        f = black()
    if T["cara"] <= t < T["presentamos"] + 0.5:
        f = detail_titles(f, t)
    return f


# --------------------------------------------------------------------------- #
# Acabado
# --------------------------------------------------------------------------- #
_GRAIN = None


def grade(f):
    f = np.clip(f, 0, None)
    L = luma(f)[..., None]
    f = f * np.float32([1.02, 1.0, 0.965])
    f = f + np.float32([0.010, 0.0075, 0.006]) * (1 - np.clip(L, 0, 1)) ** 3
    s = np.clip(f, 0, 1)
    f = f * 0.86 + s * s * (3 - 2 * s) * 0.14
    return f


def post(f, t, fi):
    global _GRAIN
    if _GRAIN is None:
        _GRAIN = Grain(W, H, n=10, seed=11)
    f = grade(f)
    f = bloom(f, threshold=0.70, sigma=30, strength=0.22, tint=(1.0, 0.86, 0.70))
    f = f * vignette_mask(W, H, 0.30)[..., None]
    f = _GRAIN.apply(f, fi, 0.016)
    if t < 0.3:
        f = f * smooth(t / 0.3)
    fo = 1 - smooth(lin(t, DURATION - 1.4, DURATION - 0.1))
    return f * fo


def render_frame(fi):
    t = fi / FPS
    return finalize(post(compose(t), t, fi))


def _worker(fi):
    return fi, render_frame(fi).tobytes()


def prepare_orbit(src=R3D / "orbita", dst=ORBIT_DIR):
    """Interpola la órbita (12 fps) a 24 fps con flujo óptico y la amplía a 1080p."""
    frames = sorted(Path(src).glob("orbita_*.png"))
    if not frames:
        raise SystemExit("faltan los fotogramas de la órbita (python -m cinematic3d.shots build/3d/orbita --orbita)")
    dst.mkdir(parents=True, exist_ok=True)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)

    def load(p):
        im = _read(p)[..., :3]
        return cv2.resize(im, (W, H), interpolation=cv2.INTER_CUBIC)

    def save(im, k):
        out = (np.clip(im, 0, 1) * 65535 + 0.5).astype(np.uint16)
        cv2.imwrite(str(dst / f"o_{k:04d}.png"), cv2.cvtColor(out, cv2.COLOR_RGB2BGR))

    prev = load(frames[0])
    k = 0
    save(prev, k)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    for p in frames[1:]:
        cur = load(p)
        g0 = (cv2.cvtColor(prev, cv2.COLOR_RGB2GRAY) * 255).astype(np.uint8)
        g1 = (cv2.cvtColor(cur, cv2.COLOR_RGB2GRAY) * 255).astype(np.uint8)
        f01 = dis.calc(g0, g1, None)
        f10 = dis.calc(g1, g0, None)
        a = cv2.remap(prev, gx + 0.5 * f10[..., 0], gy + 0.5 * f10[..., 1], cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_REPLICATE)
        b = cv2.remap(cur, gx + 0.5 * f01[..., 0], gy + 0.5 * f01[..., 1], cv2.INTER_LINEAR,
                      borderMode=cv2.BORDER_REPLICATE)
        k += 1
        save(0.5 * a + 0.5 * b, k)
        k += 1
        save(cur, k)
        prev = cur
    print("órbita interpolada:", k + 1, "fotogramas")


def render_video(out, audio=None, workers=None, crf=18, start=0.0, end=None):
    end = DURATION if end is None else end
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    f0, f1 = int(round(start * FPS)), int(round(end * FPS))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-ss", f"{start:.3f}", "-i", str(audio)]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-maxrate", "6M", "-bufsize", "12M",
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film", "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += [str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    t0 = time.time()
    with Pool(workers or os.cpu_count() or 2) as pool:
        for n, (fi, data) in enumerate(pool.imap(_worker, range(f0, f1), chunksize=2)):
            proc.stdin.write(data)
            if n % 48 == 0:
                rate = (n + 1) / max(time.time() - t0, 1e-6)
                print(f"  fotograma {fi}/{f1} ({rate:.1f} fps)", flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"OK {out} ({time.time() - t0:.0f}s)")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="video/YAMPI_cinematica_1080p.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--stills", default=None)
    ap.add_argument("--stills-dir", default="build/stills2")
    ap.add_argument("--prepare-orbit", action="store_true")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=None)
    a = ap.parse_args(argv)
    if a.prepare_orbit:
        prepare_orbit()
        return
    if a.stills:
        from PIL import Image
        d = Path(a.stills_dir)
        d.mkdir(parents=True, exist_ok=True)
        for t in [float(x) for x in a.stills.split(",")]:
            p = d / f"still_{t:06.2f}.png"
            Image.fromarray(render_frame(int(round(t * FPS)))).save(p)
            print(p)
        return
    render_video(a.out, a.audio, a.workers, a.crf, a.start, a.end)


if __name__ == "__main__":
    main()
