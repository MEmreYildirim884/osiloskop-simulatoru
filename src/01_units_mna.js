/* =====================================================================
 * Units — SI ön ekli biçimlendirme / ayrıştırma ve 1-2-5 dizileri
 * ===================================================================== */
const Units = (() => {
  const PFX = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];

  /** v değerini 'digits' anlamlı basamakla, uygun SI ön ekiyle yazar: fmt(0.00123,'s') -> "1.23ms" */
  function fmt(v, unit = '', digits = 3) {
    if (v === null || v === undefined || !isFinite(v)) return '?';
    if (v === 0) return (0).toFixed(Math.max(0, digits - 1)) + unit;
    const r = Number(v.toPrecision(digits));          // önce yuvarla, sonra ön eki seç (0.99996k → 1.000k)
    const a = Math.abs(r);
    let p = PFX[PFX.length - 1];
    for (const q of PFX) { if (a >= q[0] * (1 - 1e-12)) { p = q; break; } }
    return (r / p[0]).toPrecision(digits) + p[1] + unit;
  }

  /** "4.7k", "10u", "100n", "2.2meg", "1µ", "50" → sayı. Başarısızsa NaN. */
  function parse(str) {
    if (typeof str === 'number') return str;
    const s = String(str).trim().replace(',', '.');
    const m = s.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)\s*(meg|[GMkKmuµnp])?/i);
    if (!m) return NaN;
    let v = parseFloat(m[1]);
    const p = m[2];
    if (p) {
      const map = { G: 1e9, M: 1e6, k: 1e3, K: 1e3, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12 };
      v *= /^meg$/i.test(p) ? 1e6 : map[p];
    }
    return v;
  }

  /** [lo, hi] aralığında 1-2-5 dizisi */
  function seq125(lo, hi) {
    const out = [];
    for (let e = -12; e <= 4; e++) for (const m of [1, 2, 5]) {
      const v = +(m * Math.pow(10, e)).toPrecision(3);
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
    return out;
  }
  return { fmt, parse, seq125 };
})();

/* =====================================================================
 * MNA — Modified Nodal Analysis ile zaman alanı (transient) çözücü
 *   - Kapasitör/bobin: trapez (varsayılan) veya Backward-Euler companion modeli
 *   - Gerilim kaynakları: Norton eşdeğeri (V/R akım kaynağı + 1/R iletkenlik)
 *   - Diyot: Shockley modeli, Newton-Raphson + pnjlim gerilim sınırlaması
 *   - İdeal op-amp: yüksek kazançlı VCVS (A=1e5, Ro=1Ω), Norton biçiminde
 *   Düğüm 0 = toprak. Matris yoğun (dense), kısmi pivotlu LU.
 * ===================================================================== */
