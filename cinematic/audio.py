"""Banda sonora original sintetizada por código, sincronizada con la línea de
tiempo de la imagen.

Uso: python -m cinematic.audio --out build/soundtrack.wav
"""
from __future__ import annotations

import argparse
import math
import wave
from pathlib import Path

import numpy as np
from scipy import signal

from .timeline import BAR, BEAT, C, DURATION

SR = 48000
TAIL = 0.0
N = int(SR * (DURATION + TAIL))
RNG = np.random.default_rng(1234)


# --------------------------------------------------------------------------- #
# Utilidades
# --------------------------------------------------------------------------- #
def note(name):
    """'D3' -> Hz (A4 = 440)."""
    names = {"C": -9, "C#": -8, "Db": -8, "D": -7, "D#": -6, "Eb": -6, "E": -5, "F": -4, "F#": -3,
             "Gb": -3, "G": -2, "G#": -1, "Ab": -1, "A": 0, "A#": 1, "Bb": 1, "B": 2}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + (o - 4) * 12) / 12)


def tt(dur):
    return np.arange(int(dur * SR), dtype=np.float64) / SR


def fade(x, a=0.005, r=0.01):
    n = len(x)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na > 0:
        x[:na] *= np.linspace(0, 1, na) ** 2
    if nr > 0:
        x[n - nr:] *= np.linspace(1, 0, nr) ** 2
    return x


def lp(x, fc, order=2):
    b, a = signal.butter(order, min(fc, SR * 0.45) / (SR / 2), "low")
    return signal.lfilter(b, a, x, axis=0)


def hp(x, fc, order=2):
    b, a = signal.butter(order, fc / (SR / 2), "high")
    return signal.lfilter(b, a, x, axis=0)


def bp(x, f1, f2, order=2):
    b, a = signal.butter(order, [f1 / (SR / 2), min(f2, SR * 0.45) / (SR / 2)], "band")
    return signal.lfilter(b, a, x, axis=0)


def sweep_filter(x, f_start, f_end, kind="band", q=2.0, block=256, curve=1.0):
    """Filtro con frecuencia variable (por bloques, conservando el estado)."""
    y = np.zeros_like(x)
    nb = max(1, len(x) // block + 1)
    zi = None
    for i in range(nb):
        a0, a1 = i * block, min(len(x), (i + 1) * block)
        if a0 >= a1:
            break
        u = (i / max(1, nb - 1)) ** curve
        fc = f_start * (f_end / f_start) ** u
        fc = min(max(fc, 20), SR * 0.45)
        if kind == "band":
            bw = fc / q
            lo, hi = max(10, fc - bw / 2), min(SR * 0.45, fc + bw / 2)
            b, a = signal.butter(2, [lo / (SR / 2), hi / (SR / 2)], "band")
        elif kind == "low":
            b, a = signal.butter(2, fc / (SR / 2), "low")
        else:
            b, a = signal.butter(2, fc / (SR / 2), "high")
        if zi is None or len(zi) != max(len(a), len(b)) - 1:
            zi = signal.lfilter_zi(b, a) * 0
        y[a0:a1], zi = signal.lfilter(b, a, x[a0:a1], zi=zi)
    return y


def pan(x, p):
    """p en [-1, 1] -> estéreo (ley de potencia constante). p puede ser array."""
    ang = (np.asarray(p) + 1) * math.pi / 4
    return np.stack([x * np.cos(ang), x * np.sin(ang)], -1)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2), np.float64)

    def add(self, t0, sig, gain=1.0, p=0.0):
        if sig.ndim == 1:
            sig = pan(sig, p)
        i0 = int(round(t0 * SR))
        if i0 >= N:
            return
        j0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(len(sig) - j0, N - i0)
        if n > 0:
            self.x[i0:i0 + n] += sig[j0:j0 + n] * gain


def saw(f, t, detune_cents=0.0):
    ff = f * 2 ** (detune_cents / 1200)
    ph = RNG.random()
    return signal.sawtooth(2 * np.pi * (ff * t + ph))


