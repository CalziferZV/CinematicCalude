"""Banda sonora épica del teaser de OBEKET (33 s, 90 BPM, Re menor que se abre a Re
mayor en la revelación), sincronizada con cinematic/teaser.py y cinematic/teaser_v.py.

Golpe grave con el símbolo de OBEKET, tambores en cada corte, ostinato de cuerdas y
metales graves que crecen, subida con redoble y silencio antes de YAMPI, gran golpe
con el acorde mayor, la guitarra de Yampi bajo la foto real y firma final con
campanas para el logotipo.

Pensada para redes (Instagram recomprime el audio y se escucha en altavoces de móvil):
  - osciladores de banda limitada (PolyBLEP): sin aliasing ni "arenilla" aguda;
  - barridos de filtro por mezcla de bandas fijas: sin chasquidos de "cremallera";
  - graves controlados (paso alto a 40 Hz y estante bajo), sin saturación;
  - compresión lenta y limitador de pico real (sobremuestreo x4) a -2 dBTP.

Uso: python -m cinematic.audio_teaser --out build/score_teaser.wav
"""
from __future__ import annotations

import argparse

import numpy as np
from scipy import signal

from . import audio as A
from .audio import SR, Bus, apply_reverb, bell, bp, env_exp, fade, hp, loudness, lp, note, reverb_ir, tt, write_wav
from .audio2 import pluck
from .teaser import BAR5, DURATION5, T5

BEAT = BAR5 / 4
N = int(SR * DURATION5)
RNG = np.random.default_rng(2026)


# --------------------------------------------------------------------------- #
# Osciladores y filtros limpios
# --------------------------------------------------------------------------- #
def blep_saw(freq, n=None, phase0=None):
    """Diente de sierra de banda limitada (PolyBLEP). freq: Hz (escalar o array por muestra)."""
    freq = np.broadcast_to(np.asarray(freq, np.float64), (n,)) if n is not None else np.asarray(freq, np.float64)
    dt = np.clip(freq / SR, 1e-7, 0.45)
    ph = ((RNG.random() if phase0 is None else phase0) + np.cumsum(dt)) % 1.0
    y = 2.0 * ph - 1.0
    m1 = ph < dt
    x = ph[m1] / dt[m1]
    y[m1] -= x + x - x * x - 1.0
    m2 = ph > 1.0 - dt
    x = (ph[m2] - 1.0) / dt[m2]
    y[m2] -= x * x + x + x + 1.0
    return y


def _lp_bank(x, cutoffs):
    sos = [signal.butter(2, c / (SR / 2), "low", output="sos") for c in cutoffs]
    return [signal.sosfilt(s, x) for s in sos]


def _bank_weights(fc, centers):
    """Pesos (suma 1) entre bandas fijas para seguir una frecuencia fc(t) sin saltos."""
    lc = np.log(np.asarray(centers))
    lf = np.log(np.clip(fc, centers[0], centers[-1]))
    pos = np.interp(lf, lc, np.arange(len(centers)))
    w = [np.clip(1 - np.abs(pos - k), 0, 1) for k in range(len(centers))]
    return w


def bank_lowpass(x, fc):
    """Paso bajo variable fc(t) por mezcla de filtros fijos (sin efecto cremallera)."""
    cut = [180, 300, 500, 820, 1350, 2200, 3600]
    ys = _lp_bank(x, cut)
    return sum(wk * yk for wk, yk in zip(_bank_weights(fc, cut), ys))


def bank_sweep(x, f0, f1, curve=1.0, q=1.6):
    """Paso banda que barre de f0 a f1 (mezcla de 12 bandas fijas)."""
    n = len(x)
    centers = list(np.geomspace(min(f0, f1), max(f0, f1), 12))
    u = (np.arange(n) / max(n - 1, 1)) ** curve
    fc = f0 * (f1 / f0) ** u
    out = np.zeros(n)
    for wk, c in zip(_bank_weights(fc, centers), centers):
        lo, hi = c / (1 + 0.5 / q), min(c * (1 + 0.5 / q), SR * 0.45)
        out += wk * signal.sosfilt(signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band", output="sos"), x)
    return out


def noise(n):
    return lp(RNG.standard_normal(n), 12000)


# --------------------------------------------------------------------------- #
# Instrumentos
# --------------------------------------------------------------------------- #
def taiko(f0=60.0, dur=1.6, bright=0.5):
    t = tt(dur)
    f = f0 * (1 + 0.55 * np.exp(-t * 28))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.0)
    # armónicos del parche: dan cuerpo en altavoces pequeños sin subgrave
    body += 0.35 * np.sin(2 * np.pi * np.cumsum(2.3 * f) / SR) * np.exp(-t * 7.0)
    skin = bp(noise(len(t)), 110, 900 + 1800 * bright) * np.exp(-t * 30) * 0.9
    return fade(body + skin, 0.002, 0.15) * 0.8


