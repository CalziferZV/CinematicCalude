// Bandas sonoras de cada reel, en tono tranquilo: música de Kevin MacLeod (incompetech.com, CC BY 4.0)
// y efectos grabados de Freesound (CC0), suavizados (filtro paso bajo y tono más grave). Ver audio/CREDITOS.md.
//   m / s: { f: archivo, from: segundo de la pista, at: segundo del reel, dur, gain, fin, fout,
//            lp: corte del paso bajo (Hz), pitch: factor de tono (<1 = más grave y más largo) }
const M = (f) => `audio/musica/${f}.mp3`, E = (f) => `audio/efectos/${f}.mp3`;
// "aire" suave en los cambios de escena: whoosh grabado, más grave y sin agudos
const air = (at, gain = 0.22) => ({ f: E('whoosh'), at: at - 0.45, gain, pitch: 0.55, lp: 2500, fin: 0.15 });
// golpe grave y redondo para los momentos clave (sin chasquido)
const boom = (at, gain = 0.35) => ({ f: E('hit'), at, dur: 2.5, gain, lp: 900, fout: 1.4 });
// impresora real, baja y filtrada, mientras se imprime
const printer = (at, dur, gain = 1.3) => ({ f: E('printer'), at, from: 2 + at, dur, gain, lp: 3500, fin: 0.3, fout: 0.4 });

export const SOUNDTRACKS = {
  'reel-marca': {
    m: [{ f: M('inspired'), from: 0, at: 0, dur: 20, gain: 0.9, fin: 0.4, fout: 2 }],
    s: [printer(0, 4.1, 1.5), boom(4.0), air(8), air(12), air(16)],
  },
  'reel-navidad': {
    m: [{ f: M('wish-background'), from: 8, at: 0, dur: 22, gain: 1, fin: 0.8, fout: 2 }],
    s: [printer(0.1, 3.6), air(6), printer(6.0, 3.9, 0.9), air(10), printer(10.05, 2.4, 0.9), air(14), printer(14.05, 1.9, 0.9), air(18), boom(18.0, 0.3)],
  },
  'reel-ultimo-dia': {
    m: [{ f: M('adeste-fideles-waltz'), from: 6, at: 0, dur: 12, gain: 1, fin: 0.5, fout: 1.5 }],
    s: [printer(0.1, 3.4, 1.1), air(6), boom(6.1, 0.3)],
  },
  'reel-cine': {
    m: [{ f: M('it-came-upon-a-midnight-clear'), from: 17, at: 0, dur: 18, gain: 1.2, fin: 1.2, fout: 2.4 }],
    s: [printer(0, 4.2, 1.8), air(4, 0.16), air(8, 0.16), air(12, 0.16), boom(15.5, 0.4)],
  },
  'reel-viral': {
    m: [{ f: M('jingle-bells-calm'), from: 10, at: 0, dur: 2.5, gain: 2.4, fin: 0.3, fout: 0.2 },
      { f: M('oh-xmas'), from: 0, at: 2.5, dur: 12.5, gain: 0.9, fin: 0.05, fout: 1.2 }],
    s: [boom(2.5, 0.3), ...[4.5, 6, 7.5].map((a) => air(a, 0.15)), ...[3, 4.5, 6, 7.5].map((a) => printer(a, 0.9, 0.8)), air(9, 0.2), air(12, 0.2)],
  },
  'reel-top3': {
    m: [{ f: M('we-wish-you'), from: 13, at: 0, dur: 18, gain: 1.1, fin: 0.6, fout: 1.6 }],
    s: [...[2.5, 7, 11.5].flatMap((a) => [air(a, 0.18), { f: E('pencil'), at: a + 0.15, from: 0.4, dur: 1.4, gain: 2.2, lp: 5000, fout: 0.3 },
      printer(a + 1.5, 1.4, 1.0)]), air(16, 0.2)],
  },
};
