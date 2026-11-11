"""Modelo 3D procedural de Yampi (Blender / bpy).

Construido en "unidades de figura" (altura total ≈ 2.0, suelo en Z=0, frente
mirando a -Y) y escalado a 0,2 m reales mediante un empty padre, para que la
profundidad de campo y la luz se comporten como en una figura de 20 cm.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

SCALE = 0.1  # unidades de figura -> metros (figura de ~20 cm)


# --------------------------------------------------------------------------- #
# Materiales
# --------------------------------------------------------------------------- #
def srgb(c):
    def f(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def _bsdf(m):
    return m.node_tree.nodes["Principled BSDF"]


def material(name, color, rough=0.5, spec=0.5, sss=0.0, sheen=0.0, coat=0.0, bump=None):
    m = bpy.data.materials.new(name)
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    if sss > 0:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.45, 0.25)
        b.inputs["Subsurface Scale"].default_value = 0.004
    if sheen > 0:
        b.inputs["Sheen Weight"].default_value = sheen
    if coat > 0:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.3
    return m


def wood_material(name, color, dark):
    """Tapa de la guitarra: madera clara con vetas suaves."""
    m = material(name, color, rough=0.48)
    nt = m.node_tree
    b = _bsdf(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1.0, 7.0, 1.0)
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 3.2
    wave.inputs["Distortion"].default_value = 6.0
    wave.inputs["Detail"].default_value = 3.0
    wave.inputs["Detail Roughness"].default_value = 0.55
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = srgb(color)
    ramp.color_ramp.elements[1].color = srgb(dark)
    ramp.color_ramp.elements[0].position = 0.55
    ramp.color_ramp.elements[1].position = 1.0
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], wave.inputs["Vector"])
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    bump.inputs["Distance"].default_value = 0.0004
    nt.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def make_materials():
    return dict(
        skin=material("piel", (158, 94, 70), rough=0.44),
        skin_dark=material("pelo_base", (46, 30, 24), rough=0.72),
        hair=material("pelo", (140, 110, 89), rough=0.52),
        shirt=material("camiseta", (234, 230, 223), rough=0.62, sheen=0.25),
        pants=material("pantalon", (14, 74, 166), rough=0.42),
        shoes=material("zapatos", (22, 23, 27), rough=0.55),
        red=material("rojo", (196, 22, 32), rough=0.32),
        eye=material("ojo", (240, 238, 234), rough=0.25),
        pupil=material("pupila", (42, 42, 48), rough=0.18),
        line=material("trazo", (26, 26, 30), rough=0.35),
        wood=wood_material("madera", (186, 142, 104), (166, 124, 90)),
        wood_side=material("madera_lateral", (104, 68, 50), rough=0.45),
        hole=material("boca", (44, 40, 38), rough=0.55),
        rosette=material("roseta", (96, 92, 88), rough=0.4),
        string=material("cuerdas", (204, 172, 132), rough=0.38),
        bridge=material("puente", (30, 30, 33), rough=0.35),
    )


# --------------------------------------------------------------------------- #
# Utilidades de geometría
# --------------------------------------------------------------------------- #
def _link(obj, parent):
    obj.parent = parent
    return obj


def smooth_obj(obj, levels=2, render_levels=None):
    for p in obj.data.polygons:
        p.use_smooth = True
    m = obj.modifiers.new("subsurf", "SUBSURF")
    m.levels = levels
    m.render_levels = render_levels if render_levels is not None else levels
    return obj


def mesh_from_bm(name, bm, mat, parent):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return _link(obj, parent)


def ellipsoid(name, center, radii, mat, parent, rot=(0, 0, 0), seg=24, rings=16, levels=2):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    bmesh.ops.scale(bm, vec=Vector(radii), verts=bm.verts)
    obj = mesh_from_bm(name, bm, mat, parent)
    obj.location = center
    obj.rotation_euler = Euler(rot) if not isinstance(rot, Quaternion) else rot.to_euler()
    return smooth_obj(obj, levels)


def tube(name, points, radius, mat, parent, radii=None, res=16, caps=True):
    """Tubo suave a lo largo de una polilínea (curva con biselado)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = 12
    cu.bevel_depth = radius
    cu.bevel_resolution = 6
    cu.use_fill_caps = caps
    sp = cu.splines.new("NURBS")
    sp.points.add(len(points) - 1)
    for i, p in enumerate(points):
        w = 1.0
        sp.points[i].co = (p[0], p[1], p[2], w)
        if radii is not None:
            sp.points[i].radius = radii[i]
    sp.use_endpoint_u = True
    sp.order_u = min(4, len(points))
    obj = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return _link(obj, parent)


