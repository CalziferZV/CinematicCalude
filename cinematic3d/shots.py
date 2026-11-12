"""Planos 3D de la cinemática (Cycles). Uso:
    python -m cinematic3d.shots <dir_salida> [--preview] [plano ...]
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

# Puntos de interés (metros) medidos sobre el modelo real (3MF del autor)
P = dict(
    eyes=(0.0002, -0.0193, 0.1563), eye_r=(0.0090, -0.0196, 0.1563), eye_l=(-0.0086, -0.0189, 0.1563),
    nose=(0.0002, -0.0212, 0.1511), antenna=(0.0162, 0.0050, 0.1980), hole=(-0.0014, -0.0265, 0.0992),
    headstock=(-0.0633, -0.0282, 0.1403), hand_r=(0.0127, -0.0309, 0.0964), hand_l=(-0.0449, -0.0313, 0.1304),
    shoes=(0.0011, -0.0065, 0.0042), body=(0.0, 0.0, 0.102),
)

# luz: (principal, contraluz, contraluz_izq, relleno, halo de fondo)
LIGHT = {
    "producto": (1.0, 1.0, 1.0, 1.0, 1.0),
    "penumbra": (0.55, 1.25, 0.9, 0.35, 0.45),
    "silueta": (0.05, 1.7, 1.4, 0.0, 0.7),
    "heroe": (1.05, 1.15, 1.0, 0.9, 1.7),
}

# nombre: dict(cam, objetivo, lente, f, foco, res, muestras, luz, transparente, partes)
SHOTS = {
    "ojos": dict(cam=(0.018, -0.146, 0.1588), tgt=(0.0, -0.019, 0.1548), lens=100, f=3.2, focus=P["eye_r"],
                 res=(1920, 1080), spp=40, light="penumbra"),
    "antena": dict(cam=(0.055, -0.085, 0.216), tgt=P["antenna"], lens=100, f=2.4, focus=P["antenna"],
                   res=(1920, 1080), spp=40, light="penumbra"),
    "cara34": dict(cam=(-0.13, -0.29, 0.168), tgt=(0.0, -0.002, 0.152), lens=100, f=5.6, focus=P["eye_l"],
                   res=(1920, 1080), spp=40, light="producto"),
    "clavijero": dict(cam=(-0.135, -0.165, 0.168), tgt=(-0.058, -0.028, 0.137), lens=100, f=5.0, focus=P["headstock"],
                      res=(1920, 1080), spp=40, light="producto"),
    "cuerdas": dict(cam=(0.075, -0.155, 0.114), tgt=(0.004, -0.028, 0.096), lens=100, f=4.0, focus=P["hand_r"],
                    res=(1920, 1080), spp=40, light="producto"),
    "cuerdas_boca": dict(cam=(0.075, -0.155, 0.114), tgt=(0.004, -0.028, 0.096), lens=100, f=4.0, focus=P["hole"],
                         res=(1920, 1080), spp=40, light="producto"),
    "zapatos": dict(cam=(0.085, -0.17, 0.016), tgt=(0.0, -0.012, 0.022), lens=100, f=4.0, focus=(0.011, -0.026, 0.009),
                    res=(1920, 1080), spp=40, light="producto"),
    "entero": dict(cam=(0.0, -0.98, 0.108), tgt=(0.0, 0.0, 0.103), lens=85, f=8.0, focus=P["body"],
                   res=(1920, 1080), spp=40, light="producto"),
    "heroe": dict(cam=(0.035, -1.02, 0.118), tgt=(0.0, 0.0, 0.106), lens=85, f=4.0, focus=(0.0, -0.02, 0.11),
                  res=(2240, 1260), spp=48, light="heroe"),
    "contrapicado": dict(cam=(0.055, -0.40, 0.006), tgt=(0.0, 0.0, 0.112), lens=38, f=5.6, focus=(0.0, -0.025, 0.10),
                         res=(1920, 1080), spp=40, light="penumbra"),
    "silueta": dict(cam=(0.80, -0.24, 0.112), tgt=(0.0, 0.0, 0.104), lens=85, f=5.6, focus=P["body"],
                    res=(1920, 1080), spp=40, light="silueta"),
}
# variantes del plano entero para el efecto "capa a capa"
SHOTS["entero_fondo"] = dict(SHOTS["entero"], parts="ninguna", spp=24)
SHOTS["entero_alfa"] = dict(SHOTS["entero"], transparent=True, parts="sinpeana", spp=24)
# héroe con la figura a la izquierda (sitio para el título) y peana completa
SHOTS["heroe_izq"] = dict(cam=(0.03, -1.25, 0.112), tgt=(0.0, 0.0, 0.095), lens=85, f=4.0, focus=(0.0, -0.02, 0.10),
                          res=(2240, 1260), spp=48, light="heroe", shift_x=0.17)
# --- versión vertical 9:16 (Reels), renderizada un 20 % mayor que 1080x1920 para los empujes de cámara ---
VR = (1296, 2304)
SHOTS["v_ojos"] = dict(cam=(0.012, -0.135, 0.157), tgt=(0.0, -0.019, 0.1525), lens=62, f=3.2, focus=P["eye_r"],
                       res=VR, spp=64, light="penumbra")
SHOTS["v_antena"] = dict(cam=(0.055, -0.085, 0.216), tgt=P["antenna"], lens=100, f=2.4, focus=P["antenna"],
                         res=VR, spp=64, light="penumbra")
SHOTS["v_entero"] = dict(cam=(0.0, -0.98, 0.122), tgt=(0.0, 0.0, 0.128), lens=105, f=8.0, focus=P["body"],
                         res=VR, spp=48, light="producto")
SHOTS["v_entero_fondo"] = dict(SHOTS["v_entero"], parts="ninguna", spp=32)
SHOTS["v_entero_alfa"] = dict(SHOTS["v_entero"], transparent=True, parts="sinpeana", spp=32)
SHOTS["v_cara34"] = dict(cam=(-0.13, -0.29, 0.168), tgt=(0.0, -0.002, 0.150), lens=100, f=5.6, focus=P["eye_l"],
                         res=VR, spp=64, light="producto")
SHOTS["v_clavijero"] = dict(cam=(-0.135, -0.165, 0.168), tgt=(-0.058, -0.028, 0.137), lens=85, f=5.0,
                            focus=P["headstock"], res=VR, spp=64, light="producto")
SHOTS["v_cuerdas"] = dict(cam=(0.075, -0.155, 0.114), tgt=(0.004, -0.028, 0.096), lens=85, f=4.0, focus=P["hole"],
                          res=VR, spp=64, light="producto")
SHOTS["v_contrapicado"] = dict(cam=(0.055, -0.40, 0.006), tgt=(0.0, 0.0, 0.112), lens=50, f=5.6,
                               focus=(0.0, -0.025, 0.10), res=VR, spp=64, light="penumbra")
SHOTS["v_heroe"] = dict(cam=(0.03, -1.25, 0.10), tgt=(0.0, 0.0, 0.10), lens=100, f=4.0, focus=(0.0, -0.02, 0.10),
                        res=VR, spp=64, light="heroe", shift_y=0.14)
# despiece vertical: misma cámara que v_entero con un objetivo 1,389 veces más abierto y la misma
# densidad de píxeles (el centro 1296x2304 de la capa coincide exactamente con v_entero)
for part in ("cabeza", "pelo", "torso", "piernas", "todo"):
    SHOTS[f"v_capa_{part}"] = dict(SHOTS["v_entero"], lens=105 * 1296 / 1800, f=None, focus=None, res=(1800, 3200),
                                   spp=32, transparent=True, parts=part)
SHOTS["v_capa_fondo"] = dict(SHOTS["v_entero"], lens=105 * 1296 / 1800, f=None, focus=None, res=(1800, 3200),
                             spp=24, parts="ninguna")

# capas de la vista despiezada (mismo encuadre, fondo transparente)
for part in ("cabeza", "pelo", "torso", "piernas", "todo"):
    SHOTS[f"capa_{part}"] = dict(cam=(0.0, -1.75, 0.135), tgt=(0.0, 0.0, 0.130), lens=85, f=None, focus=None,
                                 res=(2880, 1620), spp=28, light="penumbra", transparent=True, parts=part)
SHOTS["capa_fondo"] = dict(cam=(0.0, -1.75, 0.135), tgt=(0.0, 0.0, 0.130), lens=85, f=None, focus=None,
                           res=(2880, 1620), spp=20, light="penumbra", parts="ninguna")


def set_lights(L, mode, base=14.0):
    k = LIGHT[mode]
    L["key"].data.energy = base * k[0]
    L["rim"].data.energy = base * 0.95 * k[1]
    L["rim2"].data.energy = base * 0.45 * k[2]
    L["fill"].data.energy = base * 0.16 * k[3]
    L["halo"].data.energy = 160 * k[4]


def build_scene():
    S.reset()
    S.render_settings()
    S.world((9, 8, 7))
    bd = S.backdrop()
    ped = S.pedestal()
    L = S.studio_lights()
    root, parts = build_real_yampi()
    return dict(backdrop=bd, pedestal=ped, lights=L, root=root, parts=parts)


def show_parts(scn, which):
    for name, empty in scn["parts"].items():
        vis = which in ("todo", None) or name == which
        for ob in empty.children_recursive:
            ob.hide_render = not vis
    # en las capas, la peana solo aparece con las piernas o el conjunto
    scn["pedestal"].hide_render = which not in (None, "todo", "piernas", "ninguna")


def render_shot(scn, name, outdir, preview=False):
    cfg = SHOTS[name]
    res = cfg["res"]
    spp = cfg["spp"]
    if preview:
        res = (res[0] * 360 // res[1], 360)
        spp = 12
    transparent = cfg.get("transparent", False)
    S.render_settings(res=res, samples=spp, transparent=transparent)
    set_lights(scn["lights"], cfg["light"])
    parts = cfg.get("parts")
    if parts == "sinpeana":
        show_parts(scn, "todo")
        scn["pedestal"].hide_render = True
    elif parts == "ninguna":
        for empty in scn["parts"].values():
            for ob in empty.children_recursive:
                ob.hide_render = True
        scn["pedestal"].hide_render = False
    else:
        show_parts(scn, parts)
    scn["backdrop"].hide_render = transparent
    cam = S.camera(f"cam_{name}", cfg["cam"], cfg["tgt"], lens=cfg["lens"], fstop=cfg["f"],
                   shift_x=cfg.get("shift_x", 0.0), shift_y=cfg.get("shift_y", 0.0))
    if cfg["f"] is not None and cfg.get("focus") is not None:
        cam.data.dof.focus_distance = (Vector(cfg["focus"]) - Vector(cfg["cam"])).length
    out = Path(outdir) / f"{name}.png"
    bpy.context.scene.render.filepath = str(out)
    t = time.time()
    bpy.ops.render.render(write_still=True)
    dt = time.time() - t
    print(f"PLANO {name} {res[0]}x{res[1]} {spp}spp {dt:.1f}s", flush=True)
    return out


def main(argv):
    outdir = argv[0]
    if "--orbita-v" in argv:
        render_orbit_v(outdir)
        return
    if "--orbita" in argv:
        render_orbit(outdir)
        return
    preview = "--preview" in argv
    names = [a for a in argv[1:] if not a.startswith("--")] or list(SHOTS)
    Path(outdir).mkdir(parents=True, exist_ok=True)
    scn = build_scene()
    for n in names:
        render_shot(scn, n, outdir, preview)


def render_orbit(outdir, n=60, az0=0.0, az1=36.0, radius=0.95, height=0.125, res=(1600, 900), spp=20,
                 start=0):
    """Órbita de cámara alrededor de la figura (fotogramas a 12 fps)."""
    scn = build_scene()
    S.render_settings(res=res, samples=spp)
    set_lights(scn["lights"], "producto")
    show_parts(scn, "todo")
    tgt = Vector((0.0, 0.0, 0.106))
    cam = S.camera("cam_orbita", (0, -radius, height), tgt, lens=85, fstop=4.5)
    Path(outdir).mkdir(parents=True, exist_ok=True)
    for i in range(start, n):
        u = i / (n - 1)
        e = u * u * (3 - 2 * u)  # entrada y salida suaves
        az = math.radians(az0 + (az1 - az0) * e)
        cam.location = (radius * math.sin(az), -radius * math.cos(az), height + 0.012 * math.sin(math.pi * u))
        S.look_at(cam, tgt)
        cam.data.dof.focus_distance = (tgt + Vector((0, -0.02, 0)) - cam.location).length
        out = Path(outdir) / f"orbita_{i:03d}.png"
        if out.exists():
            continue
        bpy.context.scene.render.filepath = str(out)
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"ORBITA {i}/{n} {time.time() - t:.1f}s", flush=True)


def render_orbit_v(outdir, n=64, az1=36.0, radius=0.95, height=0.125, res=(1134, 2016), spp=24, lens=105):
    """Órbita vertical para el teaser: fotogramas nativos a 24 fps (2,67 s), con la misma curva de
    movimiento que el montaje (arranque con impulso y frenada suave), un 5 % mayores que 1080x1920."""
    scn = build_scene()
    S.render_settings(res=res, samples=spp)
    set_lights(scn["lights"], "producto")
    show_parts(scn, "todo")
    tgt = Vector((0.0, 0.0, 0.128))
    cam = S.camera("cam_orbita_v", (0, -radius, height), tgt, lens=lens, fstop=4.5)
    Path(outdir).mkdir(parents=True, exist_ok=True)
    for i in range(n):
        u = i / (n - 1)
        x = 1 - (1 - u) ** 2
        e = x * x * (3 - 2 * x)
        az = math.radians(az1 * e)
        cam.location = (radius * math.sin(az), -radius * math.cos(az), height + 0.012 * math.sin(math.pi * x))
        S.look_at(cam, tgt)
        cam.data.dof.focus_distance = (tgt + Vector((0, -0.02, 0)) - cam.location).length
        out = Path(outdir) / f"v_orbita_{i:03d}.png"
        if out.exists():
            continue
        bpy.context.scene.render.filepath = str(out)
        t = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"ORBITA_V {i}/{n} {time.time() - t:.1f}s", flush=True)


if __name__ == "__main__":
    main(sys.argv[1:])
