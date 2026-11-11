"""Logotipo YAMPI: letras con extrusión "impresa en 3D" (líneas de capa en los
laterales) y dos antenas rojas que brotan de los picos de la M."""
from __future__ import annotations

import functools
import math

import cv2
import numpy as np

from .core import (clamp01, ease_out_back, ease_out_cubic, ease_out_elastic, hexcol, lin,
                   text_layer)

FACE_TOP = hexcol("#FFFBF3")
FACE_BOT = hexcol("#EADFCC")
SIDE = hexcol("#B5794C")
RED = hexcol("#D9252F")
RED_DARK = hexcol("#7E0F16")

LOGO_TEXT = "YAMPI"
WGHT = 700
WDTH = 108
TRACK = 0.035


def _shift(a, dx, dy):
    M = np.float32([[1, 0, dx], [0, 1, dy]])
    return cv2.warpAffine(a, M, (a.shape[1], a.shape[0]), flags=cv2.INTER_LINEAR,
                          borderMode=cv2.BORDER_CONSTANT, borderValue=0)


@functools.lru_cache(maxsize=8)
def letter_sprites(size):
    """Sprites RGBA premultiplicados por letra + métricas de colocación."""
    depth = max(6, int(size * 0.075))
    step = 1.0
    sprites = []
    x = 0.0
    track = TRACK * size
    for ch in LOGO_TEXT:
        a, (ox, oy), adv = text_layer(ch, "fredoka", size, WGHT, 0.0, WDTH)
        a = np.pad(a, ((0, depth + 4), (0, 0)))
        h, w = a.shape
        rgb = np.zeros((h, w, 3), np.float32)
        acc = np.zeros((h, w), np.float32)
        # extrusión (de atrás hacia delante), con bandas de "capa"
        for k in range(depth, 0, -1):
            sh = _shift(a, 0.0, k * step)
            shade = 1.0 - 0.45 * (k / depth)
            if (k // 2) % 2 == 1:
                shade *= 0.86
            col = SIDE * shade
            rgb = rgb * (1 - sh[..., None]) + col * sh[..., None]
            acc = acc * (1 - sh) + sh
        # cara frontal con degradado vertical
        top = oy - size * 0.75
        g = np.clip((np.arange(h, dtype=np.float32) - top) / (size * 0.8), 0, 1)[:, None, None]
        face = FACE_TOP * (1 - g) + FACE_BOT * g
        # brillo en los bordes superiores (bisel)
        hl = np.clip(a - _shift(a, 0, 2.2), 0, 1)
        face = face + hl[..., None] * 0.18
        # sombra interior en bordes inferiores
        lo = np.clip(a - _shift(a, 0, -2.0), 0, 1)
        face = face * (1 - lo[..., None] * 0.18)
        rgb = rgb * (1 - a[..., None]) + face * a[..., None]
        acc = acc * (1 - a) + a
        rgb_p = rgb * 1.0  # ya está "sobre negro" => premultiplicado
        sprites.append(dict(ch=ch, rgb=rgb_p.astype(np.float32), a=acc.astype(np.float32),
                            ox=ox, oy=oy, x=x, adv=adv, face_a=a))
        x += adv + track
    total = x - track
    return sprites, total, depth


@functools.lru_cache(maxsize=8)
def m_peaks(size):
    """Posiciones (relativas al origen de la M) de los dos picos superiores."""
    sprites, total, depth = letter_sprites(size)
    m = [s for s in sprites if s["ch"] == "M"][0]
    a = m["face_a"]
    h, w = a.shape
    cols = np.where(a.max(0) > 0.5)[0]
    x0, x1 = cols.min(), cols.max()
    peaks = []
    for lo, hi in ((x0, (x0 + x1) // 2), ((x0 + x1) // 2, x1)):
        best = None
        for c in range(lo, hi):
            rows = np.where(a[:, c] > 0.5)[0]
            if len(rows) == 0:
                continue
            if best is None or rows[0] < best[1]:
                best = (c, rows[0])
        # centro de la meseta del pico
        c0, r0 = best
        plateau = [c for c in range(lo, hi)
                   if len(np.where(a[:, c] > 0.5)[0]) and np.where(a[:, c] > 0.5)[0][0] <= r0 + 2]
        cx = (min(plateau) + max(plateau)) / 2
        peaks.append((cx - m["ox"], r0 - m["oy"]))
    return m["x"], peaks


def _paste(frame, rgb_p, a, x, y, opacity=1.0, scale=1.0, anchor=(0.0, 0.0)):
    """Pega un sprite premultiplicado con escala respecto a su ancla."""
    if opacity <= 0.003 or scale <= 0.01:
        return
    H, W = frame.shape[:2]
    h, w = a.shape
    ax, ay = anchor
    M = np.float32([[scale, 0, x - ax * scale], [0, scale, y - ay * scale]])
    x0 = int(max(0, math.floor(x - ax * scale) - 2))
    y0 = int(max(0, math.floor(y - ay * scale) - 2))
    x1 = int(min(W, math.ceil(x + (w - ax) * scale) + 2))
    y1 = int(min(H, math.ceil(y + (h - ay) * scale) + 2))
    if x1 <= x0 or y1 <= y0:
        return
    M[0, 2] -= x0
    M[1, 2] -= y0
    aw = cv2.warpAffine(a, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=0) * opacity
    cw = cv2.warpAffine(rgb_p, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                        borderMode=cv2.BORDER_CONSTANT, borderValue=0) * opacity
    roi = frame[y0:y1, x0:x1]
    frame[y0:y1, x0:x1] = roi * (1 - aw[..., None]) + cw


def _antenna_sprite(size, grow, pop, side):
    """Antena roja (tallo + bola) dibujada con supermuestreo."""
    ss = 3
    L = size * 0.30 * grow
    r_ball = size * 0.068 * pop
    sw = size * 0.052
    tilt = math.radians(10 if side > 0 else -10)
    pad = int(size * 0.2)
    Wd = int((abs(math.sin(tilt)) * size * 0.3 + r_ball * 2 + pad * 2) * ss) + 8
    Hd = int((size * 0.3 + size * 0.07 * 2 + pad * 2) * ss) + 8
    bx = Wd / 2
    by = Hd - pad * ss
    ex = bx + math.sin(tilt) * L * ss
    ey = by - math.cos(tilt) * L * ss
    img = np.zeros((Hd, Wd, 3), np.float32)
    al = np.zeros((Hd, Wd), np.float32)
    def line(c, w, col):
        cv2.line(c, (int(bx), int(by)), (int(ex), int(ey)), col, int(max(1, w)), cv2.LINE_AA)
    if L > 1:
        # sombra/lado del tallo
        tmp = np.zeros_like(al)
        line(tmp, sw * ss, 1.0)
        al = np.maximum(al, tmp)
        img = img * (1 - tmp[..., None]) + RED * 0.95 * tmp[..., None]
        # brillo lateral
        hl = np.zeros_like(al)
        cv2.line(hl, (int(bx - sw * ss * 0.18), int(by)), (int(ex - sw * ss * 0.18), int(ey)),
                 1.0, int(max(1, sw * ss * 0.25)), cv2.LINE_AA)
        img = img + hl[..., None] * 0.22 * tmp[..., None]
    if r_ball > 0.5:
        ball = np.zeros_like(al)
        cv2.circle(ball, (int(ex), int(ey)), int(r_ball * ss), 1.0, -1, cv2.LINE_AA)
        yy, xx = np.mgrid[0:Hd, 0:Wd].astype(np.float32)
        d = np.sqrt((xx - (ex - r_ball * ss * 0.35)) ** 2 + (yy - (ey - r_ball * ss * 0.35)) ** 2)
        shade = np.clip(1 - d / (r_ball * ss * 2.0), 0, 1)
        col = RED_DARK * (1 - shade[..., None]) + RED * shade[..., None]
        spec = np.exp(-(d / (r_ball * ss * 0.22)) ** 2)
        col = col + spec[..., None] * 0.55
        img = img * (1 - ball[..., None]) + col * ball[..., None]
        al = np.maximum(al, ball)
    img = cv2.resize(img, (Wd // ss, Hd // ss), interpolation=cv2.INTER_AREA)
    al = cv2.resize(al, (Wd // ss, Hd // ss), interpolation=cv2.INTER_AREA)
    return img * al[..., None], al, (bx / ss, by / ss)


def draw_logo(frame, cx, baseline_y, size, t, opacity=1.0, sweep_t=None, shadow=0.55,
              letters_dur=0.9, stagger=0.085):
    """Dibuja YAMPI animado. t: segundos desde el inicio de la animación."""
    sprites, total, depth = letter_sprites(size)
    x_start = cx - total / 2
    # sombra suave bajo el logotipo
    if shadow > 0 and opacity > 0:
        H, W = frame.shape[:2]
        k = clamp01(lin(t, 0.1, 0.9))
        y0 = int(baseline_y + depth * 0.6)
        sx = total * 0.55
        yy = np.arange(max(0, y0 - 80), min(H, y0 + 80), dtype=np.float32)[:, None]
        xx = np.arange(max(0, int(cx - sx * 1.6)), min(W, int(cx + sx * 1.6)), dtype=np.float32)[None, :]
        if yy.size and xx.size:
            sh = np.exp(-(((xx - cx) / sx) ** 2 + ((yy - y0) / 26) ** 2)) * shadow * k * opacity
            frame[int(yy[0, 0]):int(yy[-1, 0]) + 1, int(xx[0, 0]):int(xx[0, -1]) + 1] *= (1 - sh[..., None])
    for i, s in enumerate(sprites):
        lt = (t - i * stagger) / letters_dur
        if lt <= 0:
            continue
        e = ease_out_back(lt, 1.4)
        rise = (1 - e) * size * 0.55
        op = clamp01(lt * 2.2) * opacity
        sc = 0.86 + 0.14 * ease_out_cubic(lt)
        px = x_start + s["x"] - s["ox"]
        py = baseline_y - s["oy"] + rise
        anchor = (s["ox"] + s["adv"] / 2, s["oy"])
        _paste(frame, s["rgb"], s["a"], px + anchor[0], py + anchor[1], op, sc, anchor)
    # antenas sobre los picos de la M
    m_x, peaks = m_peaks(size)
    ta = t - (len(sprites) * stagger + letters_dur * 0.55)
    if ta > 0:
        for j, (pxr, pyr) in enumerate(peaks):
            tj = ta - j * 0.08
            if tj <= 0:
                continue
            grow = ease_out_elastic(clamp01(tj / 0.75))
            pop = ease_out_back(clamp01((tj - 0.18) / 0.45), 2.6)
            rgb, al, (bx, by) = _antenna_sprite(size, grow, max(pop, 0.0), -1 if j == 0 else 1)
            ax = x_start + m_x + pxr
            ay = baseline_y + pyr + size * 0.02
            _paste(frame, rgb, al, ax, ay, opacity, 1.0, (bx, by))
    # barrido de luz sobre la cara de las letras
    if sweep_t is not None and 0 < sweep_t < 1:
        H, W = frame.shape[:2]
        x0 = int(max(0, x_start - size * 0.3))
        x1 = int(min(W, x_start + total + size * 0.3))
        y0 = int(max(0, baseline_y - size * 1.25))
        y1 = int(min(H, baseline_y + depth + 6))
        if x1 > x0 and y1 > y0:
            xx = np.arange(x0, x1, dtype=np.float32)[None, :]
            yy = np.arange(y0, y1, dtype=np.float32)[:, None]
            pos = x_start - size * 0.4 + (total + size * 0.8) * sweep_t
            band = np.exp(-(((xx - pos) + (yy - baseline_y) * 0.35) / (size * 0.16)) ** 2)
            roi = frame[y0:y1, x0:x1]
            # solo sobre píxeles claros (las caras)
            L = roi.mean(-1)
            k = np.clip((L - 0.6) / 0.3, 0, 1)
            frame[y0:y1, x0:x1] = roi + (band * k * 0.55 * opacity)[..., None] * np.float32([1, 0.97, 0.9])
    return frame
