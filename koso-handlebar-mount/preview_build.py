"""Builds the same geometry as the Fusion 360 script with manifold3d,
exports STLs and renders preview images. Units: mm.
Bar axis = X, Z up, bar centre at origin."""
import math, sys, os
import numpy as np
import manifold3d as m3
import trimesh

P = dict(
    bar_d=22.2, bar_clear=0.4, gap=1.0, clamp_w=20.0, clamp_wall=4.0,
    bolt_d=5.5, nut_af=8.2, nut_depth=4.5, cbore_d=9.5, cbore_depth=2.0,
    tray_in_x=70.0, tray_in_y=40.0, tray_depth=14.0, tray_wall=2.4, tray_floor=3.0,
    ear_r=6.0, ear_t=5.0, end_margin=6.5,
    slot_len=14.0, slot_w=12.0, notch_w=12.0, notch_d=6.0,
)
R = (P['bar_d'] + P['bar_clear']) / 2
H = R + P['clamp_wall']
g = P['gap'] / 2
tox = P['tray_in_x'] + 2*P['tray_wall']
toy = P['tray_in_y'] + 2*P['tray_wall']
yb = toy/2 + P['ear_r'] - 1.0          # bolt centre offset
L = 2*(yb + P['end_margin'])            # clamp length (Y)
SEG = 96

def box(x0, x1, y0, y1, z0, z1):
    return m3.Manifold.cube([x1-x0, y1-y0, z1-z0]).translate([x0, y0, z0])
def cyl_z(x, y, r, z0, z1, n=SEG):
    return m3.Manifold.cylinder(z1-z0, r, r, n).translate([x, y, z0])
def cyl_x(r, x0, x1):
    return m3.Manifold.cylinder(x1-x0, r, r, SEG).rotate([0, 90, 0]).translate([x0, 0, 0])
def hex_z(x, y, af, z0, z1):
    r = af/2/math.cos(math.pi/6)
    return m3.Manifold.cylinder(z1-z0, r, r, 6).translate([x, y, z0])

w2 = P['clamp_w']/2
bar = cyl_x(R, -100, 100)
holes = cyl_z(0, yb, P['bolt_d']/2, -50, 80) + cyl_z(0, -yb, P['bolt_d']/2, -50, 80)

upper = box(-w2, w2, -L/2, L/2, g, H) - bar - holes
lower = box(-w2, w2, -L/2, L/2, -H, -g) - bar - holes
for s in (1, -1):
    lower -= hex_z(0, s*yb, P['nut_af'], -H-1, -H+P['nut_depth'])

z0 = H
tray = box(-tox/2, tox/2, -toy/2, toy/2, z0, z0+P['tray_floor']+P['tray_depth'])
tray -= box(-P['tray_in_x']/2, P['tray_in_x']/2, -P['tray_in_y']/2, P['tray_in_y']/2,
            z0+P['tray_floor'], z0+100)
for s in (1, -1):
    ear = cyl_z(0, s*yb, P['ear_r'], z0, z0+P['ear_t']) + \
          box(-P['ear_r'], P['ear_r'], min(s*toy/2*0.9, s*yb), max(s*toy/2*0.9, s*yb), z0, z0+P['ear_t'])
    tray += ear
tray -= holes
for s in (1, -1):
    tray -= cyl_z(0, s*yb, P['cbore_d']/2, z0+P['ear_t']-P['cbore_depth'], z0+P['ear_t']+1)
# cable slot in floor + notch in +X wall
sx1 = P['tray_in_x']/2 - 3
tray -= box(sx1-P['slot_len'], sx1, -P['slot_w']/2, P['slot_w']/2, z0-1, z0+P['tray_floor']+1)
ztop = z0+P['tray_floor']+P['tray_depth']
tray -= box(P['tray_in_x']/2-1, tox/2+1, -P['notch_w']/2, P['notch_w']/2, ztop-P['notch_d'], ztop+1)

def to_tm(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(mesh.vert_properties[:, :3], mesh.tri_verts)

out = os.path.dirname(os.path.abspath(__file__))
parts = {'tray': tray, 'clamp_upper': upper, 'clamp_lower': lower}
tms = {}
for k, v in parts.items():
    t = to_tm(v); tms[k] = t
    print(f"{k}: watertight={t.is_watertight} vol={t.volume/1000:.1f} cm3 bbox={np.round(t.extents,1)}")
# print orientation exports (flat side down)
to_tm(tray).export(f"{out}/stl/tray.stl")
to_tm(upper.rotate([180, 0, 0])).export(f"{out}/stl/clamp_upper.stl")
to_tm(lower).export(f"{out}/stl/clamp_lower.stl")
print(f"R={R:.2f} H={H:.2f} bolt_offset={yb:.2f} spacing={2*yb:.2f} clamp_len={L:.2f}")

if len(sys.argv) > 1:
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    cols = {'tray': '#f2b632', 'clamp_upper': '#e8a020', 'clamp_lower': '#d08a10'}
    def draw(ax, offs, title):
        for k, t in tms.items():
            tt = t.copy(); tt.apply_translation(offs[k])
            n = tt.face_normals; light = np.clip(n @ np.array([0.4, -0.5, 0.8]), 0.15, 1)
            base = np.array(matplotlib.colors.to_rgb(cols[k]))
            pc = Poly3DCollection(tt.vertices[tt.faces], facecolors=base*light[:, None]*0.9+0.08, linewidths=0)
            ax.add_collection3d(pc)
        ax.set_xlim(-45, 45); ax.set_ylim(-45, 45); ax.set_zlim(-45+offs['clamp_lower'][2]/2, 45+offs['tray'][2]/2)
        ax.set_box_aspect((1, 1, 1)); ax.view_init(25, -55); ax.set_axis_off(); ax.set_title(title)
    fig = plt.figure(figsize=(12, 6))
    draw(fig.add_subplot(121, projection='3d'), {k: [0, 0, 0] for k in tms}, 'Montado')
    draw(fig.add_subplot(122, projection='3d'), {'tray': [0, 0, 25], 'clamp_upper': [0, 0, 8], 'clamp_lower': [0, 0, -10]}, 'Explosionado')
    plt.tight_layout(); plt.savefig(sys.argv[1], dpi=110)
