"""Vistas de prueba del Yampi real (frente, tres cuartos, perfil y espalda).

    python -m cinematic3d.real_preview <dir_salida> [ancho] [muestras]
"""
from __future__ import annotations

import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

from . import studio as S
from .real import build_real_yampi


def main(argv):
    out = Path(argv[0])
    out.mkdir(parents=True, exist_ok=True)
    width = int(argv[1]) if len(argv) > 1 else 960
    spp = int(argv[2]) if len(argv) > 2 else 16
    S.reset()
    S.render_settings(res=(width, width * 9 // 16), samples=spp)
    S.world((9, 8, 7))
    S.backdrop()
    S.pedestal()
    S.studio_lights(mirror=True)
    t = time.time()
    build_real_yampi()
    print(f"malla cargada en {time.time() - t:.1f}s", flush=True)
    tgt = Vector((0.0, 0.0, 0.102))
    for name, az in (("frente", 0.0), ("tres_cuartos", 35.0), ("perfil", 90.0), ("espalda", 180.0)):
        a = math.radians(az)
        cam = S.camera(f"cam_{name}", (0.98 * math.sin(a), -0.98 * math.cos(a), 0.108), tgt, lens=85, fstop=8.0)
        bpy.context.scene.camera = cam
        bpy.context.scene.render.filepath = str(out / f"{name}.png")
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"VISTA {name} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
