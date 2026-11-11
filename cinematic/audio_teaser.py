"""Banda sonora épica del teaser de OBEKET (32 s, 90 BPM, Re menor que se abre a Re
mayor en la revelación), sincronizada con cinematic/teaser.py.

Golpe grave con el símbolo de OBEKET, tambores en cada corte, ostinato de cuerdas y
metales graves que crecen, subida con redoble y silencio antes de YAMPI, gran golpe
con el acorde mayor y firma final con campanas para el logotipo.

Uso: python -m cinematic.audio_teaser --out build/score_teaser.wav
"""
from __future__ import annotations

import argparse

import numpy as np

from . import audio as A
from .audio import (SR, Bus, apply_reverb, bell, boom, bp, braam, env_exp, fade, hp, loudness, lp, note,
                    reverb_ir, riser, saw, tt, whoosh, write_wav)
from .audio2 import cello, strings
from .teaser import BAR5, DURATION5, T5

BEAT = BAR5 / 4
N = int(SR * DURATION5)
RNG = np.random.default_rng(2026)


# --------------------------------------------------------------------------- #
# Instrumentos
# --------------------------------------------------------------------------- #
def taiko(f0=60.0, dur=1.6, bright=0.5):
    t = tt(dur)
    f = f0 * (1 + 0.55 * np.exp(-t * 28))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 4.0)
    skin = bp(RNG.standard_normal(len(t)), 110, 900 + 1800 * bright) * np.exp(-t * 30) * 0.9
    return fade(np.tanh(1.8 * (body + skin)), 0.0008, 0.12)


def tom(f0=180.0, dur=0.5):
    t = tt(dur)
    f = f0 * (1 + 0.4 * np.exp(-t * 40))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    nz = bp(RNG.standard_normal(len(t)), 400, 4000) * np.exp(-t * 55) * 0.6
    return fade(np.tanh(1.4 * (body + nz)), 0.0005, 0.05)


def crash(dur=4.5):
    t = tt(dur)
    nz = RNG.standard_normal((len(t), 2))
    x = hp(nz, 3200) * np.exp(-t * 1.0)[:, None] + bp(nz, 5000, 9000) * np.exp(-t * 2.4)[:, None] * 0.6
    edge = fade(np.ones(len(t)), 0.001, 0.6)
    return x * 0.35 * edge[:, None]


