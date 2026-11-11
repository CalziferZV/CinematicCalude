"""Banda sonora de la v2: composición original para piano, guitarra punteada,
cuerdas y chelo (72 BPM, Re mayor), sincronizada con cinematic/film2.py.

Uso: python -m cinematic.audio2 --out build/score2.wav
"""
from __future__ import annotations

import argparse
import math

import numpy as np

from .audio import (SR, Bus, apply_reverb, bell, fade, guitar_body, hp, karplus, loudness, lp, note, pan,
                    reverb_ir, tt, write_wav)
from .film2 import BAR, DURATION, T

BEAT = BAR / 4
N = int(SR * DURATION)
RNG = np.random.default_rng(72)


# --------------------------------------------------------------------------- #
# Instrumentos
# --------------------------------------------------------------------------- #
def piano(freq, dur, vel=0.6, release=0.6):
    """Piano de fieltro por síntesis aditiva (parciales inarmónicos, doble
    caída, cuerdas al unísono ligeramente desafinadas y martillo)."""
    tot = dur + release + 2.5
    t = tt(tot)
    out = np.zeros_like(t)
    B = 0.00032
    K = int(min(20, 9000 / freq))
    ref = (261.6 / freq) ** 0.55
    for k in range(1, K + 1):
        fk = k * freq * math.sqrt(1 + B * k * k)
        amp = (1.0 / k ** 1.25) * math.exp(-(k - 1) * (0.42 - 0.25 * vel))
        tau_s = 3.2 * ref / k ** 0.65
        tau_f = tau_s * 0.12
        env = 0.55 * np.exp(-t / tau_f) + 0.45 * np.exp(-t / tau_s)
        for det, w in ((-0.00045, 0.5), (0.00050, 0.5)):
            ph = RNG.random() * 6.283
            out += amp * w * env * np.sin(2 * np.pi * fk * (1 + det) * t + ph)
    # martillo y fieltro
    ham = lp(RNG.standard_normal(len(t)) * np.exp(-t * 180), 2200) * 0.05 * vel
    out = out + ham
    out = lp(out, 2400 + 3600 * vel)
    # apagador al soltar la tecla
    rel = np.ones_like(t)
    i0 = int(dur * SR)
    if i0 < len(t):
        rel[i0:] = np.exp(-(t[i0:] - dur) / (release * 0.45))
    out *= rel
    a = int(0.003 * SR)
    out[:a] *= np.linspace(0, 1, a)
    return out * vel


def strings(freqs, dur, attack=1.2, release=1.8, bright=0.5, vib=0.0028, gain=1.0):
    """Sección de cuerdas: varias voces de sierra desafinadas, vibrato y filtro suave."""
    tot = dur + release
    t = tt(tot)
    L = np.zeros_like(t)
    R = np.zeros_like(t)
    for j, f in enumerate(freqs):
        for v, det in enumerate((-11, -5, 0, 6, 12)):
            ph = RNG.random()
            rate = 4.8 + RNG.random() * 1.0
            vdepth = vib * np.clip((t - 0.5) / 0.8, 0, 1)
            inst = f * 2 ** (det / 1200) * (1 + vdepth * np.sin(2 * np.pi * rate * t + RNG.random() * 6.28))
            phase = 2 * np.pi * np.cumsum(inst) / SR + ph * 6.283
            s = 2 * ((phase / (2 * np.pi)) % 1.0) - 1
            if (j + v) % 2:
                L += s
            else:
                R += s
    x = np.stack([L, R], -1) / (len(freqs) * 3.0)
    fc = 1300 + 2400 * bright
    x = lp(lp(x, fc), fc * 1.4)
    x = hp(x, 110)
    env = np.minimum(np.clip(t / attack, 0, 1), np.clip((tot - t) / release, 0, 1))
    env = np.sin(env * np.pi / 2) ** 2
    return x * env[:, None] * gain


def cello(freq, dur, attack=0.35, release=1.2, gain=1.0):
    t = tt(dur + release)
    inst = freq * (1 + 0.003 * np.clip((t - 0.4) / 0.6, 0, 1) * np.sin(2 * np.pi * 5.2 * t))
    phase = 2 * np.pi * np.cumsum(inst) / SR
    s = 2 * ((phase / (2 * np.pi)) % 1.0) - 1
    s = lp(lp(s, 900), 1300)
    env = np.minimum(np.clip(t / attack, 0, 1), np.clip((dur + release - t) / release, 0, 1))
    return s * np.sin(env * np.pi / 2) ** 2 * gain