def tom(f0=180.0, dur=0.5):
    t = tt(dur)
    f = f0 * (1 + 0.4 * np.exp(-t * 40))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    nz = bp(noise(len(t)), 400, 4000) * np.exp(-t * 55) * 0.6
    return fade(body + nz, 0.0015, 0.05) * 0.8


def boom(dur=4.0, f0=95.0, f1=42.0):
    """Golpe grave limpio (sin saturación): seno que cae de f0 a f1 y un golpe filtrado."""
    t = tt(dur)
    freq = f1 + (f0 - f1) * np.exp(-t * 7)
    sub = np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-t * 1.6)
    sub += 0.25 * np.sin(2 * np.pi * np.cumsum(2 * freq) / SR) * np.exp(-t * 2.4)
    click = lp(noise(len(t)) * np.exp(-t * 60), 2500) * 0.5
    rumble = lp(noise(len(t)), 160) * np.exp(-t * 2.0) * 0.6
    return fade(sub + click + rumble, 0.002, 0.4)


def braam(dur=3.5, root="D2"):
    """Metales graves: sierras de banda limitada con un filtro que se abre y se cierra."""
    t = tt(dur)
    f = note(root)
    x = np.zeros_like(t)
    for m, det in ((1, 0), (1, 9), (1, -11), (2, 4), (2, -6), (1.5, 3), (3, 0)):
        x += blep_saw(f * m * 2 ** (det / 1200), len(t)) / (1 + 0.3 * m)
    cut = 220 + 1900 * np.exp(-t * 2.2) * (1 - np.exp(-t * 30))
    y = bank_lowpass(x, cut) * env_exp(t, 0.035, 1.3)
    return fade(y * 0.55, 0.004, 0.4)


def crash(dur=4.5):
    t = tt(dur)
    nz = np.stack([noise(len(t)), noise(len(t))], -1)
    x = hp(nz, 3200) * np.exp(-t * 1.2)[:, None] + bp(nz, 5000, 9000) * np.exp(-t * 2.6)[:, None] * 0.5
    edge = fade(np.ones(len(t)), 0.002, 0.6)
    return lp(x, 11000) * 0.30 * edge[:, None]


def riser(dur):
    t = tt(dur)
    amp = (t / dur) ** 2.4
    out = bank_sweep(noise(len(t)), 250, 6500, curve=1.6, q=3.0) * amp * 1.6
    f = 110 * 2 ** (3.2 * (t / dur) ** 1.4)
    ph = 2 * np.pi * np.cumsum(f) / SR
    out += (np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.25 + np.sin(1.5 * ph) * 0.2) * amp * 0.5
    return fade(out, 0.05, 0.02)


def whoosh(dur=0.7, f0=400, f1=4500, peak=0.45):
    t = tt(dur)
    u = t / dur
    x = bank_sweep(noise(len(t)), f0, f1, curve=0.8, q=1.6)
    return fade(x * np.exp(-((u - peak) / 0.22) ** 2) * 1.4, 0.01, 0.05)


def strings(freqs, dur, attack=1.2, release=1.8, bright=0.5, vib=0.0028):
    """Sección de cuerdas: cinco sierras de banda limitada por nota, vibrato y filtro suave."""
    tot = dur + release
    t = tt(tot)
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    for j, f in enumerate(freqs):
        for v, det in enumerate((-11, -5, 0, 6, 12)):
            rate = 4.8 + RNG.random() * 1.0
            vdepth = vib * np.clip((t - 0.5) / 0.8, 0, 1)
            inst = f * 2 ** (det / 1200) * (1 + vdepth * np.sin(2 * np.pi * rate * t + RNG.random() * 6.28))
            s = blep_saw(inst)
            if (j + v) % 2:
                L += s
            else:
                R += s
    x = np.stack([L, R], -1) / (len(freqs) * 3.0)
    fc = 1300 + 2400 * bright
    x = hp(lp(lp(x, fc), fc * 1.4), 110)
    env = np.minimum(np.clip(t / attack, 0, 1), np.clip((tot - t) / release, 0, 1))
    return x * (np.sin(env * np.pi / 2) ** 2)[:, None]