def capsule(name, a, b, radius, mat, parent, levels=2):
    """Cápsula entre dos puntos (cilindro con extremos redondeados)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=radius)
    for v in bm.verts:
        if v.co.z > 0:
            v.co.z += L
    obj = mesh_from_bm(name, bm, mat, parent)
    obj.location = a
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return smooth_obj(obj, levels)


def surface_point(obj, origin, direction):
    """Lanza un rayo desde dentro del objeto (coordenadas de la figura) y
    devuelve el punto y la normal de la superficie evaluada."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    # todo en coordenadas locales del objeto (que comparte padre con el resto)
    ml = obj.matrix_local
    mli = ml.inverted()
    o = mli @ Vector(origin)
    d = (mli.to_3x3() @ Vector(direction)).normalized()
    hit, loc, nor, idx = ev.ray_cast(o + d * 3.0, -d)  # desde fuera hacia dentro
    if not hit:
        return Vector(origin) + Vector(direction), Vector(direction).normalized()
    loc_w = ml @ loc
    nor_w = (ml.to_3x3().inverted().transposed() @ nor).normalized()
    return loc_w, nor_w


def orient(normal, up=Vector((0, 0, 1))):
    """Rotación que lleva el eje Z local a la normal, manteniendo Y hacia arriba."""
    z = Vector(normal).normalized()
    x = up.cross(z)
    if x.length < 1e-4:
        x = Vector((1, 0, 0))
    x.normalize()
    y = z.cross(x)
    M = Matrix((x, y, z)).transposed()
    return M.to_euler()


def sph_dir(az_deg, el_deg):
    az, el = math.radians(az_deg), math.radians(el_deg)
    return Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))


# --------------------------------------------------------------------------- #
# Partes del cuerpo
# --------------------------------------------------------------------------- #
HEAD_C = Vector((0.0, 0.0, 1.55))
HEAD_R = (0.266, 0.248, 0.272)


def build_head(M, root):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # mofletes: más ancho en la parte baja, barbilla redondeada
        cheek = math.exp(-((z + 0.38) / 0.36) ** 2)
        sx = 1.0 + 0.10 * cheek
        sy = 1.0 + 0.04 * cheek
        # cara algo más plana por delante
        if y < 0:
            sy *= 1.0 - 0.06 * max(0.0, -y) * (1 - abs(z))
        # barbilla: un poco más estrecha al final
        if z < -0.75:
            sx *= 1.0 - 0.25 * (-0.75 - z)
        v.co = Vector((x * HEAD_R[0] * sx, y * HEAD_R[1] * sy, z * HEAD_R[2]))
    head = mesh_from_bm("cabeza", bm, M["skin"], root)
    head.location = HEAD_C
    smooth_obj(head, 2)
    return head


def place_on(head, az, el, name, radii, mat, root, lift=0.0, spin=0.0, levels=2):
    d = sph_dir(az, el)
    p, n = surface_point(head, HEAD_C, d)
    e = orient(n)
    obj = ellipsoid(name, p + n * lift, radii, mat, root, rot=(0, 0, 0), levels=levels)
    R = e.to_matrix() @ Matrix.Rotation(math.radians(spin), 3, "Z")
    obj.rotation_euler = R.to_euler()
    return obj, p, n


