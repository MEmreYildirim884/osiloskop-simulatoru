/* =====================================================================
 * State — osiloskobun tüm kullanıcı ayarları (S) ve çalışma zamanı verisi (R)
 *   Ayarlar Save Setup ile JSON olarak saklanabilir.
 * ===================================================================== */
const State = (() => {
  // Donanım V/div kademeleri (1× prob için): 1 mV … 10 V, 1-2-5
  const VDIV = Units.seq125(1e-3, 10);
  // Zaman tabanı: kılavuzda 5 ns/div … 100 s/div, 1-2-5 (istemde 1 ns yazıyor; kılavuz değeri kullanıldı)
  const TDIV = Units.seq125(5e-9, 100);
  const PERSIST = [0.016, 0.03, 0.06, 0.12, 0.24, 0.5, 1, 2, 4, Infinity, 0]; // Infinity = Infinite, 0 = Off
  const PERSIST_LBL = ['16ms', '30ms', '60ms', '120ms', '240ms', '0.5s', '1s', '2s', '4s', 'Infinite', 'Off'];
  const RL = [1000, 10000, 100000, 1000000, 10000000];
  const ATTEN = (() => { const a = []; for (const m of [1e-3, 1e-2, 1e-1, 1, 10, 100, 1000]) for (const k of [1, 2, 5]) { const v = +(m * k).toPrecision(3); if (v <= 1000) a.push(v); } return a; })();
  const AVG = [2, 4, 8, 16, 32, 64, 128, 256];
  const DIV_X = 10, DIV_Y = 8;
  const ADC_LSB_PER_DIV = 25;   // 8 bit: ±128 kod ≈ ±5.12 div (TAHMIN: GW'nin tipik 25 nokta/div değeri)

  function chDefault(i) {
    return { on: i === 0, vdivIdx: VDIV.indexOf(0.01), pos: 0, coupling: 'DC', invert: false, bw: 'Full',
             expand: 'Ground', atten: 10, probeType: 'Voltage', deskew: 0 };
  }
  /** Fabrika ayarları (Default tuşu). Kılavuz: 100 mV/div, 10 µs/div, Edge/CH1/Auto, 10k, Vector, 240 ms. */
  function defaults() {
    return {
      ch: [chDefault(0), chDefault(1)],      // TAHMIN: varsayılan prob zayıflatması 10X → 10 mV donanım × 10 = 100 mV/div
      tdivIdx: TDIV.indexOf(10e-6), hpos: 0,
      trig: { type: 'Edge', src: 'CH1', slope: 'rise', coupling: 'DC', noiseRej: false, mode: 'Auto', holdoff: 10e-9, level: 0, extAtten: 1 },
      acq: { mode: 'Sample', avgIdx: 3, xy: false, rlIdx: 1 },
      disp: { vector: true, persistIdx: 4, wfInt: 60, gridInt: 55, backlight: 85, grat: 'Full' },
      meas: { items: [], src1: 'CH1', src2: 'CH2', gating: 'Screen', displayAll: null, highlow: 'Auto', stats: false, statN: 100,
              refs: { hi: 90, mid: 50, lo: 10 } },
      cursor: { mode: null, sel: 0, h: [-2, 2], v: [1.5, -1.5], src: 'CH1', hunit: 'S', vunit: 'Base', hRef: null, vRef: null },
      math: { on: false, kind: 'dual', s1: 'CH1', op: '+', s2: 'CH2', pos: 0, vdiv: 1,
              fft: { src: 'CH1', unit: 'dBV', win: 'Hanning', pos: 1, scale: 20, hcenter: null, hdiv: null } },
      ref: [0, 1, 2, 3].map(() => ({ on: false })),
      zoom: { on: false, tdivIdx: TDIV.indexOf(1e-6), pos: 0, knob: 'zoom', play: false },
      autosetMode: 'Fit',
      util: { compFreq: 1000, inkSaver: false, hcAssign: 'Image' },
    };
  }

  let S = defaults();
  /** Çalışma zamanı (kaydedilmez) */
  const R = {
    run: true, single: false, status: 'Auto', lastTrigReal: -1, now: 0,
    rec: null,          // son kayıt {t0, step, n, fs, ch:[Float64Array|null], clip:[bool,bool], trigT, tdiv, mode}
    avg: [null, null], avgN: 0, avgKey: '',
    meas: [], measTime: 0, freq: null, freqTime: 0,
    stats: [],
    msg: null, msgUntil: 0,
    undoAutoset: null,
    stoppedDirty: false,
    persistClear: true,
  };

  const vdiv = (i) => VDIV[S.ch[i].vdivIdx] * S.ch[i].atten;   // ekranda görünen V/div
  const tdiv = () => TDIV[S.tdivIdx];
  /** Örnekleme hızı: kayıt uzunluğu / ekran süresi, en fazla 1 GSa/s (TAHMIN: kayıt ekranı tam kaplar) */
  const fs = () => Math.min(1e9, RL[S.acq.rlIdx] / (DIV_X * tdiv()));
  const rollMode = () => tdiv() >= 0.1 && S.trig.mode === 'Auto' && !R.single && !S.acq.xy;

  function set(newS) { S = newS; api.S = S; }
  function message(text, ms = 2200) { R.msg = text; R.msgUntil = performance.now() + ms; }

  const api = { VDIV, TDIV, PERSIST, PERSIST_LBL, RL, ATTEN, AVG, DIV_X, DIV_Y, ADC_LSB_PER_DIV,
    S, R, defaults, set, vdiv, tdiv, fs, rollMode, message };
  return api;
})();
