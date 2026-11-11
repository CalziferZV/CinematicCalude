"""Plató 3D: fondo continuo, peana, luces de estudio, cámara y ajustes de Cycles."""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from .model import srgb


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def render_settings(res=(1920, 1080), samples=64, denoise=True, transparent=False, persistent=True):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.device = "CPU"
    cy.samples = samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.03
    cy.adaptive_min_samples = 8
    cy.max_bounces = 4
    cy.diffuse_bounces = 2
    cy.glossy_bounces = 2
    cy.transmission_bounces = 2
    cy.volume_bounces = 0
    cy.transparent_max_bounces = 4
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    cy.use_denoising = denoise
    try:
        cy.denoiser = "OPENIMAGEDENOISE"
        cy.denoising_input_passes = "RGB_ALBEDO_NORMAL"
        cy.denoising_prefilter = "ACCURATE"
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = transparent
    sc.render.use_persistent_data = persistent
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    sc.render.image_settings.color_depth = "16"
    vs = sc.view_settings
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Medium High Contrast"
    except Exception:
        vs.view_transform = "Filmic"
    vs.exposure = 0.0
    sc.render.filter_size = 1.2
    return sc


def world(color=(10, 8, 7), strength=1.0):
    w = bpy.data.worlds.new("mundo")
    bpy.context.scene.world = w
    bg = w.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = srgb(color)
    bg.inputs["Strength"].default_value = strength
    return w


def _mat(name, color, rough=0.5, spec=0.5, emission=None, coat=0.0):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = srgb(color)
    b.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    if coat > 0:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.25
    return m


def backdrop(color=(24, 20, 18), width=8.0, depth=2.2, curve=1.2, height=4.0, z0=-0.03):
    """Ciclorama continuo: suelo que se curva hacia la pared sin horizonte."""
    import bmesh
    bm = bmesh.new()
    prof = []
    for k in range(12):
        prof.append((-depth * 2 + depth * 2 * k / 11, 0.0))
    for k in range(1, 25):
        a = math.radians(90 * k / 24)
        prof.append((curve * math.sin(a), curve * (1 - math.cos(a))))
    for k in range(1, 10):
        prof.append((curve, curve + (height - curve) * k / 9))
    rows = []
    for xi in range(2):
        x = -width / 2 + width * xi
        rows.append([bm.verts.new((x, y + depth * 0.45, z + z0)) for (y, z) in prof])
    for i in range(len(prof) - 1):
        bm.faces.new((rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i + 1]))
    me = bpy.data.meshes.new("ciclorama")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("ciclorama", me)
    bpy.context.collection.objects.link(obj)
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.materials.append(_mat("ciclorama", color, rough=0.9, spec=0.15))
    return obj


def pedestal(radius=0.11, height=0.03, color=(30, 27, 25), top=0.0):
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=radius, depth=height, location=(0, 0, top - height / 2))
    p = bpy.context.object
    p.name = "peana"
    bv = p.modifiers.new("bisel", "BEVEL")
    bv.width = 0.004
    bv.segments = 6
    for f in p.data.polygons:
        f.use_smooth = True
    p.data.materials.append(_mat("peana", color, rough=0.55, spec=0.35))
    return p


def area_light(name, loc, target, energy, size, color=(1.0, 0.9, 0.8), shape="DISK", size_y=None, spread=180):
    bpy.ops.object.light_add(type="AREA", location=loc)
    L = bpy.context.object
    L.name = name
    L.data.energy = energy
    L.data.shape = shape
    L.data.size = size
    if size_y is not None and shape in ("RECTANGLE", "ELLIPSE"):
        L.data.size_y = size_y
    L.data.color = color
    if hasattr(L.data, "spread"):
        L.data.spread = math.radians(spread)
    look_at(L, target)
    return L


def spot_light(name, loc, target, energy, angle=40, blend=0.8, color=(1.0, 0.85, 0.7), radius=0.05):
    bpy.ops.object.light_add(type="SPOT", location=loc)
    L = bpy.context.object
    L.name = name
    L.data.energy = energy
    L.data.spot_size = math.radians(angle)
    L.data.spot_blend = blend
    L.data.color = color
    L.data.shadow_soft_size = radius
    look_at(L, target)
    return L


def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def camera(name="camara", loc=(0, -1.0, 0.1), target=(0, 0, 0.1), lens=85, fstop=4.0, focus=None,
           sensor=36.0, shift_x=0.0, shift_y=0.0):
    cam_data = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = loc
    look_at(cam, target)
    cam_data.lens = lens
    cam_data.sensor_width = sensor
    cam_data.shift_x = shift_x
    cam_data.shift_y = shift_y
    cam_data.clip_start = 0.005
    cam_data.clip_end = 50
    cam_data.dof.use_dof = fstop is not None
    if fstop is not None:
        cam_data.dof.aperture_fstop = fstop
        cam_data.dof.focus_distance = focus if focus is not None else (Vector(target) - Vector(loc)).length
        cam_data.dof.aperture_blades = 7
        cam_data.dof.aperture_ratio = 1.0
    bpy.context.scene.camera = cam
    return cam


def studio_lights(mood="warm", key_energy=14.0):
    """Esquema de luz de producto: principal cálida grande, contraluz para el
    contorno, relleno suave y un halo en el fondo."""
    key = area_light("principal", (-0.36, -0.42, 0.42), (0.0, 0.0, 0.10), key_energy, 0.42,
                     color=(1.0, 0.86, 0.70))
    rim = area_light("contraluz", (0.30, 0.34, 0.30), (0.0, 0.0, 0.13), key_energy * 0.95, 0.20,
                     color=(1.0, 0.90, 0.78), shape="RECTANGLE", size_y=0.5)
    rim2 = area_light("contraluz_izq", (-0.32, 0.30, 0.26), (0.0, 0.0, 0.13), key_energy * 0.45, 0.18,
                      color=(0.95, 0.92, 0.88), shape="RECTANGLE", size_y=0.45)
    fill = area_light("relleno", (0.45, -0.35, 0.16), (0.0, 0.0, 0.10), key_energy * 0.16, 0.6,
                      color=(0.86, 0.90, 1.0))
    halo = spot_light("halo_fondo", (0.0, -0.2, 0.55), (0.0, 1.7, 0.32), 160, angle=38, blend=1.0,
                      color=(1.0, 0.78, 0.55), radius=0.2)
    return dict(key=key, rim=rim, rim2=rim2, fill=fill, halo=halo)