def pluck(n, dur=3.2, bright=0.45, seed=0):
    return guitar_body(karplus(note(n), dur, bright=bright, decay=0.9968, seed=seed))


def soft_timpani(f0=73.4, dur=3.0):
    t = tt(dur)
    f = f0 * (1 + 0.15 * np.exp(-t * 18))
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    nz = lp(RNG.standard_normal(len(t)), 300) * np.exp(-t * 6) * 0.4
    return fade((s + nz) * 0.8, 0.004, 0.3)


def swell(dur):
    """Platillo invertido muy suave (ruido filtrado en crescendo)."""
    t = tt(dur)
    nz = hp(lp(RNG.standard_normal(len(t)), 9000), 2500)
    return nz * (t / dur) ** 3 * 0.25


# --------------------------------------------------------------------------- #
# Armonía y melodía
# --------------------------------------------------------------------------- #
GUITAR = {  # bajo, voces (de grave a agudo)
    "Dmaj7": ("D3", ["A3", "C#4", "F#4"], "A2"),
    "Bm7": ("B2", ["F#3", "A3", "D4"], "F#2"),
    "Gmaj7": ("G2", ["B3", "D4", "F#4"], "D3"),
    "Asus": ("A2", ["E3", "A3", "D4"], "E3"),
    "A": ("A2", ["E3", "A3", "C#4"], "E3"),
    "Em7": ("E2", ["B2", "D3", "G3"], "B2"),
    "D/F#": ("F#2", ["A3", "D4", "F#4"], "D3"),
    "G/D": ("D3", ["G3", "B3", "D4"], "A2"),
    "D": ("D3", ["A3", "D4", "F#4"], "A2"),
    "Dadd9": ("D3", ["A3", "E4", "F#4"], "A2"),
}
PAD = {
    "Dmaj7": ["D3", "A3", "C#4", "F#4"], "Bm7": ["B2", "F#3", "A3", "D4"], "Gmaj7": ["G2", "D3", "F#3", "B3"],
    "Asus": ["A2", "E3", "A3", "D4"], "A": ["A2", "E3", "A3", "C#4"], "Em7": ["E2", "B2", "D3", "G3"],
    "D/F#": ["F#2", "A3", "D4", "F#4"], "G/D": ["D3", "G3", "B3", "D4"], "D": ["D3", "A3", "D4", "F#4"],
    "Dadd9": ["D3", "A3", "E4", "F#4"],
}
# un acorde por compás (los dos acordes del compás 3 y 8 se reparten en mitades)
PROG = [
    "Dmaj7", "Bm7", "Gmaj7", ("Asus", "A"),          # 0-3  apertura / capa a capa
    "Dmaj7", "Bm7", "Gmaj7",                          # 4-6  despiece
    "Em7", ("Asus", "A"),                             # 7-8  órbita
    "Bm7", "Gmaj7", "D/F#", "Em7",                    # 9-12 detalle
    "Asus",                                           # 13   respiración
    "D", "G/D", "D",                                  # 14-16 revelación
    "Gmaj7", "A",                                     # 17-18 epílogo
    "Dadd9",                                          # 19    cierre
]
MOTIF = [  # (pulso inicial, duración en pulsos, nota) por compás
    [(0, 1.5, "F#5"), (1.5, 0.5, "E5"), (2, 1, "D5"), (3, 1, "A4")],
    [(0, 2, "B4"), (2, 0.5, "C#5"), (2.5, 0.5, "D5"), (3, 1, "F#5")],
    [(0, 1.5, "E5"), (1.5, 0.5, "D5"), (2, 2, "B4")],
    [(0, 1, "A4"), (1, 1, "D5"), (2, 2, "C#5")],
]


def chord_at(bar_i, half):
    c = PROG[bar_i]
    if isinstance(c, tuple):
        return c[half]
    return c