def cello(freq, dur, attack=0.35, release=1.2):
    t = tt(dur + release)
    inst = freq * (1 + 0.003 * np.clip((t - 0.4) / 0.6, 0, 1) * np.sin(2 * np.pi * 5.2 * t))
    s = lp(lp(blep_saw(inst), 900), 1300)
    env = np.minimum(np.clip(t / attack, 0, 1), np.clip((dur + release - t) / release, 0, 1))
    return s * np.sin(env * np.pi / 2) ** 2


def spiccato(freq, dur=0.2):
    """Cuerdas en golpe de arco corto (ostinato)."""
    t = tt(dur + 0.25)
    x = sum(blep_saw(freq * 2 ** (d / 1200), len(t)) for d in (-7, 0, 8)) / 3
    x = lp(lp(x, 2600), 3600)
    return fade(x * env_exp(t, 0.008, 0.11), 0.003, 0.05)


def drone(freq, dur):
    t = tt(dur)
    x = np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * 2 * freq * t)
    env = np.minimum(np.clip(t / 1.4, 0, 1), np.clip((dur - t) / 0.8, 0, 1))
    return x * env


# --------------------------------------------------------------------------- #
# Composición
# --------------------------------------------------------------------------- #
# Re menor épico: i - VI - III - VII - i  (Dm - Bb - F - C - Dm)
PROG = [(["D3", "F3", "A3"], "D2"), (["Bb2", "D3", "F3"], "Bb1"), (["F3", "A3", "C4"], "F2"),
        (["C3", "E3", "G3"], "C2"), (["D3", "F3", "A3"], "D2")]
OSTINATO = [0, 0, 2, 0, 1, 0, 2, 1]  # índices de la tríada, en corcheas


