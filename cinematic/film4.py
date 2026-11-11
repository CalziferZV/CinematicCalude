"""Cinemática v4: el montaje elegante de la v2 con los renders del modelo 3D real de
Yampi (geometría del 3MF del autor y colores tomados de las fotos de la figura).

Uso:
    python -m cinematic.film4 --prepare-orbit
    python -m cinematic.film4 --out video/YAMPI_cinematica_1080p.mp4 --audio build/score2.wav
    python -m cinematic.film4 --stills 2,10,30
"""
from __future__ import annotations

import os
import sys

from .core import ROOT

R3D = ROOT / "build" / "3d_real"
# antes de importar film2: los procesos del pool heredan estas variables
os.environ.setdefault("YAMPI_R3D", str(R3D))
os.environ.setdefault("YAMPI_ORBIT_FRONT", "0")     # la órbita del modelo real empieza de frente

import functools  # noqa: E402

import numpy as np  # noqa: E402

from . import film2 as F2  # noqa: E402


@functools.lru_cache(maxsize=1)
def _part_boxes():
    """Cajas de cada pieza para las notas del despiece. La capa de las piernas incluye la
    peana: su caja se mide solo en la parte alta (las piernas), no en la peana."""
    boxes = {}
    for p in F2.PART_ORDER:
        a = F2.R(f"capa_{p}")[..., 3]
        ys, xs = np.where(a > 0.4)
        y0, y1 = int(ys.min()), int(ys.max())
        if p == "piernas":
            # la peana empieza donde las filas se ensanchan de golpe
            width = (a > 0.4).sum(1)
            legs_w = np.median(width[y0:y0 + max(4, (y1 - y0) // 4)])
            wide = np.where((np.arange(len(width)) > y0) & (width > 2.5 * legs_w))[0]
            if len(wide):
                y1 = int(wide[0]) - 1
            sel = ys <= y1
            ys, xs = ys[sel], xs[sel]
        boxes[p] = (int(xs.min()), y0, int(xs.max()), y1)
    return boxes


def configure():
    """Apunta el montaje de la v2 a los renders del modelo real."""
    F2.R3D = R3D
    F2.ORBIT_DIR = R3D / "orbita_24"
    F2.ORBIT_FRONT = 0
    F2._part_boxes = _part_boxes
    F2.R.cache_clear()


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    configure()
    if "--prepare-orbit" in argv:
        F2.prepare_orbit(src=R3D / "orbita", dst=R3D / "orbita_24")
        return
    if "--stills-dir" not in argv:
        argv += ["--stills-dir", "build/stills4"]
    F2.main(argv)


if __name__ == "__main__":
    main()