def env_exp(t, attack, decay):
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)


def automation(points, n=N):
    """Curva por tramos lineales [(t, valor), ...] muestreada en n muestras."""
    ts = np.array([p[0] for p in points]) * SR
    vs = np.array([p[1] for p in points])
    return np.interp(np.arange(n), ts, vs)


# --------------------------------------------------------------------------- #
# Instrumentos
# --------------------------------------------------------------------------- #
def boom(dur=4.0, f0=95, f1=30, drive=1.6, noise=0.35):
    t = tt(dur)
    freq = f1 + (f0 - f1) * np.exp(-t * 7)
    ph = 2 * np.pi * np.cumsum(freq) / SR
    sub = np.sin(ph) * np.exp(-t * 1.25)
    click = lp(RNG.standard_normal(len(t)) * np.exp(-t * 55), 3500)
    rumble = lp(RNG.standard_normal(len(t)), 180) * np.exp(-t * 1.8)
    x = np.tanh(drive * (sub + 0.5 * click + noise * rumble * 3))
    return fade(x, 0.001, 0.3)


def braam(dur=3.5, root="D1", gain=1.0):
    t = tt(dur)
    f = note(root)
    x = np.zeros_like(t)
    for m, det in ((1, 0), (1, 9), (1, -11), (2, 4), (2, -6), (1.5, 3), (3, 0)):
        x += saw(f * m, t, det) / (1 + 0.3 * m)
    env = env_exp(t, 0.035, 1.3)
    # filtro que se abre y se vuelve a cerrar
    cut = 220 + 1900 * np.exp(-t * 2.2) * (1 - np.exp(-t * 30))
    y = np.zeros_like(x)
    blk = 256
    zi = None
    for i in range(0, len(x), blk):
        fc = float(cut[min(i, len(cut) - 1)])
        b, a = signal.butter(2, fc / (SR / 2), "low")
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        y[i:i + blk], zi = signal.lfilter(b, a, x[i:i + blk], zi=zi)
    y = np.tanh(2.2 * y * env) * gain
    return fade(y, 0.002, 0.4)


def riser(dur, f_lo=250, f_hi=7000, tone=True):
    t = tt(dur)
    nz = RNG.standard_normal(len(t))
    x = sweep_filter(nz, f_lo, f_hi, "band", q=3.0, curve=1.6)
    amp = (t / dur) ** 2.4
    out = x * amp * 1.6
    if tone:
        # tono ascendente tipo Shepard
        f = 110 * 2 ** (3.2 * (t / dur) ** 1.4)
        ph = 2 * np.pi * np.cumsum(f) / SR
        out += (np.sin(ph) * 0.5 + np.sin(2 * ph) * 0.25 + np.sin(1.5 * ph) * 0.2) * amp * 0.5
    return fade(out, 0.05, 0.004)


def whoosh(dur=0.7, f0=400, f1=4500, peak=0.45):
    t = tt(dur)
    nz = RNG.standard_normal(len(t))
    u = t / dur
    x = sweep_filter(nz, f0, f1, "band", q=1.6, curve=0.8)
    env = np.exp(-((u - peak) / 0.22) ** 2)
    return fade(x * env * 1.4, 0.01, 0.05)


def tick(freq=3200, dur=0.035, noise=0.3):
    t = tt(dur)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 160) + noise * RNG.standard_normal(len(t)) * np.exp(-t * 400)
    return fade(hp(x, 800), 0.0005, 0.005)


def blip(freq=1500, dur=0.09):
    t = tt(dur)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t * 45) + 0.4 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t * 70)
    return fade(x, 0.002, 0.01)


def bell(freq, dur=2.5, index=2.0, ratio=3.5):
    """Campana FM."""
    t = tt(dur)
    mod = np.sin(2 * np.pi * freq * ratio * t) * index * np.exp(-t * 2.5)
    x = np.sin(2 * np.pi * freq * t + mod) * np.exp(-t * 1.6)
    return fade(x, 0.002, 0.2)


