"""Escenas de la cinemática. Cada función recibe el tiempo global t (s) y
devuelve un fotograma float32 (H, W, 3)."""
from __future__ import annotations

import functools
import math

import cv2
import numpy as np

from .assets import EXT_PAD, FIG_BOTTOM, FIG_TOP, photo_assets, plate_assets
from .core import (blur, clamp01, dir_blur, draw_text, ease_in_cubic, ease_in_expo,
                   ease_in_out_cubic, ease_in_out_sine, ease_out_back, ease_out_cubic,
                   ease_out_expo, env, hash01, hexcol, lin, luma, mix, over, screen, smooth,
                   smoother, view, add_light_leak, anamorphic_flare)
from .logo import draw_logo
from .timeline import C

W, H = 1920, 1080
CYAN = hexcol("#5FE3D6")
CYAN_D = hexcol("#1E8F8A")
AMBER = hexcol("#FFB65C")
WARM = hexcol("#FFD9A8")
WHITE = np.float32([0.96, 0.95, 0.92])
NAVY = hexcol("#04060B")
BAMBU = hexcol("#19C26B")

FEET_X = 778  # centro entre los zapatos en la foto (x fuente)


# =========================================================================== #
# Utilidades de escena
# =========================================================================== #
@functools.lru_cache(maxsize=8)
def _radial(cx, cy, rx, ry):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    return np.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)).astype(np.float32)


def bg_dark(glow=0.07, color=None, cx=0.5, cy=0.5, rx=0.55, ry=0.6):
    col = CYAN_D if color is None else color
    f = np.empty((H, W, 3), np.float32)
    f[...] = NAVY
    if glow > 0:
        r = _radial(int(cx * W), int(cy * H), int(rx * W), int(ry * H))
        f += r[..., None] * col * glow
    return f


@functools.lru_cache(maxsize=16)
def _sprite(r):
    n = int(r * 3) + 2
    y, x = np.mgrid[-n:n + 1, -n:n + 1].astype(np.float32)
    return np.exp(-(x * x + y * y) / (2 * (r * 0.55) ** 2)).astype(np.float32)


def stamp(frame, x, y, r, color, intensity):
    spr = _sprite(round(max(0.6, r) * 2) / 2)
    n = spr.shape[0] // 2
    xi, yi = int(round(x)), int(round(y))
    x0, y0 = xi - n, yi - n
    x1, y1 = x0 + spr.shape[1], y0 + spr.shape[0]
    sx0, sy0 = max(0, -x0), max(0, -y0)
    sx1 = spr.shape[1] - max(0, x1 - W)
    sy1 = spr.shape[0] - max(0, y1 - H)
    if sx1 <= sx0 or sy1 <= sy0:
        return
    fx0, fy0 = max(0, x0), max(0, y0)
    patch = spr[sy0:sy1, sx0:sx1, None] * (np.asarray(color, np.float32) * intensity)
    frame[fy0:fy0 + patch.shape[0], fx0:fx0 + patch.shape[1]] += patch


class Dust:
    """Motas de polvo en suspensión con profundidad (las cercanas, desenfocadas)."""

    def __init__(self, n=90, seed=1, color=(1.0, 0.95, 0.85), rmin=0.8, rmax=9.0,
                 speed=12.0, region=(0, 0, W, H)):
        rng = np.random.default_rng(seed)
        self.n = n
        self.p = rng.random((n, 3)).astype(np.float32)
        self.v = (rng.random((n, 2)).astype(np.float32) - 0.5) * 2
        self.ph = rng.random(n).astype(np.float32) * 6.28
        self.color = np.asarray(color, np.float32)
        self.rmin, self.rmax, self.speed = rmin, rmax, speed
        self.region = region

    def draw(self, frame, t, opacity=1.0, mask_fn=None):
        if opacity <= 0.01:
            return frame
        x0, y0, x1, y1 = self.region
        rw, rh = x1 - x0, y1 - y0
        for i in range(self.n):
            z = self.p[i, 2]
            r = self.rmin + (self.rmax - self.rmin) * z ** 2.2
            sp = self.speed * (0.4 + z)
            x = (self.p[i, 0] * rw + self.v[i, 0] * sp * t + 14 * math.sin(t * 0.7 + self.ph[i])) % rw + x0
            y = (self.p[i, 1] * rh + (self.v[i, 1] * 0.5 - 0.35) * sp * t
                 + 10 * math.cos(t * 0.5 + self.ph[i] * 1.3)) % rh + y0
            tw = 0.65 + 0.35 * math.sin(t * (1.5 + z) + self.ph[i] * 3)
            inten = opacity * tw * (0.55 if z > 0.75 else 1.0) * (0.25 + 0.75 * (1 - z * 0.5))
            if mask_fn is not None:
                inten *= mask_fn(x, y)
            if inten > 0.01:
                stamp(frame, x, y, r, self.color, inten * (0.9 / (1 + 0.08 * r)))
        return frame


def _roi_screen(frame, buf, x0, y0, color, glow_sigma=0.0, glow=0.0, opacity=1.0):
    """Suma luz de una capa pequeña (buf, uint8 o float) en la posición (x0, y0)."""
    m = (buf.astype(np.float32) / 255.0 if buf.dtype == np.uint8 else buf) * opacity
    if glow > 0:
        m = m + cv2.GaussianBlur(m, (0, 0), glow_sigma) * glow
    h, w = m.shape
    fx0, fy0 = max(0, x0), max(0, y0)
    fx1, fy1 = min(W, x0 + w), min(H, y0 + h)
    if fx1 <= fx0 or fy1 <= fy0:
        return frame
    sub = m[fy0 - y0:fy1 - y0, fx0 - x0:fx1 - x0]
    roi = frame[fy0:fy1, fx0:fx1]
    frame[fy0:fy1, fx0:fx1] = roi + (sub[..., None] * np.asarray(color, np.float32)) * (1 - roi)
    return frame


def hud_corners(frame, x0, y0, x1, y1, color=CYAN, L=26, th=2, opacity=1.0):
    if opacity <= 0.01:
        return frame
    pad = 24
    bx0, by0 = int(x0) - pad, int(y0) - pad
    buf = np.zeros((int(y1 - y0) + 2 * pad + 1, int(x1 - x0) + 2 * pad + 1), np.uint8)
    pts = [((x0, y0), (x0 + L, y0)), ((x0, y0), (x0, y0 + L)),
           ((x1, y0), (x1 - L, y0)), ((x1, y0), (x1, y0 + L)),
           ((x0, y1), (x0 + L, y1)), ((x0, y1), (x0, y1 - L)),
           ((x1, y1), (x1 - L, y1)), ((x1, y1), (x1, y1 - L))]
    for a, b in pts:
        cv2.line(buf, (int(a[0]) - bx0, int(a[1]) - by0), (int(b[0]) - bx0, int(b[1]) - by0), 255, th,
                 cv2.LINE_AA)
    return _roi_screen(frame, buf, bx0, by0, color, 6, 0.6, opacity)


def hline(frame, x0, x1, y, color=CYAN, th=1, opacity=1.0, glow=0.5):
    if opacity <= 0.01 or x1 <= x0:
        return frame
    pad = 16
    bx0, by0 = int(x0) - pad, int(y) - pad
    buf = np.zeros((2 * pad + 1, int(x1 - x0) + 2 * pad + 1), np.uint8)
    cv2.line(buf, (pad, pad), (int(x1) - bx0, pad), 255, th, cv2.LINE_AA)
    return _roi_screen(frame, buf, bx0, by0, color, 5, glow, opacity)


def mono(frame, text, x, y, size=20, color=CYAN, opacity=0.85, align="left", wght=500,
         tracking=0.12, glow=0.0):
    return draw_text(frame, text, "mono", size, x, y, color=color, wght=wght, tracking=tracking,
                     align=align, opacity=opacity, glow=glow, glow_sigma=8)


def lowkey(img, exposure=0.42, lift=(0.004, 0.012, 0.018)):
    out = img * exposure
    return out + np.asarray(lift, np.float32) * (1 - np.clip(luma(out), 0, 1))[..., None]


@functools.lru_cache(maxsize=4)
def _xy_grids():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    return x, y