def compose():
    pno = Bus()
    gtr = Bus()
    strg = Bus()
    low = Bus()
    fx = Bus()

    def t_of(bar_i, beat=0.0):
        return bar_i * BAR + beat * BEAT

    n_bars = len(PROG)
    reveal_bar = 14

    for b in range(n_bars):
        tb = t_of(b)
        # ---------- pad de cuerdas ----------
        if b >= 1 and b != 13:
            for half in (0, 1) if isinstance(PROG[b], tuple) else (0,):
                c = chord_at(b, half)
                dur = BAR if not isinstance(PROG[b], tuple) else BAR / 2
                g = 0.30
                if 7 <= b <= 8:
                    g = 0.36 + 0.06 * (b - 7)
                if 9 <= b <= 12:
                    g = 0.42 + 0.08 * (b - 9)
                if b >= reveal_bar and b <= 16:
                    g = 0.85 if b == 14 else (0.75 if b == 15 else 0.55)
                if b >= 17:
                    g = 0.36
                bright = 0.35 + (0.35 if 9 <= b <= 16 else 0.0)
                freqs = [note(n) for n in PAD[c]]
                if b >= reveal_bar and b <= 16:
                    freqs = freqs + [note(PAD[c][-1]) * 2]  # voz aguda en la revelación
                strg.add(tb + half * BAR / 2, strings(freqs, dur + 0.25, attack=0.9 if b != reveal_bar else 0.25,
                                                      release=1.6, bright=bright), g)
        # ---------- chelo ----------
        if 4 <= b <= 12 or 14 <= b <= 16:
            c = chord_at(b, 0)
            root = GUITAR[c][0]
            f = note(root) / (2 if note(root) > 120 else 1)
            low.add(tb, pan(cello(f, BAR - 0.1, gain=1.0), -0.15), 0.32 if b < 14 else 0.42)
        # ---------- guitarra punteada ----------
        if 2 <= b <= 12 or 14 <= b <= 18:
            for half in (0, 1):
                c = chord_at(b, half)
                bass, tones, bass2 = GUITAR[c]
                pattern = [bass, tones[0], tones[1], tones[2], bass2, tones[1], tones[2], tones[0]]
                for k in range(4):
                    beat = half * 2 + k * 0.5
                    if b == reveal_bar and half == 0 and k == 0:
                        continue  # el rasgueo ocupa el primer pulso
                    n = pattern[half * 4 + k]
                    hum = (RNG.random() - 0.5) * 0.018
                    vel = (0.78 if k == 0 else 0.55) * (0.9 + 0.2 * RNG.random())
                    if b >= 17:
                        vel *= 1.05
                    p = -0.25 + 0.5 * RNG.random()
                    gtr.add(t_of(b, beat) + hum, pan(pluck(n, 3.0, 0.42, seed=b * 31 + half * 7 + k), p), 0.30 * vel)
        # ---------- piano ----------
        if b <= 3:
            for (st, du, n) in MOTIF[b]:
                pno.add(t_of(b, st), pan(piano(note(n), du * BEAT, vel=0.55), 0.12), 0.9)
            pno.add(tb, pan(piano(note(GUITAR[chord_at(b, 0)][0]) / 2, BAR * 0.9, vel=0.35), -0.2), 0.55)
        if 9 <= b <= 12:
            for (st, du, n) in MOTIF[b - 9]:
                pno.add(t_of(b, st), pan(piano(note(n), du * BEAT, vel=0.62), 0.1), 0.9)
                # violines doblan la melodía una octava arriba
                strg.add(t_of(b, st), strings([note(n) * 2], du * BEAT + 0.15, attack=0.18, release=0.8,
                                              bright=0.5, vib=0.004), 0.16 + 0.03 * (b - 9))
        if 4 <= b <= 8:
            # acordes suaves del piano en el primer pulso
            c = chord_at(b, 0)
            for i, n in enumerate(PAD[c][1:]):
                pno.add(tb + i * 0.03, pan(piano(note(n), BAR * 0.8, vel=0.32), -0.1 + 0.1 * i), 0.5)
    # ---------- compás 13: respiración ----------
    t13 = t_of(13)
    high = strings([note("A5"), note("E6")], BAR - 0.55, attack=0.6, release=0.35, bright=0.2, vib=0.003)
    strg.add(t13, high, 0.22)
    low.add(t13, pan(cello(note("A2") / 2, BAR - 0.8, release=0.5), 0), 0.28)
    fx.add(t13 + BAR - 2.2, pan(swell(2.15), 0.0), 0.5)
    # ---------- revelación ----------
    rv = T["revelacion"]
    fx.add(rv, pan(soft_timpani(note("D2")), 0), 0.75)
    D_STRUM = ["D2", "A2", "D3", "A3", "D4", "F#4"]
    for i, n in enumerate(D_STRUM):
        gtr.add(rv + i * 0.021, pan(pluck(n, 5.5, 0.55, seed=200 + i), -0.3 + 0.12 * i), 0.36)
    arp = ["D4", "F#4", "A4", "D5", "F#5", "A5", "D6"]
    for i, n in enumerate(arp):
        pno.add(rv + 0.05 + i * BEAT / 3, pan(piano(note(n), 2.2, vel=0.5 + 0.03 * i), -0.3 + 0.1 * i), 0.8)
    for (st, du, n) in [(0, 1.5, "F#5"), (1.5, 0.5, "E5"), (2, 2, "D5")]:
        pno.add(t_of(15, st), pan(piano(note(n), du * BEAT, vel=0.6), 0.1), 0.9)
    for (st, du, n) in [(0, 1, "A4"), (1, 1, "B4"), (2, 2, "A4")]:
        pno.add(t_of(16, st), pan(piano(note(n), du * BEAT, vel=0.5), 0.1), 0.85)
    # campanitas cuando brotan las antenas del logotipo
    ant = rv + 1.6 + 0.10 * 5 + 0.9 + 0.3
    for i, n in enumerate(["D6", "A6", "F#6"]):
        fx.add(ant + i * 0.12, pan(bell(note(n), 2.5, 0.9, 2.0), -0.3 + 0.3 * i), 0.07)
    fx.add(rv + 4.2, pan(swell(1.2) * 0.4, 0.2), 0.3)
    # ---------- cierre ----------
    tf = t_of(19)
    for i, n in enumerate(["D5", "E5", "F#5", "A5"]):
        pno.add(tf + i * BEAT * 0.5, pan(piano(note(n), 3.0, vel=0.42), -0.2 + 0.13 * i), 0.8)
    harm = guitar_body(karplus(note("D4") * 2, 4.5, 0.35, 0.9985, seed=999))
    gtr.add(tf + BEAT * 2.5, pan(harm, 0.1), 0.30)
    strg.add(tf, strings([note(n) for n in PAD["Dadd9"]], DURATION - tf, attack=1.0, release=2.0, bright=0.3),
             0.30)
    return pno, gtr, strg, low, fx


