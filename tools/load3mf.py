"""Convierte el proyecto 3MF de Bambu Studio en una malla compacta (npz).

Solo se usa la geometría y las regiones pintadas (qué filamento lleva cada
triángulo); los colores finales se asignan después a partir de las fotos.

Uso:
    python -I tools/load3mf.py <modelo.3mf> <salida.npz>

Salida: vertices (N,3) en metros con los pies en z=0, faces (M,3), state (M,)
con el filamento (1..7) de cada triángulo y filament_colour (los colores del
proyecto, solo como referencia).
"""
from __future__ import annotations

import json
import re
import sys
import zipfile
from collections import defaultdict

import numpy as np

VERT_RE = re.compile(rb'<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\s*/>')
TRI_RE = re.compile(rb'<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?: paint_color="([0-9A-F]*)")?\s*/>')


def decode_paint(s: str, default: int = 1) -> int:
    """Estado mayoritario de un triángulo pintado (formato TriangleSelector serializado:
    nibbles leídos desde el final; 2 bits de lados divididos + estado, recursivo)."""
    if not s:
        return default
    bits = []
    for ch in reversed(s):
        d = int(ch, 16)
        bits.extend((d >> i) & 1 for i in range(4))
    pos = 0
    acc = defaultdict(float)

    def nib():
        nonlocal pos
        v = bits[pos] | bits[pos + 1] << 1 | bits[pos + 2] << 2 | bits[pos + 3] << 3
        pos += 4
        return v

    stack = [1.0]
    while stack:
        w = stack.pop()
        code = nib()
        nsplit = code & 3
        if nsplit == 0:
            st = code >> 2
            if st == 3:
                st = nib() + 3
            acc[st or default] += w
        else:
            n = nsplit + 1
            # los hijos se leen en orden; la pila los procesa en el mismo orden
            stack.extend([w / n] * n)
    return max(acc, key=acc.get)


def main(src, dst):
    z = zipfile.ZipFile(src)
    data = z.read("3D/3dmodel.model")
    cfg = json.loads(z.read("Metadata/project_settings.config").decode("utf-8", "replace"))
    v = np.array(VERT_RE.findall(data), dtype=np.float64)
    tris = TRI_RE.findall(data)
    f = np.array([(int(a), int(b), int(c)) for a, b, c, _ in tris], dtype=np.int32)
    cache = {}
    state = np.empty(len(tris), np.uint8)
    for i, t in enumerate(tris):
        s = t[3].decode()
        st = cache.get(s)
        if st is None:
            st = cache[s] = decode_paint(s)
        state[i] = st
    # mm -> m, pies en z = 0, centrado en x/y
    v = v / 1000.0
    v[:, 2] -= v[:, 2].min()
    v[:, 0] -= (v[:, 0].min() + v[:, 0].max()) / 2
    v[:, 1] -= (v[:, 1].min() + v[:, 1].max()) / 2
    np.savez_compressed(dst, vertices=v.astype(np.float32), faces=f, state=state,
                        filament_colour=np.array(cfg.get("filament_colour", [])))
    ext = v.max(0) - v.min(0)
    print(f"OK {dst}: {len(v)} vértices, {len(f)} triángulos, tamaño {ext * 1000} mm, "
          f"{len(cache)} códigos de pintura distintos")
    for k in range(8):
        n = int((state == k).sum())
        if n:
            print(f"  filamento {k}: {n} triángulos")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