def fast_sweep(t01, angle=25.0, width=0.22):
    x, y = _xy_grids()
    a = math.radians(angle)
    u = (x / W) * math.cos(a) + (y / H) * math.sin(a) * (H / W)
    pos = -0.3 + 1.6 * t01
    return np.exp(-((u - pos) / width) ** 2)


@functools.lru_cache(maxsize=4)
def dof_mask(rx=0.42, ry=0.36, cx=0.5, cy=0.5):
    x, y = _xy_grids()
    d = np.sqrt(((x / W - cx) / rx) ** 2 + ((y / H - cy) / ry) ** 2)
    return np.clip((d - 0.75) / 0.8, 0, 1).astype(np.float32)


def apply_dof(frame, amount=6.0, **kw):
    if amount <= 0.2:
        return frame
    m = dof_mask(**kw)[..., None]
    b = blur(frame, amount)
    return frame * (1 - m) + b * m


# =========================================================================== #
# Cámara 3D simple para suelos en perspectiva y paneles
# =========================================================================== #
class Cam3D:
    def __init__(self, pos, target, fov=40.0):
        self.c = np.asarray(pos, np.float64)
        t = np.asarray(target, np.float64)
        f = t - self.c
        self.f = f / np.linalg.norm(f)
        up = np.array([0.0, 1.0, 0.0])
        r = np.cross(up, self.f)
        self.r = r / np.linalg.norm(r)
        self.u = np.cross(self.f, self.r)
        self.F = (W / 2) / math.tan(math.radians(fov) / 2)

    def project(self, P):
        v = np.asarray(P, np.float64) - self.c
        zc = v @ self.f
        xc = v @ self.r
        yc = v @ self.u
        return W / 2 + self.F * xc / zc, H / 2 - self.F * yc / zc, zc


def floor_grid(frame, cam, color=CYAN, opacity=0.5, spacing=0.5, extent=12, zmax=14.0, glow=0.6,
               t=0.0, scroll=0.0):
    if opacity <= 0.01:
        return frame
    buf = np.zeros((H, W), np.float32)
    def seg(P, Q, inten):
        p = cam.project(P)
        q = cam.project(Q)
        if p[2] < 0.15 and q[2] < 0.15:
            return
        if p[2] < 0.15 or q[2] < 0.15:
            # recortar al plano cercano
            a, b = (P, Q) if p[2] < 0.15 else (Q, P)
            for k in range(1, 20):
                m = np.asarray(a) + (np.asarray(b) - np.asarray(a)) * (k / 20)
                pm = cam.project(m)
                if pm[2] >= 0.15:
                    p, q = pm, cam.project(b)
                    break
            else:
                return
        cv2.line(buf, (int(p[0] * 4), int(p[1] * 4)), (int(q[0] * 4), int(q[1] * 4)), float(inten), 1,
                 cv2.LINE_AA, shift=2)
    n = int(extent / spacing)
    off = (scroll % spacing)
    for i in range(-n, n + 1):
        x = i * spacing
        inten = 1.0 if i % 5 == 0 else 0.55
        seg((x, 0, -2), (x, 0, zmax), inten)
    for j in range(-4, int(zmax / spacing) + 1):
        z = j * spacing - off
        far = clamp01(1 - z / zmax)
        inten = (1.0 if j % 5 == 0 else 0.55) * far
        seg((-extent, 0, z), (extent, 0, z), inten)
    # desvanecer en la distancia (por fila de pantalla)
    _, hy, _ = cam.project((0, 0, zmax))
    rows = np.arange(H, dtype=np.float32)[:, None]
    fade = np.clip((rows - hy) / (H * 0.35), 0, 1)
    m = buf * fade * opacity
    if glow > 0:
        m = m + blur(m, 3) * glow
    return screen(frame, m[..., None] * color)


def panel_quad(w, h, cx, cy, scale, yaw, pitch=0.0, roll=0.0, dist=2600.0, fov=36.0):
    """Esquinas en pantalla de un panel w x h rotado en 3D (yaw/pitch en grados)."""
    F = (W / 2) / math.tan(math.radians(fov) / 2)
    hw, hh = w * scale / 2, h * scale / 2
    pts = np.array([[-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0]], np.float64)
    cy_, sy_ = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    cp, sp = math.cos(math.radians(pitch)), math.sin(math.radians(pitch))
    cr, sr = math.cos(math.radians(roll)), math.sin(math.radians(roll))
    Ry = np.array([[cy_, 0, sy_], [0, 1, 0], [-sy_, 0, cy_]])
    Rx = np.array([[1, 0, 0], [0, cp, -sp], [0, sp, cp]])
    Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
    P = pts @ (Rz @ Rx @ Ry).T
    P[:, 2] += dist
    # la escala de pantalla en z=dist es F/dist; normalizamos para que scale sea px
    k = dist / F
    P[:, 0] /= k
    P[:, 1] /= k
    P[:, 2] /= k
    sx = cx + F * P[:, 0] / P[:, 2]
    sy = cy + F * P[:, 1] / P[:, 2]
    return np.stack([sx, sy], 1).astype(np.float32)


@functools.lru_cache(maxsize=16)
def rounded_alpha(w, h, r):
    a = np.zeros((h, w), np.uint8)
    r = int(r)
    cv2.rectangle(a, (r, 0), (w - r - 1, h - 1), 255, -1)
    cv2.rectangle(a, (0, r), (w - 1, h - r - 1), 255, -1)
    for cx, cy in ((r, r), (w - r - 1, r), (r, h - r - 1), (w - r - 1, h - r - 1)):
        cv2.circle(a, (cx, cy), r, 255, -1, cv2.LINE_AA)
    return a.astype(np.float32) / 255