def master(buses, target=-16.0):
    pno, gtr, strg, low, fx = buses
    ir = reverb_ir(3.6, 0.03, 21)
    ir_small = reverb_ir(1.6, 0.012, 22)
    mix = (pno.x * 0.85 + apply_reverb(pno.x, ir, 0.34) +
           gtr.x * 0.9 + apply_reverb(gtr.x, ir_small, 0.22) + apply_reverb(gtr.x, ir, 0.16) +
           strg.x * 0.8 + apply_reverb(strg.x, ir, 0.42) +
           low.x * 0.9 + apply_reverb(low.x, ir, 0.25) +
           fx.x * 0.9 + apply_reverb(fx.x, ir, 0.35))
    mix = hp(mix, 32)
    # silencio de respiración justo antes de la revelación
    a, b = int((T["revelacion"] - 0.42) * SR), int(T["revelacion"] * SR)
    ramp = int(0.35 * SR)
    g = np.ones(len(mix))
    g[a - ramp:a] = np.linspace(1, 0, ramp) ** 2
    g[a:b] = 0
    mix *= g[:, None]
    # compresión suave
    lvl = np.sqrt(lp(np.mean(mix ** 2, 1), 6, 1).clip(1e-12))
    thr = 0.18
    gain = np.where(lvl > thr, (thr / lvl) ** 0.35, 1.0)
    mix *= lp(gain, 12, 1)[:, None]
    base = mix / np.abs(mix).max()
    drive = 1.05
    for _ in range(5):
        y = np.tanh(base * drive) / np.tanh(drive)
        y = y / np.abs(y).max() * 0.89
        L = loudness(y)
        if abs(L - target) < 0.3:
            break
        drive *= 10 ** ((target - L) / 20 * 0.9)
    if L > target:
        y = y * 10 ** ((target - L) / 20)
        L = loudness(y)
    fo = np.clip((DURATION - np.arange(len(y)) / SR) / 1.5, 0, 1)
    print(f"  sonoridad {L:.1f} LUFS")
    return y * fo[:, None]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/score2.wav")
    a = ap.parse_args(argv)
    import cinematic.audio as A
    A.N = N  # longitud de los buses = duración de la v2
    buses = compose()
    y = master(buses)
    write_wav(a.out, y)
    print("OK", a.out, f"{len(y) / SR:.1f}s")


if __name__ == "__main__":
    main()
