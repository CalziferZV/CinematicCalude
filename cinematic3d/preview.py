"""Vistas rápidas del modelo para iterar: python -m cinematic3d.preview <dir> [vista ...]"""
import sys
import time
from pathlib import Path

import bpy

from . import studio as S
from .model import build_yampi

VIEWS = {
    # nombre: (pos cámara, objetivo, lente, resolución)
    "frente": ((0.0, -0.62, 0.11), (0.0, 0.0, 0.105), 75, (540, 960)),
    "tresc": ((-0.42, -0.45, 0.14), (0.0, 0.0, 0.105), 75, (540, 960)),
    "lado": ((0.95, -0.05, 0.11), (0.0, 0.0, 0.105), 75, (540, 960)),
    "cara": ((0.03, -0.42, 0.155), (0.0, 0.0, 0.152), 100, (960, 540)),
    "foto": ((0.10, -0.60, 0.16), (0.0, 0.0, 0.105), 75, (540, 720)),
}


def main(outdir, views, samples=24):
    out = Path(outdir)
    out.mkdir(parents=True, exist_ok=True)
    S.reset()
    S.render_settings(samples=samples)
    S.world((9, 8, 7))
    S.backdrop()
    S.pedestal()
    S.studio_lights()
    t = time.time()
    root, parts, M = build_yampi()
    print("modelo", round(time.time() - t, 2), "s")
    for v in views:
        loc, tgt, lens, res = VIEWS[v]
        S.render_settings(res=res, samples=samples)
        S.camera(f"cam_{v}", loc, tgt, lens=lens, fstop=None)
        bpy.context.scene.render.filepath = str(out / f"{v}.png")
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(v, round(time.time() - t, 1), "s")


if __name__ == "__main__":
    args = sys.argv[1:]
    main(args[0], args[1:] or ["frente", "tresc", "cara"])