def compose():
    A.N = N
    drums, strg, low, fx, hits = Bus(), Bus(), Bus(), Bus(), Bus()
    b, B = BEAT, BAR5

    # 1. símbolo de OBEKET: golpe grave y campanas
    hits.add(0.30, boom(3.2, f0=82, f1=44), 0.75)
    fx.add(0.32, bell(note("D5"), 3.2), 0.10, p=-0.25)
    fx.add(0.95, bell(note("A5"), 3.0), 0.07, p=0.25)
    low.add(0.0, drone(note("D2"), T5["imp"] + 0.4), 0.30)
    strg.add(0.5, strings([note("D3"), note("A3")], T5["imp"] - 0.5, attack=1.6, release=0.8, bright=0.2), 0.22)

    # 2. gancho: tambor en cada corte y latido entre medias
    for t0 in (T5["ojos"], T5["antena"]):
        hits.add(t0, taiko(55, 2.2), 0.95)
        fx.add(t0 - 0.42, whoosh(0.55, 300, 3200, 0.8), 0.22)
        for k in (1, 2, 3):
            drums.add(t0 + k * b, taiko(72, 0.9, 0.3), 0.30 if k != 2 else 0.42)

    # 3. sección rítmica (impresión, despiece, órbita, detalles)
    for i, (tri, root) in enumerate(PROG):
        t0 = T5["imp"] + i * B
        g = 1.0 + 0.12 * i
        low.add(t0, braam(B * 0.95, root=root), 0.42 * g)
        low.add(t0, cello(note(root) * 2, B * 0.9, attack=0.05, release=0.4), 0.22 * g)
        strg.add(t0, strings([note(n) for n in tri], B * 0.95, attack=0.2, release=0.5, bright=0.4 + 0.1 * i),
                 0.24 * g)
        octs = 2 if i < 3 else 4
        for k in range(8):
            n = tri[OSTINATO[k]]
            acc = 1.0 if k % 2 == 0 else 0.72
            strg.add(t0 + k * b / 2, spiccato(note(n) * octs), 0.15 * acc * g, p=0.35 if k % 2 else -0.35)
        drums.add(t0, taiko(58, 1.6), 0.85)
        drums.add(t0 + 2 * b, taiko(66, 1.4), 0.60)
        drums.add(t0 + 3 * b + b / 2, taiko(72, 1.2), 0.45)
        for k in range(1, 8, 2):
            drums.add(t0 + k * b / 2, tom(190 + 25 * (k % 3)), 0.16 + 0.03 * i)
        if i >= 3:  # semicorcheas al final del compás
            for k in range(4):
                drums.add(t0 + 3 * b + k * b / 4, tom(230 - 12 * k), 0.14 + 0.04 * k)
    for t0 in (T5["despiece"], T5["orbita"], T5["cara"], T5["cuerdas"]):
        fx.add(t0 - 0.45, whoosh(0.6, 250, 4200, 0.78), 0.26)
    for t0 in (T5["orbita"], T5["cara"], T5["clavijero"], T5["cuerdas"], T5["contrapicado"]):
        hits.add(t0, taiko(52, 1.8), 0.55)

    # 4. "Presentamos": nota aguda, subida, redoble y silencio
    P0, R0 = T5["presentamos"], T5["revelacion"]
    strg.add(P0, strings([note("A4"), note("D5")], R0 - P0 - 0.35, attack=0.25, release=0.2, bright=0.65), 0.20)
    fx.add(P0 + 0.25, riser(R0 - P0 - 0.65), 0.55)
    tr, step, k = P0 + 1.35, 0.30, 0
    while tr < R0 - 0.45:
        drums.add(tr, taiko(64 + 3 * k, 0.8, 0.45), 0.25 + 0.05 * k)
        tr += step
        step = max(0.07, step * 0.80)
        k += 1

    # 5. revelación: el gran golpe y el acorde mayor
    hits.add(R0, boom(5.0, f0=110, f1=42), 1.0)
    hits.add(R0, taiko(50, 3.0), 1.0)
    hits.add(R0, taiko(76, 2.0), 0.55)
    hits.add(R0, crash(5.0), 0.75)
    low.add(R0, braam(5.0, root="D2"), 0.75)
    low.add(R0, cello(note("D2"), 4.6, attack=0.04, release=1.2), 0.32)
    strg.add(R0, strings([note(n) for n in ("D3", "A3", "D4", "F#4", "A4")], 4.6, attack=0.06, release=1.4,
                         bright=0.7), 0.50)
    drums.add(R0 + B, taiko(56, 2.0), 0.55)

    # 6. la foto real: el acorde se calma y suena la guitarra de Yampi
    F0 = T5["realidad"]
    strg.add(F0 - 0.4, strings([note(n) for n in ("D3", "A3", "D4", "F#4")], T5["marca"] - F0 + 0.6, attack=1.0,
                               release=1.0, bright=0.3), 0.30)
    for k, n in enumerate(("D3", "A3", "D4", "F#4", "A4", "F#4", "D4", "A3")):
        strg.add(F0 + 0.15 + k * b / 2, pluck(n, 3.0, bright=0.5, seed=k), 0.55, p=-0.2 + 0.05 * k)

    # 7. firma de OBEKET
    M0 = T5["marca"]
    hits.add(M0, boom(5.0, f0=88, f1=44), 0.70)
    fx.add(M0 + 0.40, bell(note("D5"), 4.0), 0.13, p=-0.2)
    fx.add(M0 + 0.95, bell(note("A5"), 4.0), 0.09, p=0.2)
    fx.add(M0 + 1.55, bell(note("F#5"), 4.0), 0.08)
    strg.add(M0, strings([note(n) for n in ("D3", "A3", "D4", "F#4")], DURATION5 - M0 - 0.4, attack=0.5,
                         release=1.4, bright=0.35), 0.32)
    low.add(M0, drone(note("D2"), DURATION5 - M0), 0.22)
    return drums, strg, low, fx, hits


