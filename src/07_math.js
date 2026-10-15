/* =====================================================================
 * MathFn — iki kanal işlemleri (+ − × ÷) ve FFT
 * ===================================================================== */
const MathFn = (() => {
  let dcache = { seq: -1, v: null }, fcache = { seq: -1, v: null };
  const srcArr = (name) => {
    const rec = State.R.rec; if (!rec) return null;
    const c = name === 'CH2' ? 1 : 0;
    return State.S.ch[c].on ? rec.ch[c] : null;
  };
  /** Dual channel math: Source1 op Source2. Dönüş {arr, unit} */
  function dual() {
    const S = State.S, M = S.math, R = State.R;
    const key = R.recSeq + M.s1 + M.op + M.s2;
    if (dcache.seq === key) return dcache.v;
    const a = srcArr(M.s1), b = srcArr(M.s2);
    let v = null;
    if (a && b && a.length === b.length) {
      const arr = new Float64Array(a.length);
      for (let k = 0; k < a.length; k++) {
        switch (M.op) {
          case '+': arr[k] = a[k] + b[k]; break;
          case '−': arr[k] = a[k] - b[k]; break;
          case '×': arr[k] = a[k] * b[k]; break;
          case '÷': arr[k] = Math.abs(b[k]) < 1e-12 ? NaN : a[k] / b[k]; break;
        }
      }
      v = { arr, unit: M.op === '×' ? 'V²' : M.op === '÷' ? '' : 'V' };
    }
    dcache = { seq: key, v };
    return v;
  }

  /** Yerinde radix-2 FFT (re, im) */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  const WIN = {
    Rectangular: () => 1,
    Hanning: (k, N) => 0.5 - 0.5 * Math.cos(2 * Math.PI * k / (N - 1)),
    Hamming: (k, N) => 0.54 - 0.46 * Math.cos(2 * Math.PI * k / (N - 1)),
    Blackman: (k, N) => 0.42 - 0.5 * Math.cos(2 * Math.PI * k / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * k / (N - 1)),
  };
  /** FFT spektrumu: {mag (Linear RMS V veya dBV RMS), df, fmax} */
  function spectrum() {
    const S = State.S, F = S.math.fft, R = State.R, rec = R.rec;
    const key = R.recSeq + F.src + F.win + F.unit;
    if (fcache.seq === key) return fcache.v;
    let v = null;
    const a = srcArr(F.src);
    if (a && rec) {
      let N = 1; while (N * 2 <= a.length && N < 16384) N *= 2;
      const re = new Float64Array(N), im = new Float64Array(N);
      const w = WIN[F.win] || WIN.Hanning;
      let cg = 0;
      for (let k = 0; k < N; k++) { const wk = w(k, N); cg += wk; re[k] = (isNaN(a[k]) ? 0 : a[k]) * wk; }
      cg /= N;
      fft(re, im);
      const mag = new Float64Array(N / 2);
      for (let k = 0; k < N / 2; k++) {
        let m = Math.hypot(re[k], im[k]) / (N * cg);
        m = k === 0 ? m : m * 2 / Math.SQRT2;              // tek taraflı RMS
        mag[k] = F.unit === 'dBV' ? 20 * Math.log10(m + 1e-12) : m;
      }
      const df = 1 / (rec.step * N);
      v = { mag, df, fmax: df * N / 2 };
    }
    fcache = { seq: key, v };
    return v;
  }
  return { dual, spectrum, fft };
})();
