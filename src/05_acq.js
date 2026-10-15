/* =====================================================================
 * Acq — osiloskobun edinim (acquisition) motoru
 *   - Tetik: Edge (CH1/CH2/EXT/AC Line), rising/falling/either, histerezis, holdoff,
 *     Auto / Normal / Single, Force-Trig, Roll (≥100 ms/div, Auto)
 *   - ADC: örnekleme hızı fs = min(1 GSa/s, kayıt uzunluğu / ekran süresi), 8 bit (25 kod/div),
 *     ekran dışına taşma (clip) tespiti, küçük ön kat + ADC gürültüsü
 *   - Acquire modları: Sample, Peak Detect, Average (2…256)
 *   - Autoset, 50%
 * ===================================================================== */
const Acq = (() => {
  const MAXN = 20000;           // ekranda tutulan en fazla örnek (hesap bütçesi)
  let nextArm = -Infinity;      // tetiğin yeniden kurulacağı simülasyon zamanı
  let lastTrigT = null;         // son kaydın tetik anı (simülasyon zamanı)
  let realClock = 0, lastRealTrig = -1e9, lastFreqScan = -1;
  let forcePending = false;

  // --- yardımcılar ---
  let spare = null;
  function gauss() {                       // Box–Muller
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0, v = 0; while (u === 0) u = Math.random(); v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
  }
  const ringOf = (src) => src === 'CH2' ? 'c1' : 'c0';
  const chIdx = (src) => src === 'CH2' ? 1 : 0;

  /** Tetik seviyesi BNC birimine çevrilmiş hali (tetik tamponu BNC volt tutar) */
  function levelBnc() {
    const T = State.S.trig;
    if (T.src === 'LINE') return 0;
    if (T.src === 'EXT') return T.level;
    return T.level / State.S.ch[chIdx(T.src)].atten;
  }
  /** Histerezis (gürültüye karşı); Noise Rejection açıkken daha geniş. TAHMIN: 0.1 / 0.5 div */
  function hysteresis() {
    const T = State.S.trig;
    const k = T.noiseRej ? 0.5 : 0.1;
    if (T.src === 'LINE') return 0.05;
    if (T.src === 'EXT') return k * 0.2;
    const c = chIdx(T.src);
    return k * State.VDIV[State.S.ch[c].vdivIdx];
  }

  /** [from, to] simülasyon zamanı aralığında ilk geçerli tetik anını bul (ara değerlemeli). */
  function findTrig(from, to) {
    const dt = Sim.dt, tb = Sim.tBase, r = Sim.ring.trig, M = Sim.MASK;
    let n0 = Math.ceil((from - tb) / dt), n1 = Math.floor((to - tb) / dt);
    n0 = Math.max(n0, Sim.oldestN() + 1); n1 = Math.min(n1, Sim.count - 1);
    if (n1 <= n0) return null;
    const L = levelBnc(), h = hysteresis(), slope = State.S.trig.slope;
    let armR = false, armF = false;
    let prev = r[(n0 - 1) & M];
    for (let n = n0; n <= n1; n++) {
      const v = r[n & M];
      if ((slope === 'rise' || slope === 'either') && armR && prev < L && v >= L) return tb + (n - 1 + (L - prev) / (v - prev)) * dt;
      if ((slope === 'fall' || slope === 'either') && armF && prev > L && v <= L) return tb + (n - 1 + (prev - L) / (prev - v)) * dt;
      if (v < L - h) armR = true;
      if (v > L + h) armF = true;
      prev = v;
    }
    return null;
  }

  /**
   * Kayıt oluştur. tl: ekranın sol kenarının simülasyon zamanı.
   * Her kanal için ekran gerilimi (V) dizisi; ADC kuantalaması ve gürültü dahil.
   */
  function buildRecord(tl, trigT) {
    const S = State.S, tdiv = State.tdiv(), span = State.DIV_X * tdiv;
    const fs = State.fs();
    const N = Math.max(2, Math.min(MAXN, Math.round(span * fs)));
    const step = span / N, n = N + 1;
    const pd = S.acq.mode === 'Peak';
    const rec = { tl, trigT, step, n, fs, tdiv, hpos: S.hpos, ch: [null, null], clip: [false, false], missing: [0, 0],
                  vdiv: [State.vdiv(0), State.vdiv(1)], pos: [S.ch[0].pos, S.ch[1].pos], mode: S.acq.mode };
    for (let c = 0; c < 2; c++) {
      const C = S.ch[c];
      if (!C.on) continue;
      const arr = new Float64Array(n);
      const ring = 'c' + c, vd = State.vdiv(c), atten = C.atten, pos = C.pos;
      const lsbBnc = State.VDIV[C.vdivIdx] / State.ADC_LSB_PER_DIV;
      const sig = Math.sqrt(1e-4 * 1e-4 + (0.07 * lsbBnc) ** 2);   // TAHMIN: 0.1 mV ön kat + 0.07 LSB ADC gürültüsü
      const sgn = C.invert ? -1 : 1, gnd = C.coupling === 'GND';
      let clip = false, miss = 0;
      for (let k = 0; k < n; k++) {
        const t = tl + k * step - C.deskew;
        let v;
        if (pd) { const mm = Sim.minmax(ring, t - step / 2, t + step / 2); v = mm ? mm[k & 1] : NaN; }
        else v = Sim.at(ring, t);
        if (isNaN(v)) { arr[k] = NaN; miss++; continue; }
        if (gnd) v = 0;
        v = (v + sig * gauss()) * atten * sgn;
        const div = v / vd + pos;
        let code = Math.round(div * State.ADC_LSB_PER_DIV);
        if (code > 127) code = 127; else if (code < -128) code = -128;
        if (Math.abs(div) > State.DIV_Y / 2 + 0.08) clip = true;   // ekrandan taşma → ölçüm "?"
        arr[k] = (code / State.ADC_LSB_PER_DIV - pos) * vd;
      }
      rec.ch[c] = arr; rec.clip[c] = clip; rec.missing[c] = miss;
    }
    return rec;
  }

  /** Average modu: ardışık kayıtların ortalaması (ayar değişince sıfırlanır) */
  function accumulate(rec) {
    const S = State.S, R = State.R;
    if (S.acq.mode !== 'Average') { R.avgN = 0; return rec; }
    const key = [rec.n, rec.tdiv, rec.hpos, rec.vdiv, rec.pos, S.ch[0].on, S.ch[1].on].join('|');
    if (key !== R.avgKey) { R.avgKey = key; R.avgN = 0; R.avg = [null, null]; }
    const N = State.AVG[S.acq.avgIdx];
    R.avgN++;
    const w = 1 / Math.min(R.avgN, N);
    for (let c = 0; c < 2; c++) {
      if (!rec.ch[c]) continue;
      if (!R.avg[c] || R.avgN === 1) { R.avg[c] = Float64Array.from(rec.ch[c]); continue; }
      const a = R.avg[c], x = rec.ch[c];
      for (let k = 0; k < a.length; k++) a[k] = isNaN(a[k]) ? x[k] : a[k] + (x[k] - a[k]) * w;
    }
    const out = Object.assign({}, rec, { ch: R.avg.map((a, c) => rec.ch[c] ? a : null) });
    return out;
  }

  function setRecord(rec) { State.R.rec = rec; State.R.recSeq = (State.R.recSeq || 0) + 1; }

  /** Ana döngüden her karede çağrılır. realDt: gerçek geçen süre (s). */
  function tick(realDt) {
    const S = State.S, R = State.R;
    realDt = Math.min(Math.max(realDt, 0), 0.1);
    realClock += realDt;
    const tdiv = State.tdiv();
    if (!R.run) {
      R.status = 'Stop';
      if (R.stoppedDirty) {
        R.stoppedDirty = false;
        if (lastTrigT !== null) setRecord(buildRecord(lastTrigT + S.hpos - 5 * tdiv, lastTrigT));
      }
      return;
    }
    Sim.ensure(tdiv, Math.abs(S.hpos));

    if (State.rollMode()) {
      Sim.advance(realDt);
      const now = Sim.nowT();
      setRecord(buildRecord(now - State.DIV_X * tdiv, null));
      R.rec.roll = true;
      R.status = 'Roll'; lastTrigT = now - 5 * tdiv - S.hpos;
      scanFreq();
      return;
    }

    Sim.advance(realDt);
    const now = Sim.nowT(), old = Sim.oldestT(), dt = Sim.dt;
    const leftOff = S.hpos - 5 * tdiv, rightOff = S.hpos + 5 * tdiv;   // tetikten ekran kenarlarına göre
    let from = Math.max(nextArm, old - leftOff, old + 2 * dt);
    const to = Math.min(now - rightOff, now - 2 * dt);
    const holdoff = S.trig.holdoff;
    const trigs = [];
    while (from < to && trigs.length < 64) {
      const t = findTrig(from, to);
      if (t === null) break;
      trigs.push(t);
      from = t + Math.max(rightOff, 0) + holdoff;
      if (R.single) break;
    }
    if (trigs.length) nextArm = from;
    else if (to > from) nextArm = Math.max(nextArm, to - 4 * dt);

    if (trigs.length) {
      const use = S.acq.mode === 'Average' ? trigs.slice(-16) : [trigs[trigs.length - 1]];
      if (R.single) use.length = 1, use[0] = trigs[0];
      let rec = null;
      for (const T of use) { rec = accumulate(buildRecord(T + leftOff, T)); lastTrigT = T; }
      setRecord(rec);
      lastRealTrig = realClock;
      if (R.single) { R.single = false; R.run = false; R.status = 'Stop'; }
      else R.status = "Trig'd";
      forcePending = false;
    } else {
      const free = now - rightOff;
      if (forcePending || (S.trig.mode === 'Auto' && !R.single && realClock - lastRealTrig > 0.12)) {
        // Auto: tetik gelmezse serbest koşu (dalga ekranda kayar). Force-Trig: tek seferlik zorla tetik
        if (free + leftOff >= old) {
          setRecord(accumulate(buildRecord(free + leftOff, null)));
          lastTrigT = free;
          if (forcePending) { forcePending = false; lastRealTrig = realClock; if (R.single) { R.single = false; R.run = false; } }
        }
        R.status = R.run ? (realClock - lastRealTrig < 0.3 ? "Trig'd" : 'Auto') : 'Stop';
      } else {
        // Normal/Single: ekrandaki son görüntü donar
        R.status = realClock - lastRealTrig < 0.3 ? "Trig'd" : (Sim.count * dt < 10 * tdiv ? 'PrTrig' : 'Trig?');
      }
    }
    scanFreq();
  }

  /** Frekans sayacı: tetik kaynağındaki seviye geçişlerinden (6 hane) */
  function scanFreq() {
    const R = State.R;
    if (realClock - lastFreqScan < 0.25) return;
    lastFreqScan = realClock;
    const dt = Sim.dt, r = Sim.ring.trig, M = Sim.MASK;
    const n1 = Sim.count - 1, n0 = Math.max(Sim.oldestN(), n1 - Math.min(400000, Math.round(1.0 / dt)));
    const L = levelBnc(), h = hysteresis();
    let arm = false, prev = r[n0 & M], first = null, last = null, k = 0;
    for (let n = n0 + 1; n <= n1; n++) {
      const v = r[n & M];
      if (arm && prev < L && v >= L) { const t = (n - 1 + (L - prev) / (v - prev)) * dt; if (first === null) first = t; last = t; k++; arm = false; }
      if (v < L - h) arm = true;
      prev = v;
    }
    R.freq = (k >= 2 && last > first) ? (k - 1) / (last - first) : null;
    if (R.freq !== null && R.freq < 2) R.freq = null;
  }

  /** 50% tuşu: tetik seviyesini kaynağın orta noktasına ayarla */
  function level50() {
    const S = State.S, T = S.trig;
    if (T.src === 'LINE') { T.level = 0; return; }
    const r = Sim.ring.trig, M = Sim.MASK, n1 = Sim.count - 1;
    const n0 = Math.max(Sim.oldestN(), n1 - Math.min(300000, Math.round(Math.max(2 / Sim.fmin, 10 * State.tdiv()) / Sim.dt)));
    if (n1 - n0 < 4) return;
    let mn = Infinity, mx = -Infinity;
    for (let n = n0; n <= n1; n++) { const v = r[n & M]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const mid = (mn + mx) / 2;
    T.level = T.src === 'EXT' ? mid : mid * S.ch[chIdx(T.src)].atten;
  }

  /** Bir sinyal dizisinden frekans (orta seviye geçişleri, %10 histerezis) */
  function estFreq(arr, dt) {
    let mn = Infinity, mx = -Infinity;
    for (const v of arr) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const mid = (mn + mx) / 2, h = (mx - mn) * 0.1;
    if (mx - mn <= 0) return { f: null, mn, mx };
    let arm = false, first = null, last = null, k = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arm && arr[i - 1] < mid && arr[i] >= mid) { const t = (i - 1 + (mid - arr[i - 1]) / (arr[i] - arr[i - 1])) * dt; if (first === null) first = t; last = t; k++; arm = false; }
      if (arr[i] < mid - h) arm = true;
    }
    let mean = 0; for (const v of arr) mean += v; mean /= arr.length;
    return { f: k >= 2 ? (k - 1) / (last - first) : null, mn, mx, mean };
  }

  /** Autoset: kanalların V/div ve konumunu, zaman tabanını ve tetiği otomatik ayarlar. */
  function autoset() {
    const S = State.S, R = State.R;
    R.undoAutoset = JSON.parse(JSON.stringify(S));
    const chans = [0, 1].filter(c => S.ch[c].on);
    if (!chans.length) { State.message('Autoset: No channel is turned on'); return false; }
    if (S.autosetMode === 'AC') for (const c of chans) S.ch[c].coupling = 'AC';
    const an = Sim.analyze(0.1);
    const info = chans.map(c => {
      const arr = an['c' + c];
      const e = estFreq(arr.subarray(Math.floor(arr.length * 0.1)), an.dt);
      const at = S.ch[c].atten;
      return { c, f: e.f, vpp: (e.mx - e.mn) * at, mid: (e.mx + e.mn) / 2 * at, mean: e.mean * at };
    });
    const valid = info.filter(i => i.vpp >= 0.01 && i.f !== null && i.f >= 20);
    if (!valid.length) { State.message('Autoset: signal is too small or slower than 20 Hz'); return false; }
    for (const i of info) {
      const C = S.ch[i.c];
      if (i.vpp < 1e-3) continue;
      let idx = State.VDIV.length - 1;
      for (let k = 0; k < State.VDIV.length; k++) if (i.vpp / (State.VDIV[k] * C.atten) <= 6) { idx = k; break; } // TAHMIN: dalga ≤ 6 div yükseklikte
      C.vdivIdx = idx;
      const vd = State.VDIV[idx] * C.atten;
      C.pos = S.autosetMode === 'AC' ? 0 : Math.max(-4, Math.min(4, -i.mid / vd));
    }
    const tr = valid.find(i => 'CH' + (i.c + 1) === S.trig.src) || valid[0];
    if (S.trig.src !== 'EXT' && S.trig.src !== 'LINE') S.trig.src = 'CH' + (tr.c + 1);
    S.trig.type = 'Edge'; S.trig.slope = 'rise'; S.trig.coupling = 'DC';
    S.trig.level = S.autosetMode === 'AC' ? 0 : tr.mid;
    let ti = State.TDIV.length - 1;
    for (let k = 0; k < State.TDIV.length; k++) if (State.TDIV[k] * 10 >= 2 / tr.f) { ti = k; break; }
    S.tdivIdx = ti; S.hpos = 0; S.zoom.on = false;
    R.run = true; R.single = false; R.avgN = 0;
    Sim.ensure(State.tdiv(), 0);
    Sim.refilterTrig();
    nextArm = -Infinity; lastRealTrig = realClock;
    State.message('Autoset');
    return true;
  }

  function forceTrig() { forcePending = true; }
  function resetArm() { nextArm = -Infinity; }
  function markDirty() { State.R.stoppedDirty = true; State.R.avgN = 0; }

  return { tick, autoset, level50, forceTrig, resetArm, markDirty, buildRecord, estFreq, get realClock() { return realClock; } };
})();