# --------------------------------------------------------------------------- #
# Masterización
# --------------------------------------------------------------------------- #
def _smooth_gain(target_gain, attack=0.010, release=0.150):
    """Suaviza una curva de ganancia: baja rápido (ataque) y se recupera despacio."""
    a_att = np.exp(-1.0 / (attack * SR))
    a_rel = np.exp(-1.0 / (release * SR))
    out = np.empty_like(target_gain)
    g = 1.0
    for i, tg in enumerate(target_gain):
        coef = a_att if tg < g else a_rel
        g = coef * g + (1 - coef) * tg
        out[i] = g
    return out


def true_peak_limiter(x, ceiling_db=-2.0, lookahead=0.005, release=0.12):
    """Limitador con detección de pico real (sobremuestreo x4) y anticipación."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    ceiling = 10 ** (ceiling_db / 20)
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(up).max(1)[: len(x) * 4].reshape(-1, 4).max(1)
    need = np.minimum(1.0, ceiling / np.maximum(pk, 1e-9))
    la = int(lookahead * SR)
    need = minimum_filter1d(need, 2 * la + 1)                  # empieza a bajar antes del pico
    g = _smooth_gain(need, attack=0.0015, release=release)
    g = np.minimum(g, uniform_filter1d(need, la))              # nunca por encima de lo necesario
    y = x * g[:, None]
    up = signal.resample_poly(y, 4, 1, axis=0)                 # último seguro por si queda algo
    tp = np.abs(up).max()
    if tp > ceiling:
        y *= ceiling / tp
    return y


def master(buses, target=-14.5, ceiling_db=-2.0):
    drums, strg, low, fx, hits = buses
    ir_big = reverb_ir(3.2, 0.025, 31)
    ir_room = reverb_ir(1.4, 0.010, 32)
    mix = (drums.x * 0.85 + apply_reverb(drums.x, ir_room, 0.30) + apply_reverb(drums.x, ir_big, 0.15) +
           strg.x * 0.85 + apply_reverb(strg.x, ir_big, 0.35) +
           low.x * 0.90 + apply_reverb(low.x, ir_big, 0.20) +
           fx.x * 0.85 + apply_reverb(fx.x, ir_big, 0.40) +
           hits.x * 0.95 + apply_reverb(hits.x, ir_big, 0.30))
    # graves controlados: sin subgrave inaudible en móviles y estante bajo suave
    mix = signal.sosfilt(signal.butter(4, 40 / (SR / 2), "high", output="sos"), mix, axis=0)
    mix = mix - 0.55 * lp(mix, 90, 2)
    # sin energía ultrasónica (el códec de Instagram la convierte en "arenilla")
    mix = signal.sosfilt(signal.butter(6, 16000 / (SR / 2), "low", output="sos"), mix, axis=0)
    # silencio absoluto antes de YAMPI
    a, b_ = int((T5["revelacion"] - 0.40) * SR), int(T5["revelacion"] * SR)
    ramp = int(0.06 * SR)
    g = np.ones(len(mix))
    g[a - ramp:a] = np.linspace(1, 0, ramp) ** 2
    g[a:b_] = 0
    mix *= g[:, None]
    # compresión lenta y suave (no deforma la onda de los graves)
    win = int(0.03 * SR)
    lvl = np.sqrt(np.convolve(np.mean(mix ** 2, 1), np.ones(win) / win, "same").clip(1e-12))
    thr = np.percentile(lvl[lvl > 1e-4], 90)
    gr = np.where(lvl > thr, (thr / lvl) ** 0.35, 1.0)
    mix *= _smooth_gain(gr, attack=0.015, release=0.25)[:, None]
    # sonoridad objetivo con limitador de pico real
    y = mix / np.abs(mix).max() * 0.5
    for _ in range(4):
        L = loudness(y)
        y = y * 10 ** ((target - L) / 20)
        y = true_peak_limiter(y, ceiling_db)
    L = loudness(y)
    fo = np.clip((DURATION5 - np.arange(len(y)) / SR) / 1.4, 0, 1)
    y = y * fo[:, None]
    up = signal.resample_poly(y, 4, 1, axis=0)
    print(f"  sonoridad {L:.1f} LUFS, pico real {20 * np.log10(np.abs(up).max()):.2f} dBTP")
    return y


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/score_teaser.wav")
    a = ap.parse_args(argv)
    y = master(compose())
    write_wav(a.out, y)
    print("OK", a.out, f"{len(y) / SR:.1f}s")


if __name__ == "__main__":
    main()