const MNA = (() => {
  const VT = 0.025852;           // 300 K termal gerilim
  const GMIN = 1e-12;            // her düğümden toprağa küçük iletkenlik (tekil matrisi önler)

  /** Yerinde LU ayrıştırma (kısmi pivotlama). A: Float64Array n*n. */
  function luFactor(A, n, piv) {
    for (let i = 0; i < n; i++) piv[i] = i;
    for (let k = 0; k < n; k++) {
      let p = k, max = Math.abs(A[k * n + k]);
      for (let i = k + 1; i < n; i++) { const v = Math.abs(A[i * n + k]); if (v > max) { max = v; p = i; } }
      if (max < 1e-300) { A[k * n + k] = 1e-18; }
      if (p !== k) {
        for (let j = 0; j < n; j++) { const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t; }
        const t = piv[k]; piv[k] = piv[p]; piv[p] = t;
      }
      const d = A[k * n + k];
      for (let i = k + 1; i < n; i++) {
        const f = (A[i * n + k] /= d);
        if (f !== 0) for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      }
    }
  }
  function luSolve(A, n, piv, b, x) {
    for (let i = 0; i < n; i++) x[i] = b[piv[i]];
    for (let i = 0; i < n; i++) { let s = x[i]; for (let j = 0; j < i; j++) s -= A[i * n + j] * x[j]; x[i] = s; }
    for (let i = n - 1; i >= 0; i--) { let s = x[i]; for (let j = i + 1; j < n; j++) s -= A[i * n + j] * x[j]; x[i] = s / A[i * n + i]; }
  }
  function pnjlim(vnew, vold, vt, vcrit) {
    if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
      if (vold > 0) { const arg = 1 + (vnew - vold) / vt; vnew = arg > 0 ? vold + vt * Math.log(arg) : vcrit; }
      else vnew = vt * Math.log(vnew / vt);
    }
    return vnew;
  }

  /**
   * Devre. elems:
   *  {t:'R', a, b, R}  {t:'C', a, b, C}  {t:'L', a, b, L}
   *  {t:'D', a, b(katot), Is, N}
   *  {t:'V', a(+), b(-), R, fn:(t)=>volt}   (Norton; R>0)
   *  {t:'OA', p, n, o, A, Ro}
   */
  class Circuit {
    constructor(nNodes, elems) {
      this.nn = nNodes;                 // toprak dahil düğüm sayısı
      this.n = Math.max(1, nNodes - 1); // bilinmeyen sayısı
      this.el = elems;
      this.nonlin = elems.some(e => e.t === 'D');
      this.v = new Float64Array(nNodes);       // düğüm gerilimleri (v[0]=0)
      const n = this.n;
      this.Gw = new Float64Array(n * n);       // NR çalışma kopyası
      this.piv = new Int32Array(n);
      this.b = new Float64Array(n);
      this.x = new Float64Array(n);
      this.dt = -1; this.forceBE = 0;
      this.t = 0;
      this.first = true;                 // ilk adım Backward-Euler (trapez başlangıç geçmişi yok)
      for (const e of elems) {
        if (e.t === 'C') { e.vp = 0; e.ip = 0; }
        if (e.t === 'L') { e.vp = 0; e.ip = 0; }
        if (e.t === 'D') { e.vd = 0; e.vcrit = e.N * VT * Math.log(e.N * VT / (Math.SQRT2 * e.Is)); }
      }
    }
    _stampG(G, a, b, g) {
      const n = this.n;
      if (a > 0) G[(a - 1) * n + (a - 1)] += g;
      if (b > 0) G[(b - 1) * n + (b - 1)] += g;
      if (a > 0 && b > 0) { G[(a - 1) * n + (b - 1)] -= g; G[(b - 1) * n + (a - 1)] -= g; }
    }
    _rhs(i, val) { if (i > 0) this.b[i - 1] += val; }
    /** dt değişince doğrusal taban matrislerini (TR ve BE için ayrı) yeniden kur; doğrusal devrede LU'yu önbelleğe al. */
    _build(dt) {
      const n = this.n;
      this.base = {};
      for (const be of [false, true]) {
        const G = new Float64Array(n * n);
        for (let i = 0; i < n; i++) G[i * n + i] += GMIN;
        for (const e of this.el) {
          switch (e.t) {
            case 'R': this._stampG(G, e.a, e.b, 1 / e.R); break;
            case 'C': { const g = (be ? 1 : 2) * e.C / dt; if (be) e.gBE = g; else e.gTR = g; this._stampG(G, e.a, e.b, g); break; }
            case 'L': { const g = (be ? 1 : 0.5) * dt / e.L; if (be) e.gBE = g; else e.gTR = g; this._stampG(G, e.a, e.b, g); break; }
            case 'V': this._stampG(G, e.a, e.b, 1 / e.R); break;
            case 'OA': {
              const g = 1 / e.Ro, ga = e.A / e.Ro, o = e.o - 1;
              if (e.o > 0) {
                G[o * n + o] += g;
                if (e.p > 0) G[o * n + (e.p - 1)] -= ga;
                if (e.n > 0) G[o * n + (e.n - 1)] += ga;
              }
              break;
            }
          }
        }
        const rec = { G, LU: null, piv: null };
        if (!this.nonlin) { rec.LU = G.slice(); rec.piv = new Int32Array(n); luFactor(rec.LU, n, rec.piv); }
        this.base[be ? 'BE' : 'TR'] = rec;
      }
      this.dt = dt;
    }
    /**
     * Bir zaman adımı ilerlet.
     * method: 'TR' (trapez) | 'BE' (backward Euler).
     * Trapez, kare dalga kenarı gibi süreksizliklerde sayısal salınım (ringing) yapabildiğinden
     * kaynaklardan biri bu adımda kenar üretiyorsa (e.edge) veya ilk adımsa o adım BE ile çözülür
     * (SPICE'taki "breakpoint" davranışına benzer).
     */
    step(dt, method = 'TR') {
      if (dt !== this.dt) this._build(dt);
      const t0 = this.t, t1 = t0 + dt;
      let be = this.first || method === 'BE' || this.forceBE > 0;
      if (!be) for (const e of this.el) if (e.t === 'V' && e.edge && e.edge(t0, t1)) { be = true; this.forceBE = 2; break; }
      if (this.forceBE > 0 && !this.first) this.forceBE--;
      const M = this.base[be ? 'BE' : 'TR'];
      const b = this.b, v = this.v, n = this.n;
      b.fill(0);
      for (const e of this.el) {
        switch (e.t) {
          case 'C': { e.geq = be ? e.gBE : e.gTR; const J = be ? e.geq * e.vp : e.geq * e.vp + e.ip; this._rhs(e.a, J); this._rhs(e.b, -J); e.J = J; break; }
          case 'L': { e.geq = be ? e.gBE : e.gTR; const K = be ? e.ip : e.ip + e.geq * e.vp; this._rhs(e.a, -K); this._rhs(e.b, K); e.K = K; break; }
          case 'V': { const I = e.fn(t1, dt) / e.R; this._rhs(e.a, I); this._rhs(e.b, -I); break; }
        }
      }
      if (!this.nonlin) {
        luSolve(M.LU, n, M.piv, b, this.x);
      } else {
        // Newton-Raphson: diyotlar her iterasyonda (gd, ieq) ile doğrusallaştırılır
        const bl = b.slice();
        const diodes = this.diodes || (this.diodes = this.el.filter(e => e.t === 'D'));
        let ok = false;
        for (let it = 0; it < 80; it++) {
          this.Gw.set(M.G); b.set(bl);
          for (const d of diodes) {
            const nvt = d.N * VT;
            const ex = Math.exp(Math.min(d.vd / nvt, 80));
            const id = d.Is * (ex - 1), gd = d.Is * ex / nvt + GMIN;
            const ieq = id - gd * d.vd;
            this._stampG(this.Gw, d.a, d.b, gd);
            this._rhs(d.a, -ieq); this._rhs(d.b, ieq);
          }
          luFactor(this.Gw, n, this.piv);
          luSolve(this.Gw, n, this.piv, b, this.x);
          let conv = true;
          for (const d of diodes) {
            const va = d.a > 0 ? this.x[d.a - 1] : 0, vk = d.b > 0 ? this.x[d.b - 1] : 0;
            const vn = va - vk;
            const lim = pnjlim(vn, d.vd, d.N * VT, d.vcrit);
            if (Math.abs(lim - d.vd) > 1e-9 + 1e-6 * Math.abs(d.vd) || lim !== vn) conv = false;
            d.vd = lim;
          }
          if (conv && it > 0) { ok = true; break; }
        }
        this.nrFail = !ok;
      }
      // çözümü düğüm dizisine yaz, reaktif elemanların durumlarını güncelle
      v[0] = 0;
      for (let i = 1; i < this.nn; i++) v[i] = this.x[i - 1];
      for (const e of this.el) {
        if (e.t === 'C') { const vv = v[e.a] - v[e.b]; e.ip = e.geq * vv - e.J; e.vp = vv; }
        else if (e.t === 'L') { const vv = v[e.a] - v[e.b]; e.ip = e.geq * vv + e.K; e.vp = vv; }
      }
      this.t = t1;
      this.first = false;
    }
  }
  return { Circuit, luFactor, luSolve };
})();
