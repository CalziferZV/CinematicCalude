# Fusion 360 script: soporte de manillar para marcador Koso.
# Genera 3 cuerpos montados: Bandeja, Abrazadera_Superior, Abrazadera_Inferior.
# Unidades del bloque P: mm. Eje del manillar = X, Z hacia arriba.
# Cambia los valores de P y vuelve a ejecutar para regenerar.
import adsk.core, adsk.fusion, traceback, math

P = dict(
    bar_d=28.0,        # diametro manillar
    bar_clear=0.4,     # holgura diametral
    gap=1.0,           # separacion entre mitades (para que apriete)
    clamp_w=24.0,      # ancho de la abrazadera a lo largo del manillar
    clamp_wall=4.0,    # pared por encima/debajo del manillar
    corner_r=4.0,      # redondeo de los extremos de la abrazadera
    bolt_d=5.5,        # paso tornillo M5
    bolt_spacing=60.0, # distancia entre tornillos
    nut_af=8.2, nut_depth=4.5,       # tuerca M5
    cbore_d=9.5, cbore_depth=2.0,    # rebaje cabeza tornillo
    tray_in_x=71.2,    # interior bandeja (largo, paralelo al manillar)
    tray_in_y=40.0,    # interior bandeja (ancho)
    tray_depth=14.5,   # profundidad interior
    tray_wall=2.4, tray_floor=3.0,
    ear_len=24.0,      # largo de la orejeta (a lo largo de la bandeja)
    ear_out=15.0,      # cuanto sobresale la orejeta de la pared
    ear_t=5.0, ear_r=5.0,
    ledge_w=10.0, ledge_h=4.0,       # escalon interior
    hole_x=10.0, hole_y=17.5,        # agujero de cable en el fondo
)

app = adsk.core.Application.get()
ui = app.userInterface
NEW = adsk.fusion.FeatureOperations.NewBodyFeatureOperation
JOIN = adsk.fusion.FeatureOperations.JoinFeatureOperation
CUT = adsk.fusion.FeatureOperations.CutFeatureOperation


def cm(v):
    return v / 10.0


def vi(v_mm):
    return adsk.core.ValueInput.createByReal(cm(v_mm))


class Builder:
    def __init__(self, root):
        self.root = root

    def plane_z(self, z):
        if abs(z) < 1e-9:
            return self.root.xYConstructionPlane
        inp = self.root.constructionPlanes.createInput()
        inp.setByOffset(self.root.xYConstructionPlane, vi(z))
        pl = self.root.constructionPlanes.add(inp)
        pl.isLightBulbOn = False
        return pl

    def pt(self, sk, x, y, z):
        return sk.modelToSketchSpace(adsk.core.Point3D.create(cm(x), cm(y), cm(z)))

    def extrude(self, prof, dist, op, bodies=None):
        exts = self.root.features.extrudeFeatures
        inp = exts.createInput(prof, op)
        inp.setDistanceExtent(False, vi(dist))
        if bodies and op != NEW:
            inp.participantBodies = list(bodies)
        f = exts.add(inp)
        return f.bodies.item(0) if op == NEW else None

    def box(self, x0, x1, y0, y1, z0, z1, op, bodies=None):
        sk = self.root.sketches.add(self.plane_z(z0))
        sk.isVisible = False
        sk.sketchCurves.sketchLines.addTwoPointRectangle(
            self.pt(sk, x0, y0, z0), self.pt(sk, x1, y1, z0))
        return self.extrude(sk.profiles.item(0), z1 - z0, op, bodies)

    def cyl_z(self, x, y, r, z0, z1, op, bodies=None):
        sk = self.root.sketches.add(self.plane_z(z0))
        sk.isVisible = False
        sk.sketchCurves.sketchCircles.addByCenterRadius(self.pt(sk, x, y, z0), cm(r))
        return self.extrude(sk.profiles.item(0), z1 - z0, op, bodies)

    def hex_z(self, x, y, af, z0, z1, op, bodies=None):
        sk = self.root.sketches.add(self.plane_z(z0))
        sk.isVisible = False
        r = af / 2.0 / math.cos(math.pi / 6)
        pts = [self.pt(sk, x + r * math.cos(i * math.pi / 3), y + r * math.sin(i * math.pi / 3), z0)
               for i in range(6)]
        lines = sk.sketchCurves.sketchLines
        first = lines.addByTwoPoints(pts[0], pts[1])
        prev = first
        for i in range(2, 6):
            prev = lines.addByTwoPoints(prev.endSketchPoint, pts[i])
        lines.addByTwoPoints(prev.endSketchPoint, first.startSketchPoint)
        return self.extrude(sk.profiles.item(0), z1 - z0, op, bodies)

    def cyl_x(self, r, length, op, bodies):
        sk = self.root.sketches.add(self.root.yZConstructionPlane)
        sk.isVisible = False
        sk.sketchCurves.sketchCircles.addByCenterRadius(self.pt(sk, 0, 0, 0), cm(r))
        exts = self.root.features.extrudeFeatures
        inp = exts.createInput(sk.profiles.item(0), op)
        inp.setSymmetricExtent(vi(length), True)
        inp.participantBodies = list(bodies)
        exts.add(inp)

    def fillet_vertical(self, body, corners, r):
        """Redondea aristas rectas verticales que pasan por los puntos (x, y) dados."""
        try:
            edges = adsk.core.ObjectCollection.create()
            for e in body.edges:
                g = e.geometry
                if g.curveType != adsk.core.Curve3DTypes.Line3DCurveType:
                    continue
                ln = adsk.core.Line3D.cast(g)
                s, t = ln.startPoint, ln.endPoint
                if abs(s.x - t.x) > 1e-6 or abs(s.y - t.y) > 1e-6:
                    continue
                for (cx, cy) in corners:
                    if abs(s.x - cm(cx)) < 1e-5 and abs(s.y - cm(cy)) < 1e-5:
                        edges.add(e)
                        break
            if edges.count == 0:
                return
            fil = self.root.features.filletFeatures
            inp = fil.createInput()
            inp.addConstantRadiusEdgeSet(edges, vi(r), True)
            fil.add(inp)
        except Exception:
            pass  # el redondeo es estetico; si falla, seguimos