def spiccato(freq, dur=0.2):
    """Cuerdas en golpe de arco corto (ostinato)."""
    t = tt(dur + 0.25)
    x = (saw(freq, t, -7) + saw(freq, t, 0) + saw(freq, t, 8)) / 3
    x = lp(lp(x, 2600), 3600)
    return fade(x * env_exp(t, 0.006, 0.11), 0.002, 0.05)


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
    hits.add(0.30, boom(3.2, f0=80, f1=28, drive=1.4, noise=0.25), 0.8)
    fx.add(0.32, bell(note("D5"), 3.2), 0.10, p=-0.25)
    fx.add(0.95, bell(note("A5"), 3.0), 0.07, p=0.25)
    low.add(0.0, drone(note("D1"), T5["imp"] + 0.4), 0.45)
    strg.add(0.5, strings([note("D3"), note("A3")], T5["imp"] - 0.5, attack=1.6, release=0.8, bright=0.2), 0.22)

    # 2. gancho: tambor en cada corte y latido entre medias
    for t0 in (T5["ojos"], T5["antena"]):
        hits.add(t0, taiko(52, 2.2), 0.95)
        fx.add(t0 - 0.42, whoosh(0.55, 300, 3200, 0.8), 0.22)
        for k in (1, 2, 3):
            drums.add(t0 + k * b, taiko(70, 0.9, 0.3), 0.30 if k != 2 else 0.42)

    # 3. sección rítmica (impresión, despiece, órbita, detalles)
    for i, (tri, root) in enumerate(PROG):
        t0 = T5["imp"] + i * B
        g = 1.0 + 0.12 * i
        low.add(t0, braam(B * 0.95, root=root), 0.30 * g)
        low.add(t0, cello(note(root) * 2, B * 0.9, attack=0.05, release=0.4), 0.22 * g)
        strg.add(t0, strings([note(n) for n in tri], B * 0.95, attack=0.2, release=0.5, bright=0.4 + 0.1 * i),
                 0.24 * g)
        octs = 2 if i < 3 else 4
        for k in range(8):
            n = tri[OSTINATO[k]]
            acc = 1.0 if k % 2 == 0 else 0.72
            strg.add(t0 + k * b / 2, spiccato(note(n) * octs), 0.15 * acc * g, p=0.35 if k % 2 else -0.35)
        drums.add(t0, taiko(56, 1.6), 0.85)
        drums.add(t0 + 2 * b, taiko(64, 1.4), 0.60)
        drums.add(t0 + 3 * b + b / 2, taiko(70, 1.2), 0.45)
        for k in range(1, 8, 2):
            drums.add(t0 + k * b / 2, tom(190 + 25 * (k % 3)), 0.16 + 0.03 * i)
        if i >= 3:  # semicorcheas al final del compás
            for k in range(4):
                drums.add(t0 + 3 * b + k * b / 4, tom(230 - 12 * k), 0.14 + 0.04 * k)
    for t0 in (T5["despiece"], T5["orbita"], T5["cara"], T5["cuerdas"]):
        fx.add(t0 - 0.45, whoosh(0.6, 250, 4200, 0.78), 0.26)
    for t0 in (T5["orbita"], T5["cara"], T5["clavijero"], T5["cuerdas"], T5["contrapicado"]):
        hits.add(t0, taiko(50, 1.8), 0.55)

    # 4. "Presentamos": nota aguda, subida, redoble y silencio
    P0, R0 = T5["presentamos"], T5["revelacion"]
    strg.add(P0, strings([note("A4"), note("D5")], R0 - P0 - 0.35, attack=0.25, release=0.2, bright=0.65), 0.20)
    fx.add(P0 + 0.25, riser(R0 - P0 - 0.65), 0.55)
    tr, step, k = P0 + 1.35, 0.30, 0
    while tr < R0 - 0.45:
        drums.add(tr, taiko(62 + 3 * k, 0.8, 0.45), 0.25 + 0.05 * k)
        tr += step
        step = max(0.07, step * 0.80)
        k += 1

    # 5. revelación: el gran golpe y el acorde mayor
    hits.add(R0, boom(5.0, f0=110, f1=26, drive=2.0, noise=0.4), 1.0)
    hits.add(R0, taiko(46, 3.0), 1.0)
    hits.add(R0, taiko(74, 2.0), 0.55)
    hits.add(R0, crash(5.0), 0.75)
    low.add(R0, braam(5.0, root="D1"), 0.55)
    low.add(R0, cello(note("D2"), 4.6, attack=0.04, release=1.2), 0.32)
    strg.add(R0, strings([note(n) for n in ("D3", "A3", "D4", "F#4", "A4")], 4.6, attack=0.06, release=1.4,
                         bright=0.7), 0.50)
    drums.add(R0 + B, taiko(54, 2.0), 0.55)

    # 6. firma de OBEKET
    M0 = T5["marca"]
    hits.add(M0, boom(5.0, f0=85, f1=26, drive=1.5, noise=0.3), 0.70)
    fx.add(M0 + 0.40, bell(note("D5"), 4.0), 0.13, p=-0.2)
    fx.add(M0 + 0.95, bell(note("A5"), 4.0), 0.09, p=0.2)
    fx.add(M0 + 1.55, bell(note("F#5"), 4.0), 0.08)
    strg.add(M0, strings([note(n) for n in ("D3", "A3", "D4", "F#4")], DURATION5 - M0 - 0.4, attack=0.5,
                         release=1.4, bright=0.35), 0.32)
    low.add(M0, drone(note("D1"), DURATION5 - M0), 0.30)
    return drums, strg, low, fx, hits


def master(buses, target=-14.0):
    drums, strg, low, fx, hits = buses
    ir_big = reverb_ir(3.2, 0.025, 31)
    ir_room = reverb_ir(1.4, 0.010, 32)
    mix = (drums.x * 0.85 + apply_reverb(drums.x, ir_room, 0.30) + apply_reverb(drums.x, ir_big, 0.15) +
           strg.x * 0.85 + apply_reverb(strg.x, ir_big, 0.35) +
           low.x * 0.90 + apply_reverb(low.x, ir_big, 0.20) +
           fx.x * 0.85 + apply_reverb(fx.x, ir_big, 0.40) +
           hits.x * 0.95 + apply_reverb(hits.x, ir_big, 0.30))
    mix = hp(mix, 30)
    mix = mix - 0.30 * lp(mix, 55, 2)
    # silencio absoluto antes de YAMPI
    a, b_ = int((T5["revelacion"] - 0.40) * SR), int(T5["revelacion"] * SR)
    ramp = int(0.05 * SR)
    g = np.ones(len(mix))
    g[a - ramp:a] = np.linspace(1, 0, ramp)
    g[a:b_] = 0
    mix *= g[:, None]
    lvl = np.sqrt(lp(np.mean(mix ** 2, 1), 8, 1).clip(1e-12))
    thr = 0.22
    gain = np.where(lvl > thr, (thr / lvl) ** 0.45, 1.0)
    mix *= lp(gain, 20, 1)[:, None]
    base = mix / np.abs(mix).max()
    drive = 1.2
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
    fo = np.clip((DURATION5 - np.arange(len(y)) / SR) / 1.4, 0, 1)
    print(f"  sonoridad {L:.1f} LUFS")
    return y * fo[:, None]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="build/score_teaser.wav")
    a = ap.parse_args(argv)
    y = master(compose())
    write_wav(a.out, y)
    print("OK", a.out, f"{len(y) / SR:.1f}s")


if __name__ == "__main__":
    main()