def draw_panel(frame, img, quad, opacity=1.0, border=CYAN, border_op=0.9, scan=None, sheen=None,
               shadow=0.6, dim=1.0, radius=18):
    """Pega una imagen como pantalla flotante con borde luminoso, sombra y brillo."""
    if opacity <= 0.01:
        return frame
    h, w = img.shape[:2]
    src = np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    Hm = cv2.getPerspectiveTransform(src, quad)
    x0 = int(max(0, quad[:, 0].min() - 60))
    x1 = int(min(W, quad[:, 0].max() + 60))
    y0 = int(max(0, quad[:, 1].min() - 60))
    y1 = int(min(H, quad[:, 1].max() + 60))
    if x1 <= x0 or y1 <= y0:
        return frame
    T = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], np.float64)
    Hr = T @ Hm
    size = (x1 - x0, y1 - y0)
    rgb = cv2.warpPerspective(img, Hr, size, flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_CONSTANT)
    a0 = rounded_alpha(w, h, radius)
    a = cv2.warpPerspective(a0, Hr, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    roi = frame[y0:y1, x0:x1]
    # sombra
    if shadow > 0:
        sh = blur(a, 30)
        sh = np.roll(sh, 24, axis=0)
        roi = roi * (1 - (sh * shadow * opacity)[..., None])
    # textura de pantalla: líneas de barrido muy sutiles
    rows = (np.arange(size[1]) % 3 == 0).astype(np.float32)[:, None, None]
    rgb = rgb * (1 - 0.05 * rows) * dim
    if scan is not None:
        # scan: posición 0..1 de la línea de escaneo (en coordenadas del panel)
        ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        reveal = np.clip((scan - ys) / 0.04 + 1, 0, 1)
        line = np.exp(-((ys - scan) / 0.012) ** 2)
        rv = cv2.warpPerspective(np.repeat(reveal, w, 1), Hr, size, flags=cv2.INTER_LINEAR)
        ln = cv2.warpPerspective(np.repeat(line, w, 1).astype(np.float32), Hr, size, flags=cv2.INTER_LINEAR)
        rgb = rgb * (0.18 + 0.82 * rv[..., None]) + ln[..., None] * CYAN * 1.2
        roi = screen(roi, blur(ln * a, 10)[..., None] * CYAN * 0.8 * opacity)
    if sheen is not None:
        xs = np.linspace(0, 1, w, dtype=np.float32)[None, :]
        ys = np.linspace(0, 1, h, dtype=np.float32)[:, None]
        band = np.exp(-(((xs + ys * 0.6) - sheen) / 0.12) ** 2) * 0.06
        bw = cv2.warpPerspective(band.astype(np.float32), Hr, size, flags=cv2.INTER_LINEAR)
        rgb = rgb + bw[..., None]
    aa = (a * opacity)[..., None]
    roi = roi * (1 - aa) + rgb * aa
    # borde luminoso
    if border_op > 0:
        e = cv2.morphologyEx((a > 0.5).astype(np.uint8), cv2.MORPH_GRADIENT,
                             np.ones((3, 3), np.uint8)).astype(np.float32)
        e = blur(e, 0.6)
        roi = screen(roi, (e * border_op * opacity)[..., None] * border)
        roi = screen(roi, (blur(e, 8) * border_op * 0.6 * opacity)[..., None] * border)
    frame[y0:y1, x0:x1] = roi
    return frame


# =========================================================================== #
# ACTO I — EL GANCHO
# =========================================================================== #
_hook_dust = None


def _line_layer(frame, t, y, x0, x1, p, intensity=1.0):
    """Línea de luz extruida con chispa en la cabeza."""
    xh = x0 + (x1 - x0) * p
    if p <= 0:
        return frame
    m = np.zeros((H, W), np.float32)
    yi = int(y)
    xs = np.arange(int(x0), int(xh))
    if xs.size:
        # degradado: más brillante cerca de la cabeza
        g = 0.55 + 0.45 * np.exp(-(xh - xs) / 260.0)
        m[yi, int(x0):int(xh)] = g
        m[yi - 1, int(x0):int(xh)] = g * 0.35
        m[yi + 1, int(x0):int(xh)] = g * 0.35
    glow = blur(m, 4) * 2.2 + blur(m, 18) * 2.5
    col = np.float32([0.85, 1.0, 1.0])
    frame = screen(frame, (m + glow)[..., None] * col * intensity)
    if p < 1.0:
        stamp(frame, xh, y, 10, np.float32([0.7, 1.0, 1.0]), 1.2 * intensity)
        stamp(frame, xh, y, 30, CYAN, 0.35 * intensity)
        for k in range(10):
            ph = hash01("sp", k, int(t * 24))
            sx = xh - ph * 60
            sy = y + (hash01("spy", k, int(t * 24)) - 0.5) * 30 * ph
            stamp(frame, sx, sy, 1.2, np.float32([0.8, 1.0, 1.0]), 0.6 * (1 - ph))
    return frame


def scene_hook(t):
    f = bg_dark(glow=0.035)
    y = H / 2 + 6
    x0, x1 = W * 0.2, W * 0.8
    p = ease_in_out_cubic(lin(t, C["line_start"], C["line_end"]))
    # tras el golpe, la línea se mantiene más tenue
    li = 1.0 if t < C["hit_render"] else 0.75 + 0.25 * math.exp(-(t - C["hit_render"]) * 3)
    out_k = 1 - smooth(lin(t, C["glitch_out"], C["flashes"]))
    f = _line_layer(f, t, y, x0, x1, p, li * out_k)
    # Texto 1
    a1 = env(t, C["hook1"], C["hook1"] + 0.7, 9, 10) * out_k
    if t >= C["hit_render"]:
        a1 *= 0.62
    tr = 0.30 + 0.10 * lin(t, C["hook1"], C["flashes"])
    bl = 6 * (1 - ease_out_cubic(lin(t, C["hook1"], C["hook1"] + 0.8)))
    f = draw_text(f, "LO QUE ESTÁS A PUNTO DE VER", "montserrat", 34, W / 2, y - 46,
                  color=WHITE, wght=300, tracking=tr, opacity=a1, blur_sigma=bl)
    # Texto 2: golpe
    if t >= C["hit_render"]:
        k = t - C["hit_render"]
        sc = 1.0 + 0.28 * (1 - ease_out_expo(k / 0.22))
        op = clamp01(k / 0.05) * out_k
        bl2 = 9 * (1 - ease_out_expo(k / 0.2))
        gl = 0.25 + 0.9 * math.exp(-k * 5)
        if t >= C["glitch_out"]:
            # glitch: desplazamientos horizontales por franjas
            g = lin(t, C["glitch_out"], C["flashes"])
            tmp = np.zeros_like(f)
            tmp = draw_text(tmp, "NO ES UN RENDER.", "montserrat", 104, W / 2, y + 128, color=WHITE,
                            wght=700, tracking=0.06, opacity=1.0)
            for b in range(14):
                yy0 = int(y + 30 + b * 9)
                sh = int((hash01("gl", b, int(t * 24)) - 0.5) * 140 * g)
                tmp[yy0:yy0 + 9] = np.roll(tmp[yy0:yy0 + 9], sh, axis=1)
            tmp[..., 0] = np.roll(tmp[..., 0], int(10 * g), axis=1)
            tmp[..., 2] = np.roll(tmp[..., 2], -int(10 * g), axis=1)
            f = screen(f, tmp * (1 - g))
        else:
            f = draw_text(f, "NO ES UN RENDER.", "montserrat", 104, W / 2, y + 128, color=WHITE,
                          wght=700, tracking=0.06, opacity=op, scale=sc, blur_sigma=bl2,
                          glow=gl, glow_sigma=22, glow_color=np.float32([0.7, 0.95, 1.0]))
    return f


# Destellos macro del gancho: (cx, cy, escala, rotación, ángulo del barrido)
HOOK_FLASHES = [
    (905, 648, 4.0, -4, 20),     # ojos
    (652, 305, 4.3, 6, 160),     # bola de la antena
    (845, 1085, 3.5, -12, 35),   # cuerdas sobre la boca
    (870, 745, 4.0, 3, 200),     # sonrisa y líneas de capa
    (318, 690, 3.6, 18, 60),     # clavijas
]


def macro_lowkey(t_local, dur, cx, cy, s0, rot, sweep_angle, push=1.10, exposure=0.38, gain=1.25,
                 drift=(0, 0), bg_level=0.22, width=0.18):
    """Plano macro en clave baja: el fondo cae a negro y un barrido de luz
    cálida recorre solo la superficie de la figura."""
    A = photo_assets()
    k = t_local / dur
    s = s0 * (1 + (push - 1) * ease_out_cubic(k))
    ccx = cx + drift[0] * k
    ccy = cy + drift[1] * k
    img = view(A["photo"], ccx, ccy, s, rot, out=(W, H))
    fr = view(A["fig_rgb"], ccx, ccy, s, rot, out=(W, H), border=cv2.BORDER_CONSTANT)
    m = view(A["fig_a"], ccx, ccy, s, rot, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    band = fast_sweep(0.12 + 0.88 * k, angle=sweep_angle, width=width)
    # figura (color sin halo) iluminada por el barrido; fondo en penumbra
    lf = (exposure + gain * band) * m
    lb = exposure * bg_level * (1 - m)
    lit = (fr * lf[..., None] + img * lb[..., None]) * np.float32([1.0, 0.95, 0.9])
    return lowkey(lit, 1.0)


def scene_flashes(t):
    i = int((t - C["flashes"]) / C["flash_dur"])
    i = max(0, min(C["n_flashes"] - 1, i))
    tl = t - (C["flashes"] + i * C["flash_dur"])
    cx, cy, s, rot, ang = HOOK_FLASHES[i]
    f = macro_lowkey(tl, C["flash_dur"], cx, cy, s, rot, ang, push=1.12, exposure=0.42 + 0.03 * i)
    # sobreexposición inicial que se asienta
    f = f * (1 + 0.5 * math.exp(-tl * 20))
    f = apply_dof(f, 7.0, rx=0.40, ry=0.34)
    return f


def scene_black(t):
    f = bg_dark(glow=0.0)
    # resto de luz del último destello que se apaga
    k = math.exp(-(t - C["boom_black"]) * 5)
    if k > 0.02:
        g = macro_lowkey(C["flash_dur"], C["flash_dur"], *HOOK_FLASHES[-1][:4], HOOK_FLASHES[-1][4])
        f = f + blur(g, 25) * k * 0.25
    return f


# =========================================================================== #
# ACTO II — LO DIGITAL
# =========================================================================== #
_DUST_CYAN = Dust(n=70, seed=11, color=(0.75, 1.0, 0.98), rmin=0.8, rmax=7, speed=10)
_DUST_WARM = Dust(n=80, seed=5, color=(1.0, 0.86, 0.66), rmin=0.8, rmax=10, speed=9)


def whip(frame, k, direction=-1):
    """Barrido de cámara: k en 0..1 desplaza el encuadre con desenfoque de movimiento."""
    if k <= 0.001:
        return frame
    dx = direction * W * 0.9 * k
    M = np.float32([[1, 0, dx], [0, 1, 0]])
    out = cv2.warpAffine(frame, M, (W, H), borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0))
    L = int(min(220, 30 + 600 * math.sin(math.pi * min(k, 1.0)) * 0.5))
    small = cv2.resize(out, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    small = dir_blur(small, L // 4, 0)
    return cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR) * 0.9 + out * 0.1


def digital_bg(t, glow=0.08, grid=0.30, cam_z=-6.0, dust=0.9):
    f = bg_dark(glow=glow)
    cam = Cam3D((0.0, 1.5, cam_z + 0.15 * t % 0.5), (0.0, 0.5, 4.0), fov=52)
    f = floor_grid(f, cam, opacity=grid, spacing=0.5, extent=14)
    _DUST_CYAN.draw(f, t, opacity=dust)
    return f


def scene_weeks(t):
    tl = t - C["act2"]
    f = digital_bg(t, glow=0.09, grid=0.28 * smooth(lin(tl, 0, 0.9)))
    k = ease_out_expo(lin(tl, 0.0, 1.1))
    out_k = smooth(lin(t, C["plate1"] - 0.30, C["plate1"]))
    sc = 1 + 0.6 * ease_in_expo(out_k)
    op = smooth(lin(tl, 0.0, 0.4)) * (1 - out_k)
    sweep = (-0.3 + 1.6 * lin(tl, 0.9, 1.9), 0.10, 1.1)
    f = draw_text(f, "3 SEMANAS", "bebas", 236, W / 2, H / 2 + 62, color=WHITE,
                  tracking=mix(0.42, 0.05, k), opacity=op, blur_sigma=10 * (1 - k), scale=sc,
                  glow=0.18, glow_sigma=26, glow_color=CYAN, sweep=sweep)
    op2 = smooth(lin(tl, 0.45, 1.1)) * (1 - out_k)
    f = draw_text(f, "DE TRABAJO INTENSO", "montserrat", 30, W / 2, H / 2 + 128, color=WHITE,
                  wght=300, tracking=mix(0.38, 0.52, lin(tl, 0.4, 2.5)), opacity=op2 * 0.9)
    # contador de días
    days = 1 + int(20 * lin(t, C["days_start"], C["days_end"]))
    op3 = smooth(lin(tl, 0.2, 0.6)) * (1 - out_k)
    f = mono(f, f"DÍA {days:02d} / 21", W / 2, H / 2 + 232, size=22, align="center", opacity=0.9 * op3)
    x0 = W / 2 - 21 * 22 / 2
    for i in range(21):
        lit = i < days
        col = CYAN if lit else np.float32([0.25, 0.32, 0.36])
        inten = (1.0 if lit else 0.5) * op3
        if i == days - 1:
            inten *= 1.8
        stamp(f, x0 + i * 22 + 11, H / 2 + 262, 2.2, col, inten)
    return f


PLATE_SHOTS = [
    (C["plate1"], C["plate2"]),
    (C["plate2"], C["plate3"]),
    (C["plate3"], C["plate4"]),
    (C["plate4"], C["cards"]),
]
WHIP = 0.24


def _plate_content(t, idx):
    a, b = PLATE_SHOTS[idx]
    tl = t - a
    dur = b - a
    P = plate_assets()[idx]
    img = P["img"]
    f = digital_bg(t, glow=0.10, grid=0.22)
    ph, pw = img.shape[:2]
    disp_h = 540.0
    scale = disp_h / ph
    cx, cy = W * 0.355, H / 2 + 4
    # entrada
    if idx == 0:
        e = ease_out_cubic(lin(tl, 0.0, 0.75))
        sc = scale * (0.72 + 0.28 * e)
        yaw = mix(34, 12, e)
        op = smooth(lin(tl, 0.0, 0.35))
    else:
        e = 1.0
        sc = scale
        yaw = 12
        op = 1.0
    drift = lin(tl, 0, dur)
    sc *= 1 + 0.05 * ease_in_out_sine(drift)
    yaw = yaw - 6 * ease_in_out_sine(drift)
    pitch = 3 - 2 * drift
    quad = panel_quad(pw, ph, cx, cy, sc, yaw, pitch)
    scan = 1.08 * ease_in_out_cubic(lin(tl, 0.12, 1.05)) if tl < 1.1 else None
    f = draw_panel(f, img, quad, opacity=op, scan=scan, sheen=-0.4 + 1.9 * drift, shadow=0.7, dim=0.86)
    hud_op = smooth(lin(tl, 0.25, 0.7))
    # esquinas HUD alrededor del panel
    xs, ys = quad[:, 0], quad[:, 1]
    f = hud_corners(f, xs.min() - 18, ys.min() - 18, xs.max() + 18, ys.max() + 18, CYAN, 22, 2,
                    0.75 * hud_op * op)
    # etiquetas a la derecha
    lx = W * 0.70
    f = mono(f, f"PLACA {P['num']} / 04", lx, 372, size=20, opacity=0.85 * hud_op)
    f = hline(f, lx, lx + 300 * ease_out_cubic(lin(tl, 0.3, 0.9)), 388, CYAN, 1, 0.6 * hud_op)
    f = draw_text(f, P["num"], "bebas", 170, lx - 6, 548, color=WHITE, tracking=0.02, align="left",
                  opacity=hud_op, blur_sigma=6 * (1 - ease_out_cubic(lin(tl, 0.25, 0.8))),
                  glow=0.15, glow_color=CYAN)
    lines = P["name"].replace(", ", ",\n", 1).split("\n") if len(P["name"]) > 18 else [P["name"]]
    for j, ln in enumerate(lines):
        tj = lin(tl, 0.45 + 0.1 * j, 1.0 + 0.1 * j)
        f = draw_text(f, ln, "montserrat", 38, lx, 612 + j * 50, color=WHITE, wght=600,
                      tracking=mix(0.30, 0.10, ease_out_cubic(tj)), align="left",
                      opacity=smooth(tj))
    yb = 612 + len(lines) * 50 + 8
    f = mono(f, "LAMINADO  ·  BAMBU STUDIO", lx, yb, size=17, opacity=0.6 * hud_op)
    # cabecera
    f = mono(f, "YAMPI_V7_04_FINAL", 120, 196, size=18, opacity=0.55 * hud_op)
    for k in range(4):
        col = CYAN if k == idx else np.float32([0.3, 0.38, 0.42])
        stamp(f, W - 210 + k * 26, 190, 3.0, col, (1.5 if k == idx else 0.7) * hud_op)
    f = mono(f, "PLACAS", W - 240, 196, size=16, opacity=0.5 * hud_op, align="right")
    # línea de llamada desde la pieza hasta la etiqueta
    fx, fy = P["focus"]
    Hm = cv2.getPerspectiveTransform(np.float32([[0, 0], [pw, 0], [pw, ph], [0, ph]]), quad)
    pt = Hm @ np.array([fx * pw, fy * ph, 1.0])
    px, py = pt[0] / pt[2], pt[1] / pt[2]
    kk = ease_out_cubic(lin(tl, 0.55, 1.15))
    if kk > 0:
        stamp(f, px, py, 5, CYAN, 1.2 * kk)
        stamp(f, px, py, 16, CYAN, 0.35 * kk)
        buf = np.zeros((H, W), np.uint8)
        mid_x = px + (lx - 24 - px) * 0.35
        pts = [(px, py), (mid_x, py), (lx - 24, 548 - 60)]
        # polilínea: tramo 1 horizontal, tramo 2 en diagonal hasta la etiqueta
        segs = [(pts[0], pts[1]), (pts[1], pts[2])]
        total = sum(math.dist(p, q) for p, q in segs)
        rem = total * kk
        for p, q in segs:
            d = math.dist(p, q)
            if rem <= 0:
                break
            u = min(1.0, rem / d)
            qq = (p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u)
            cv2.line(buf, (int(p[0] * 4), int(p[1] * 4)), (int(qq[0] * 4), int(qq[1] * 4)), 255, 1,
                     cv2.LINE_AA, shift=2)
            rem -= d
        m = buf.astype(np.float32) / 255 * 0.8
        f = screen(f, (m + blur(m, 4) * 0.6)[..., None] * CYAN)
    # placa 03: el dato del millón de triángulos
    if idx == 2:
        f = _triangles_card(f, t, quad)
    return f


def _triangles_card(f, t, quad):
    tl = t - C["tri_count"]
    if tl <= 0:
        return f
    e = ease_out_back(lin(tl, 0.0, 0.45), 1.3)
    op = smooth(lin(tl, 0.0, 0.25))
    cw, ch = 540, 200
    cx = quad[:, 0].max() - cw / 2 + 60
    cy = quad[:, 1].max() - ch / 2 - 26 + (1 - e) * 40
    x0, y0 = int(cx - cw / 2), int(cy - ch / 2)
    x1, y1 = x0 + cw, y0 + ch
    roi = f[y0:y1, x0:x1]
    a = rounded_alpha(cw, ch, 16)[..., None] * op
    glass = blur(roi, 14) * 0.18 + np.float32([0.015, 0.022, 0.034])
    roi = roi * (1 - a * 0.92) + glass * a * 0.92
    # barra de acento ámbar a la izquierda
    roi[:, :7] = roi[:, :7] * (1 - a[:, :7] * 0.9) + AMBER * a[:, :7] * 0.9
    f[y0:y1, x0:x1] = roi
    n = int(1_000_000 * ease_out_expo(lin(tl, 0.1, 1.15)))
    txt = "+" + f"{n:,}".replace(",", ".")
    f = draw_text(f, txt, "bebas", 104, x0 + 34, y0 + 116, color=WHITE, align="left", tracking=0.02,
                  opacity=op, glow=0.2 if n >= 1_000_000 else 0.0, glow_color=AMBER)
    f = draw_text(f, "TRIÁNGULOS", "montserrat", 24, x0 + 36, y0 + 156, color=AMBER, wght=600,
                  tracking=0.32, align="left", opacity=op)
    f = mono(f, "SOLO EN LA PLACA 03", x0 + 36, y0 + 184, size=17, color=WHITE,
             opacity=0.6 * op)
    return f


def scene_plate(t, idx):
    a, b = PLATE_SHOTS[idx]
    f = _plate_content(t, idx)
    if idx > 0 and t - a < WHIP:
        k = 1 - ease_out_cubic((t - a) / WHIP)
        f = whip(f, k, direction=+1)
    if idx < 3 and b - t < WHIP:
        k = ease_in_cubic(1 - (b - t) / WHIP)
        f = whip(f, k, direction=-1)
    return f


def scene_plate1(t):
    return scene_plate(t, 0)


def scene_plate2(t):
    return scene_plate(t, 1)


def scene_plate3(t):
    return scene_plate(t, 2)


def scene_plate4(t):
    return scene_plate(t, 3)


def card_target():
    _, _, _, (fx, fy) = fig_screen(print_cam(C["act3"]))
    return fx, fy


def scene_cards(t):
    CARD_TARGET = card_target()
    tl = t - C["cards"]
    f = digital_bg(t, glow=0.10, grid=0.22)
    plates = plate_assets()
    col_k = ease_in_expo(lin(t, C["cards_collapse"], C["act3"] - 0.05))
    rot = -6 * ease_in_out_sine(lin(tl, 0, 2.2))
    for i in range(4):
        P = plates[i]
        img = P["img"]
        ph, pw = img.shape[:2]
        e = ease_out_back(lin(tl, 0.05 + i * 0.09, 0.75 + i * 0.09), 1.2)
        op = smooth(lin(tl, 0.05 + i * 0.09, 0.4 + i * 0.09))
        cw = 395.0
        sc = cw / pw * (0.9 + 0.1 * e)
        cx = W / 2 + (i - 1.5) * 425
        cy = H / 2 + 8 + (1 - e) * 260
        yaw = (i - 1.5) * -16 + rot
        if col_k > 0:
            cx = mix(cx, CARD_TARGET[0], col_k)
            cy = mix(cy, CARD_TARGET[1], col_k)
            sc *= (1 - 0.97 * col_k)
            op *= 1 - smooth(lin(col_k, 0.6, 1.0))
        quad = panel_quad(pw, ph, cx, cy, sc, yaw, 4)
        f = draw_panel(f, img, quad, opacity=op, sheen=-0.3 + 1.4 * lin(tl, 0.3, 2.6) + i * 0.1,
                       shadow=0.5, radius=14, border_op=0.8)
        tag_op = op * smooth(lin(tl, 0.6 + i * 0.09, 1.0 + i * 0.09)) * (1 - col_k)
        f = mono(f, P["num"], cx, quad[:, 1].max() + 40, size=20, align="center", opacity=0.8 * tag_op)
    t_op = smooth(lin(tl, 0.35, 0.9)) * (1 - smooth(lin(t, C["cards_collapse"], C["cards_collapse"] + 0.4)))
    f = draw_text(f, "4 PLACAS  ·  1 FIGURA", "montserrat", 40, W / 2, 262, color=WHITE, wght=500,
                  tracking=mix(0.5, 0.36, ease_out_cubic(lin(tl, 0.35, 1.4))), opacity=t_op)
    if col_k > 0:
        g = smooth(lin(col_k, 0.2, 1.0))
        stamp(f, CARD_TARGET[0], CARD_TARGET[1], 6 + 10 * g, np.float32([0.85, 1.0, 1.0]), 1.4 * g)
        stamp(f, CARD_TARGET[0], CARD_TARGET[1], 40 + 40 * g, CYAN, 0.45 * g)
    return f


# =========================================================================== #
# ACTO III — LO FÍSICO: impresión capa a capa
# =========================================================================== #
FIG_H_WORLD = 1.7
LAYER_PERIOD = 12.0  # px fuente por "capa" visible
PARTS = [  # (progreso al que se completa, etiqueta) de abajo arriba
    (0.31, "04  PIERNAS Y ZAPATOS"),
    (0.66, "03  TORSO, BRAZOS Y GUITARRA"),
    (0.84, "01  CABEZA COMPLETA"),
    (1.00, "02  PELO CON ANTENAS"),
]


def print_cam(t):
    k = ease_in_out_sine(lin(t, C["act3"], C["act4"]))
    return Cam3D((mix(-0.55, 0.45, k), 1.22, mix(-7.3, -6.2, k)), (0.0, 0.86, 0.0), fov=40)


def fig_screen(cam):
    """Escala y centro fuente para dibujar la figura de pie en el origen."""
    fx, fy, _ = cam.project((0, 0, 0))
    tx, ty, _ = cam.project((0, FIG_H_WORLD, 0))
    hpx = fy - ty
    s = hpx / (FIG_BOTTOM - FIG_TOP)
    cxs = FEET_X + (W / 2 - fx) / s
    cys = FIG_BOTTOM + (H / 2 - fy) / s
    return s, cxs, cys, (fx, fy)


def print_progress(t):
    return ease_in_out_sine(lin(t, C["print_start"], C["print_end"]))


def draw_check(f, x, y, size, color, op):
    pad = 10
    bx0, by0 = int(x) - pad, int(y - size * 0.45) - pad
    buf = np.zeros((int(size * 0.8) + 2 * pad + 2, int(size) + 2 * pad + 2), np.uint8)
    pts = np.array([[x, y], [x + size * 0.35, y + size * 0.35], [x + size, y - size * 0.45]])
    pts = (pts - [bx0, by0]) * 4
    cv2.polylines(buf, [pts.astype(np.int32)], False, 255, 2, cv2.LINE_AA, shift=2)
    return _roi_screen(f, buf, bx0, by0, color, 3, 0.6, op)


def build_bed(f, cam, op):
    """Cama de impresión: rectángulo luminoso en el suelo + resplandor."""
    if op <= 0.01:
        return f
    buf = np.zeros((H, W), np.uint8)
    hw = 1.25
    corners = [(-hw, 0, -hw), (hw, 0, -hw), (hw, 0, hw), (-hw, 0, hw)]
    pts = np.array([cam.project(c)[:2] for c in corners])
    cv2.polylines(buf, [(pts * 4).astype(np.int32)], True, 255, 2, cv2.LINE_AA, shift=2)
    m = buf.astype(np.float32) / 255 * op
    f = screen(f, (m * 0.8 + blur(m, 6) * 0.8)[..., None] * CYAN)
    fill = np.zeros((H // 4, W // 4), np.uint8)
    cv2.fillPoly(fill, [(pts).astype(np.int32)], 255, cv2.LINE_AA, shift=2)
    fm = cv2.GaussianBlur(fill.astype(np.float32) / 255, (0, 0), 4.5) * 0.06 * op
    fm = cv2.resize(fm, (W, H), interpolation=cv2.INTER_LINEAR)
    return screen(f, fm[..., None] * CYAN)


def hologram(f, t, cam, p, q, holo_op=1.0, ghost_k=1.0):
    A = photo_assets()
    s, cxs, cys, (fx, fy) = fig_screen(cam)
    a = view(A["fig_a"], cxs, cys, s, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    e = view(A["edge"], cxs, cys, s, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    rows = np.arange(H, dtype=np.float32)
    ysrc = cys + (rows - H / 2) / s
    y_p = FIG_BOTTOM - p * (FIG_BOTTOM - FIG_TOP)
    y_q = FIG_BOTTOM - q * (FIG_BOTTOM - FIG_TOP)
    printed = np.clip((ysrc - y_p) * s / 2.0 + 0.5, 0, 1)[:, None]
    stripes = (0.5 + 0.5 * np.cos(2 * np.pi * ysrc / LAYER_PERIOD)) ** 2
    stripes = stripes[:, None]
    flick = 0.85 + 0.15 * math.sin(t * 37) * math.sin(t * 13)
    body = a * printed * (0.10 + 0.24 * stripes) * flick
    edges = e * printed * 0.85
    ghost = (a * 0.03 + e * 0.16 * (0.7 + 0.3 * math.sin(t * 6))) * (1 - printed) * ghost_k
    holo = (body + edges + ghost) * holo_op
    real_mask = np.clip((ysrc - y_q) * s / 2.0 + 0.5, 0, 1)[:, None] if q > 0 else None
    if real_mask is not None:
        holo = holo * (1 - real_mask)
    f = screen(f, holo[..., None] * CYAN)
    f = screen(f, blur(holo, 10)[..., None] * CYAN * 0.55)
    # línea de la capa actual + boquilla
    if 0.0 < p < 1.0 and holo_op > 0.01:
        yl = H / 2 + (y_p - cys) * s
        band = np.exp(-((rows - yl) / 1.6) ** 2)[:, None]
        ad = cv2.dilate(a, np.ones((5, 5), np.uint8))
        line = band * ad
        f = screen(f, (line * 1.2 + blur(line, 6) * 1.4 + blur(line, 22) * 0.9)[..., None]
                   * np.float32([0.8, 1.0, 1.0]) * holo_op)
        yi = int(round(yl))
        if 0 <= yi < H:
            xs = np.where(a[yi] > 0.5)[0]
            if xs.size:
                left, right = xs.min(), xs.max()
                u = 0.5 + 0.5 * math.sin(t * 7.0) * math.cos(t * 2.3)
                nx = left + (right - left) * u
                stamp(f, nx, yl, 4, np.float32([1, 1, 1]), 1.6 * holo_op)
                stamp(f, nx, yl, 16, CYAN, 0.6 * holo_op)
                stamp(f, nx, yl, 46, CYAN, 0.18 * holo_op)
                for k in range(12):
                    hh = hash01("spark", k, int(t * 24))
                    sx = nx + (hash01("sx", k, int(t * 24)) - 0.5) * 70 * hh
                    sy = yl + hh * 50
                    stamp(f, sx, sy, 1.3, np.float32([0.8, 1.0, 1.0]), 0.8 * (1 - hh) * holo_op)
    # figura real que se materializa
    if real_mask is not None:
        rgb = view(A["fig_rgb"], cxs, cys, s, out=(W, H), border=cv2.BORDER_CONSTANT)
        lit = real_figure_light(rgb, a, e, t)
        m = a[..., None] * real_mask[..., None] if real_mask.ndim == 2 else a[..., None] * real_mask
        f = f * (1 - m) + lit * m
        if q < 1.0:
            yl = H / 2 + (y_q - cys) * s
            band = np.exp(-((rows - yl) / 2.2) ** 2)[:, None]
            ad = cv2.dilate(a, np.ones((9, 9), np.uint8))
            line = band * ad
            f = screen(f, (line * 1.5 + blur(line, 8) * 1.6 + blur(line, 30) * 0.8)[..., None]
                       * np.float32([1.0, 0.95, 0.85]))
    return f, (fx, fy), s


def real_figure_light(rgb, a, e, t, exposure=0.62, rim=0.55, sweep=None):
    """Figura real en penumbra con luz de contorno cálida."""
    lit = rgb * exposure * np.float32([1.0, 0.96, 0.92])
    if sweep is not None:
        lit = lit * (1 + sweep[..., None] * 0.9)
    rim_l = blur(e, 2.5) * rim
    lit = lit + rim_l[..., None] * np.float32([1.0, 0.78, 0.52]) * 0.6
    return lit


def scene_print(t):
    cam = print_cam(t)
    f = bg_dark(glow=0.10, cy=0.62)
    grid_op = 0.42 * smooth(lin(t, C["act3"], C["act3"] + 0.8)) * (1 - 0.6 * smooth(lin(t, C["mat_end"], C["act4"])))
    f = floor_grid(f, cam, opacity=grid_op, spacing=0.25, extent=8, zmax=10)
    f = build_bed(f, cam, grid_op * 1.6)
    _DUST_CYAN.draw(f, t, opacity=0.7)
    p = print_progress(t)
    q = ease_in_out_cubic(lin(t, C["materialize"], C["mat_end"]))
    holo_op = 1 - smooth(lin(t, C["mat_end"], C["act4"]))
    ghost_k = 0.3 + 0.7 * smooth(lin(t, C["print_start"] - 0.5, C["print_start"] + 0.6))
    f, (fx, fy), s = hologram(f, t, cam, p, q, holo_op, ghost_k)
    # punto de luz en espera (viene de las tarjetas)
    if t < C["print_start"] + 0.3:
        pulse = 0.75 + 0.25 * math.sin(t * 9)
        k = 1 - smooth(lin(t, C["print_start"], C["print_start"] + 0.3))
        stamp(f, fx, fy, 6, np.float32([0.85, 1.0, 1.0]), 1.3 * pulse * k)
        stamp(f, fx, fy, 50, CYAN, 0.35 * pulse * k)
    # título
    tl = t - C["act3"]
    out_k = smooth(lin(t, C["print_start"] - 0.35, C["print_start"] + 0.25))
    kk = ease_out_expo(lin(tl, 0.05, 1.0))
    op = smooth(lin(tl, 0.0, 0.4)) * (1 - out_k)
    if op > 0.01:
        f = draw_text(f, "MÁS DE 2 DÍAS", "bebas", 210, W / 2, H / 2 + 20, color=WHITE,
                      tracking=mix(0.40, 0.05, kk), opacity=op, blur_sigma=10 * (1 - kk) + 8 * out_k,
                      glow=0.18, glow_color=CYAN,
                      sweep=(-0.3 + 1.6 * lin(tl, 0.8, 1.8), 0.1, 1.0))
        f = draw_text(f, "DE IMPRESIÓN", "montserrat", 30, W / 2, H / 2 + 86, color=WHITE, wght=300,
                      tracking=mix(0.38, 0.5, lin(tl, 0.3, 2.0)),
                      opacity=smooth(lin(tl, 0.4, 1.0)) * (1 - out_k) * 0.9)
    # HUD
    hud = smooth(lin(t, C["act3"] + 0.9, C["act3"] + 1.5)) * (1 - smooth(lin(t, C["mat_end"] - 0.3, C["mat_end"] + 0.4)))
    if hud > 0.01:
        secs = int(48 * 3600 * lin(t, C["print_start"], C["print_end"]))
        hh, mm, ss = secs // 3600, (secs // 60) % 60, secs % 60
        done = t >= C["print_end"]
        f = mono(f, "TIEMPO DE IMPRESIÓN", W - 130, 205, size=17, align="right", opacity=0.65 * hud)
        tcol = AMBER if done else WHITE
        txt = f"{hh:02d}:{mm:02d}:{ss:02d}" + ("+" if done and int(t * 3) % 2 == 0 else (" " if done else ""))
        f = draw_text(f, txt, "mono", 54, W - 130 + (18 if done else 0), 268, color=tcol, wght=500,
                      tracking=0.04, align="right", opacity=hud, glow=0.25 if done else 0.08,
                      glow_color=tcol)
        # barra de progreso
        bx0, bx1, by = W / 2 - 360, W / 2 + 360, 892
        f = hline(f, bx0, bx1, by, np.float32([0.3, 0.4, 0.45]), 2, 0.6 * hud, glow=0)
        f = hline(f, bx0, bx0 + (bx1 - bx0) * p, by, CYAN, 3, hud, glow=0.9)
        lab = "COMPLETADO" if p >= 0.999 else "IMPRIMIENDO"
        f = mono(f, lab, bx0, by - 18, size=17, opacity=0.7 * hud)
        f = mono(f, f"{int(round(p * 100)):3d} %", bx1, by - 18, size=17, align="right",
                 opacity=0.9 * hud, color=WHITE)
        # piezas
        x0, y0 = 120, 760
        f = mono(f, "PIEZAS", x0, y0 - 4 * 40 - 10, size=16, opacity=0.5 * hud)
        for j, (pp, label) in enumerate(PARTS):
            yy = y0 - (3 - j) * 40
            ok = p >= pp - 0.03
            col = WHITE if ok else np.float32([0.42, 0.5, 0.55])
            f = mono(f, label, x0 + 34, yy, size=18, color=col, opacity=(1.0 if ok else 0.7) * hud)
            if ok:
                kk2 = smooth(lin(p, pp - 0.03, pp))
                f = draw_check(f, x0, yy - 8, 16, CYAN, kk2 * hud)
            else:
                stamp(f, x0 + 8, yy - 7, 2.0, np.float32([0.42, 0.5, 0.55]), 0.6 * hud)
    return f


# =========================================================================== #
# ACTO IV — EL DETALLE
# =========================================================================== #
def dark_figure_frame(t, s, feet_x, feet_y, sweep01=None, exposure=0.62, rim=0.55, bg=None):
    A = photo_assets()
    cxs = FEET_X + (W / 2 - feet_x) / s
    cys = FIG_BOTTOM + (H / 2 - feet_y) / s
    rgb = view(A["fig_rgb"], cxs, cys, s, out=(W, H), border=cv2.BORDER_CONSTANT)
    a = view(A["fig_a"], cxs, cys, s, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    e = view(A["edge"], cxs, cys, s, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    sw = None
    if sweep01 is not None:
        x, y = _xy_grids()
        pos = -0.2 + 1.4 * sweep01
        sw = np.exp(-(((y / H) - pos + (x / W - 0.5) * 0.35) / 0.13) ** 2)
    lit = real_figure_light(rgb, a, e, t, exposure, rim, sw)
    f = bg if bg is not None else bg_dark(glow=0.05, color=np.float32([0.5, 0.32, 0.2]))
    return f * (1 - a[..., None]) + lit * a[..., None]


def lower_title(f, text, t, t0, t1, y=842, size=50, font="cinzel", wght=600, tracking=0.16):
    op = env(t, t0, t0 + 0.6, t1 - 0.5, t1)
    if op <= 0.01:
        return f
    k = ease_out_cubic(lin(t, t0, t0 + 1.2))
    # degradado oscuro inferior para legibilidad
    rows = np.arange(H, dtype=np.float32)[:, None]
    g = np.clip((rows - (y - 170)) / 220, 0, 1) * 0.55 * op
    f = f * (1 - g[..., None])
    return draw_text(f, text, font, size, W / 2, y, color=np.float32([0.98, 0.95, 0.89]), wght=wght,
                     tracking=mix(tracking + 0.12, tracking, k), opacity=op,
                     blur_sigma=5 * (1 - k), glow=0.12, glow_color=AMBER)


def scene_figure_dark(t):
    tl = t - C["act4"]
    k = lin(t, C["act4"], C["macro_face"])
    s0, _, _, (fx0, fy0) = fig_screen(print_cam(C["act4"]))
    g = ease_in_out_cubic(lin(t, C["act4"], C["act4"] + 1.3))
    s = mix(s0, mix(0.462, 0.49, ease_in_out_sine(k)), g)
    fx = mix(fx0, W * 0.655 + 20 * k, g)
    fy = mix(fy0, 918, g)
    bg = bg_dark(glow=0.06 * g, color=np.float32([0.55, 0.35, 0.2]), cx=0.64, cy=0.55)
    _DUST_WARM.draw(bg, t, opacity=0.5 * g)
    f = dark_figure_frame(t, s, fx, fy, sweep01=lin(tl, 0.3, 2.4), bg=bg)
    op = env(t, C["act4"] + 0.55, C["act4"] + 1.1, C["macro_face"] - 0.35, C["macro_face"])
    kk = ease_out_cubic(lin(tl, 0.55, 1.7))
    for j, ln in enumerate(["PARA CREAR", "UNA FIGURA…"]):
        f = draw_text(f, ln, "cinzel", 58, W * 0.31, 505 + j * 82, color=np.float32([0.98, 0.95, 0.89]),
                      wght=600, tracking=mix(0.30, 0.16, kk), opacity=op * smooth(lin(tl, 0.55 + j * 0.25, 1.2 + j * 0.25)),
                      blur_sigma=5 * (1 - kk), glow=0.1, glow_color=AMBER)
    return f


# (inicio, fin, (cx0, cy0, s0, rot0), (cx1, cy1, s1, rot1), ángulo barrido)
MACROS = [
    (C["macro_face"], C["macro_hair"], (848, 692, 2.05, -1.0), (852, 668, 2.35, 1.5), 20),
    (C["macro_hair"], C["macro_neck"], (792, 560, 1.85, 2.0), (772, 405, 2.0, -1.0), 110),
    (C["macro_neck"], C["macro_strings"], (355, 738, 2.3, 16.0), (560, 868, 2.2, 13.0), 200),
    (C["macro_strings"], C["macro_wood"], (885, 1112, 2.3, -3.0), (862, 1088, 2.6, 0.5), 40),
    (C["macro_wood"], C["macro_flash1"], (905, 1255, 2.25, 4.0), (930, 1215, 1.95, 2.0), 150),
    (C["macro_flash1"], C["macro_flash2"], (800, 1742, 2.4, -3.0), (800, 1742, 2.75, -3.0), 30),
    (C["macro_flash2"], C["act5"], (822, 872, 2.5, 2.0), (822, 872, 2.85, 2.0), 200),
]
XFADE = 0.30


def _macro_render(t, i):
    a, b, p0, p1, ang = MACROS[i]
    k = ease_in_out_sine(lin(t, a, b + (XFADE if i < len(MACROS) - 1 else 0)))
    cx, cy, s, rot = [mix(p0[j], p1[j], k) for j in range(4)]
    A = photo_assets()
    img = view(A["photo"], cx, cy, s, rot, out=(W, H))
    fr = view(A["fig_rgb"], cx, cy, s, rot, out=(W, H), border=cv2.BORDER_CONSTANT)
    m = view(A["fig_a"], cx, cy, s, rot, out=(W, H), interp=cv2.INTER_LINEAR, border=cv2.BORDER_CONSTANT)
    band = fast_sweep(lin(t, a - 0.2, b + 0.2), angle=ang, width=0.26)
    lf = (0.70 + 0.55 * band) * m
    lb = 0.70 * 0.42 * (1 - m)
    f = (fr * lf[..., None] + img * lb[..., None]) * np.float32([1.0, 0.96, 0.9])
    f = lowkey(f, 1.0, lift=(0.006, 0.008, 0.012))
    return apply_dof(f, 5.0, rx=0.46, ry=0.40)


def scene_macros(t):
    i = 0
    for j, (a, b, *_rest) in enumerate(MACROS):
        if a <= t < b:
            i = j
            break
    a = MACROS[i][0]
    f = _macro_render(t, i)
    if i > 0 and t - a < XFADE and i < 5:
        prev = _macro_render(t, i - 1)
        k = smooth((t - a) / XFADE)
        f = prev * (1 - k) + f * k
    if i >= 5:
        # destellos rápidos finales
        tl = t - a
        f = f * (1 + 0.8 * math.exp(-tl * 16))
    if i == len(MACROS) - 1:
        f = f * (1 - smooth(lin(t, C["act5"] - 0.25, C["act5"])))
    f = lower_title(f, "CON UN DETALLE PERFECTO", t, C["macro_face"] + 0.25, C["macro_hair"] + 0.15)
    f = lower_title(f, "Y UNA CALIDAD IMPOLUTA", t, C["macro_strings"] + 0.25, C["macro_wood"] + 0.15)
    return f


# =========================================================================== #
# ACTO V — LA REVELACIÓN
# =========================================================================== #
STROBES = [54.30, 54.64, 54.92, 55.13, 55.29, 55.40, 55.48]


def scene_presentamos(t):
    f = bg_dark(glow=0.03, color=np.float32([0.5, 0.35, 0.25]))
    _DUST_WARM.draw(f, t, opacity=0.35 * (1 - smooth(lin(t, C["silence"] - 0.3, C["silence"]))))
    tl = t - C["presentamos"]
    op = env(t, C["presentamos"], C["presentamos"] + 0.6, C["strobe"] + 0.6, C["strobe"] + 1.05)
    if op > 0.01:
        f = draw_text(f, "PRESENTAMOS", "montserrat", 40, W / 2, H / 2 + 14, color=WHITE, wght=300,
                      tracking=mix(0.55, 0.85, lin(tl, 0, 2.6)), opacity=op,
                      blur_sigma=4 * (1 - smooth(lin(tl, 0, 0.8))))
    for ts in STROBES:
        if ts <= t < ts + 0.09:
            k = 1 - (t - ts) / 0.09
            g = dark_figure_frame(t, 0.47, W / 2 + 40, 915, sweep01=0.5, exposure=0.5, rim=0.9,
                                  bg=np.zeros((H, W, 3), np.float32))
            f = screen(f, g * k * 0.9)
    if t >= C["silence"]:
        f[...] = 0
    return f


REVEAL_S0, REVEAL_S1 = 0.585, 0.628


def reveal_cam(t):
    k = ease_out_cubic(lin(t, C["reveal"], C["endcard"] + 1.0)) * 0.6 + 0.4 * lin(t, C["reveal"], C["endcard"] + 1.0)
    s = mix(REVEAL_S0, REVEAL_S1, k)
    cx = 960 / s + 18
    cy = mix(1052, 1032, k)
    return s, cx, cy


@functools.lru_cache(maxsize=1)
def _reveal_feather():
    A = photo_assets()
    Hh, Ww = A["H"], A["W"]
    xr = np.arange(Ww, dtype=np.float32)
    return np.repeat((np.clip((1300 - xr) / 320.0, 0, 1) ** 1.3)[None, :], Hh, 0).astype(np.float32)


_DUST_REVEAL = Dust(n=110, seed=21, color=(1.0, 0.9, 0.75), rmin=0.8, rmax=12, speed=7,
                    region=(700, 0, W, H))


def reveal_base(t, s, cx, cy):
    A = photo_assets()
    f = view(A["ext"], (cx + EXT_PAD) / 2, cy / 2, s * 2, out=(W, H))
    p = view(A["photo"], cx, cy, s, out=(W, H), border=cv2.BORDER_CONSTANT)
    m = view(_reveal_feather(), cx, cy, s, out=(W, H), border=cv2.BORDER_CONSTANT,
             interp=cv2.INTER_LINEAR)
    # cambio de foco: el fondo se desenfoca un poco más tras el golpe y la figura "salta"
    rack = 4.5 * smooth(lin(t, C["reveal"] + 0.3, C["reveal"] + 2.6))
    if rack > 0.3:
        fg = view(A["fg_a"], cx, cy, s, out=(W, H), border=cv2.BORDER_CONSTANT, interp=cv2.INTER_LINEAR)
        fg = cv2.GaussianBlur(fg, (0, 0), 1.5)[..., None]
        p = p * fg + blur(p, rack) * (1 - fg)
    f = over(f, p, m)
    # grade cálido sutil
    f = f * np.float32([1.03, 1.0, 0.95])
    return f


LOGO_X, LOGO_Y, LOGO_SIZE = 1300, 600, 232
END_X, END_Y, END_SIZE = W / 2, 520, 210


def scene_reveal(t):
    s, cx, cy = reveal_cam(t)
    f = reveal_base(t, s, cx, cy)
    tl = t - C["reveal"]
    f = add_light_leak(f, t, strength=0.20 + 0.12 * math.exp(-tl * 1.5), seed=3)
    _DUST_REVEAL.draw(f, t, opacity=0.55)
    # transición al cierre: la foto se oscurece y el logotipo viaja al centro
    k_end = smoother(lin(t, C["endcard"] - 0.7, C["endcard"] + 0.5))
    if k_end > 0:
        dark = bg_dark(glow=0.07, color=np.float32([0.6, 0.38, 0.22]))
        f = blur(f, 18 * k_end) * (1 - k_end) + dark * k_end
        _DUST_WARM.draw(f, t, opacity=0.5 * k_end)
    lx = mix(LOGO_X, END_X, k_end)
    ly = mix(LOGO_Y, END_Y, k_end)
    ls = int(round(mix(LOGO_SIZE, END_SIZE, k_end) / 2) * 2)
    lt = t - C["logo"]
    if lt > 0:
        sw = lin(t, C["logo_sweep"], C["logo_sweep"] + 0.9)
        f = draw_logo(f, lx, ly, ls, lt, opacity=1.0, sweep_t=sw if 0 < sw < 1 else None,
                      shadow=0.5 * (1 - k_end))
    # subtítulo
    so = smooth(lin(t, C["subtitle"], C["subtitle"] + 0.8)) * (1 - k_end)
    if so > 0.01:
        f = draw_text(f, "IMPRESO EN 3D  ·  CAPA A CAPA", "montserrat", 30, LOGO_X, LOGO_Y + 100,
                      color=np.float32([0.97, 0.93, 0.86]), wght=400,
                      tracking=mix(0.45, 0.32, ease_out_cubic(lin(t, C["subtitle"], C["subtitle"] + 1.4))),
                      opacity=so)
    # destello en las bolas de las antenas cuando aparecen
    ta = C["logo"] + 5 * 0.085 + 0.9 * 0.55 + 0.25
    if ta <= t < ta + 0.6 and k_end == 0:
        g = math.sin(math.pi * lin(t, ta, ta + 0.6))
        f = anamorphic_flare(f, LOGO_X + 40, LOGO_Y - LOGO_SIZE * 0.98, strength=0.35 * g, color=(1.0, 0.75, 0.6),
                             length=0.5)
    return f


def scene_endcard(t):
    f = scene_reveal(t)
    o1 = smooth(lin(t, C["end_line1"], C["end_line1"] + 0.8))
    if o1 > 0.01:
        f = draw_text(f, "NO ES UN RENDER. ES YAMPI.", "cinzel", 36, W / 2, END_Y + 118,
                      color=np.float32([0.98, 0.95, 0.89]), wght=600,
                      tracking=mix(0.30, 0.20, ease_out_cubic(lin(t, C["end_line1"], C["end_line1"] + 1.5))),
                      opacity=o1, glow=0.1, glow_color=AMBER)
    o2 = smooth(lin(t, C["end_line2"], C["end_line2"] + 0.8))
    if o2 > 0.01:
        f = draw_text(f, "4 PLACAS  ·  +48 H DE IMPRESIÓN  ·  3 SEMANAS DE TRABAJO", "montserrat", 21,
                      W / 2, END_Y + 182, color=np.float32([0.9, 0.86, 0.8]), wght=400, tracking=0.30,
                      opacity=o2 * 0.75)
    return f