def pluck_synth(freq, dur=0.6, bright=1.0, decay=0.35):
    """Pulso tipo 'pluck' por síntesis aditiva (filtro implícito por armónico)."""
    t = tt(dur)
    x = np.zeros_like(t)
    K = int(min(24, 9000 / freq))
    for k in range(1, K + 1):
        x += (1 / k) * np.sin(2 * np.pi * k * freq * t) * np.exp(-t * (1 / decay) * (1 + 0.55 * k / bright))
    return fade(x * 0.6, 0.002, 0.03)


def karplus(freq, dur=4.0, bright=0.55, decay=0.9965, seed=0):
    """Cuerda pulsada (Karplus-Strong vectorizado por periodos)."""
    rng = np.random.default_rng(seed)
    true_n = SR / freq
    Nn = int(round(true_n + 0.5))  # el promediado (x[i]+x[i+1])/2 acorta el periodo medio muestra
    total = int(dur * SR)
    buf = rng.uniform(-1, 1, Nn)
    # brillo del ataque: suavizar el ruido inicial
    k = max(1, int((1 - bright) * 6))
    for _ in range(k):
        buf = 0.5 * (buf + np.roll(buf, 1))
    out = np.zeros(total + Nn)
    pos = 0
    while pos < total:
        out[pos:pos + Nn] = buf
        buf = decay * 0.5 * (buf + np.roll(buf, -1))
        pos += Nn
    out = out[:total]
    # corregir la afinación (el periodo entero redondea la frecuencia)
    src_t = np.arange(total) * ((Nn - 0.5) / true_n)
    out = np.interp(src_t, np.arange(total), out, right=0)
    out -= out.mean()
    return fade(out, 0.0005, 0.25)


def guitar_body(x):
    """Resonancias de caja de guitarra acústica."""
    y = x * 0.8
    for f, q, g in ((98, 3, 0.4), (205, 4, 0.3), (400, 5, 0.22), (2500, 1.5, 0.12)):
        bw = f / q
        b, a = signal.butter(2, [(f - bw / 2) / (SR / 2), (f + bw / 2) / (SR / 2)], "band")
        y = y + signal.lfilter(b, a, x) * g * 1.8
    return lp(hp(y, 70), 7000)


def strum(chord, dur=5.0, spacing=0.016, down=True, gain=1.0, bright=0.6, seed=0):
    out = np.zeros((int((dur + 0.2) * SR), 2))
    order = chord if down else list(reversed(chord))
    for i, n in enumerate(order):
        s = karplus(note(n), dur, bright=bright, decay=0.9972, seed=seed + i)
        s = guitar_body(s)
        p = -0.35 + 0.7 * (chord.index(n) / max(1, len(chord) - 1))
        st = pan(s, p) * (1.15 - 0.05 * chord.index(n))
        i0 = int(i * spacing * SR)
        out[i0:i0 + len(st)] += st[:len(out) - i0]
    # ruido de púa
    pick = lp(hp(RNG.standard_normal(int(0.03 * SR)), 1500), 6000) * np.exp(-tt(0.03) * 120) * 0.25
    out[:len(pick)] += pan(pick, 0.0)
    return out * gain


def pad(freqs, dur, cutoff=1400, detune=(0, 7, -9), attack=1.5, release=2.0, seed=0, gain=1.0,
        lfo_rate=0.11):
    t = tt(dur)
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    for j, f in enumerate(freqs):
        for k, d in enumerate(detune):
            s = saw(f, t, d)
            if (j + k) % 2 == 0:
                L += s
            else:
                R += s
            if k == 0:
                L += s * 0.5
                R += s * 0.5
    x = np.stack([L, R], -1) / (len(freqs) * len(detune))
    x = lp(x, cutoff, 2)
    x = lp(x, cutoff * 1.6, 2)
    env = np.minimum(np.clip(t / attack, 0, 1), np.clip((dur - t) / release, 0, 1)) ** 1.5
    lfo = 1 + 0.12 * np.sin(2 * np.pi * lfo_rate * t + seed)
    return x * (env * lfo * gain)[:, None]


