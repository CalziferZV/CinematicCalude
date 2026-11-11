"""Yampi real: la geometría del proyecto 3MF del autor (convertida con tools/load3mf.py)
con colores y materiales ajustados a las fotos de la figura impresa.

Del 3MF solo se usa la forma y qué filamento lleva cada triángulo (para separar los
materiales). Los colores del proyecto no se usan: cada material toma el color medido
en la foto real. Cada vértice guarda la proporción de cada material a su alrededor y
el sombreador corta por la isolínea 0,5, así los bordes entre colores (ojos, cejas,
boca...) quedan nítidos y redondos en lugar de seguir los triángulos.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
import numpy as np

from .model import srgb

ROOT = Path(__file__).resolve().parents[1]
MESH = ROOT / "build" / "real" / "yampi_mesh.npz"
# centra la figura sobre la peana (eje de las piernas en x/y), en metros
SHIFT = np.array([-0.0144, -0.00545, 0.0])
LEG_CUT = 0.0660      # corte piernas / torso (justo bajo el bajo de la camiseta)
NECK_CUT = 0.1355     # corte cabeza / torso (cuello, entre el cuello de la camiseta y la barbilla)
NECK_R = 0.016
PIECES = ("pelo", "cabeza", "torso", "piernas")

# material -> color medido en la foto (sRGB) y acabado. 1-7 son los filamentos del
# proyecto (solo para separar zonas); 8 es el lateral de la guitarra y 9 la franja
# oscura bajo el flequillo (las dos se ven en la figura impresa y no tienen zona en el 3MF).
PALETTE = {
    1: dict(name="piel", color=(128, 78, 58), rough=0.46, spec=0.45),
    2: dict(name="pelo", color=(108, 82, 68), rough=0.55, spec=0.40, hollow=True),
    3: dict(name="blanco", color=(232, 228, 220), rough=0.56, spec=0.40),
    4: dict(name="negro", color=(20, 20, 24), rough=0.34, spec=0.50),
    5: dict(name="rojo", color=(168, 16, 24), rough=0.36, spec=0.50),
    6: dict(name="azul", color=(12, 58, 150), rough=0.42, spec=0.45),
    7: dict(name="madera", color=(132, 98, 72), rough=0.50, spec=0.40, grain=True),
    8: dict(name="madera_lateral", color=(70, 44, 30), rough=0.48, spec=0.40),
    9: dict(name="pelo_base", color=(48, 32, 25), rough=0.60, spec=0.35),
}
NMAT = max(PALETTE)


def load(path=MESH):
    d = np.load(path)
    v = d["vertices"].astype(np.float64) + SHIFT
    return v, d["faces"].astype(np.int64), d["state"].astype(np.int64)


def _components(v, f, mask):
    """Componentes conexas (por vértices compartidos) de los triángulos 'mask'."""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    idx = np.where(mask)[0]
    ff = f[idx]
    n = len(v)
    rows = np.concatenate([ff[:, 0], ff[:, 1]])
    cols = np.concatenate([ff[:, 1], ff[:, 2]])
    g = sp.coo_matrix((np.ones(len(rows), np.int8), (rows, cols)), shape=(n, n))
    _, lab = connected_components(g, directed=False)
    fl = lab[ff[:, 0]]
    _, inv, cnt = np.unique(fl, return_inverse=True, return_counts=True)
    return idx, inv, cnt


def _majority(f, mat, fix, n_vert, iters=12):
    """Asigna a los triángulos 'fix' el material más frecuente de sus vecinos."""
    mat = mat.copy()
    fix = fix.copy()
    for _ in range(iters):
        if not fix.any():
            break
        ok = ~fix
        hist = np.zeros((n_vert, NMAT + 1))
        for k in range(3):
            np.add.at(hist, (f[ok, k], mat[ok]), 1)
        fi = np.where(fix)[0]
        h = hist[f[fi, 0]] + hist[f[fi, 1]] + hist[f[fi, 2]]
        has = h.sum(1) > 0
        mat[fi[has]] = h[has].argmax(1)
        fix[fi[has]] = False
    return mat


def fix_regions(v, f, st):
    """Corrige las zonas del 3MF para que coincidan con la figura impresa (fotos):
    iris, cejas y puente de la guitarra en negro; manchas sueltas con el color de su
    entorno; laterales de la guitarra en marrón oscuro."""
    mat = st.copy()
    mm = v * 1000.0
    cen = mm[f].mean(1)
    fix = np.zeros(len(f), bool)
    # zonas 'pelo' que no son el pelo (iris, cejas, puente): negro; motas: entorno
    idx, inv, cnt = _components(v, f, st == 2)
    big = cnt.argmax()
    for c in range(len(cnt)):
        if c == big:
            continue
        sel = idx[inv == c]
        if cnt[c] >= 1000:
            mat[sel] = 4
        else:
            fix[sel] = True
    # blanco suelto: se conservan el blanco de los ojos y sus brillos
    idx, inv, cnt = _components(v, f, st == 3)
    big = cnt.argmax()
    for c in range(len(cnt)):
        sel = idx[inv == c]
        if c == big:
            continue
        cz, cy = cen[sel, 2].mean(), cen[sel, 1].mean()
        if not (148 < cz < 163 and cy < -8):
            fix[sel] = True
    # motas de piel y de negro
    for s_ in (1, 4, 5, 6):
        idx, inv, cnt = _components(v, f, st == s_)
        for c in np.where(cnt < 400)[0]:
            fix[idx[inv == c]] = True
    mat = _majority(f, mat, fix, len(v))
    # laterales de la guitarra (cuerpo, no el mástil)
    g = mat == 7
    gp = mm[f[g].ravel()]
    c0 = gp.mean(0)
    _, _, vt = np.linalg.svd(gp - c0, full_matrices=False)
    a0, a1, nrm = vt[0], vt[1], vt[2]
    if nrm[1] < 0:
        nrm = -nrm
    hole = cen[(mat == 4) & (cen[:, 2] > 90) & (cen[:, 2] < 110) & (cen[:, 1] < -15)].mean(0)
    if a0 @ np.array([1.0, 0.0, -1.0]) < 0:    # a0 apunta hacia el fondo del cuerpo
        a0 = -a0
    fn = np.cross(mm[f[:, 1]] - mm[f[:, 0]], mm[f[:, 2]] - mm[f[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    rel = cen - hole
    dist = rel @ nrm
    t0 = rel @ a0
    # huella de la guitarra en su plano
    res = 0.5
    u, w = (cen - c0) @ a0, (cen - c0) @ a1
    gi = np.where(g)[0]
    u0, w0 = u[gi].min() - 5, w[gi].min() - 5
    nu, nw = int((u[gi].max() - u0 + 5) / res) + 1, int((w[gi].max() - w0 + 5) / res) + 1
    grid = np.zeros((nw, nu), np.uint8)
    grid[((w[gi] - w0) / res).astype(int), ((u[gi] - u0) / res).astype(int)] = 1
    import cv2
    grid = cv2.morphologyEx(grid, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    grid = cv2.dilate(grid, np.ones((3, 3), np.uint8))
    iu = np.clip(((u - u0) / res).astype(int), 0, nu - 1)
    iw = np.clip(((w - w0) / res).astype(int), 0, nw - 1)
    inside = grid[iw, iu].astype(bool) & (u > u0) & (w > w0)
    perp = np.abs(fn @ nrm) < 0.5
    side = inside & (t0 > -20) & perp & (dist > -2.0)
    side &= ((mat == 7) & (dist < 14)) | ((mat == 3) & (dist < 11))
    mat[side] = 8
    # blanco de la camiseta que se coló en la guitarra (dentro de su huella y su grosor)
    spill = inside & (mat == 3) & (dist > -6) & (dist < 12) & (t0 > -20)
    mat[spill & perp] = 8
    mat[spill & ~perp] = 7
    # franja oscura del nacimiento del pelo (cabeza impresa en marrón bajo el flequillo)
    from scipy.spatial import cKDTree
    hair_v = np.unique(f[mat == 2].ravel())
    tree = cKDTree(mm[hair_v])
    head_c = mm[hair_v].mean(0)
    cand = np.where((mat == 1) & (cen[:, 2] > 159) & (np.abs(cen[:, 0] - head_c[0]) < 25.5))[0]
    dd, _ = tree.query(cen[cand], k=1, distance_upper_bound=6.0)
    band = cand[dd < 3.8]
    mat[band] = 9
    return mat


# --------------------------------------------------------------------------- #
# Superficie y bordes de color
# --------------------------------------------------------------------------- #
def _adjacency(f, n):
    import scipy.sparse as sp
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A = ((A + A.T) > 0).astype(np.float64)
    deg = np.asarray(A.sum(1)).ravel()
    return A, np.maximum(deg, 1)


SMOOTH_CLASSES = (1, 2, 3, 5, 6, 9)


def smooth_surface(v, f, mat, iters=10, lam=0.55, mu=-0.58, eye_iters=40):
    """Suavizado de Taubin (sin encoger) de las ondulaciones finas de la malla en las
    superficies lisas (piel, pelo, camiseta, pantalón); no toca guitarra ni trazos negros."""
    n = len(v)
    A, deg = _adjacency(f, n)
    ok = np.isin(mat, SMOOTH_CLASSES) | ((mat == 4) & (v[f].mean(1)[:, 2] < 0.012))   # + zapatos
    bad = np.zeros(n, bool)
    for k in range(3):
        bad[f[~ok, k]] = True
    m = (~bad)[:, None].astype(np.float64)
    x = v.copy()
    for _ in range(iters):
        for w in (lam, mu):
            avg = (A @ x) / deg[:, None]
            x = x + w * (avg - x) * m
    # ojos: el borde en relieve del blanco y de la pupila sigue los triángulos (dientes);
    # un suavizado más largo y solo alrededor de cada ojo lo deja redondo
    cen = v[f].mean(1)
    pup = (mat == 4) & (cen[:, 2] > 0.150) & (cen[:, 2] < 0.162) & (cen[:, 1] < -0.012)
    eye_m = np.zeros(n)
    for side in (cen[:, 0] < 0, cen[:, 0] >= 0):
        sel = pup & side
        if sel.any():
            c = cen[sel].mean(0)
            d = np.linalg.norm(v - c, axis=1)
            eye_m = np.maximum(eye_m, np.clip((0.0078 - d) / 0.0015, 0, 1))
    em = eye_m[:, None]
    for _ in range(eye_iters):
        for w in (0.6, -0.63):
            avg = (A @ x) / deg[:, None]
            x = x + w * (avg - x) * em
    return x


def class_weights(v, f, mat, smooth_iters=2):
    """Fracción de cada material alrededor de cada vértice (para bordes nítidos y suaves:
    el sombreador corta por la isolínea 0,5 en lugar de seguir los triángulos)."""
    n = len(v)
    W = np.zeros((n, NMAT))
    for k in range(3):
        np.add.at(W, (f[:, k], mat - 1), 1.0)
    W /= np.maximum(W.sum(1, keepdims=True), 1)
    if smooth_iters:
        A, deg = _adjacency(f, n)
        for _ in range(smooth_iters):
            W = 0.5 * W + 0.5 * (A @ W) / deg[:, None]
    return W


def _color_group():
    """Grupo de nodos: color = suma de colores ponderada por smoothstep(pesos)."""
    ng = bpy.data.node_groups.get("yampi_color")
    if ng is not None:
        return ng
    ng = bpy.data.node_groups.new("yampi_color", "ShaderNodeTree")
    ng.interface.new_socket(name="Color", in_out="OUTPUT", socket_type="NodeSocketColor")
    out = ng.nodes.new("NodeGroupOutput")
    acc = None
    tot = None
    for k in range(1, NMAT + 1):
        at = ng.nodes.new("ShaderNodeAttribute")
        at.attribute_type = "GEOMETRY"
        at.attribute_name = f"w{k}"
        mr = ng.nodes.new("ShaderNodeMapRange")
        mr.data_type = "FLOAT"
        mr.interpolation_type = "SMOOTHSTEP"
        mr.inputs["From Min"].default_value = 0.36
        mr.inputs["From Max"].default_value = 0.64
        ng.links.new(at.outputs["Fac"], mr.inputs["Value"])
        sc = ng.nodes.new("ShaderNodeVectorMath")
        sc.operation = "SCALE"
        sc.inputs[0].default_value = srgb(PALETTE[k]["color"])[:3]
        ng.links.new(mr.outputs["Result"], sc.inputs["Scale"])
        if acc is None:
            acc, tot = sc.outputs["Vector"], mr.outputs["Result"]
        else:
            ad = ng.nodes.new("ShaderNodeVectorMath")
            ad.operation = "ADD"
            ng.links.new(acc, ad.inputs[0])
            ng.links.new(sc.outputs["Vector"], ad.inputs[1])
            acc = ad.outputs["Vector"]
            st = ng.nodes.new("ShaderNodeMath")
            st.operation = "ADD"
            ng.links.new(tot, st.inputs[0])
            ng.links.new(mr.outputs["Result"], st.inputs[1])
            tot = st.outputs["Value"]
    mx = ng.nodes.new("ShaderNodeMath")
    mx.operation = "MAXIMUM"
    mx.inputs[1].default_value = 1e-3
    ng.links.new(tot, mx.inputs[0])
    inv = ng.nodes.new("ShaderNodeMath")
    inv.operation = "DIVIDE"
    inv.inputs[0].default_value = 1.0
    ng.links.new(mx.outputs["Value"], inv.inputs[1])
    nrm = ng.nodes.new("ShaderNodeVectorMath")
    nrm.operation = "SCALE"
    ng.links.new(acc, nrm.inputs[0])
    ng.links.new(inv.outputs["Value"], nrm.inputs["Scale"])
    ng.links.new(nrm.outputs["Vector"], out.inputs["Color"])
    return ng


def _material(key, info):
    m = bpy.data.materials.new(f"yampi_{info['name']}")
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = info["rough"]
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = info["spec"]
    if info.get("hollow"):
        # el pelo es una pieza hueca: su cara interior se vuelve transparente para que,
        # renderizado solo (despiece), no tape la cara con el interior del casco
        out = nt.nodes["Material Output"]
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        tr = nt.nodes.new("ShaderNodeBsdfTransparent")
        mx = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(geo.outputs["Backfacing"], mx.inputs["Fac"])
        nt.links.new(b.outputs["BSDF"], mx.inputs[1])
        nt.links.new(tr.outputs["BSDF"], mx.inputs[2])
        nt.links.new(mx.outputs["Shader"], out.inputs["Surface"])
    attr = nt.nodes.new("ShaderNodeGroup")
    attr.node_tree = _color_group()
    if info.get("grain"):
        # vetas suaves de madera (variación de tono y relieve muy leves)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (60.0, 60.0, 420.0)
        mp.inputs["Rotation"].default_value = (0.0, 0.0, math.radians(35.0))
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "Z"
        wave.inputs["Scale"].default_value = 1.0
        wave.inputs["Distortion"].default_value = 7.0
        wave.inputs["Detail"].default_value = 3.0
        wave.inputs["Detail Roughness"].default_value = 0.6
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (1.0, 1.0, 1.0, 1.0)
        ramp.color_ramp.elements[1].color = (0.86, 0.84, 0.82, 1.0)
        ramp.color_ramp.elements[0].position = 0.45
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        nt.links.new(attr.outputs["Color"], mix.inputs[6])  # color del grupo
        nt.links.new(ramp.outputs["Color"], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.05
        bump.inputs["Distance"].default_value = 0.0002
        nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    else:
        nt.links.new(attr.outputs["Color"], b.inputs["Base Color"])
    return m


def make_object(name, v, f, st, materials, weights=None):
    """Crea un objeto de malla a partir de arrays (rápido, con foreach_set)."""
    used = np.unique(f.ravel())
    remap = np.full(len(v), -1, np.int64)
    remap[used] = np.arange(len(used))
    vv = v[used]
    ff = remap[f]
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(vv))
    me.vertices.foreach_set("co", vv.astype(np.float32).ravel())
    me.loops.add(ff.size)
    me.loops.foreach_set("vertex_index", ff.astype(np.int32).ravel())
    me.polygons.add(len(ff))
    me.polygons.foreach_set("loop_start", np.arange(0, ff.size, 3, dtype=np.int32))
    me.update(calc_edges=True)
    for m in materials:
        me.materials.append(m)
    me.polygons.foreach_set("material_index", (st - 1).astype(np.int32))
    if weights is not None:
        for k in range(weights.shape[1]):
            at = me.attributes.new(name=f"w{k + 1}", type="FLOAT", domain="POINT")
            at.data.foreach_set("value", weights[used, k].astype(np.float32))
    me.shade_smooth()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------- #
# Las cuatro piezas impresas
# --------------------------------------------------------------------------- #
def _face_pairs(f, n_vert):
    """Pares de triángulos que comparten una arista."""
    e = np.sort(np.stack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]], 1).reshape(-1, 2), axis=1)
    fid = np.repeat(np.arange(len(f)), 3)
    key = e[:, 0] * n_vert + e[:, 1]
    o = np.argsort(key, kind="stable")
    ks, fs = key[o], fid[o]
    same = ks[1:] == ks[:-1]
    return fs[:-1][same], fs[1:][same]


def split_pieces(v, f, mat):
    """0 pelo (con antenas), 1 cabeza, 2 torso (brazos y guitarra), 3 piernas (y zapatos)."""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    cen = v[f].mean(1)
    legs = cen[:, 2] < LEG_CUT
    near = (np.abs(cen[:, 2] - NECK_CUT) < 0.0006) & (mat == 1) & (cen[:, 0] > -0.022)
    nx, ny = cen[near, 0].mean(), cen[near, 1].mean()
    cyl = (cen[:, 0] - nx) ** 2 + (cen[:, 1] - ny) ** 2 < NECK_R ** 2
    above = cen[:, 2] > NECK_CUT
    a, b = _face_pairs(f, len(v))
    cross = (legs[a] != legs[b]) | ((cyl[a] | cyl[b]) & (above[a] != above[b]))
    a, b = a[~cross], b[~cross]
    g = sp.coo_matrix((np.ones(len(a), np.int8), (a, b)), shape=(len(f), len(f)))
    _, comp = connected_components(g, directed=False)
    nose = np.where((mat == 5) & (cen[:, 2] < 0.16))[0][0]
    piece = np.full(len(f), 2, np.int64)
    piece[legs] = 3
    head = comp == comp[nose]
    piece[head] = 1
    piece[head & ((mat == 2) | ((mat == 5) & (cen[:, 2] > 0.175)))] = 0
    return piece


def _boundary_loops(f):
    """Bucles de aristas de borde (aristas usadas una sola vez), ordenados."""
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    k = np.sort(e, axis=1)
    _, inv, cnt = np.unique(k[:, 0] * (f.max() + 1) + k[:, 1], return_inverse=True, return_counts=True)
    be = e[cnt[inv] == 1]
    nxt = {}
    for u, w in be:
        nxt.setdefault(int(u), []).append(int(w))
    loops, seen = [], set()
    for start in list(nxt):
        if start in seen:
            continue
        loop, cur = [start], start
        seen.add(start)
        while True:
            cand = [w for w in nxt.get(cur, []) if w not in seen]
            if not cand:
                break
            cur = cand[0]
            seen.add(cur)
            loop.append(cur)
        if len(loop) > 2:
            loops.append(loop)
    return loops


def _cap(v, loop, normal):
    """Tapa en abanico de un bucle de borde, orientada según 'normal'."""
    idx = np.array(loop)
    c = v[idx].mean(0)
    ci = len(v)
    tris = np.stack([idx, np.roll(idx, -1), np.full(len(idx), ci)], 1)
    p0, p1 = v[tris[0, 0]], v[tris[0, 1]]
    nrm = np.cross(p1 - p0, c - p0)
    if nrm @ np.asarray(normal) < 0:
        tris = tris[:, [1, 0, 2]]
    return c, tris


def _scalp(v, f_hair, f_head, depth=0.0030, ramp=0.0040):
    """Casquete bajo el pelo: copia de la superficie del pelo hundida hacia dentro
    (sin moverse en el nacimiento del pelo, para que encaje con la cabeza)."""
    from scipy.spatial import cKDTree
    used = np.unique(f_hair.ravel())
    vn = np.zeros_like(v)
    fn = np.cross(v[f_hair[:, 1]] - v[f_hair[:, 0]], v[f_hair[:, 2]] - v[f_hair[:, 0]])
    for k in range(3):
        np.add.at(vn, f_hair[:, k], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    rim = np.intersect1d(used, np.unique(f_head.ravel()))
    d, _ = cKDTree(v[rim]).query(v[used], k=1)
    t = np.clip(d / ramp, 0, 1)
    off = np.zeros_like(v)
    off[used] = -vn[used] * (depth * t * t * (3 - 2 * t))[:, None]
    return v + off


def build_pieces(path=MESH):
    """Devuelve {pieza: (vértices, triángulos, material)} con tapas en los cortes."""
    v, f, st = load(path)
    mat = fix_regions(v, f, st)
    piece = split_pieces(v, f, mat)
    v = smooth_surface(v, f, mat)
    out = {}
    for i, name in enumerate(PIECES):
        sel = piece == i
        fp, mp = f[sel], mat[sel]
        vv = v.copy()
        extra_v, extra_f, extra_m = [], [], []
        if name == "cabeza":
            # casquete oscuro bajo el pelo
            hair = f[(piece == 0) & (mat == 2)]
            vs = _scalp(v, hair, fp)
            base = len(vv)
            vv = np.concatenate([vv, vs])
            extra_f.append(hair + base)
            extra_m.append(np.full(len(hair), 9))
        if name != "pelo":
            for loop in _boundary_loops(fp):
                z = v[loop, 2].mean()
                if abs(z - LEG_CUT) < 0.002:
                    up = name == "piernas"
                    c, tris = _cap(vv, loop, (0, 0, 1 if up else -1))
                    m_ = 6
                elif abs(z - NECK_CUT) < 0.003:
                    up = name == "torso"
                    c, tris = _cap(vv, loop, (0, 0, 1 if up else -1))
                    m_ = 1
                else:
                    continue
                tris = tris.copy()
                tris[:, 2] = len(vv) + len(extra_v)
                extra_v.append(c)
                extra_f.append(tris)
                extra_m.append(np.full(len(tris), m_))
        if extra_v:
            vv = np.concatenate([vv, np.array(extra_v)])
        if extra_f:
            fp = np.concatenate([fp] + extra_f)
            mp = np.concatenate([mp] + extra_m)
        out[name] = (vv, fp, mp)
    return out


def build_real_yampi(path=MESH, split=True):
    """Crea Yampi en la escena. Con split=True, una pieza por objeto (para el despiece),
    cada una colgada de un vacío con su nombre. Devuelve (raíz, {pieza: vacío})."""
    mats = [_material(k, PALETTE[k]) for k in range(1, NMAT + 1)]
    root = bpy.data.objects.new("yampi", None)
    bpy.context.collection.objects.link(root)
    parts = {}
    if split:
        for name, (vv, fp, mp) in build_pieces(path).items():
            emp = bpy.data.objects.new(f"pieza_{name}", None)
            bpy.context.collection.objects.link(emp)
            emp.parent = root
            ob = make_object(f"yampi_{name}", vv, fp, mp, mats, class_weights(vv, fp, mp))
            ob.parent = emp
            parts[name] = emp
    else:
        v, f, st = load(path)
        mat = fix_regions(v, f, st)
        v = smooth_surface(v, f, mat)
        ob = make_object("yampi_real", v, f, mat, mats, class_weights(v, f, mat))
        ob.parent = root
        parts["todo"] = root
    return root, parts
