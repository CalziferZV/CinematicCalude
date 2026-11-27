# Fusion 360 script: soporte de manillar para marcador Koso.
# Genera 3 cuerpos montados: Bandeja, Abrazadera_Superior, Abrazadera_Inferior.
# Unidades del bloque P: mm. Eje del manillar = X, Z hacia arriba.
# Cambia los valores de P y vuelve a ejecutar para regenerar.
import adsk.core, adsk.fusion, traceback, math

P = dict(
    bar_d=22.2,        # diametro manillar (22.2 = 7/8", 28.6 = 1-1/8")
    bar_clear=0.4,     # holgura diametral
    gap=1.0,           # separacion entre mitades (para que apriete)
    clamp_w=20.0,      # ancho de la abrazadera a lo largo del manillar
    clamp_wall=4.0,    # pared minima alrededor del manillar
    bolt_d=5.5,        # paso tornillo M5
    nut_af=8.2,        # tuerca M5 entre caras (8 mm + holgura)
    nut_depth=4.5,
    cbore_d=9.5, cbore_depth=2.0,   # avellanado cabeza en orejetas
    tray_in_x=70.0,    # interior bandeja (largo, paralelo al manillar)
    tray_in_y=40.0,    # interior bandeja (ancho)
    tray_depth=14.0,   # profundidad interior
    tray_wall=2.4, tray_floor=3.0,
    ear_r=6.0, ear_t=5.0,            # orejetas de la bandeja
    end_margin=6.5,    # material mas alla del tornillo en la abrazadera
    slot_len=14.0, slot_w=12.0,      # ranura de cable en el fondo
    notch_w=12.0, notch_d=6.0,       # muesca de cable en la pared
    corner_r=2.0,      # redondeo de aristas verticales
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

    def bar_cut(self, r, length, bodies):
        sk = self.root.sketches.add(self.root.yZConstructionPlane)
        sk.isVisible = False
        sk.sketchCurves.sketchCircles.addByCenterRadius(self.pt(sk, 0, 0, 0), cm(r))
        exts = self.root.features.extrudeFeatures
        inp = exts.createInput(sk.profiles.item(0), CUT)
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
        yb = toy / 2.0 + P['ear_r'] - 1.0
        L = 2 * (yb + P['end_margin'])
        w2 = P['clamp_w'] / 2.0
        cr = P['corner_r']

        # --- Abrazadera (2 mitades) ---
        upper = b.box(-w2, w2, -L / 2, L / 2, g, H, NEW)
        upper.name = 'Abrazadera_Superior'
        b.fillet_vertical(upper, [(sx * w2, sy * L / 2) for sx in (1, -1) for sy in (1, -1)], cr)
        lower = b.box(-w2, w2, -L / 2, L / 2, -H, -g, NEW)
        lower.name = 'Abrazadera_Inferior'
        b.fillet_vertical(lower, [(sx * w2, sy * L / 2) for sx in (1, -1) for sy in (1, -1)], cr)
        b.bar_cut(R, 200.0, [upper, lower])

        # --- Bandeja ---
        z0 = H
        ztop = z0 + P['tray_floor'] + P['tray_depth']
        tray = b.box(-tox / 2, tox / 2, -toy / 2, toy / 2, z0, ztop, NEW)
        tray.name = 'Bandeja'
        b.fillet_vertical(tray, [(sx * tox / 2, sy * toy / 2) for sx in (1, -1) for sy in (1, -1)], cr)
        b.box(-P['tray_in_x'] / 2, P['tray_in_x'] / 2, -P['tray_in_y'] / 2, P['tray_in_y'] / 2,
              z0 + P['tray_floor'], ztop + 1, CUT, [tray])
        for s in (1, -1):
            b.cyl_z(0, s * yb, P['ear_r'], z0, z0 + P['ear_t'], JOIN, [tray])
            ya, yc = sorted((s * toy / 2 * 0.9, s * yb))
            b.box(-P['ear_r'], P['ear_r'], ya, yc, z0, z0 + P['ear_t'], JOIN, [tray])
        sx1 = P['tray_in_x'] / 2 - 3
        b.box(sx1 - P['slot_len'], sx1, -P['slot_w'] / 2, P['slot_w'] / 2,
              z0 - 1, z0 + P['tray_floor'] + 1, CUT, [tray])
        b.box(P['tray_in_x'] / 2 - 1, tox / 2 + 1, -P['notch_w'] / 2, P['notch_w'] / 2,
              ztop - P['notch_d'], ztop + 1, CUT, [tray])

        # --- Tornilleria M5 ---
        for s in (1, -1):
            b.cyl_z(0, s * yb, P['bolt_d'] / 2, -H - 1, ztop + 1, CUT, [tray, upper, lower])
            b.cyl_z(0, s * yb, P['cbore_d'] / 2, z0 + P['ear_t'] - P['cbore_depth'],
                    z0 + P['ear_t'] + 1, CUT, [tray])
            b.hex_z(0, s * yb, P['nut_af'], -H - 1, -H + P['nut_depth'], CUT, [lower])

        app.activeViewport.fit()
        ui.messageBox(
            'Soporte generado.\n\n'
            'Separacion tornillos: %.1f mm (2x M5x35 + tuerca)\n'
            'Clic derecho en cada cuerpo > Guardar como malla (STL).\n'
            'Imprime la Abrazadera_Superior boca abajo.' % (2 * yb))
    except Exception:
        ui.messageBox('Error:\n{}'.format(traceback.format_exc()))