def run(context):
    try:
        app.documents.add(adsk.core.DocumentTypes.FusionDesignDocumentType)
        design = adsk.fusion.Design.cast(app.activeProduct)
        design.designType = adsk.fusion.DesignTypes.ParametricDesignType
        root = design.rootComponent
        b = Builder(root)

        R = (P['bar_d'] + P['bar_clear']) / 2.0
        H = R + P['clamp_wall']
        g = P['gap'] / 2.0
        tox = P['tray_in_x'] + 2 * P['tray_wall']
        toy = P['tray_in_y'] + 2 * P['tray_wall']
        yb = P['bolt_spacing'] / 2.0
        yend = toy / 2.0 + P['ear_out']
        L = 2 * yend
        w2 = P['clamp_w'] / 2.0
        el = P['ear_len'] / 2.0
        cr = P['corner_r']
        zt = H
        ztop = zt + P['tray_floor'] + P['tray_depth']
        ends = [(sx * w2, sy * L / 2) for sx in (1, -1) for sy in (1, -1)]

        # --- Abrazaderas: bloques con media caña ---
        upper = b.box(-w2, w2, -L / 2, L / 2, g, H, NEW)
        upper.name = 'Abrazadera_Superior'
        b.fillet_vertical(upper, ends, cr)
        lower = b.box(-w2, w2, -L / 2, L / 2, -H, -g, NEW)
        lower.name = 'Abrazadera_Inferior'
        b.fillet_vertical(lower, ends, cr)
        b.cyl_x(R, 200.0, CUT, [upper, lower])

        # --- Bandeja: fondo plano, orejetas a ras de la base ---
        tray = b.box(-tox / 2, tox / 2, -toy / 2, toy / 2, zt, ztop, NEW)
        tray.name = 'Bandeja'
        b.fillet_vertical(tray, [(sx * tox / 2, sy * toy / 2) for sx in (1, -1) for sy in (1, -1)], 2.0)
        b.box(-el, el, -yend, yend, zt, zt + P['ear_t'], JOIN, [tray])
        b.fillet_vertical(tray, [(sx * el, sy * yend) for sx in (1, -1) for sy in (1, -1)], P['ear_r'])
        ix, iy = P['tray_in_x'] / 2, P['tray_in_y'] / 2
        zf = zt + P['tray_floor']
        b.box(-ix, ix, -iy, iy, zf, ztop + 1, CUT, [tray])
        b.box(-ix, ix, -iy, -iy + P['ledge_w'], zf, zf + P['ledge_h'], JOIN, [tray])
        b.box(ix - P['hole_x'], ix, -P['hole_y'] / 2, P['hole_y'] / 2, zt - 1, zf + 1, CUT, [tray])

        # --- Tornilleria M5 ---
        for s in (1, -1):
            b.cyl_z(0, s * yb, P['bolt_d'] / 2, -H - 1, ztop + 1, CUT, [tray, upper, lower])
            b.cyl_z(0, s * yb, P['cbore_d'] / 2, zt + P['ear_t'] - P['cbore_depth'],
                    zt + P['ear_t'] + 1, CUT, [tray])
            b.hex_z(0, s * yb, P['nut_af'], -H - 1, -H + P['nut_depth'], CUT, [lower])

        app.activeViewport.fit()
        ui.messageBox(
            'Soporte generado.\n\n'
            'Separacion tornillos: %.1f mm (2x M5x40 + tuerca)\n'
            'Clic derecho en cada cuerpo > Guardar como malla (STL).\n'
            'Imprime la Abrazadera_Superior boca abajo.' % (2 * yb))
    except Exception:
        ui.messageBox('Error:\n{}'.format(traceback.format_exc()))
