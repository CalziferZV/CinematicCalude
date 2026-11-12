"""Teaser de OBEKET en vertical 9:16 (1080x1920) para Reels: mismo guion, música y
cortes que cinematic/teaser.py, con planos 3D renderizados en vertical (v_*) y la
órbita nativa a 24 fps.

Uso:
    python -m cinematic.teaser_v --audio build/score_teaser.wav --out video/YAMPI_OBEKET_teaser_vertical.mp4
    python -m cinematic.teaser_v --stills 1.2,6,9,30
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

from . import teaser as TZ
from .core import (ROOT, Grain, bloom, draw_text, ease_in_out_cubic, ease_in_out_sine, ease_out_cubic, finalize,
                   lin, mix, place_layer, smooth, smoother, screen, text_layer, view, vignette_mask)
from .film2 import BLACK, GOLD, IVORY, _read, grade, hairline, wordmark

W, H, FPS = 1080, 1920, 24
T5, DURATION5 = TZ.T5, TZ.DURATION5
R3D = ROOT / "build" / "3d_real"
PHOTO = ROOT / "assets" / "source" / "yampi_final.jpg"
head, sub, punch = TZ.head, TZ.sub, TZ.punch


@functools.lru_cache(maxsize=48)
def R(name):
    return _read(R3D / f"{name}.png")


def black():
    f = np.empty((H, W, 3), np.float32)
    f[...] = BLACK
    return f


def still(name, k, z0=1.0, z1=1.05, p0=(0.5, 0.5), p1=(0.5, 0.5), img=None, ease=None):
    """Movimiento de cámara lento sobre un render fijo, en el cuadro vertical."""
    img = R(name)[..., :3] if img is None else img
    h, w = img.shape[:2]
    base = max(W / w, H / h)
    e = (ease or ease_in_out_sine)(k)
    s = base * mix(z0, z1, e)
    px, py = mix(p0[0], p1[0], e) * w, mix(p0[1], p1[1], e) * h
    hw, hh = W / (2 * s), H / (2 * s)
    px = min(max(px, hw), w - hw)
    py = min(max(py, hh), h - hh)
    return view(img, px, py, s, 0.0, out=(W, H), border=cv2.BORDER_REPLICATE)


def light_sweep(f, k, angle=24.0, width=0.22, strength=0.10, color=(1.0, 0.86, 0.66)):
    if strength <= 0 or not (0 < k < 1):
        return f
    y, x = np.ogrid[0:H, 0:W]
    a = math.radians(angle)
    u = (x / W) * math.cos(a) + (y / H) * math.sin(a) * (H / W) * 0.35
    band = np.exp(-((u - (-0.3 + 1.6 * k)) / width) ** 2).astype(np.float32)
    return f * (1 + band[..., None] * strength * np.float32(color))


def shade(f, top=True, height=520, strength=0.62):
    """Degradado oscuro arriba o abajo para que los rótulos se lean sobre la imagen."""
    y = np.arange(H, dtype=np.float32)[:, None]
    d = (y if top else (H - 1 - y)) / height
    g = np.clip(1 - d, 0, 1) ** 1.6 * strength
    return f * (1 - g[..., None])


# --------------------------------------------------------------------------- #
# Planos
# --------------------------------------------------------------------------- #
def sc_logo(t):
    f = black()
    k = ease_out_cubic(lin(t, 0.30, 1.35))
    op = smooth(lin(t, 0.30, 0.90)) * (1 - smooth(lin(t, 2.05, 2.60)))
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W / 2) / (W * 0.45)) ** 2 + ((y - H / 2) / (H * 0.30)) ** 2)).astype(np.float32)
    f = screen(f, (g * 0.05 * op)[..., None] * np.float32([1.0, 0.85, 0.65]))
    return TZ.place_logo(f, TZ.logo_alpha(TZ.LOGO_SYM), W / 2, H / 2, 300 * (1.07 - 0.07 * k), op,
                         glint=lin(t, 0.85, 2.0), blur=4.0 * (1 - k))


def sc_ojos(t):
    t0, t1 = T5["ojos"], T5["antena"]
    z = punch(t, t0)
    f = still("v_ojos", lin(t, t0, t1), 1.0 * z, 1.10 * z, (0.5, 0.50), (0.5, 0.48))
    return light_sweep(f, lin(t, t0 - 0.1, t1 + 0.2), 28, 0.25, 0.12)


def sc_antena(t):
    t0, t1 = T5["antena"], T5["imp"]
    z = punch(t, t0)
    f = still("v_antena", lin(t, t0, t1), 1.0 * z, 1.12 * z, (0.52, 0.50), (0.50, 0.46))
    return light_sweep(f, lin(t, t0 - 0.1, t1 + 0.1), 150, 0.25, 0.10)


IMP_Z1 = 1.05


@functools.lru_cache(maxsize=1)
def _print_assets():
    full = R("v_entero")[..., :3]
    empty = R("v_entero_fondo")[..., :3]
    a = R("v_entero_alfa")[..., 3]
    rows = np.where(a.max(1) > 0.3)[0]
    ad = cv2.dilate(a, np.ones((5, 5), np.uint8))
    return full, empty, a, ad, int(rows.min()), int(rows.max())


def sc_imp(t):
    full, empty, a, ad, y_top, y_bot = _print_assets()
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
    z = punch(t, T5["imp"], 0.03)
    f = still(None, lin(t, T5["imp"], T5["despiece"]), 1.0 * z, IMP_Z1 * z, (0.5, 0.51), (0.5, 0.5), img=comp)
    f = head(f, "MÁS DE DOS DÍAS", t, T5["imp"] + 0.35, T5["despiece"] + 0.15, W / 2, 330, size=60, align="center")
    f = sub(f, "de impresión", t, T5["imp"] + 0.60, T5["despiece"] + 0.15, W / 2, 408, size=58, align="center")
    return f


# despiece vertical: capas 1800x3200 con la misma densidad de píxeles que v_entero (1296x2304)
CAPA_PPM = 3200 / (0.98 * 36 / (105 * 1296 / 1800))      # px de capa por metro a la distancia de la figura
ORB_PPM = H / (0.95 * 36 / 105)                           # px de salida por metro en la órbita (zoom 1)
S_IN = W / 1296 * IMP_Z1                                  # escala de la capa al enlazar con la impresión
S_OUT = ORB_PPM / CAPA_PPM                                # escala de la capa al enlazar con la órbita
LIFT = dict(piernas=0.0, torso=0.015, cabeza=0.040, pelo=0.065)   # metros
DESP_HOLD = 0.30


def _sep(t):
    d0, o = T5["despiece"] + DESP_HOLD, T5["orbita"]
    if t < o - 0.6:
        return ease_out_cubic(lin(t, d0, d0 + 0.85))
    return 1.0 - ease_in_out_cubic(lin(t, o - 0.55, o - 0.04))


def _desp_scale(t):
    d0, o = T5["despiece"] + DESP_HOLD, T5["orbita"]
    s_wide = W / 1800
    if t < d0 + 1.0:
        return mix(S_IN, s_wide, ease_in_out_cubic(lin(t, d0, d0 + 1.0)))
    if t < o - 0.6:
        return s_wide * (1 + 0.02 * lin(t, d0 + 1.0, o - 0.6))
    return mix(s_wide * 1.02, S_OUT, ease_in_out_cubic(lin(t, o - 0.6, o)))


def sc_despiece(t):
    bg = R("v_capa_fondo")[..., :3]
    h, w = bg.shape[:2]
    s = _sep(t)
    comp = bg.copy()
    for p in ("piernas", "torso", "cabeza", "pelo"):
        L = R(f"v_capa_{p}")
        dy = -(LIFT[p] * CAPA_PPM * s) + 4.0 * math.sin(t * 2.0 + TZ.F2.hash01(p) * 6) * s
        M = np.float32([[1, 0, 0], [0, 1, dy]])
        rgba = cv2.warpAffine(L, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        al = rgba[..., 3:4]
        comp = comp * (1 - al) + rgba[..., :3] * al
    kf = smooth(lin(t, T5["orbita"] - 0.16, T5["orbita"] - 0.02))
    if kf > 0:
        full = R("v_capa_todo")
        comp = comp * (1 - kf) + (bg * (1 - full[..., 3:4]) + full[..., :3] * full[..., 3:4]) * kf
    sc = _desp_scale(t)
    f = view(comp, w / 2, h / 2, sc, 0.0, out=(W, H), border=cv2.BORDER_REPLICATE)
    f = head(f, "TRES SEMANAS", t, T5["despiece"] + 0.35, T5["orbita"] - 0.45, W / 2, 250, size=60, align="center")
    f = sub(f, "de trabajo intenso", t, T5["despiece"] + 0.60, T5["orbita"] - 0.45, W / 2, 326, size=58,
            align="center")
    return f


@functools.lru_cache(maxsize=1)
def _orbit_frames():
    return sorted((R3D / "v_orbita").glob("v_orbita_*.png"))


def sc_orbita(t):
    fr = _orbit_frames()
    u = lin(t, T5["orbita"], T5["cara"])
    i = min(len(fr) - 1, int(round(u * (len(fr) - 1))))
    img = _read(fr[i])[..., :3]
    f = still(None, u, 1.0, 1.05, (0.5, 0.5), (0.5, 0.49), img=img)
    f = head(f, "PARA CREAR", t, T5["orbita"] + 0.30, T5["cara"] - 0.05, W / 2, 330, size=60, align="center")
    f = sub(f, "una figura…", t, T5["orbita"] + 0.55, T5["cara"] - 0.05, W / 2, 408, size=58, align="center")
    return f


def _macro(name, t, t0, t1, z0, z1, p0, p1, sweep=None):
    z = punch(t, t0)
    f = still(name, lin(t, t0, t1), z0 * z, z1 * z, p0, p1)
    if sweep:
        f = light_sweep(f, lin(t, t0 - 0.1, t1 + 0.2), sweep, 0.28, 0.08)
    return f


def sc_cara(t):
    return _macro("v_cara34", t, T5["cara"], T5["clavijero"], 1.0, 1.09, (0.5, 0.52), (0.51, 0.49), 20)


def sc_clavijero(t):
    return _macro("v_clavijero", t, T5["clavijero"], T5["cuerdas"], 1.02, 1.12, (0.46, 0.52), (0.54, 0.48))


def sc_cuerdas(t):
    return _macro("v_cuerdas", t, T5["cuerdas"], T5["contrapicado"], 1.0, 1.10, (0.48, 0.50), (0.44, 0.47), 35)


def sc_contrapicado(t):
    f = _macro("v_contrapicado", t, T5["contrapicado"], T5["presentamos"], 1.0, 1.07, (0.5, 0.54), (0.5, 0.48))
    return f * (1 - smooth(lin(t, T5["presentamos"] - 0.25, T5["presentamos"] + 0.15)))


def sc_presentamos(t):
    f = black()
    return TZ.F2.title(f, "PRESENTAMOS", t, T5["presentamos"] + 0.30, T5["revelacion"] - 0.45, W / 2, H / 2 + 18,
                       size=50, font="cinzel", wght=500, align="center", tracking=0.30, rise=6, fade=0.8, out=0.4)


def sc_revelacion(t):
    tl = t - T5["revelacion"]
    z = punch(t, T5["revelacion"], 0.05, 0.25)
    f = still("v_heroe", lin(t, T5["revelacion"], T5["realidad"] + 0.6), 1.0 * z, 1.06 * z, (0.5, 0.52),
              (0.5, 0.50))
    rise = smoother(lin(tl, 0.0, 0.55))
    halo = smooth(lin(tl, 0.1, 2.5))
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W * 0.5) / (W * 0.55)) ** 2 + ((y - H * 0.55) / (H * 0.35)) ** 2)).astype(np.float32)
    f = screen(f * (0.15 + 0.85 * rise), (g * 0.12 * halo)[..., None] * np.float32([1.0, 0.78, 0.52]))
    ta = t - (T5["revelacion"] + 0.30)
    if ta > 0:
        sw = lin(t, T5["revelacion"] + 2.4, T5["revelacion"] + 3.6)
        f = wordmark(f, W / 2, 440, 150, ta * 1.25, opacity=1.0, sweep=sw,
                     tagline="IMPRESO EN 3D  ·  CAPA A CAPA", tag_t=ta * 1.25 - 1.9)
    return f


@functools.lru_cache(maxsize=1)
def _photo():
    im = cv2.cvtColor(cv2.imread(str(PHOTO)), cv2.COLOR_BGR2RGB).astype(np.float32) / 255
    return im * np.float32([1.0, 0.985, 0.95])


def sc_realidad(t):
    """La figura real en la mano: la foto es vertical y llena el cuadro casi a su resolución."""
    r0 = T5["realidad"]
    k = lin(t, r0, T5["marca"] + 0.45)
    f = still(None, k, 1.0, 1.05, (0.47, 0.52), (0.47, 0.50), img=_photo())
    f = shade(f, top=False, height=700, strength=0.72)
    f = head(f, "DEL RENDER…", t, r0 + 0.45, T5["marca"] + 0.1, W / 2, 1610, size=56, align="center", tracking=0.12)
    return sub(f, "a la realidad.", t, r0 + 1.05, T5["marca"] + 0.1, W / 2, 1692, size=64, align="center")


def sc_marca(t):
    m0 = T5["marca"]
    f = black()
    y, x = np.ogrid[0:H, 0:W]
    g = np.exp(-(((x - W / 2) / (W * 0.50)) ** 2 + ((y - H * 0.49) / (H * 0.30)) ** 2)).astype(np.float32)
    f = screen(f, (g * 0.06 * smooth(lin(t, m0, m0 + 1.5)))[..., None] * np.float32([1.0, 0.84, 0.62]))
    k1 = ease_out_cubic(lin(t, m0 + 0.40, m0 + 1.40))
    f = TZ.place_logo(f, TZ.logo_alpha(TZ.LOGO_SYM), W / 2, 735, 190 * (1.08 - 0.08 * k1),
                      smooth(lin(t, m0 + 0.40, m0 + 1.0)), glint=lin(t, m0 + 1.1, m0 + 2.0), blur=4 * (1 - k1))
    k2 = ease_out_cubic(lin(t, m0 + 0.65, m0 + 1.75))
    a = TZ.logo_alpha(TZ.LOGO_TXT)
    hgt = 840 * a.shape[0] / a.shape[1]
    f = TZ.place_logo(f, a, W / 2, 975 + 14 * (1 - k2), hgt, smooth(lin(t, m0 + 0.65, m0 + 1.35)),
                      color=np.float32([0.97, 0.96, 0.94]), glint=lin(t, m0 + 1.7, m0 + 2.8), blur=5 * (1 - k2),
                      glint_gain=0.6)
    kl = ease_out_cubic(lin(t, m0 + 1.25, m0 + 2.1))
    if kl > 0:
        f = hairline(f, W / 2 - 160 * kl, W / 2 + 160 * kl, 1108, GOLD, 0.9 * kl, 1.3)
    op = smooth(lin(t, m0 + 1.55, m0 + 2.3))
    if op > 0.003:
        size = 50
        _, _, adv = text_layer(TZ.HANDLE, "montserrat", size, 400, 0.08)
        icon = TZ.ig_icon(54)
        gap = 24
        x0 = W / 2 - (icon.shape[1] + gap + adv) / 2
        yy = 1205 + 8 * (1 - ease_out_cubic(lin(t, m0 + 1.55, m0 + 2.5)))
        f = place_layer(f, icon, IVORY, x0 + icon.shape[1] / 2, yy - 17, (icon.shape[1] / 2, icon.shape[0] / 2),
                        1.0, 0.0, op * 0.95)
        f = draw_text(f, TZ.HANDLE, "montserrat", size, x0 + icon.shape[1] + gap, yy, color=IVORY, wght=400,
                      tracking=0.08, align="left", opacity=op * 0.95)
    return f


SHOTS = [
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
    k = smooth(lin(t, T5["cara"], T5["cara"] + 0.3)) * (1 - smooth(lin(t, T5["presentamos"] - 0.3,
                                                                       T5["presentamos"])))
    f = shade(f, top=True, height=560, strength=0.66 * k)
    f = head(f, "CON UN DETALLE", t, T5["cara"] + 0.25, T5["cuerdas"] - 0.05, W / 2, 205, size=56, align="center")
    f = sub(f, "perfecto", t, T5["cara"] + 0.50, T5["cuerdas"] - 0.05, W / 2, 280, size=58, align="center")
    f = head(f, "Y UNA CALIDAD", t, T5["cuerdas"] + 0.25, T5["presentamos"] - 0.05, W / 2, 205, size=56,
             align="center")
    f = sub(f, "impoluta.", t, T5["cuerdas"] + 0.50, T5["presentamos"] - 0.05, W / 2, 280, size=58, align="center")
    return f


def compose(t):
    f = None
    for a, b, fin, fn in SHOTS:
        if a <= t < b:
            img = fn(t)
            w = 1.0 if fin <= 0 else smooth((t - a) / fin)
            f = img if f is None else f * (1 - w) + img * w
    if f is None:
        f = black()
    if T5["cara"] <= t < T5["presentamos"]:
        f = titles(f, t)
    return TZ.flashes(f, t)


_GRAIN = None


def post(f, t, fi):
    global _GRAIN
    if _GRAIN is None:
        _GRAIN = Grain(W, H, n=10, seed=11)
    f = grade(f)
    f = bloom(f, threshold=0.70, sigma=30, strength=0.24, tint=(1.0, 0.86, 0.70))
    f = f * vignette_mask(W, H, 0.30)[..., None]
    f = _GRAIN.apply(f, fi, 0.014)
    if t < 0.25:
        f = f * smooth(t / 0.25)
    return f * (1 - smooth(lin(t, DURATION5 - 1.3, DURATION5 - 0.05)))


def render_frame(fi):
    t = fi / FPS
    return finalize(post(compose(t), t, fi))


def _worker(fi):
    return fi, render_frame(fi).tobytes()


def render_video(out, audio=None, workers=None, crf=15, maxrate="18M", preset="slow"):
    """Codifica en H.264 High (yuv420p, +faststart): compatible con móviles e Instagram."""
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = int(round(DURATION5 * FPS))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-i", str(audio)]
    bufsize = f"{int(maxrate[:-1]) * 2}M"
    cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-maxrate", maxrate, "-bufsize", bufsize,
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.2", "-tune", "film",
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-shortest"]
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
    ap.add_argument("--out", default="video/YAMPI_OBEKET_teaser_vertical.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--crf", type=int, default=15)
    ap.add_argument("--maxrate", default="18M")
    ap.add_argument("--stills", default=None)
    ap.add_argument("--stills-dir", default="build/stills_v")
    a = ap.parse_args(argv)
    if a.stills:
        from PIL import Image
        d = Path(a.stills_dir)
        d.mkdir(parents=True, exist_ok=True)
        for t in [float(x) for x in a.stills.split(",")]:
            p = d / f"still_{t:06.2f}.png"
            Image.fromarray(render_frame(int(round(t * FPS)))).save(p)
            print(p)
        return
    render_video(a.out, a.audio, a.workers, a.crf, a.maxrate)


if __name__ == "__main__":
    main()