def stepper_song(dur, seed=3):
    """El 'canto' de los motores paso a paso de la impresora."""
    rng = np.random.default_rng(seed)
    scale = [note(n) for n in ("D4", "F4", "G4", "A4", "C5", "D5", "F5", "A3", "C4")]
    pos = 0
    out = np.zeros(int(dur * SR))
    while pos < len(out):
        seg = int(rng.choice([0.08, 0.12, 0.16, 0.24, 0.32]) * SR)
        f = rng.choice(scale) * rng.choice([1, 1, 1, 0.5, 2])
        tseg = np.arange(seg) / SR
        sq = signal.square(2 * np.pi * f * tseg, duty=0.5) * 0.5 + np.sin(2 * np.pi * f * tseg) * 0.5
        # micro-glissando de aceleración del motor
        envs = np.minimum(1, np.minimum(tseg / 0.008, (seg / SR - tseg) / 0.008))
        if rng.random() < 0.25:
            envs *= 0.0  # pausas entre movimientos
        out[pos:pos + seg] += (sq * envs)[:len(out) - pos]
        pos += seg
    out = bp(out, 180, 2600)
    fan = lp(hp(rng.standard_normal(len(out)), 300), 2500) * 0.06
    return out * 0.5 + fan


def glitch(dur=0.3):
    t = tt(dur)
    x = RNG.standard_normal(len(t))
    # bit-crush y troceado
    x = np.round(x * 3) / 3
    gate = (np.sin(2 * np.pi * 37 * t) > 0.2).astype(float)
    return fade(bp(x * gate, 600, 5000) * np.exp(-t * 6), 0.001, 0.02)


def heartbeat():
    t = tt(0.5)
    def thump(f0):
        f = 40 + f0 * np.exp(-t * 25)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    x = thump(60)
    x2 = np.zeros(int(0.75 * SR))
    x2[:len(x)] += x
    i = int(0.22 * SR)
    x2[i:i + len(x)] += thump(45) * 0.7
    return fade(x2, 0.001, 0.05)


# --------------------------------------------------------------------------- #
# Reverb
# --------------------------------------------------------------------------- #
def reverb_ir(rt60=2.8, pre=0.02, seed=9):
    rng = np.random.default_rng(seed)
    dur = rt60 * 1.1
    t = tt(dur)
    tau = rt60 / 6.9
    env = np.exp(-t / tau)
    irs = []
    for ch in range(2):
        nz = rng.standard_normal(len(t))
        dark = lp(nz, 2500)
        mixk = np.clip(t / (rt60 * 0.5), 0, 1)
        ir = (nz * (1 - mixk) + dark * mixk * 1.6) * env
        p = int(pre * SR)
        ir = np.concatenate([np.zeros(p), ir])
        irs.append(ir)
    ir = np.stack(irs, -1)
    return ir / np.sqrt((ir ** 2).sum(0)).max()


def apply_reverb(x, ir, wet=0.3):
    out = np.zeros((len(x) + len(ir) - 1, 2))
    for ch in range(2):
        out[:, ch] = signal.fftconvolve(x[:, ch], ir[:, ch])
    return out[:len(x)] * wet


