"""Refina la máscara ISNet de la foto final de Yampi.

Genera dos máscaras:
  - mask_fg.png     : figura + mano (primer plano completo, para paralaje)
  - mask_figure.png : solo la figura (sin la mano), para siluetas y focos

Uso: python tools/refine_mask.py <foto> <mask_raw.png> <dir_salida>
"""
import sys
import numpy as np
import cv2
from PIL import Image


def poly_mask(shape, pts):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


def box(shape, x0, y0, x1, y1):
    m = np.zeros(shape, bool)
    m[y0:y1, x0:x1] = True
    return m


def largest_component(b):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(b.astype(np.uint8), 8)
    if n <= 1:
        return b
    k = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
    return lab == k


def fill_holes(b):
    h, w = b.shape
    ff = b.astype(np.uint8).copy()
    mask = np.zeros((h + 2, w + 2), np.uint8)
    cv2.floodFill(ff, mask, (0, 0), 1)
    return b | (ff == 0)


def main(img_path, raw_path, out_dir):
    im = np.asarray(Image.open(img_path).convert("RGB")).astype(np.int32)
    raw = np.asarray(Image.open(raw_path).convert("L")).astype(np.float32) / 255
    H, W = raw.shape
    S = (H, W)
    R, G, B = im[..., 0], im[..., 1], im[..., 2]
    mx = im.max(-1)
    mn = im.min(-1)

    red = (R > G + 60) & (R > B + 50) & (R > 110) & (G < 130)
    blue = (B > R + 35) & (B > 90)
    dark = mx < 75

    # zonas de corte (coordenadas en la foto original 1512x2016)
    hand_zone = poly_mask(S, [
        (0, 1110), (395, 1110), (408, 1124), (422, 1140), (443, 1155), (470, 1164),
        (500, 1165), (528, 1156), (548, 1142), (568, 1102), (588, 1062), (602, 1045),
        (600, 1200), (590, 1250), (585, 1300), (585, 1352), (622, 1352), (624, 1500),
        (630, 1700), (624, 1735), (628, 1800), (650, 1830), (760, 1830), (760, 2016),
        (0, 2016)])
    right_zone = poly_mask(S, [(900, 1352), (1020, 1352), (1020, 1640), (900, 1640)])
    leg_zone = box(S, 600, 1352, 1000, 1835)
    shoe = box(S, 615, 1700, 760, 1835) | box(S, 760, 1630, 975, 1775)
    keep_leg = blue | dark | (shoe & (mx < 110))
    antR = box(S, 872, 270, 935, 386)
    antL = box(S, 612, 250, 692, 386)
    head_zone = box(S, 200, 620, 470, 880)
    ear_zone = box(S, 566, 552, 592, 590)

    def constrain(fig):
        fig = fig & ~hand_zone & ~right_zone
        fig = np.where(leg_zone, fig & keep_leg, fig)
        fig = np.where(antR | antL, red, fig)  # las antenas: solo píxeles rojos
        fig &= ~(head_zone & (mn > 195) & ((mx - mn) < 35))
        fig &= ~(ear_zone & (mx > 175))
        return fig

    fig = constrain(raw > 0.5)
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8)).astype(bool)
    fig = largest_component(fig)
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8)).astype(bool)
    fig = fill_holes(fig)
    fig = constrain(fig)
    # antenas: cerrar pequeños huecos de color dentro del tallo
    ant = (antR | antL) & red
    ant = cv2.morphologyEx(ant.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)).astype(bool)
    fig |= ant
    fig = cv2.morphologyEx(fig.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    fig = largest_component(fig)

    # alfa suave: borde exterior con el valor del modelo, cortes manuales suavizados
    soft = cv2.GaussianBlur(fig.astype(np.float32), (0, 0), 1.1)
    edge_raw = np.clip((raw - 0.25) / 0.5, 0, 1)
    inner = cv2.erode(fig.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
    alpha = np.where(inner, 1.0, np.minimum(soft * 1.6, np.maximum(edge_raw, soft)))
    cut = cv2.dilate((hand_zone | right_zone | leg_zone | antR | antL | head_zone | ear_zone).astype(np.uint8),
                     np.ones((5, 5), np.uint8)).astype(bool)
    alpha = np.where(cut, soft, alpha)
    alpha = np.clip(alpha, 0, 1)
    Image.fromarray((alpha * 255).astype(np.uint8)).save(f"{out_dir}/mask_figure.png")

    # primer plano completo (figura + mano + manga)
    fg = (raw > 0.12) | fig
    sleeve = poly_mask(S, [(0, 1560), (220, 1640), (520, 1780), (560, 2016), (0, 2016)])
    fg |= sleeve & (raw > 0.04)
    fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8)).astype(bool)
    fg = largest_component(fg)
    fg = fill_holes(fg)
    fg &= ~(head_zone & (mn > 195) & ((mx - mn) < 35))
    fgs = cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 1.6)
    fga = np.maximum(fgs, alpha)
    Image.fromarray((np.clip(fga, 0, 1) * 255).astype(np.uint8)).save(f"{out_dir}/mask_fg.png")
    print("ok", round(float(alpha.mean()), 4), round(float(fga.mean()), 4))


if __name__ == "__main__":
    main(*sys.argv[1:4])
