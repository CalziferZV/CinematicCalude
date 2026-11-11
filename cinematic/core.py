"""Núcleo del motor: easing, cámara, composición, tipografía y efectos de cine.

Todas las imágenes son float32 HxWx3 en rango 0..1 (sRGB).
"""
from __future__ import annotations

import functools
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"

cv2.setNumThreads(1)  # paralelizamos por procesos


# --------------------------------------------------------------------------- #
# Easing y envolventes
# --------------------------------------------------------------------------- #
def clamp01(x):
    return 0.0 if x <= 0 else 1.0 if x >= 1 else float(x)


def lin(t, a, b):
    if b == a:
        return float(t >= b)
    return clamp01((t - a) / (b - a))


def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)


def smoother(x):
    x = clamp01(x)
    return x * x * x * (x * (x * 6 - 15) + 10)


def ease_out_cubic(x):
    x = clamp01(x)
    return 1 - (1 - x) ** 3


def ease_in_cubic(x):
    x = clamp01(x)
    return x ** 3


def ease_in_out_cubic(x):
    x = clamp01(x)
    return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def ease_out_expo(x):
    x = clamp01(x)
    return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)


def ease_in_expo(x):
    x = clamp01(x)
    return 0.0 if x <= 0 else 2 ** (10 * x - 10)


def ease_in_out_sine(x):
    x = clamp01(x)
    return -(math.cos(math.pi * x) - 1) / 2


def ease_out_back(x, s=1.70158):
    x = clamp01(x)
    return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2


def ease_out_elastic(x):
    x = clamp01(x)
    if x in (0.0, 1.0):
        return x
    c4 = (2 * math.pi) / 3
    return 2 ** (-10 * x) * math.sin((x * 10 - 0.75) * c4) + 1


def env(t, a, b, c, d, fn=smooth):
    """Trapecio suave: 0 antes de a, sube hasta b, 1 hasta c, baja hasta d."""
    if t <= a or t >= d:
        return 0.0
    if t < b:
        return fn(lin(t, a, b))
    if t <= c:
        return 1.0
    return 1 - fn(lin(t, c, d))


def mix(a, b, x):
    return a + (b - a) * x


# --------------------------------------------------------------------------- #
# Ruido determinista
# --------------------------------------------------------------------------- #
def hash01(*args):
    h = 2166136261
    for a in args:
        for ch in repr(a).encode():
            h ^= ch
            h = (h * 16777619) & 0xFFFFFFFF
    return h / 0xFFFFFFFF


def vnoise1(x, seed=0):
    """Ruido de valor 1D suave en [-1, 1]."""
    i = math.floor(x)
    f = x - i
    a = hash01(seed, i) * 2 - 1
    b = hash01(seed, i + 1) * 2 - 1
    u = f * f * (3 - 2 * f)
    return a + (b - a) * u


# --------------------------------------------------------------------------- #
# Cámara: vista de una imagen fuente con escala/rotación sub-píxel
# --------------------------------------------------------------------------- #
def view(src, cx, cy, s, rot=0.0, out=(1920, 1080), interp=cv2.INTER_CUBIC,
         border=cv2.BORDER_REFLECT101, border_value=0.0):
    """Devuelve el encuadre `out` centrado en (cx, cy) de `src` con escala s
    (píxeles de salida por píxel fuente) y rotación en grados."""
    Wo, Ho = out
    h, w = src.shape[:2]
    if s < 0.85:
        r = 0.5 * math.hypot(Wo, Ho) / s + 8
        x0, x1 = int(max(0, cx - r)), int(min(w, cx + r))
        y0, y1 = int(max(0, cy - r)), int(min(h, cy + r))
        if x1 - x0 > 2 and y1 - y0 > 2:
            roi = src[y0:y1, x0:x1]
            nw = max(2, int(round((x1 - x0) * s / 0.92)))
            nh = max(2, int(round((y1 - y0) * s / 0.92)))
            small = cv2.resize(roi, (nw, nh), interpolation=cv2.INTER_AREA)
            fx = nw / (x1 - x0)
            fy = nh / (y1 - y0)
            src = small
            cx = (cx - x0) * fx
            cy = (cy - y0) * fy
            s = s / fx
    M = cv2.getRotationMatrix2D((float(cx), float(cy)), float(rot), float(s))
    M[0, 2] += Wo / 2 - cx
    M[1, 2] += Ho / 2 - cy
    return cv2.warpAffine(src, M, (Wo, Ho), flags=interp, borderMode=border,
                          borderValue=border_value)


