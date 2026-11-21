// Bandas sonoras reales de cada reel: música (Kevin MacLeod, incompetech.com, CC-BY 4.0) y efectos
// de sonido grabados (Freesound, CC0). Ver audio/CREDITOS.md.
//   m: pista de música → { f: archivo, from: segundo de la pista, at: segundo del reel, dur, gain, fin, fout }
//   s: efecto         → { f, at, from, dur, gain, fout }
const M = (f) => `audio/musica/${f}.mp3`, E = (f) => `audio/efectos/${f}.mp3`;
const whoosh = (at, gain = 0.6) => ({ f: E('woosh-quick'), at: at - 0.2, gain, dur: 0.8 });
const pop = (at, gain = 0.55) => ({ f: E('pop'), at: at - 0.1, gain });
const printer = (at, dur, gain = 2.2) => ({ f: E('printer'), at, from: 2 + at, dur, gain, fin: 0.2, fout: 0.3 });

export const SOUNDTRACKS = {
  'reel-marca': {
    m: [{ f: M('exit-the-premises'), from: 3.0, at: 0, dur: 20, gain: 1, fout: 1.6 }],
    s: [printer(0, 4.1, 2.6), { f: E('impact'), at: 3.95, from: 0.05, dur: 2.0, gain: 0.8 },
      whoosh(8), whoosh(10), whoosh(12), ...[0, 2, 4, 6, 8].map((i) => pop(13.2 + i * 0.07, 0.35)),
      whoosh(16), { f: E('magic'), at: 16.0, from: 0.2, dur: 3.8, gain: 1.6, fout: 1 }],
  },
  'reel-navidad': {
    m: [{ f: M('nouvelle-noel'), from: 0.75, at: 0, dur: 22, gain: 1, fout: 1.6 }],
    s: [printer(0.1, 3.6, 2.2), { f: E('magic'), at: 3.5, from: 0.2, dur: 2.5, gain: 1.4, fout: 0.8 },
      whoosh(6), pop(6.56), pop(7.89), pop(9.22), whoosh(10), printer(10.05, 2.4, 1.6), whoosh(14), printer(14.05, 1.9, 1.6),
      whoosh(18), { f: E('hit'), at: 18.0, dur: 2.5, gain: 0.55, fout: 1 }, { f: E('sleigh'), at: 18.1, from: 1, dur: 3.5, gain: 2.5, fin: 0.3, fout: 1 }],
  },
  'reel-ultimo-dia': {
    m: [{ f: M('jingle-bells-3'), from: 5.0, at: 0, dur: 12, gain: 1, fout: 1.2 }],
    s: [printer(0.1, 3.4, 1.8), pop(0.35, 0.5), whoosh(6), { f: E('hit'), at: 6.1, dur: 2.5, gain: 0.7, fout: 1 },
      { f: E('sleigh'), at: 6.2, from: 2, dur: 3, gain: 2.4, fin: 0.3, fout: 1 }],
  },
  'reel-cine': {
    m: [{ f: M('the-snow-queen'), from: 0, at: 0, dur: 18, gain: 1.15, fin: 0.6, fout: 2.2 }],
    s: [printer(0, 4.2, 3.2), { f: E('whoosh'), at: 3.85, dur: 0.5, gain: 0.35 }, { f: E('whoosh'), at: 7.85, dur: 0.5, gain: 0.35 },
      { f: E('whoosh'), at: 11.85, dur: 0.5, gain: 0.35 }, { f: E('magic'), at: 12.0, from: 0.2, dur: 3.2, gain: 1.3, fout: 1.2 },
      { f: E('impact'), at: 15.45, from: 0.05, dur: 2.2, gain: 0.9, fout: 0.8 }],
  },
  'reel-viral': {
    m: [{ f: M('jingle-bells-calm'), from: 10, at: 0, dur: 2.45, gain: 3.4, fin: 0.3 },
      { f: M('christmas-rap'), from: 0, at: 2.5, dur: 12.5, gain: 1, fout: 1 }],
    s: [pop(0.1), { f: E('scratch'), at: 2.25, from: 0.05, dur: 0.75, gain: 0.7 }, pop(2.5, 0.7),
      ...[3, 4.5, 6, 7.5].flatMap((a) => [whoosh(a, 0.45), pop(a + 0.02, 0.5), printer(a, 0.9, 1.6)]),
      { f: E('hit'), at: 9.0, dur: 2, gain: 0.55, fout: 0.8 }, pop(9.05), whoosh(12, 0.5), pop(12.05), pop(12.5, 0.45)],
  },
  'reel-top3': {
    m: [{ f: M('deck-the-halls-b'), from: 0, at: 0, dur: 18, gain: 0.95, fout: 1.4 }],
    s: [pop(0.1), pop(0.3), ...[2.5, 7, 11.5].flatMap((a) => [whoosh(a), { f: E('pencil'), at: a + 0.15, from: 0.4, dur: 1.4, gain: 3.5, fout: 0.3 },
      printer(a + 1.5, 1.4, 1.8), { f: E('magic'), at: a + 2.85, from: 0.2, dur: 1.6, gain: 1.1, fout: 0.6 }, pop(a + 2.6, 0.5)]),
      whoosh(16), { f: E('hit'), at: 16.0, dur: 2, gain: 0.5, fout: 0.8 }, pop(16.3), pop(16.6)],
  },
};