# --------------------------------------------------------------------------- #
# Composición
# --------------------------------------------------------------------------- #
def compose():
    music = Bus()   # música (va a reverb moderada)
    fx = Bus()      # efectos (reverb más larga)
    dry = Bus()     # impactos secos

    rev = C["reveal"]

    # ---------------- ACTO I: gancho ---------------- #
    dry.add(0.15, heartbeat(), 0.55)
    # silbido de la línea de luz
    d = C["line_end"] - C["line_start"] + 0.4
    t = tt(d)
    f = 700 * 2 ** (1.7 * np.clip(t / (d - 0.4), 0, 1))
    whine = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + bp(RNG.standard_normal(len(t)), 3000, 9000) * 0.25
    whine *= np.minimum(1, t / 0.15) * np.exp(-np.maximum(t - (d - 0.4), 0) * 6)
    fx.add(C["line_start"], fade(whine, 0.05, 0.1), 0.10, -0.3)
    # dron grave del gancho
    t = tt(C["act2"] + 1.0)
    sub = np.sin(2 * np.pi * note("D1") * t) * 0.6 + np.sin(2 * np.pi * note("D2") * t) * 0.25
    sub *= automation([(0, 0), (1.0, 0.5), (C["hit_render"], 0.7), (C["boom_black"], 0.9),
                       (C["act2"], 0.3), (C["act2"] + 1.0, 0)], len(t))
    music.add(0.0, pan(lp(sub, 200), 0), 0.30)
    music.add(0.6, pad([note("D3"), note("A3"), note("F4")], C["act2"] + 0.6, cutoff=700, attack=2.5,
                       release=1.5, gain=0.5), 0.55)
    # GOLPE "NO ES UN RENDER."
    dry.add(C["hit_render"], boom(4.0, 110, 30), 0.9)
    music.add(C["hit_render"], pan(braam(3.4, "D1"), 0), 0.55)
    fx.add(C["hit_render"] - 0.6, riser(0.6, 800, 9000, tone=False), 0.25)
    fx.add(C["glitch_out"], glitch(0.3), 0.35, 0.2)
    # destellos macro: golpes crecientes + platillo invertido
    for i in range(C["n_flashes"]):
        ts = C["flashes"] + i * C["flash_dur"]
        g = 0.45 + 0.1 * i
        dry.add(ts, boom(1.2, 140, 45, drive=2.0, noise=0.2), g)
        fx.add(ts, whoosh(0.4, 2000, 8000, 0.15), 0.18, -0.6 + 0.3 * i)
        rv = riser(C["flash_dur"] * 0.9, 1500, 9000, tone=False)
        fx.add(ts + C["flash_dur"] * 0.1, rv, 0.12)
    dry.add(C["boom_black"], boom(5.0, 80, 26, drive=1.8), 1.0)
    music.add(C["boom_black"], pan(braam(4.0, "D1", 1.0), 0), 0.6)
    # tic-tac que anuncia el acto II
    for k in range(3):
        fx.add(C["boom_black"] + 0.9 + k * BEAT * 0.5, tick(2400 if k % 2 else 1800, 0.04), 0.25)

    # ---------------- ACTOS II-IV: pulso armónico ---------------- #
    prog = [("D2", ["D3", "F3", "A3"]), ("A#1", ["A#2", "D3", "F3"]),
            ("F2", ["F2", "A2", "C3"]), ("C2", ["C3", "E3", "G3"])]
    t0 = C["act2"]
    t_end_pulse = C["act5"] - 0.3
    bar_i = 0
    tb = t0
    while tb < t_end_pulse:
        root, chord = prog[bar_i % 4]
        # pad del acorde
        in_act4 = tb >= C["act4"]
        cut = 1100 if tb < C["act3"] else (1600 if tb < C["act4"] else 1300)
        pg = 0.66 if tb < C["act3"] else (0.74 if not in_act4 else 0.82)
        music.add(tb, pad([note(n) for n in chord], BAR + 1.2, cutoff=cut, attack=0.6, release=1.2,
                          seed=bar_i, gain=pg), 0.5)
        # bajo / pulso
        step = BEAT / 2 if not in_act4 else BEAT
        nst = int(round(BAR / step))
        for k in range(nst):
            ts = tb + k * step
            if ts >= t_end_pulse:
                break
            f = note(root) * (2 if (k % 2 == 1 and not in_act4) else 1)
            acc = 1.0 if k % 4 == 0 else 0.72
            bright = 1.2 if tb >= C["act3"] else 0.9
            music.add(ts, pan(pluck_synth(f, 0.5, bright, 0.22), 0), 0.42 * acc)
            # arpegio agudo en el acto III
            if C["act3"] <= ts < C["act4"]:
                arp = [note(chord[(k) % 3]) * 4, note(chord[(k + 1) % 3]) * 4]
                music.add(ts, pan(pluck_synth(arp[k % 2], 0.35, 1.4, 0.12), 0.4 if k % 2 else -0.4), 0.06)
            # tic de reloj (acto III) en cada pulso
            if C["print_start"] <= ts < C["print_end"]:
                fx.add(ts, tick(3600 if k % 2 else 2800, 0.03, 0.5), 0.10, 0.3)
        bar_i += 1
        tb += BAR

    # ---------------- ACTO II: detalles ---------------- #
    # tic por cada día
    for d_ in range(21):
        ts = C["days_start"] + (C["days_end"] - C["days_start"]) * d_ / 20
        fx.add(ts, tick(2200 + 40 * d_, 0.03, 0.2), 0.16, -0.2 + 0.02 * d_)
    fx.add(C["act2"], whoosh(0.9, 300, 3000, 0.6), 0.25)
    for ts in (C["plate1"], C["plate2"], C["plate3"], C["plate4"]):
        fx.add(ts - 0.22, whoosh(0.55, 500, 6000, 0.45), 0.32, 0.5)
        fx.add(ts + 0.32, blip(1650, 0.08), 0.10, 0.35)
        fx.add(ts + 0.55, blip(2200, 0.06), 0.07, 0.4)
        dry.add(ts, boom(0.8, 160, 60, drive=1.2, noise=0.1), 0.22)
    # contador de triángulos: tics acelerando y golpe al millón
    k = 0
    tcur = C["tri_count"] + 0.1
    while tcur < C["tri_count"] + 1.1:
        fx.add(tcur, tick(4200, 0.02, 0.1), 0.10, 0.45)
        k += 1
        tcur += 0.09 * (0.93 ** k) + 0.018
    dry.add(C["tri_count"] + 1.12, boom(1.5, 130, 40), 0.42)
    fx.add(C["tri_count"] + 1.12, bell(note("A5"), 1.6, 1.5), 0.10, 0.4)
    # tarjetas y colapso
    fx.add(C["cards"], whoosh(0.8, 400, 4000, 0.4), 0.28, -0.3)
    fx.add(C["cards_collapse"] - 1.6, riser(1.6 + (C["act3"] - C["cards_collapse"]), 300, 8000), 0.40)

    # ---------------- ACTO III: impresión ---------------- #
    dry.add(C["act3"], boom(4.5, 90, 28), 0.8)
    music.add(C["act3"], pan(braam(3.0, "D1", 0.9), 0), 0.4)
    fx.add(C["print_start"] - 0.4, whoosh(0.6, 200, 1200, 0.7), 0.2)
    st = stepper_song(C["print_end"] - C["print_start"] + 0.3)
    st *= np.minimum(1, np.arange(len(st)) / (0.3 * SR))
    fx.add(C["print_start"], pan(st, 0.25), 0.085)
    fx.add(C["materialize"] - 2.2, riser(2.2, 300, 9000), 0.42)
    dry.add(C["materialize"], boom(4.0, 100, 30), 0.85)
    fx.add(C["materialize"], whoosh(1.2, 300, 6000, 0.35), 0.3)
    for i, n in enumerate(["D5", "F5", "A5", "D6", "F6", "A6"]):
        fx.add(C["materialize"] + 0.15 + i * 0.2, bell(note(n), 2.2, 1.2, 2.0), 0.06, -0.5 + 0.2 * i)

    # ---------------- ACTO IV: detalle ---------------- #
    dry.add(C["act4"], boom(2.5, 120, 40, drive=1.3), 0.45)
    fx.add(C["act4"] - 0.3, whoosh(0.7, 300, 3000, 0.4), 0.2)
    for ts in (C["macro_face"] + 0.25, C["macro_strings"] + 0.25):
        fx.add(ts, bell(note("D6"), 3.0, 1.0, 3.0), 0.05, -0.2)
        fx.add(ts + 0.12, bell(note("A6"), 3.0, 1.0, 3.0), 0.04, 0.2)
    for ts in (C["macro_hair"], C["macro_neck"], C["macro_strings"], C["macro_wood"]):
        fx.add(ts - 0.25, whoosh(0.5, 600, 2500, 0.5), 0.10, 0.0)
    for ts in (C["macro_flash1"], C["macro_flash2"]):
        dry.add(ts, boom(1.0, 150, 50, drive=1.6, noise=0.2), 0.35)
    music.add(C["act4"], pad([note("D2"), note("A2")], C["act5"] - C["act4"] + 0.5, cutoff=500,
                             attack=3.0, release=0.8, gain=0.6), 0.5)

    # ---------------- ACTO V: revelación ---------------- #
    pre = C["silence"] - C["act5"]
    fx.add(C["act5"], riser(pre, 200, 10000), 0.55)
    t = tt(pre)
    drone = np.sin(2 * np.pi * note("D2") * t) * (t / pre) ** 2 * 0.5
    music.add(C["act5"], pan(fade(drone, 0.5, 0.004), 0), 0.4)
    dry.add(C["act5"] + 0.2, heartbeat(), 0.45)
    dry.add(C["act5"] + 1.4, heartbeat(), 0.5)
    # tics acelerando con los destellos estroboscópicos
    from .scenes import STROBES
    for i, ts in enumerate(STROBES):
        fx.add(ts, tick(3000 + 200 * i, 0.03, 0.4), 0.22)
        dry.add(ts, boom(0.4, 180, 70, drive=1.5, noise=0.1), 0.15 + 0.03 * i)
    # (silencio entre C["silence"] y la revelación)
    # GOLPE + GUITARRA
    dry.add(rev, boom(6.0, 75, 24, drive=2.0, noise=0.5), 1.15)
    music.add(rev, pan(braam(4.5, "D1", 0.8), 0), 0.38)
    D_MAJOR = ["D2", "A2", "D3", "A3", "D4", "F#4"]
    music.add(rev + 0.01, strum(D_MAJOR, 6.0, 0.017, True, 1.0, 0.65, seed=10), 0.85)
    # pad mayor que resuelve
    music.add(rev, pad([note("D3"), note("F#3"), note("A3"), note("D4")], DURATION - rev, cutoff=1500,
                       attack=1.2, release=3.0, gain=0.75), 0.6)
    t = tt(DURATION - rev)
    subd = np.sin(2 * np.pi * note("D1") * t) * np.minimum(1, t / 1.0) * np.clip((DURATION - rev - t) / 3, 0, 1)
    music.add(rev, pan(lp(subd, 120), 0), 0.08)
    # letras del logotipo: pequeñas notas ascendentes
    for i, n in enumerate(["D5", "E5", "F#5", "A5", "B5"]):
        music.add(C["logo"] + i * 0.085 + 0.05, pan(pluck_synth(note(n), 0.6, 1.6, 0.18), -0.4 + 0.2 * i), 0.10)
    # antenas: dos "pops" simpáticos
    ta = C["logo"] + 5 * 0.085 + 0.9 * 0.55
    for j in range(2):
        tp = ta + j * 0.08 + 0.18
        t = tt(0.12)
        f = 520 * 2 ** (np.clip(t / 0.06, 0, 1) * 1.2)
        popx = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 30)
        fx.add(tp, fade(popx, 0.001, 0.02), 0.16, -0.2 + 0.4 * j)
        fx.add(tp + 0.05, bell(note("A6") if j == 0 else note("D7"), 1.5, 0.8, 2.0), 0.06, -0.2 + 0.4 * j)
    # brillo del barrido del logotipo
    fx.add(C["logo_sweep"], whoosh(0.9, 2000, 9000, 0.5), 0.10, 0.3)
    # arpegio de guitarra mientras se forma el logotipo y segundo rasgueo
    arp_notes = ["D3", "A3", "D4", "F#4", "A4", "F#4", "D4", "A3"]
    for i, n in enumerate(arp_notes):
        ts = rev + 1.25 + i * BEAT / 2
        s = guitar_body(karplus(note(n), 3.0, 0.6, 0.9968, seed=40 + i))
        music.add(ts, pan(s, -0.3 + 0.08 * i), 0.30)
    music.add(C["subtitle"], strum(D_MAJOR, 6.0, 0.02, True, 0.8, 0.55, seed=60), 0.6)
    music.add(C["subtitle"] + BEAT * 2, strum(["D3", "A3", "D4", "F#4"], 4.0, 0.022, False, 0.6, 0.5,
                                               seed=70), 0.35)
    # cierre
    music.add(C["end_line1"], strum(["D3", "A3", "D4", "F#4", "A4", "D5"], 6.5, 0.03, True, 0.7, 0.5,
                                    seed=80), 0.45)
    fx.add(C["end_line1"], bell(note("D6"), 4.0, 0.8, 2.0), 0.05)
    final = guitar_body(karplus(note("D4") * 2, 5.0, 0.4, 0.998, seed=99))  # armónico final
    music.add(C["end_line2"] + 1.6, pan(final, 0.1), 0.25)

    return music, fx, dry


