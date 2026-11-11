"""Línea de tiempo maestra: los mismos puntos de sincronía sirven para la
imagen y para el sonido."""

FPS = 24
DURATION = 72.0
BPM = 96
BEAT = 60.0 / BPM  # 0.625 s
BAR = BEAT * 4     # 2.5 s

# Barras cinemáticas 2.39:1 sobre 1920x1080
BAR_PX = 138

C = dict(
    # ACTO I — gancho
    line_start=0.40, line_end=1.55, hook1=0.85,
    hit_render=2.60, glitch_out=4.12,
    flashes=4.40, flash_dur=0.44, n_flashes=5,
    boom_black=6.60,
    # ACTO II — lo digital
    act2=8.00, days_start=8.25, days_end=10.15,
    plate1=10.50, plate2=13.00, plate3=15.50, tri_count=16.25, plate4=18.50,
    cards=21.00, cards_collapse=23.10,
    # ACTO III — lo físico
    act3=24.00, print_start=26.00, print_end=33.60,
    materialize=33.80, mat_end=35.40,
    # ACTO IV — el detalle
    act4=36.00, macro_face=38.50, macro_hair=41.00, macro_neck=43.50,
    macro_strings=46.00, macro_wood=48.50, macro_flash1=50.90, macro_flash2=51.40,
    # ACTO V — revelación
    act5=52.00, presentamos=52.90, strobe=54.30, silence=55.55,
    reveal=56.00, logo=56.90, logo_sweep=59.10, subtitle=60.00,
    endcard=64.00, end_line1=64.70, end_line2=65.70, fade_out=70.40,
)

# Golpes de cámara (t, amplitud px, duración s)
SHAKES = [
    (C["hit_render"], 16, 0.7),
    *[(C["flashes"] + i * C["flash_dur"], 6 + 2 * i, 0.3) for i in range(C["n_flashes"])],
    (C["boom_black"], 10, 0.6),
    (C["plate3"] + 1.05, 6, 0.35),
    (C["print_start"] - 2.0, 7, 0.5),
    (C["materialize"], 9, 0.6),
    (C["reveal"], 14, 0.9),
]

# Destellos (t, duración, intensidad, color)
FLASHES = [
    (C["hit_render"], 0.16, 0.85, (1.0, 1.0, 1.0)),
    *[(C["flashes"] + i * C["flash_dur"], 0.08, 0.6, (1.0, 0.95, 0.88)) for i in range(C["n_flashes"])],
    (C["plate1"], 0.10, 0.35, (0.75, 1.0, 0.98)),
    (C["materialize"], 0.22, 0.75, (0.85, 1.0, 1.0)),
    (C["act4"], 0.12, 0.25, (1.0, 0.9, 0.8)),
    (C["reveal"], 0.55, 1.0, (1.0, 0.97, 0.92)),
]

# Aberración cromática por impacto (t, k, duración)
ABERR = [
    (C["hit_render"], 0.010, 0.5),
    *[(C["flashes"] + i * C["flash_dur"], 0.006, 0.18) for i in range(C["n_flashes"])],
    (C["materialize"], 0.006, 0.4),
    (C["reveal"], 0.008, 0.6),
]