def view_matrix(cx, cy, s, rot=0.0, out=(1920, 1080)):
    """Matriz afín 2x3 fuente->salida equivalente a `view` (sin pre-reducción)."""
    Wo, Ho = out
    M = cv2.getRotationMatrix2D((float(cx), float(cy)), float(rot), float(s))
    M[0, 2] += Wo / 2 - cx
    M[1, 2] += Ho / 2 - cy
    return M


# --------------------------------------------------------------------------- #
# Composición
# --------------------------------------------------------------------------- #
def over(dst, rgb, alpha):
    """dst = dst*(1-a) + rgb*a  (rgb sin premultiplicar)."""
    a = alpha[..., None] if alpha.ndim == 2 else alpha
    return dst * (1 - a) + rgb * a


def over_premul(dst, rgb_p, alpha):
    a = alpha[..., None] if alpha.ndim == 2 else alpha
    return dst * (1 - a) + rgb_p


def screen(dst, src):
    """Mezcla 'trama' (suma de luz sin quemar): dst + src*(1-dst)."""
    return dst + src * (1 - dst)


def solid(color, size=(1920, 1080)):
    W, H = size
    f = np.empty((H, W, 3), np.float32)
    f[...] = color
    return f


def hexcol(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], np.float32)


def luma(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def blur(img, sigma):
    if sigma <= 0.05:
        return img
    if sigma > 12:
        # reducir, desenfocar y ampliar (mucho más rápido y equivalente)
        f = max(1, int(sigma / 6))
        h, w = img.shape[:2]
        small = cv2.resize(img, (max(1, w // f), max(1, h // f)), interpolation=cv2.INTER_AREA)
        small = cv2.GaussianBlur(small, (0, 0), sigma / f)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_LINEAR)
    return cv2.GaussianBlur(img, (0, 0), sigma)


def dir_blur(img, length, angle=0.0):
    """Desenfoque de movimiento direccional (length en px)."""
    L = int(abs(length))
    if L < 2:
        return img
    k = np.zeros((L * 2 + 1, L * 2 + 1), np.float32)
    c = L
    ca, sa = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    for i in range(-L, L + 1):
        x = int(round(c + i * ca))
        y = int(round(c + i * sa))
        k[y, x] = 1
    k /= k.sum()
    return cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)


# --------------------------------------------------------------------------- #
# Tipografía
# --------------------------------------------------------------------------- #
FONT_FILES = {
    "montserrat": "Montserrat-VF.ttf",
    "cinzel": "Cinzel-VF.ttf",
    "bebas": "BebasNeue-Regular.ttf",
    "mono": "JetBrainsMono-VF.ttf",
    "fredoka": "Fredoka-VF.ttf",
}


@functools.lru_cache(maxsize=256)
def get_font(key, size, wght=None, wdth=None):
    f = ImageFont.truetype(str(FONTS / FONT_FILES[key]), int(size))
    if wght is not None or wdth is not None:
        try:
            vals = []
            for a in f.get_variation_axes():
                n = a.get("name", b"")
                n = n.decode() if isinstance(n, bytes) else str(n)
                n = n.lower()
                if "weight" in n or n == "wght":
                    vals.append(wght if wght is not None else a["default"])
                elif "width" in n or n == "wdth":
                    vals.append(wdth if wdth is not None else a["default"])
                else:
                    vals.append(a["default"])
            f.set_variation_by_axes(vals)
        except Exception:
            pass
    return f


@functools.lru_cache(maxsize=512)
def text_layer(text, key, size, wght=None, tracking=0.0, wdth=None, pad=None, ss=2):
    """Renderiza texto blanco a una capa alfa float32 (supermuestreada ss veces).

    tracking: espaciado extra entre letras en 'em'.
    Devuelve (alpha HxW float32, (ox, oy) desplazamiento del origen de la línea
    base-izquierda dentro de la capa, ancho de avance).
    """
    S = size * ss
    f = get_font(key, S, wght, wdth)
    track = tracking * S
    asc, desc = f.getmetrics()
    pad = int(S * 0.35) if pad is None else pad * ss
    if tracking == 0:
        width = f.getlength(text)
    else:
        width = sum(f.getlength(ch) for ch in text) + track * max(0, len(text) - 1)
    Wl = int(math.ceil(width)) + 2 * pad
    Hl = asc + desc + 2 * pad
    img = Image.new("L", (Wl, Hl), 0)
    d = ImageDraw.Draw(img)
    if tracking == 0:
        d.text((pad, pad), text, font=f, fill=255)
    else:
        x = pad
        for ch in text:
            d.text((x, pad), ch, font=f, fill=255)
            x += f.getlength(ch) + track
    a = np.asarray(img, np.float32) / 255.0
    if ss > 1:
        a = cv2.resize(a, (Wl // ss, Hl // ss), interpolation=cv2.INTER_AREA)
    return a, (pad / ss, (pad + asc) / ss), width / ss


def place_layer(frame, alpha, color, x, y, anchor_xy, scale=1.0, rot=0.0, opacity=1.0,
                blur_sigma=0.0, glow=0.0, glow_sigma=12.0, glow_color=None, rgb=None):
    """Compone una capa alfa (con color sólido o rgb propio) sobre frame.

    (x, y): posición en el frame del punto ancla anchor_xy de la capa.
    """
    if opacity <= 0.002:
        return frame
    H, W = frame.shape[:2]
    h, w = alpha.shape[:2]
    ax, ay = anchor_xy
    M = cv2.getRotationMatrix2D((float(ax), float(ay)), float(rot), float(scale))
    M[0, 2] += x - ax
    M[1, 2] += y - ay
    # bounding box en el frame
    corners = np.array([[0, 0, 1], [w, 0, 1], [0, h, 1], [w, h, 1]], np.float32) @ M.T
    pad = int(3 * max(blur_sigma, glow_sigma if glow > 0 else 0)) + 4
    x0 = int(max(0, math.floor(corners[:, 0].min()) - pad))
    x1 = int(min(W, math.ceil(corners[:, 0].max()) + pad))
    y0 = int(max(0, math.floor(corners[:, 1].min()) - pad))
    y1 = int(min(H, math.ceil(corners[:, 1].max()) + pad))
    if x1 <= x0 or y1 <= y0:
        return frame
    M2 = M.copy()
    M2[0, 2] -= x0
    M2[1, 2] -= y0
    a = cv2.warpAffine(alpha, M2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                       borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if rgb is not None:
        c = cv2.warpAffine(rgb, M2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_CONSTANT, borderValue=0)
    if blur_sigma > 0.3:
        a = cv2.GaussianBlur(a, (0, 0), blur_sigma)
        if rgb is not None:
            c = cv2.GaussianBlur(c, (0, 0), blur_sigma)
    roi = frame[y0:y1, x0:x1]
    if glow > 0:
        g = cv2.GaussianBlur(a, (0, 0), glow_sigma)
        gc = np.asarray(glow_color if glow_color is not None else color, np.float32)
        roi = screen(roi, g[..., None] * gc * glow * opacity)
    aa = (a * opacity)[..., None]
    col = c if rgb is not None else np.asarray(color, np.float32)
    roi = roi * (1 - aa) + col * aa
    frame[y0:y1, x0:x1] = roi
    return frame


def draw_text(frame, text, key, size, x, y, color=(1, 1, 1), wght=None, tracking=0.0,
              align="center", valign="baseline", opacity=1.0, scale=1.0, rot=0.0,
              blur_sigma=0.0, glow=0.0, glow_sigma=14.0, glow_color=None, wdth=None,
              sweep=None):
    """Dibuja una línea de texto. align: left|center|right; valign: baseline|middle|top.

    sweep: (pos, width, gain) -> brillo extra en banda diagonal (pos en 0..1 del ancho).
    """
    a, (ox, oy), adv = text_layer(text, key, size, wght, round(tracking, 4), wdth)
    f = get_font(key, size, wght, wdth)
    asc, desc = f.getmetrics()
    if align == "center":
        axp = ox + adv / 2
    elif align == "right":
        axp = ox + adv
    else:
        axp = ox
    if valign == "middle":
        ayp = oy - asc * 0.36
    elif valign == "top":
        ayp = oy - asc
    else:
        ayp = oy
    rgb = None
    if sweep is not None:
        pos, width, gain = sweep
        h, w = a.shape
        xs = (np.arange(w, dtype=np.float32) - ox) / max(adv, 1)
        ys = np.arange(h, dtype=np.float32)[:, None] / h
        band = np.exp(-(((xs[None, :] - ys * 0.25) - pos) / width) ** 2)
        base = np.asarray(color, np.float32)
        rgb = base[None, None, :] * (1 + gain * band[..., None])
        rgb = np.clip(rgb, 0, 4).astype(np.float32)
    return place_layer(frame, a, color, x, y, (axp, ayp), scale, rot, opacity, blur_sigma,
                       glow, glow_sigma, glow_color, rgb)


# --------------------------------------------------------------------------- #
# Efectos de cine
# --------------------------------------------------------------------------- #
class Grain:
    def __init__(self, W, H, n=10, seed=7):
        rng = np.random.default_rng(seed)
        self.tiles = []
        for _ in range(n):
            g = rng.standard_normal((H + 64, W + 64)).astype(np.float32)
            g = cv2.GaussianBlur(g, (0, 0), 0.85)
            g /= g.std() + 1e-6
            self.tiles.append(g)
        self.W, self.H = W, H

    def apply(self, frame, fi, amount=0.035):
        k = int(hash01("g", fi) * len(self.tiles)) % len(self.tiles)
        ox = int(hash01("gx", fi) * 63)
        oy = int(hash01("gy", fi) * 63)
        g = self.tiles[k][oy:oy + self.H, ox:ox + self.W]
        L = luma(frame)
        wgt = amount * (0.35 + 1.3 * L * (1 - L) * 2.2)
        return frame + (g * wgt)[..., None]


@functools.lru_cache(maxsize=4)
def vignette_mask(W, H, strength=0.55, roundness=1.0):
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    nx = (x - W / 2) / (W / 2)
    ny = (y - H / 2) / (H / 2)
    r = np.sqrt(nx ** 2 * (1 if roundness >= 1 else roundness) + ny ** 2)
    v = 1 - strength * np.clip((r - 0.45) / 0.95, 0, 1) ** 1.6
    return v.astype(np.float32)


def bloom(frame, threshold=0.72, sigma=28, strength=0.45, tint=(1.0, 0.92, 0.82)):
    L = luma(frame)
    m = np.clip((L - threshold) / (1 - threshold + 1e-6), 0, 1)
    b = blur(frame * m[..., None], sigma)
    return frame + b * strength * np.asarray(tint, np.float32)


def chroma_ab(frame, k=0.004):
    if k <= 0.0002:
        return frame
    H, W = frame.shape[:2]
    out = frame.copy()
    for ch, s in ((0, 1 + k), (2, 1 - k)):
        M = cv2.getRotationMatrix2D((W / 2, H / 2), 0, s)
        out[..., ch] = cv2.warpAffine(frame[..., ch], M, (W, H), flags=cv2.INTER_LINEAR,
                                      borderMode=cv2.BORDER_REFLECT)
    return out


def letterbox(frame, bar):
    if bar <= 0.5:
        return frame
    b = int(bar)
    frac = bar - b
    frame[:b] = 0
    frame[frame.shape[0] - b:] = 0
    if frac > 0 and b < frame.shape[0] // 2:
        frame[b] *= (1 - frac)
        frame[frame.shape[0] - b - 1] *= (1 - frac)
    return frame


def shake_offset(t, events):
    dx = dy = rot = 0.0
    for (t0, amp, dur) in events:
        if t0 <= t < t0 + dur:
            k = math.exp(-5.0 * (t - t0) / dur)
            dx += amp * k * vnoise1((t - t0) * 38, seed=int(t0 * 100))
            dy += amp * k * vnoise1((t - t0) * 41, seed=int(t0 * 100) + 1)
            rot += amp * 0.02 * k * vnoise1((t - t0) * 23, seed=int(t0 * 100) + 2)
    return dx, dy, rot


def apply_shake(frame, dx, dy, rot):
    if abs(dx) + abs(dy) + abs(rot) < 0.05:
        return frame
    H, W = frame.shape[:2]
    s = 1 + (abs(dx) + abs(dy)) / W * 2.2 + abs(rot) * 0.01
    M = cv2.getRotationMatrix2D((W / 2, H / 2), rot, s)
    M[0, 2] += dx
    M[1, 2] += dy
    return cv2.warpAffine(frame, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)


@functools.lru_cache(maxsize=16)
def soft_blob(w, h, sx, sy):
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    return np.exp(-(((x - w / 2) / sx) ** 2 + ((y - h / 2) / sy) ** 2)).astype(np.float32)


def add_light_leak(frame, t, strength=0.35, seed=0, warm=True):
    """Fugas de luz cálidas que derivan lentamente por el encuadre."""
    H, W = frame.shape[:2]
    out = frame
    cols = [hexcol("#FF8A3C"), hexcol("#FFC46B"), hexcol("#FF5E3A")] if warm else \
        [hexcol("#3FD3E0"), hexcol("#5E7BFF"), hexcol("#7FFFE0")]
    acc = np.zeros((H // 4, W // 4, 3), np.float32)
    for i in range(3):
        px = (0.5 + 0.55 * vnoise1(t * 0.18 + i * 7.3, seed + i)) * W / 4
        py = (0.5 + 0.6 * vnoise1(t * 0.13 + i * 3.1, seed + 10 + i)) * H / 4
        r = (0.35 + 0.2 * i) * W / 4
        y, x = np.mgrid[0:H // 4, 0:W // 4].astype(np.float32)
        b = np.exp(-(((x - px) / r) ** 2 + ((y - py) / (r * 0.7)) ** 2))
        acc += b[..., None] * cols[i] * (0.7 + 0.3 * vnoise1(t * 0.5, seed + 20 + i))
    acc = cv2.resize(acc, (W, H), interpolation=cv2.INTER_LINEAR)
    return screen(out, acc * strength)


def anamorphic_flare(frame, x, y, strength=1.0, color=(0.55, 0.75, 1.0), length=0.9):
    """Destello anamórfico horizontal en (x, y)."""
    H, W = frame.shape[:2]
    if strength <= 0.01:
        return frame
    yy = np.arange(H, dtype=np.float32)[:, None]
    xx = np.arange(W, dtype=np.float32)[None, :]
    streak = np.exp(-((yy - y) / 3.0) ** 2) * np.exp(-np.abs(xx - x) / (W * length * 0.35))
    core = np.exp(-(((xx - x) / 40) ** 2 + ((yy - y) / 40) ** 2))
    halo = np.exp(-(((xx - x) / 220) ** 2 + ((yy - y) / 160) ** 2))
    c = np.asarray(color, np.float32)
    lightmap = (streak[..., None] * c * 0.9 + core[..., None] * 1.2 + halo[..., None] * c * 0.25)
    return screen(frame, lightmap * strength)


def _tone_lut(n=4096, vmax=3.0):
    x = np.linspace(0, vmax, n, dtype=np.float64)
    k, A = 0.84, 1.10
    y = np.where(x > k, k + (A - k) * (1 - np.exp(-(x - k) / (A - k))), x)
    return (np.clip(y, 0, 1) * 255 + 0.5).astype(np.uint8)


_LUT = _tone_lut()


def finalize(frame):
    """Curva tonal con hombro suave (vía tabla) y conversión a uint8."""
    idx = np.clip(frame * (4095 / 3.0), 0, 4095).astype(np.int32)
    return _LUT[idx]
