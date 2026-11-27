"""Misma geometria que el script de Fusion 360, con manifold3d: exporta STL y
renderiza vista previa. Unidades mm. Eje manillar = X, Z arriba, centro en origen."""
import math, sys, os
import numpy as np
import manifold3d as m3
import trimesh

P = dict(
    bar_d=28.0, bar_clear=0.4, gap=1.0, clamp_w=20.0, arch_t=4.0,
    lug_h_up=6.0, lug_h_low=8.0, end_margin=6.5, corner_r=4.0,
    bolt_d=5.5, nut_af=8.2, nut_depth=4.5, cbore_d=9.5, cbore_depth=2.0,
    tray_in_x=70.0, tray_in_y=40.0, tray_depth=14.0, tray_wall=2.4, tray_floor=3.0,
    ear_t=5.0, saddle_clear=0.3, floor_gap=1.0,
    ledge_w=10.0, ledge_h=4.0, hole_x=14.0, hole_y=12.0,
)
R = (P['bar_d'] + P['bar_clear']) / 2
Ro = R + P['arch_t']
g = P['gap'] / 2
tox = P['tray_in_x'] + 2*P['tray_wall']
toy = P['tray_in_y'] + 2*P['tray_wall']
yb = toy/2 + 5.0
L = 2*(yb + P['end_margin'])
w2 = P['clamp_w']/2
zt = Ro + P['floor_gap']                    # base de la bandeja
ztop = zt + P['tray_floor'] + P['tray_depth']
zlug = g + P['lug_h_up']
SEG = 128

def box(x0, x1, y0, y1, z0, z1):
    return m3.Manifold.cube([x1-x0, y1-y0, z1-z0]).translate([x0, y0, z0])
def rbox(x0, x1, y0, y1, z0, z1, r):
    cs = m3.CrossSection.square([x1-x0-2*r, y1-y0-2*r]).translate([x0+r, y0+r]).offset(r, m3.JoinType.Round, circular_segments=48)
    return m3.Manifold.extrude(cs, z1-z0).translate([0, 0, z0])
def cyl_z(x, y, r, z0, z1, n=SEG):
    return m3.Manifold.cylinder(z1-z0, r, r, n).translate([x, y, z0])
def cyl_x(r, x0=-100, x1=100):
    return m3.Manifold.cylinder(x1-x0, r, r, SEG).rotate([0, 90, 0]).translate([x0, 0, 0])
def hex_z(x, y, af, z0, z1):
    r = af/2/math.cos(math.pi/6)
    return m3.Manifold.cylinder(z1-z0, r, r, 6).translate([x, y, z0])

holes = cyl_z(0, yb, P['bolt_d']/2, -60, 80) + cyl_z(0, -yb, P['bolt_d']/2, -60, 80)
cr = P['corner_r']

upper = (box(-w2, w2, -Ro, Ro, g, Ro) ^ cyl_x(Ro)) + rbox(-w2, w2, -L/2, L/2, g, zlug, cr)
upper = upper - cyl_x(R) - holes
zlow = -(g + P['lug_h_low'])
lower = (box(-w2, w2, -Ro, Ro, -Ro, -g) ^ cyl_x(Ro)) + rbox(-w2, w2, -L/2, L/2, zlow, -g, cr)
lower = lower - cyl_x(R) - holes
for s in (1, -1):
    lower -= hex_z(0, s*yb, P['nut_af'], zlow-1, zlow+P['nut_depth'])

mount = rbox(-w2, w2, -L/2, L/2, zlug, zt+P['ear_t'], cr) - cyl_x(Ro + P['saddle_clear'])
tray = mount + rbox(-tox/2, tox/2, -toy/2, toy/2, zt, ztop, 2.0)
ix, iy = P['tray_in_x']/2, P['tray_in_y']/2
zf = zt + P['tray_floor']
tray -= box(-ix, ix, -iy, iy, zf, ztop+1)
tray += box(-ix, ix, -iy, -iy+P['ledge_w'], zf-0.01, zf+P['ledge_h'])
tray -= box(-ix+3, -ix+3+P['hole_x'], iy-P['hole_y'], iy, zt-1, zf+1)   # agujero de cable en el fondo
tray -= holes
for s in (1, -1):
    tray -= cyl_z(0, s*yb, P['cbore_d']/2, zt+P['ear_t']-P['cbore_depth'], zt+P['ear_t']+1)

def to_tm(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(mesh.vert_properties[:, :3], mesh.tri_verts)

out = os.path.dirname(os.path.abspath(__file__))
parts = {'tray': tray, 'clamp_upper': upper, 'clamp_lower': lower}
tms = {}
for k, v in parts.items():
    t = to_tm(v); tms[k] = t
    print(f"{k}: watertight={t.is_watertight} vol={t.volume/1000:.1f} cm3 bbox={np.round(t.extents,1)}")
to_tm(tray).export(f"{out}/stl/tray.stl")
to_tm(upper.rotate([180, 0, 0])).export(f"{out}/stl/clamp_upper.stl")
to_tm(lower).export(f"{out}/stl/clamp_lower.stl")
head_seat = zt + P['ear_t'] - P['cbore_depth']
print(f"R={R:.2f} Ro={Ro:.2f} bolt_spacing={2*yb:.1f} clamp_len={L:.1f} grip(head seat->bottom)={head_seat-zlow:.1f}")

if len(sys.argv) > 1:
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    col = np.array(matplotlib.colors.to_rgb('#f2b632'))
    def draw(ax, offs, title, elev=28, azim=-60):
        for k, t in tms.items():
            tt = t.copy(); tt.apply_translation(offs[k])
            light = np.clip(tt.face_normals @ np.array([0.35, -0.55, 0.75]), 0.12, 1)
            ax.add_collection3d(Poly3DCollection(tt.vertices[tt.faces], facecolors=col*(0.25+0.75*light[:, None]), linewidths=0))
        allv = np.vstack([tms[k].vertices + offs[k] for k in tms]); c = (allv.max(0)+allv.min(0))/2; s = (allv.max(0)-allv.min(0)).max()/2
        ax.set_xlim(c[0]-s, c[0]+s); ax.set_ylim(c[1]-s, c[1]+s); ax.set_zlim(c[2]-s, c[2]+s)
        ax.set_box_aspect((1, 1, 1)); ax.view_init(elev, azim); ax.set_axis_off(); ax.set_title(title)
    fig = plt.figure(figsize=(14, 7))
    draw(fig.add_subplot(121, projection='3d'), {k: [0, 0, 0] for k in tms}, 'Montado')
    draw(fig.add_subplot(122, projection='3d'), {'tray': [0, 0, 30], 'clamp_upper': [0, 0, 8], 'clamp_lower': [0, 0, -14]}, 'Explosionado')
    plt.tight_layout(); plt.savefig(sys.argv[1], dpi=110)