def surface_curve(head, pts_angles, radius, mat, root, name, lift=0.006):
    pts = []
    for az, el in pts_angles:
        p, n = surface_point(head, HEAD_C, sph_dir(az, el))
        pts.append(p + n * lift)
    return tube(name, pts, radius, mat, root)


def build_face(M, head, root):
    objs = []
    for side in (-1, 1):
        az = 21 * side
        ew, p, n = place_on(head, az, 3, f"ojo_{side}", (0.054, 0.064, 0.026), M["eye"], root, lift=0.004)
        objs.append(ew)
        # pupila sobre el blanco del ojo
        front = p + n * 0.026
        pu = ellipsoid(f"pupila_{side}", front - n * 0.006 + Vector((-0.004 * side, 0, 0.002)),
                           (0.030, 0.036, 0.012), M["pupil"], root)
        pu.rotation_euler = orient(n)
        objs.append(pu)
        # brillo
        hl = ellipsoid(f"brillo_{side}", front + n * 0.005 + Vector((-0.008, 0, 0.012)), (0.0065, 0.0065, 0.004),
                       M["eye"], root, levels=1)
        hl.rotation_euler = orient(n)
        objs.append(hl)
        # ceja
        objs.append(surface_curve(head, [(az - 10, 17.0), (az - 4.5, 20.6), (az + 4.5, 20.6), (az + 10, 17.0)],
                                  0.0042, M["line"], root, f"ceja_{side}", lift=0.004))
        # oreja
        ear, _, _ = place_on(head, 84 * side, 1, f"oreja_{side}", (0.050, 0.082, 0.028), M["skin"], root,
                             lift=0.004, spin=-24 * side)
        objs.append(ear)
    nose, _, _ = place_on(head, 0, -11, "nariz", (0.036, 0.027, 0.026), M["red"], root, lift=0.012)
    objs.append(nose)
    smile = [(-8, -21), (-4, -24.5), (0, -25.8), (4, -24.5), (8, -21)]
    objs.append(surface_curve(head, smile, 0.0062, M["line"], root, "boca"))
    return objs


def _sphere_pt(az, el, r, center=HEAD_C, sx=1.0, sy=1.0, sz=1.0):
    d = sph_dir(az, el)
    return center + Vector((d.x * r * sx, d.y * r * sy, d.z * r * sz))


