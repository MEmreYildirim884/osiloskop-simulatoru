/* =====================================================================
 * Sim — tezgâh devresini sürekli koşturan sinyal kaynağı
 *   - Bench.netlist() → MNA.Circuit; sabit adımlı transient çözüm
 *   - Her adımda prob uçlarındaki gerilimler (BNC'ye ulaşan, prob anahtarıyla bölünmüş)
 *     kanalın analog ön katı (prob bant genişliği, BW limit, AC kuplaj) filtrelerinden geçirilip
 *     halka tamponlara yazılır. Osiloskop (Acq) bu "analog geçmişi" kendi örnekleme saatiyle örnekler;
 *     böylece yavaş zaman tabanında gerçek aliasing kendiliğinden oluşur.
 *   - Adım: dt = max( min(Tmin/300, tdiv/25), Tmin/20000, tampon sığma sınırı )
 * ===================================================================== */
const Sim = (() => {
  const CAP = 1 << 20, MASK = CAP - 1;
  const ring = { c0: new Float32Array(CAP), c1: new Float32Array(CAP), ext: new Float32Array(CAP), trig: new Float32Array(CAP) };
  let cir = null, net = null, builtVersion = -1, builtComp = -1, builtX10 = '';
  let dt = 1e-6, count = 0, tBase = 0;     // örnek n'in zamanı: tBase + n*dt
  const F = {                               // analog filtre durumları
    ch: [{ p: 0, bw: 0, ac: 0 }, { p: 0, bw: 0, ac: 0 }],
    trig: { lp: 0, hp: 0 },
  };
  let warnings = [], fmax = 1000, fmin = 1000, fsq = 0;
  const HPF_AC = 10;          // TAHMIN: AC kuplaj alt kesim frekansı ≈ 10 Hz
  const X1_BW = 6e6;          // TAHMIN: ×1 prob bant genişliği ≈ 6 MHz
  const TRIG_REJ = 70e3;      // kılavuz: HF/LF Reject filtre köşe frekansı 70 kHz
  const LINE_F = 50;          // AC Line tetik kaynağı (Türkiye şebekesi 50 Hz)

  const a1 = (fc) => 1 - Math.exp(-2 * Math.PI * fc * dt);

  function needRebuild() {
    const m = Bench.model;
    const x10 = m.probes.map(p => p.x10).join();
    return !cir || builtVersion !== m.version || builtComp !== State.S.util.compFreq || builtX10 !== x10;
  }
  /** Netlist'i yeniden kur ve kararlı duruma kadar ısıt (warm-up). */
  function rebuild() {
    const m = Bench.model;
    net = Bench.netlist({ compFreq: State.S.util.compFreq });
    cir = new MNA.Circuit(net.nNodes, net.elems);
    builtVersion = m.version; builtComp = State.S.util.compFreq; builtX10 = m.probes.map(p => p.x10).join();
    warnings = net.warnings;
    fmax = net.freqs.length ? Math.max(...net.freqs) : 1000;
    fmin = net.freqs.length ? Math.min(...net.freqs) : 1000;
    fsq = net.sqFreqs.length ? Math.max(...net.sqFreqs) : 0;
    warmup();
  }
  /** Kararlı duruma oturtma: ~20 periyot (en az 50 ms) kaba adımla koşturulur. */
  function warmup() {
    const dtW = Math.min(1 / fmax / 300, 1e-4);
    const dur = Math.max(20 / fmin, 0.05);
    const cap = cir.nonlin ? 40000 : 400000;
    const n = Math.min(Math.ceil(dur / dtW), cap);
    const save = dt; dt = dtW;
    for (let i = 0; i < n; i++) stepOnce(false);
    dt = save;
    resetRing();
  }
  function resetRing() { count = 0; tBase = cir ? cir.t : 0; }

  /** İstenen adım (zaman tabanına göre) */
  function desiredDt(tdiv, extra = 0) {
    const Tmin = 1 / fmax;
    // kare dalga kenarlarının zamanlaması için daha ince adım (frekans ölçümü 4 haneye kadar doğru çıksın)
    const acc = Math.min(Tmin / 500, fsq ? 1 / fsq / 2000 : Infinity, tdiv / 25);
    const cost = Tmin / 20000;
    const ringFit = (16 * tdiv + extra) / (CAP * 0.9);   // ekran + ön tetik + H position tampona sığmalı
    let d = Math.max(acc, cost, ringFit);
    // küçük farklarla sürekli sıfırlamayı önlemek için 2^(k/4) ızgarasına yuvarla
    d = Math.pow(2, Math.round(Math.log2(d) * 4) / 4);
    return d;
  }
  /** Zaman tabanı değişince adımı ayarla (geçmiş sıfırlanır). */
  function ensure(tdiv, extra = 0) {
    if (needRebuild()) rebuild();
    const d = desiredDt(tdiv, extra);
    if (Math.abs(d / dt - 1) > 1e-9) { dt = d; resetRing(); }
  }

  /** Tek çözücü adımı + kanal ön katı filtreleri + tampona yazma */
  function stepOnce(write = true) {
    cir.step(dt, 'TR');
    const S = State.S, m = Bench.model, v = cir.v;
    const out = [0, 0];
    for (let c = 0; c < 2; c++) {
      const nd = net.probeNode[c];
      let x = nd >= 0 ? v[nd] : 0;
      const pr = m.probes[c];
      if (pr.x10) x /= 10;                         // fiziksel ×10 anahtarı: sinyal 10'a bölünür
      const f = F.ch[c];
      if (!pr.x10) { f.p += a1(X1_BW) * (x - f.p); x = f.p; } else f.p = x;
      const bwf = S.ch[c].bw === '20MHz' ? 20e6 : 100e6;
      f.bw += a1(bwf) * (x - f.bw); x = f.bw;
      f.ac += a1(HPF_AC) * (x - f.ac);
      if (S.ch[c].coupling === 'AC') x = x - f.ac;
      out[c] = x;
    }
    const ext = net.extNode >= 0 ? v[net.extNode] : 0;
    if (!write) return;
    const i = count & MASK;
    ring.c0[i] = out[0]; ring.c1[i] = out[1]; ring.ext[i] = ext;
    ring.trig[i] = trigFilter(trigSource(out[0], out[1], ext, tBase + count * dt));
    count++;
  }
  function trigSource(c0, c1, ext, t) {
    switch (State.S.trig.src) {
      case 'CH2': return c1;
      case 'EXT': return ext * State.S.trig.extAtten;
      case 'LINE': return Math.sin(2 * Math.PI * LINE_F * t);
      default: return c0;
    }
  }
  function trigFilter(x) {
    const f = F.trig, cpl = State.S.trig.coupling;
    if (cpl === 'AC') { f.hp += a1(HPF_AC) * (x - f.hp); return x - f.hp; }
    if (cpl === 'HF') { f.lp += a1(TRIG_REJ) * (x - f.lp); return f.lp; }
    if (cpl === 'LF') { f.hp += a1(TRIG_REJ) * (x - f.hp); return x - f.hp; }
    return x;
  }
  /** Tetik kaynağı/kuplajı değişince tetik tamponunu geçmiş veriden yeniden hesapla */
  function refilterTrig() {
    F.trig.lp = 0; F.trig.hp = 0;
    const n0 = oldestN();
    for (let n = n0; n < count; n++) {
      const i = n & MASK;
      ring.trig[i] = trigFilter(trigSource(ring.c0[i], ring.c1[i], ring.ext[i], tBase + n * dt));
    }
  }

  /** Simülasyonu 'seconds' kadar ilerlet (en fazla maxSteps adım). Gerçekleşen süreyi döndürür. */
  function advance(seconds, maxSteps) {
    if (!cir) rebuild();
    const cap = maxSteps || (cir.nonlin ? 9000 : 30000);   // kare başına hesap bütçesi
    const n = Math.max(0, Math.min(Math.ceil(seconds / dt), cap));
    for (let i = 0; i < n; i++) stepOnce(true);
    return n * dt;
  }

  const oldestN = () => Math.max(0, count - CAP + 1);
  const timeOf = (n) => tBase + n * dt;
  const nowT = () => tBase + (count - 1) * dt;
  const oldestT = () => timeOf(oldestN());
  /** Bir tampondan t anında doğrusal ara değerleme; veri yoksa NaN */
  function at(name, t) {
    const x = (t - tBase) / dt;
    const n = Math.floor(x);
    if (n < oldestN() || n + 1 > count - 1) {
      if (n === count - 1 && x - n < 1e-6) return ring[name][n & MASK];
      return NaN;
    }
    const r = ring[name], fr = x - n;
    const a = r[n & MASK], b = r[(n + 1) & MASK];
    return a + (b - a) * fr;
  }
  /** [t0, t1] aralığında min/max (Peak Detect için) */
  function minmax(name, t0, t1) {
    let n0 = Math.ceil((t0 - tBase) / dt), n1 = Math.floor((t1 - tBase) / dt);
    const lo = oldestN(), hi = count - 1;
    if (n1 < lo || n0 > hi) return null;
    n0 = Math.max(n0, lo); n1 = Math.min(n1, hi);
    const r = ring[name];
    let mn = Infinity, mx = -Infinity;
    if (n1 < n0) { const v = at(name, (t0 + t1) / 2); return isNaN(v) ? null : [v, v]; }
    for (let n = n0; n <= n1; n++) { const v = r[n & MASK]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return [mn, mx];
  }

  /** Autoset için: devreyi 'dur' saniye koştur ve her kanalın BNC gerilimlerini döndür */
  function analyze(dur) {
    if (needRebuild()) rebuild();
    const Tmin = 1 / fmax;
    const cap = cir.nonlin ? 40000 : 300000;
    dt = Math.max(Math.min(Tmin / 200, dur / 2000), dur / cap);
    resetRing();
    advance(dur, cap + 10);
    const n0 = oldestN(), N = count - n0;
    const out = { dt, c0: new Float64Array(N), c1: new Float64Array(N) };
    for (let k = 0; k < N; k++) { const i = (n0 + k) & MASK; out.c0[k] = ring.c0[i]; out.c1[k] = ring.c1[i]; }
    return out;
  }

  return {
    ring, ensure, advance, at, minmax, analyze, refilterTrig, rebuild, needRebuild,
    get dt() { return dt; }, get count() { return count; }, get tBase() { return tBase; },
    nowT, oldestT, timeOf, oldestN, MASK, CAP,
    get warnings() { return warnings; }, get fmax() { return fmax; }, get fmin() { return fmin; },
    get circuit() { return cir; },
  };
})();