def loudness(x):
    """Sonoridad integrada aproximada (ITU-R BS.1770, con compuertas)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(y[i:i + blk] ** 2, 0).sum() for i in range(0, len(y) - blk, hop)])
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    g = ms[L > -70]
    if not len(g):
        return -70.0
    rel = -0.691 + 10 * np.log10(g.mean()) - 10
    g2 = ms[L > max(-70, rel)]
    return float(-0.691 + 10 * np.log10(g2.mean()))


def master(music, fx, dry, target_lufs=-14.5):
    ir_m = reverb_ir(2.4, 0.02, 9)
    ir_f = reverb_ir(3.4, 0.03, 10)
    mix = music.x * 0.9 + apply_reverb(music.x, ir_m, 0.32)
    mix += fx.x * 0.85 + apply_reverb(fx.x, ir_f, 0.45)
    mix += dry.x + apply_reverb(dry.x, ir_f, 0.22)
    mix = hp(mix, 30)
    mix = mix - 0.35 * lp(mix, 55, 2)  # rebaja de subgraves (estante grave suave)
    # silencio absoluto antes del golpe final
    sil = np.ones(N)
    a, b = int(C["silence"] * SR), int(C["reveal"] * SR)
    ramp = int(0.04 * SR)
    sil[a:b] = 0
    sil[a - ramp:a] = np.linspace(1, 0, ramp)
    mix *= sil[:, None]
    # compresión suave (seguidor de envolvente)
    level = np.sqrt(lp(np.mean(mix ** 2, 1), 8, 1).clip(1e-12))
    thr = 0.22
    gain = np.where(level > thr, (thr / level) ** 0.45, 1.0)
    gain = lp(gain, 20, 1)
    mix = mix * gain[:, None]
    # saturación suave, normalización de pico y ajuste de sonoridad
    base = mix / np.abs(mix).max()
    drive = 1.15
    for _ in range(4):
        y = np.tanh(base * drive) / np.tanh(drive)
        y = y / np.abs(y).max() * 0.89  # -1 dBFS
        L = loudness(y)
        if abs(L - target_lufs) < 0.3:
            break
        drive *= 10 ** ((target_lufs - L) / 20 * 0.9)
    print(f"  sonoridad {L:.1f} LUFS (drive {drive:.2f})")
    mix = y
    # fundido final
    fo = np.clip((DURATION - np.arange(N) / SR) / 1.2, 0, 1)
    mix *= fo[:, None]
    return mix


def write_wav(path, x):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    y = (np.clip(x, -1, 1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(y.tobytes())


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/soundtrack.wav")
    a = ap.parse_args(argv)
    music, fx, dry = compose()
    mix = master(music, fx, dry)
    write_wav(a.out, mix)
    print("OK", a.out, f"{len(mix) / SR:.1f}s")


if __name__ == "__main__":
    main()