def build_hair(M, root):
    """Base de pelo oscura (patillas y nacimiento) + volumen color topo hecho de
    mechones curvos que nacen en la coronilla y caen en abanico sobre la frente."""
    def hairline_base(az):
        a = abs(((az + 180) % 360) - 180)
        if a < 55:
            return 21 - 4 * (a / 55)
        if a < 98:
            t = (a - 55) / 43
            return 17 - 30 * t ** 1.2
        return -12 - 16 * min(1, (a - 98) / 82)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=44, radius=1.0)
    kill = []
    for v in bm.verts:
        x, y, z = v.co
        az = math.degrees(math.atan2(x, -y))
        el = math.degrees(math.asin(max(-1, min(1, z))))
        if el < hairline_base(az):
            kill.append(v)
        cheek = math.exp(-((z + 0.38) / 0.36) ** 2)
        v.co = Vector((x * HEAD_R[0] * (1.03 + 0.1 * cheek), y * HEAD_R[1] * 1.035, z * HEAD_R[2] * 1.03))
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    base = mesh_from_bm("pelo_base", bm, M["skin_dark"], root)
    base.location = HEAD_C
    so = base.modifiers.new("grosor", "SOLIDIFY")
    so.thickness = 0.012
    smooth_obj(base, 2)

    objs = [base]

    def slerp(a, b, t):
        a, b = a.normalized(), b.normalized()
        om = math.acos(max(-1.0, min(1.0, a.dot(b))))
        if om < 1e-4:
            return a
        return (a * math.sin((1 - t) * om) + b * math.sin(t * om)) / math.sin(om)

    def to_head(d, r):
        return HEAD_C + Vector((d.x * r * HEAD_R[0] / 0.262, d.y * r * HEAD_R[1] / 0.262,
                                d.z * r * HEAD_R[2] / 0.262))

    # cúpula de relleno bajo los mechones
    def dome_edge(az):
        a = abs(((az + 180) % 360) - 180)
        if a < 70:
            return 24 - 7 * (az / 70)
        if a < 110:
            return (24 - 7 * math.copysign(1, az)) - 20 * (a - 70) / 40
        return 0 - 14 * min(1, (a - 110) / 70)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=72, v_segments=44, radius=1.0)
    kill = []
    for v in bm.verts:
        x, y, z = v.co
        az = math.degrees(math.atan2(x, -y))
        el = math.degrees(math.asin(max(-1, min(1, z))))
        if el < dome_edge(az):
            kill.append(v)
        v.co = Vector((x * HEAD_R[0] * 1.06, y * HEAD_R[1] * 1.07, z * HEAD_R[2] * 1.07 + 0.008))
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    dome = mesh_from_bm("pelo_cupula", bm, M["hair"], root)
    dome.location = HEAD_C
    so = dome.modifiers.new("grosor", "SOLIDIFY")
    so.thickness = 0.03
    so.offset = -1
    smooth_obj(dome, 2)
    objs.append(dome)

    # mechones peinados en diagonal: (az_ini, el_ini, az_fin, el_fin, grosor, abultamiento)
    R0 = 0.262
    strands = [
        (-165, 18, -72, 21, 0.064, 1.06),
        (-152, 34, -47, 29, 0.074, 1.10),
        (-140, 48, -20, 32, 0.080, 1.14),
        (-124, 58, 8, 32, 0.084, 1.16),
        (-100, 66, 35, 28, 0.084, 1.16),
        (-62, 72, 60, 20, 0.080, 1.14),
        (-22, 70, 82, 10, 0.074, 1.10),
        (18, 62, 100, 0, 0.066, 1.06),
        (-118, 44, 176, -6, 0.070, 1.06),
        (-88, 56, 142, -6, 0.070, 1.08),
        (-170, 40, -142, -8, 0.066, 1.04),
        (40, 58, 122, -4, 0.062, 1.05),
    ]
    for i, (az0, el0, az1, el1, thick, puff) in enumerate(strands):
        d0, d1 = sph_dir(az0, el0), sph_dir(az1, el1)
        front = abs(az1) < 105
        pts, radii = [], []
        n = 12
        for k in range(n):
            t = k / (n - 1)
            d = slerp(d0, d1, t)
            r = R0 * (1.02 + (puff - 1.0) * math.sin(math.pi * min(1.0, t * 1.08)))
            if front and t > 0.78:
                u = (t - 0.78) / 0.22
                d = (d + Vector((0, -0.06 * u, -0.10 * u * u))).normalized()
                r *= 1.0 + 0.06 * u
            pts.append(to_head(d, r))
            body = math.sin(math.pi * min(1.0, 0.16 + t * 0.80))
            tip = 1.0 if t < 0.72 else max(0.0, 1.0 - ((t - 0.72) / 0.28) ** 1.6)
            radii.append((0.42 + 0.58 * body) * (0.30 + 0.70 * tip))
        objs.append(tube(f"mechon_{i}", pts, thick, M["hair"], root, radii=radii))

    # antenas
    for side in (-1, 1):
        base_p = HEAD_C + Vector((0.085 * side, 0.03, 0.27))
        tip = base_p + Vector((0.03 * side, 0.005, 0.185))
        objs.append(capsule(f"antena_{side}", base_p, tip, 0.0135, M["red"], root))
        objs.append(ellipsoid(f"bola_{side}", tip + (tip - base_p).normalized() * 0.012, (0.028, 0.028, 0.030),
                              M["red"], root))
    return objs


