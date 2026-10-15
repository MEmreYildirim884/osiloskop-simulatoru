/* =====================================================================
 * Measure — otomatik ölçümler (kılavuzdaki 36 ölçüm) + Statistics + Display All
 *   Geçersizlik ("?"):
 *     - Gerilim ölçümleri: dalga ekrandan taşıyorsa (clip) veya veri yoksa
 *     - Zaman/çevrim ölçümleri: ekranda en az 1 tam periyot (aynı yönde 2 geçiş) yoksa
 * ===================================================================== */
const Measure = (() => {
  const V_LIST = ['Pk-Pk', 'Max', 'Min', 'Amplitude', 'High', 'Low', 'Mean', 'Cycle Mean', 'RMS', 'Cycle RMS', 'Area', 'Cycle Area', 'ROVShoot', 'FOVShoot', 'RPREShoot', 'FPREShoot'];
  const T_LIST = ['Frequency', 'Period', 'RiseTime', 'FallTime', '+Width', '-Width', 'Duty Cycle', '+Pulses', '-Pulses', '+Edges', '-Edges'];
  const D_LIST = ['FRR', 'FRF', 'FFR', 'FFF', 'LRR', 'LRF', 'LFR', 'LFF', 'Phase'];
  const DESC = { // Türkçe kısa açıklama (Help ve tooltip için)
    'Pk-Pk': 'Tepeden tepeye gerilim (Max − Min)', 'Max': 'En büyük gerilim', 'Min': 'En küçük gerilim',
    'Amplitude': 'Genlik = High − Low', 'High': 'Üst seviye (histogram/maks.)', 'Low': 'Alt seviye (histogram/min.)',
    'Mean': 'Ekrandaki tüm örneklerin ortalaması', 'Cycle Mean': 'İlk tam periyodun ortalaması', 'RMS': 'Etkin değer (ekran)',
    'Cycle RMS': 'İlk tam periyodun etkin değeri', 'Area': 'Ekran boyunca ∫v·dt', 'Cycle Area': 'Bir periyot boyunca ∫v·dt',
    'ROVShoot': 'Yükselen kenar sonrası aşma %', 'FOVShoot': 'Düşen kenar sonrası aşma %', 'RPREShoot': 'Yükselen kenar öncesi ön-aşma %', 'FPREShoot': 'Düşen kenar öncesi ön-aşma %',
    'Frequency': 'Frekans', 'Period': 'Periyot', 'RiseTime': 'Yükselme süresi (%10→%90)', 'FallTime': 'Düşme süresi (%90→%10)',
    '+Width': 'Pozitif darbe genişliği (%50)', '-Width': 'Negatif darbe genişliği', 'Duty Cycle': 'Doluluk oranı (+Width/Period)',
    '+Pulses': 'Pozitif darbe sayısı', '-Pulses': 'Negatif darbe sayısı', '+Edges': 'Yükselen kenar sayısı', '-Edges': 'Düşen kenar sayısı',
    'FRR': 'K1 ilk yükselen → K2 ilk yükselen', 'FRF': 'K1 ilk yükselen → K2 ilk düşen', 'FFR': 'K1 ilk düşen → K2 ilk yükselen', 'FFF': 'K1 ilk düşen → K2 ilk düşen',
    'LRR': 'K1 ilk yükselen → K2 son yükselen', 'LRF': 'K1 ilk yükselen → K2 son düşen', 'LFR': 'K1 ilk düşen → K2 son yükselen', 'LFF': 'K1 ilk düşen → K2 son düşen',
    'Phase': 'Faz farkı (K2, K1\'e göre; geride ise negatif)',
  };
  const catOf = (n) => V_LIST.includes(n) ? 'V' : T_LIST.includes(n) ? 'T' : 'D';

  /** Kaynak dizisini (gating uygulanmış) al: {arr, step, t0, clip} veya null */
  function source(src) {
    const S = State.S, rec = State.R.rec;
    if (!rec) return null;
    let arr = null, clip = false;
    if (src === 'CH1' || src === 'CH2') {
      const c = src === 'CH1' ? 0 : 1;
      if (!S.ch[c].on || !rec.ch[c]) return null;
      arr = rec.ch[c]; clip = rec.clip[c];
    } else if (src === 'Math') {
      const m = MathFn.dual(); if (!m) return null; arr = m.arr;
    } else return null;
    let i0 = 0, i1 = arr.length - 1;
    if (S.meas.gating === 'Cursors' && S.cursor.mode) {
      const a = (S.cursor.h[0] + 5) / 10 * (arr.length - 1), b = (S.cursor.h[1] + 5) / 10 * (arr.length - 1);
      i0 = Math.max(0, Math.round(Math.min(a, b))); i1 = Math.min(arr.length - 1, Math.round(Math.max(a, b)));
    }
    // eksik veri (NaN) varsa kırp
    while (i0 < i1 && isNaN(arr[i0])) i0++;
    while (i1 > i0 && isNaN(arr[i1])) i1--;
    if (i1 - i0 < 3) return null;
    return { arr: arr.subarray(i0, i1 + 1), step: rec.step, t0: i0 * rec.step, clip };
  }

  /** Bir dizinin temel analizi (seviyeler, geçişler) — hesap pahalı olduğundan kaynak başına önbelleklenir */
  function analyze(s) {
    const a = s.arr, n = a.length, refs = State.S.meas.refs;
    let mx = -Infinity, mn = Infinity, sum = 0, sq = 0, miss = 0;
    for (let i = 0; i < n; i++) { const v = a[i]; if (isNaN(v)) { miss++; continue; } if (v > mx) mx = v; if (v < mn) mn = v; sum += v; sq += v * v; }
    const cnt = n - miss;
    const mean = sum / cnt, rms = Math.sqrt(sq / cnt);
    // High/Low
    let high = mx, low = mn;
    const hl = State.S.meas.highlow;
    if (hl !== 'MinMax' && mx > mn) {
      const B = 100, hist = new Uint32Array(B), w = (mx - mn) / B;
      for (let i = 0; i < n; i++) if (!isNaN(a[i])) hist[Math.min(B - 1, Math.floor((a[i] - mn) / w))]++;
      let bu = 50, bl = 0, nu = 0, nl = 0;
      for (let b = 50; b < B; b++) { nu += hist[b]; if (hist[b] > hist[bu]) bu = b; }
      for (let b = 0; b < 50; b++) { nl += hist[b]; if (hist[b] > hist[bl]) bl = b; }
      const useHist = hl === 'Histogram' || (hist[bu] > 0.25 * nu && hist[bl] > 0.25 * nl);
      if (useHist) {
        // mod kutusundaki örneklerin ortalaması
        let su = 0, cu = 0, sl = 0, cl = 0;
        for (let i = 0; i < n; i++) { const v = a[i]; if (isNaN(v)) continue; const b = Math.min(B - 1, Math.floor((v - mn) / w)); if (b === bu) { su += v; cu++; } else if (b === bl) { sl += v; cl++; } }
        high = su / cu; low = sl / cl;
      }
    }
    const amp = high - low;
    const lvHi = low + amp * refs.hi / 100, lvMid = low + amp * refs.mid / 100, lvLo = low + amp * refs.lo / 100;
    // orta seviye geçişleri (Low/High ref arasında histerezis)
    const rises = [], falls = [];
    if (amp > 0) {
      let state = 0;   // -1: alt, +1: üst
      for (let i = 0; i < n; i++) {
        const v = a[i]; if (isNaN(v)) continue;
        if (v <= lvLo) { if (state === 1) falls.push(cross(a, i, lvMid, -1)); state = -1; }
        else if (v >= lvHi) { if (state === -1) rises.push(cross(a, i, lvMid, +1)); state = 1; }
      }
    }
    return { n, mx, mn, mean, rms, high, low, amp, lvHi, lvMid, lvLo, rises, falls, step: s.step, t0: s.t0, arr: a, clip: s.clip };
  }
  /** i noktasından geriye doğru 'lv' seviyesinin geçildiği ara değerlenmiş örnek indisi */
  function cross(a, i, lv, dir) {
    for (let k = i; k > 0; k--) {
      const p = a[k - 1], q = a[k];
      if (dir > 0 ? (p < lv && q >= lv) : (p > lv && q <= lv)) return k - 1 + (lv - p) / (q - p);
    }
    return i;
  }
  function edgeTime(A, idx, lo, hi, dir) {
    // idx civarında lo→hi (dir>0) veya hi→lo geçişi süresi
    const a = A.arr;
    let i = Math.floor(idx), j = Math.ceil(idx);
    if (dir > 0) {
      while (i > 0 && a[i] > lo) i--; while (j < a.length - 1 && a[j] < hi) j++;
      if (a[i] > lo || a[j] < hi) return null;
      const ti = cross(a, i + 1, lo, +1), tj = cross(a, j, hi, +1);
      return (tj - ti) * A.step;
    } else {
      while (i > 0 && a[i] < hi) i--; while (j < a.length - 1 && a[j] > lo) j++;
      if (a[i] < hi || a[j] > lo) return null;
      const ti = cross(a, i + 1, hi, -1), tj = cross(a, j, lo, -1);
      return (tj - ti) * A.step;
    }
  }
  function period(A) {
    const r = A.rises, f = A.falls;
    if (r.length >= 2) return (r[r.length - 1] - r[0]) / (r.length - 1) * A.step;
    if (f.length >= 2) return (f[f.length - 1] - f[0]) / (f.length - 1) * A.step;
    return null;
  }
  function cycleRange(A) {
    if (A.rises.length >= 2) return [A.rises[0], A.rises[1]];
    if (A.falls.length >= 2) return [A.falls[0], A.falls[1]];
    return null;
  }
  function integ(A, i0, i1) {
    const a = A.arr; let s = 0, s2 = 0, k = 0;
    for (let i = Math.ceil(i0); i <= Math.floor(i1); i++) { s += a[i]; s2 += a[i] * a[i]; k++; }
    return { mean: s / k, rms: Math.sqrt(s2 / k), area: s * A.step };
  }

  /** Tek kaynaklı ölçüm. Dönüş: {v, unit} veya null (= "?") */
  function single(name, A) {
    if (!A) return null;
    const isV = V_LIST.includes(name);
    if (isV && A.clip) return null;
    switch (name) {
      case 'Pk-Pk': return { v: A.mx - A.mn, u: 'V' };
      case 'Max': return { v: A.mx, u: 'V' };
      case 'Min': return { v: A.mn, u: 'V' };
      case 'Amplitude': return { v: A.amp, u: 'V' };
      case 'High': return { v: A.high, u: 'V' };
      case 'Low': return { v: A.low, u: 'V' };
      case 'Mean': return { v: A.mean, u: 'V' };
      case 'RMS': return { v: A.rms, u: 'V' };
      case 'Area': return { v: integ(A, 0, A.n - 1).area, u: 'Vs' };
      case 'Cycle Mean': case 'Cycle RMS': case 'Cycle Area': {
        const c = cycleRange(A); if (!c) return null;
        const r = integ(A, c[0], c[1]);
        return name === 'Cycle Mean' ? { v: r.mean, u: 'V' } : name === 'Cycle RMS' ? { v: r.rms, u: 'V' } : { v: r.area, u: 'Vs' };
      }
      case 'ROVShoot': return A.amp > 0 ? { v: (A.mx - A.high) / A.amp * 100, u: '%' } : null;
      case 'FOVShoot': return A.amp > 0 ? { v: (A.low - A.mn) / A.amp * 100, u: '%' } : null;
      case 'RPREShoot': return A.amp > 0 ? { v: (A.low - A.mn) / A.amp * 100, u: '%' } : null;
      case 'FPREShoot': return A.amp > 0 ? { v: (A.mx - A.high) / A.amp * 100, u: '%' } : null;
      case 'Period': { const p = period(A); return p ? { v: p, u: 's' } : null; }
      case 'Frequency': { const p = period(A); return p ? { v: 1 / p, u: 'Hz', d: 4 } : null; }
      case 'RiseTime': { if (!A.rises.length) return null; const t = edgeTime(A, A.rises[0], A.lvLo, A.lvHi, +1); return t !== null ? { v: t, u: 's' } : null; }
      case 'FallTime': { if (!A.falls.length) return null; const t = edgeTime(A, A.falls[0], A.lvLo, A.lvHi, -1); return t !== null ? { v: t, u: 's' } : null; }
      case '+Width': { const r = A.rises[0]; if (r === undefined) return null; const f = A.falls.find(x => x > r); return f !== undefined ? { v: (f - r) * A.step, u: 's' } : null; }
      case '-Width': { const f = A.falls[0]; if (f === undefined) return null; const r = A.rises.find(x => x > f); return r !== undefined ? { v: (r - f) * A.step, u: 's' } : null; }
      case 'Duty Cycle': { const p = period(A), w = single('+Width', A); return p && w ? { v: w.v / p * 100, u: '%' } : null; }
      case '+Pulses': return { v: A.rises.filter(r => A.falls.some(f => f > r)).length, u: '', int: true };
      case '-Pulses': return { v: A.falls.filter(f => A.rises.some(r => r > f)).length, u: '', int: true };
      case '+Edges': return { v: A.rises.length, u: '', int: true };
      case '-Edges': return { v: A.falls.length, u: '', int: true };
    }
    return null;
  }
  /** İki kaynaklı (Delay) ölçüm */
  function dual(name, A, B) {
    if (!A || !B) return null;
    const first = (arr) => arr.length ? arr[0] : null, last = (arr) => arr.length ? arr[arr.length - 1] : null;
    const ta = name[1] === 'R' ? first(A.rises) : first(A.falls);
    if (name === 'Phase') {
      const t1 = first(A.rises), p = period(A);
      if (t1 === null || !p || !B.rises.length) return null;
      let best = B.rises[0];
      for (const r of B.rises) if (Math.abs(r - t1) < Math.abs(best - t1)) best = r;
      // TAHMIN: işaret kuralı — K2 geride (gecikmeli) ise negatif derece
      let ph = -(best - t1) * A.step / p * 360;
      ph = ((ph + 180) % 360 + 360) % 360 - 180;
      return { v: ph, u: '°', fixed: 1 };
    }
    if (ta === null) return null;
    const pick = name[0] === 'F' ? first : last;
    const tb = name[2] === 'R' ? pick(B.rises) : pick(B.falls);
    if (tb === null) return null;
    return { v: (tb - ta) * A.step, u: 's' };
  }

  function format(r) {
    if (!r) return '?';
    if (r.int) return String(r.v);
    if (r.fixed !== undefined) return r.v.toFixed(r.fixed) + r.u;
    if (r.u === '%') return r.v.toFixed(2) + '%';
    return Units.fmt(r.v, r.u, r.d || 3);
  }

  let cache = { seq: -1, map: new Map() };
  function A(src) {
    const seq = State.R.recSeq + '|' + JSON.stringify(State.S.meas.refs) + State.S.meas.highlow + State.S.meas.gating + (State.S.cursor.h.join());
    if (cache.seq !== seq) cache = { seq, map: new Map() };
    if (!cache.map.has(src)) { const s = source(src); cache.map.set(src, s ? analyze(s) : null); }
    return cache.map.get(src);
  }
  /** Bir ölçüm öğesini hesapla: item = {name, s1, s2} */
  function value(item) {
    const cat = catOf(item.name);
    return cat === 'D' ? dual(item.name, A(item.s1), A(item.s2)) : single(item.name, A(item.s1));
  }
  /** Seçili ölçümlerin metinleri (+ istatistik) */
  function results() {
    const S = State.S, R = State.R;
    const out = S.meas.items.map((it, i) => {
      const r = value(it);
      const out = { it, r, text: format(r) };
      if (S.meas.stats) {
        const st = R.stats[i] || (R.stats[i] = []);
        if (r && R.statSeq !== R.recSeq) { st.push(r.v); while (st.length > S.meas.statN) st.shift(); }
        if (st.length) {
          const m = st.reduce((a, b) => a + b, 0) / st.length;
          const sd = Math.sqrt(st.reduce((a, b) => a + (b - m) ** 2, 0) / st.length);
          out.stats = { mean: m, min: Math.min(...st), max: Math.max(...st), sd, n: st.length, u: r ? r.u : '' };
        }
      }
      return out;
    });
    R.statSeq = R.recSeq;
    return out;
  }
  function resetStats() { State.R.stats = []; }

  return { V_LIST, T_LIST, D_LIST, DESC, catOf, value, results, format, resetStats, A, single };
})();
