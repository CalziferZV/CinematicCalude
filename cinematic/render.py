"""Render de la cinemática: compone cada fotograma, aplica el acabado de cine
y lo envía a ffmpeg.

Uso:
    python -m cinematic.render --out build/yampi_video.mp4 [--audio build/soundtrack.wav]
    python -m cinematic.render --stills 1.0,2.7,30   (fotogramas sueltos a PNG)
"""
from __future__ import annotations

import argparse
import math
import os
import subprocess
import time
from multiprocessing import Pool
from pathlib import Path

import numpy as np

from . import scenes as S
from .core import (Grain, apply_shake, bloom, chroma_ab, finalize, letterbox, shake_offset,
                   smooth, lin, vignette_mask)
from .timeline import ABERR, BAR_PX, C, DURATION, FLASHES, FPS, SHAKES

W, H = S.W, S.H

# (inicio, fin, escena)
SHOTS = [
    (0.0, C["flashes"], S.scene_hook),
    (C["flashes"], C["boom_black"], S.scene_flashes),
    (C["boom_black"], C["act2"], S.scene_black),
    (C["act2"], C["plate1"], S.scene_weeks),
    (C["plate1"], C["plate2"], S.scene_plate1),
    (C["plate2"], C["plate3"], S.scene_plate2),
    (C["plate3"], C["plate4"], S.scene_plate3),
    (C["plate4"], C["cards"], S.scene_plate4),
    (C["cards"], C["act3"], S.scene_cards),
    (C["act3"], C["act4"], S.scene_print),
    (C["act4"], C["macro_face"], S.scene_figure_dark),
    (C["macro_face"], C["act5"], S.scene_macros),
    (C["act5"], C["reveal"], S.scene_presentamos),
    (C["reveal"], C["endcard"], S.scene_reveal),
    (C["endcard"], DURATION + 1, S.scene_endcard),
]


def shot_at(t):
    for a, b, fn in SHOTS:
        if a <= t < b:
            return fn
    return SHOTS[-1][2]


def bar_height(t):
    """Bandas 2.39:1 hasta la revelación; se abren a 16:9 con el golpe."""
    if t < C["reveal"]:
        return BAR_PX
    return BAR_PX * (1 - smooth(lin(t, C["reveal"] + 0.12, C["reveal"] + 1.0)))


def flash_amount(t):
    tot = np.zeros(3, np.float32)
    k = 0.0
    for (t0, dur, inten, col) in FLASHES:
        if t0 - 0.02 <= t < t0 + dur:
            e = inten * (1 - smooth(lin(t, t0, t0 + dur)))
            tot += np.asarray(col, np.float32) * e
            k += e
    return k, tot


def aberr_amount(t):
    k = 0.0008
    for (t0, a, dur) in ABERR:
        if t0 <= t < t0 + dur:
            k += a * math.exp(-4 * (t - t0) / dur)
    return k


_GRAIN = None


def post(frame, t, fi):
    global _GRAIN
    if _GRAIN is None:
        _GRAIN = Grain(W, H)
    k, col = flash_amount(t)
    if k > 0:
        frame = frame * (1 - min(k, 1.0)) + col
    frame = bloom(frame, threshold=0.75, sigma=26, strength=0.32)
    frame = chroma_ab(frame, aberr_amount(t))
    dx, dy, rot = shake_offset(t, SHAKES)
    frame = apply_shake(frame, dx, dy, rot)
    frame = frame * vignette_mask(W, H, 0.42)[..., None]
    frame = _GRAIN.apply(frame, fi, 0.024)
    frame = letterbox(frame, bar_height(t))
    # fundidos de entrada / salida
    if t < 0.25:
        frame *= smooth(t / 0.25)
    fo = 1 - smooth(lin(t, C["fade_out"], DURATION - 0.15))
    if fo < 1:
        frame *= fo
    return frame


def render_frame(fi):
    t = fi / FPS
    fn = shot_at(t)
    f = fn(t)
    f = post(f, t, fi)
    return finalize(f)


def _worker(fi):
    return fi, render_frame(fi).tobytes()


def render_video(out, audio=None, start=0.0, end=DURATION, workers=None, crf=19):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    f0, f1 = int(round(start * FPS)), int(round(end * FPS))
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
           "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if audio:
        cmd += ["-ss", f"{start:.3f}", "-i", str(audio)]
    cmd += ["-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-maxrate", "5M", "-bufsize", "10M",
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-tune", "film", "-movflags", "+faststart"]
    if audio:
        cmd += ["-c:a", "aac", "-b:a", "320k", "-shortest"]
    cmd += [str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    workers = workers or max(1, (os.cpu_count() or 2))
    t0 = time.time()
    with Pool(workers) as pool:
        for n, (fi, data) in enumerate(pool.imap(_worker, range(f0, f1), chunksize=2)):
            proc.stdin.write(data)
            if n % 48 == 0:
                el = time.time() - t0
                rate = (n + 1) / max(el, 1e-6)
                print(f"  fotograma {fi}/{f1}  ({rate:.1f} fps, quedan ~{(f1 - fi) / rate:.0f}s)",
                      flush=True)
    proc.stdin.close()
    proc.wait()
    print(f"OK {out}  ({time.time() - t0:.0f}s)")


def render_stills(times, outdir):
    from PIL import Image
    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    paths = []
    for t in times:
        fi = int(round(t * FPS))
        img = render_frame(fi)
        p = outdir / f"still_{t:06.2f}.png"
        Image.fromarray(img).save(p)
        paths.append(p)
    return paths


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/yampi_cinematica.mp4")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=DURATION)
    ap.add_argument("--workers", type=int, default=None)
    ap.add_argument("--crf", type=int, default=19)
    ap.add_argument("--stills", default=None, help="lista de tiempos separados por comas")
    ap.add_argument("--stills-dir", default="build/stills")
    a = ap.parse_args(argv)
    if a.stills:
        times = [float(x) for x in a.stills.split(",")]
        for p in render_stills(times, a.stills_dir):
            print(p)
        return
    render_video(a.out, a.audio, a.start, a.end, a.workers, a.crf)


if __name__ == "__main__":
    main()