# --------------------------------------------------------------------------- #
# Cuerpo, guitarra, piernas
# --------------------------------------------------------------------------- #
def build_torso(M, root):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=5, use_grid_fill=True)
    z0, z1 = 0.58, 1.31
    for v in bm.verts:
        x, y, z = v.co  # -0.5..0.5
        t = z + 0.5
        w = 0.54 + 0.10 * (1 - t) ** 1.6
        dpt = 0.31 + 0.03 * (1 - t)
        sh = 1.0 - 0.16 * max(0.0, t - 0.84) / 0.16
        v.co = Vector((x * w * sh, y * dpt, z0 + t * (z1 - z0)))
    torso = mesh_from_bm("camiseta", bm, M["shirt"], root)
    smooth_obj(torso, 3)
    neck = capsule("cuello", (0, 0.0, 1.20), (0, 0.0, 1.34), 0.078, M["skin"], root)
    # escote en pico: triángulo fino pegado a la superficie de la camiseta
    bm = bmesh.new()
    yf = -0.158
    vs = [bm.verts.new(p) for p in ((-0.072, yf, 1.302), (0.072, yf, 1.302), (0.0, yf - 0.004, 1.215))]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=Vector((0, 0.03, 0)), verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    vneck = mesh_from_bm("escote", bm, M["skin"], root)
    bvv = vneck.modifiers.new("bisel", "BEVEL")
    bvv.width = 0.006
    bvv.segments = 3
    sleeves = []
    for side in (-1, 1):
        a = (0.245 * side, -0.005, 1.18)
        b = (0.325 * side, -0.02, 1.03)
        sleeves.append(capsule(f"manga_{side}", a, b, 0.095, M["shirt"], root))
    return [torso, neck, vneck, *sleeves]


GUITAR_ANGLE = math.radians(37)   # inclinación del mástil sobre la horizontal
GUITAR_Y = -0.262                  # plano de la tapa (delante del torso)
BODY_C = Vector((0.125, GUITAR_Y, 0.900))


def guitar_frame():
    """Ejes locales de la guitarra: u a lo largo del mástil (hacia el clavijero),
    v perpendicular en el plano de la tapa, n normal saliente (-Y)."""
    u = Vector((-math.cos(GUITAR_ANGLE), 0.0, math.sin(GUITAR_ANGLE)))
    n = Vector((0.0, -1.0, 0.0))
    v = n.cross(u)
    return u, v, n


def guitar_outline(n_pts=200):
    """Contorno clásico de guitarra acústica en coordenadas (u, v)."""
    pts = []
    lobes = ((-0.14, 0.235), (0.20, 0.180))
    for i in range(n_pts):
        t = 2 * math.pi * i / n_pts
        dx, dy = math.cos(t), math.sin(t)
        best = 0.0
        for (cu, r) in lobes:
            b = -2 * cu * dx
            c = cu * cu - r * r
            disc = b * b - 4 * c
            if disc >= 0:
                best = max(best, (-b + math.sqrt(disc)) / 2)
        waist = 1.0 - 0.13 * math.exp(-((dx - 0.16) / 0.20) ** 2) * abs(dy)
        r = best * waist
        pts.append((dx * r, dy * r))
    return pts


def _extrude(name, poly3d, offset, mat, root, bevel=0.0, segs=4):
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in poly3d]
    face = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    nv = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=offset, verts=nv)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = mesh_from_bm(name, bm, mat, root)
    if bevel > 0:
        bv = obj.modifiers.new("bisel", "BEVEL")
        bv.width = bevel
        bv.segments = segs
        bv.limit_method = "ANGLE"
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def rounded_rect(cu, cv, half_u, half_v, r, n=10):
    pts = []
    corners = ((half_u - r, half_v - r, 0), (-half_u + r, half_v - r, 90), (-half_u + r, -half_v + r, 180),
               (half_u - r, -half_v + r, 270))
    for (x, y, a0) in corners:
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cu + x + r * math.cos(a), cv + y + r * math.sin(a)))
    return pts


def build_guitar(M, root):
    u, v, n = guitar_frame()
    objs = []
    outline = guitar_outline()
    thick = 0.125

    def to3(pu, pv, pn=0.0):
        return BODY_C + u * pu + v * pv + n * pn

    objs.append(_extrude("guitarra_cuerpo", [to3(a, b, -thick) for a, b in outline], n * (thick - 0.012),
                         M["wood_side"], root, bevel=0.014, segs=5))
    objs.append(_extrude("guitarra_tapa", [to3(a * 0.982, b * 0.982, -0.013) for a, b in outline], n * 0.015,
                         M["wood"], root, bevel=0.004, segs=3))
    # boca y roseta
    hole_c = to3(0.085, 0.0, 0.0028)
    bpy.ops.mesh.primitive_cylinder_add(vertices=72, radius=0.066, depth=0.004, location=hole_c)
    hole = bpy.context.object
    hole.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
    hole.data.materials.append(M["hole"])
    _link(hole, root)
    objs.append(hole)
    for rr, mr in ((0.078, 0.0055), (0.090, 0.0035)):
        bpy.ops.mesh.primitive_torus_add(major_radius=rr, minor_radius=mr, major_segments=72, location=hole_c)
        ros = bpy.context.object
        ros.rotation_euler = n.to_track_quat("Z", "Y").to_euler()
        ros.data.materials.append(M["rosette"])
        _link(ros, root)
        for p in ros.data.polygons:
            p.use_smooth = True
        objs.append(ros)
    # puente oscuro
    objs.append(_extrude("puente", [to3(a, b, 0.002) for a, b in rounded_rect(-0.165, 0.0, 0.022, 0.085, 0.012)],
                         n * 0.012, M["bridge"], root, bevel=0.003))
    # mástil
    nk = [to3(a, b, -0.05) for a, b in rounded_rect(0.56, 0.0, 0.29, 0.038, 0.006)]
    objs.append(_extrude("mastil", nk, n * 0.05, M["wood"], root, bevel=0.010, segs=4))
    # clavijero: pala redondeada
    hd = [to3(a, b, -0.042) for a, b in rounded_rect(0.94, 0.0, 0.11, 0.064, 0.035)]
    objs.append(_extrude("clavijero", hd, n * 0.04, M["wood"], root, bevel=0.010, segs=4))
    # clavijas: tallo + aro (como las del modelo impreso)
    for k in range(3):
        for side in (-1, 1):
            pc = to3(0.875 + k * 0.062, side * 0.064, -0.022)
            tip = pc + v * side * 0.048
            objs.append(capsule(f"clavija_tallo_{k}_{side}", pc, tip, 0.0085, M["wood"], root))
            bpy.ops.mesh.primitive_torus_add(major_radius=0.019, minor_radius=0.0085, major_segments=40,
                                             minor_segments=16, location=tip + v * side * 0.016)
            ring = bpy.context.object
            ring.rotation_euler = u.to_track_quat("Z", "Y").to_euler()
            ring.data.materials.append(M["wood"])
            _link(ring, root)
            for p in ring.data.polygons:
                p.use_smooth = True
            objs.append(ring)
    # cuerdas
    for s_ in range(6):
        off = (s_ - 2.5) * 0.0118
        a = to3(-0.165, off * 1.05, 0.018)
        b = to3(0.84, off * 0.80, 0.004)
        objs.append(tube(f"cuerda_{s_}", [a, (a + b) / 2 + n * 0.006, b], 0.0030, M["string"], root))
    # trastes
    for k in range(9):
        cu_ = 0.34 + k * 0.052
        a = to3(cu_, -0.037, 0.0015)
        b = to3(cu_, 0.037, 0.0015)
        objs.append(tube(f"traste_{k}", [a, (a + b) / 2, b], 0.0018, M["bridge"], root))
    return objs


def build_arms(M, root):
    u, v, n = guitar_frame()
    objs = []
    Rm = Matrix((u, v, n)).transposed().to_euler()
    # brazo izquierdo (del espectador): baja al codo y sube hasta el mástil
    sh_l = Vector((-0.305, -0.03, 1.09))
    el_l = Vector((-0.43, -0.13, 0.86))
    hand_l = BODY_C + u * 0.70 + n * 0.035
    objs.append(tube("brazo_izq", [sh_l, Vector((-0.40, -0.08, 0.95)), el_l, el_l + Vector((0.035, -0.06, 0.12)),
                                   hand_l + Vector((-0.01, 0.0, -0.06))],
                     0.066, M["skin"], root, radii=[1.0, 1.0, 1.0, 0.95, 0.88]))
    objs.append(ellipsoid("mano_izq", hand_l + n * 0.02, (0.064, 0.055, 0.060), M["skin"], root, rot=Rm))
    for k in range(4):
        fpos = hand_l + n * 0.05 + u * (0.036 - k * 0.024) + v * 0.012
        objs.append(ellipsoid(f"dedo_izq_{k}", fpos, (0.019, 0.036, 0.021), M["skin"], root, rot=Rm))
    objs.append(ellipsoid("pulgar_izq", hand_l - v * 0.045 + n * 0.0, (0.02, 0.04, 0.02), M["skin"], root, rot=Rm))
    # brazo derecho: baja por el costado y cruza hacia las cuerdas
    sh_r = Vector((0.305, -0.03, 1.09))
    el_r = Vector((0.415, -0.10, 0.88))
    hand_r = BODY_C + u * 0.0 + v * -0.035 + n * 0.05 + Vector((0.075, 0, -0.005))
    objs.append(tube("brazo_der", [sh_r, Vector((0.39, -0.06, 0.98)), el_r, el_r + Vector((-0.07, -0.13, -0.035)),
                                   hand_r + Vector((0.05, 0.03, 0.0))],
                     0.066, M["skin"], root, radii=[1.0, 1.0, 1.0, 0.95, 0.88]))
    objs.append(ellipsoid("mano_der", hand_r + n * 0.01, (0.066, 0.052, 0.058), M["skin"], root, rot=Rm))
    for k in range(4):
        fpos = hand_r + n * 0.03 + v * (0.04 - k * 0.025) + u * -0.032
        objs.append(ellipsoid(f"dedo_der_{k}", fpos, (0.019, 0.018, 0.034), M["skin"], root, rot=Rm))
    return objs


def build_legs(M, root):
    objs = []
    for side in (-1, 1):
        x = 0.108 * side
        objs.append(capsule(f"pierna_{side}", (x, 0.0, 0.15), (x * 1.02, 0.0, 0.66), 0.078, M["pants"], root))
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for vv in bm.verts:
            xx, yy, zz = vv.co
            taper = 1.0 - 0.18 * (zz + 0.5)
            vv.co = Vector((xx * 0.15 * taper, yy * 0.27 - 0.07, (zz + 0.5) * 0.14))
        shoe = mesh_from_bm(f"zapato_{side}", bm, M["shoes"], root)
        shoe.location = (x * 1.06, -0.015, -0.022)
        shoe.rotation_euler = (0, 0, math.radians(-7 * side))
        smooth_obj(shoe, 3)
        objs.append(shoe)
    return objs


PARTS = ("cabeza", "pelo", "torso", "piernas")


def build_yampi(scale=SCALE, location=(0, 0, 0)):
    """Construye la figura completa. Devuelve (raíz, dict de partes -> raíces)."""
    M = make_materials()
    root = bpy.data.objects.new("Yampi", None)
    bpy.context.collection.objects.link(root)
    root.scale = (scale, scale, scale)
    root.location = location
    parts = {}
    for p in PARTS:
        e = bpy.data.objects.new(f"parte_{p}", None)
        bpy.context.collection.objects.link(e)
        e.parent = root
        parts[p] = e
    head = build_head(M, parts["cabeza"])
    build_face(M, head, parts["cabeza"])
    hair = build_hair(M, parts["pelo"])
    hair[0].parent = parts["cabeza"]  # nacimiento oscuro impreso con la cabeza
    torso_objs = build_torso(M, parts["torso"])
    torso_objs[1].parent = parts["cabeza"]  # el cuello va con la cabeza
    build_guitar(M, parts["torso"])
    build_arms(M, parts["torso"])
    build_legs(M, parts["piernas"])
    return root, parts, M
