/* =====================================================================
 * Guide — sağ paneldeki kılavuz + ekran altındaki akıllı ipucu çubuğu + devre kütüphanesi
 *   Sekmeler: Lab (seçili devrenin adımları) · Tablolar · Nasıl ölçerim? · Ön panel tuşları · Teori · Cihaz
 *   Her kütüphane devresi için G1–G5 görevleri, o devrenin değerleri ve AC analizden gelen teoriyle üretilir.
 *   Test devrelerinde (group 'test') kılavuz ve teori gizlidir; "Kontrol et" / "Kılavuzu aç" ile açılır.
 *   Metin içindeki düğmeler:
 *     data-show="id1,id2"  → ön paneldeki tuş/düğmeleri yanıp sönen halkayla gösterir
 *     data-do="eylem"      → işlemi kullanıcı yerine yapar (ACT tablosu)
 *     data-live="ad"       → canlı ölçüm değeri (LIVE tablosu), her 250 ms güncellenir
 *     data-chk="ad"        → koşul sağlanınca adım yeşil ✓ olur (CHK tablosu)
 *   İlerleme ve tablolar devre başına tarayıcıda (localStorage) saklanır.
 * ===================================================================== */
const Guide = (() => {
  const fmt = Units.fmt;
  const S = () => State.S;
  const LS = 'ee212.lab1.v1';
  const DEF_STORE = { tab: 'lab', vi: 4, vi2: 8, vsq4: 5, rg4: 'comp', open: true, circuit: 'wien', steps: {}, data: {}, reveal: {}, seen: {} };
  const store = (() => {
    let o;
    try { o = Object.assign({}, DEF_STORE, JSON.parse(localStorage.getItem(LS) || '{}')); } catch (e) { o = Object.assign({}, DEF_STORE); }
    for (const k of ['steps', 'data', 'reveal', 'seen']) if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    // eski sürümden (tek devre) geçiş
    if (o.t1 || o.t2) { o.data.wien = { t1: o.t1 || {}, t2: o.t2 || {} }; delete o.t1; delete o.t2; }
    if (typeof o.step === 'number') { o.steps.wien = o.step; delete o.step; }
    return o;
  })();
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) { } };

  /* ---------------- geçerli devre ---------------- */
  const D = () => Circuits.get(store.circuit) || null;
  const I = () => D() ? Circuits.info(D()) : null;
  const isTest = () => D() && D().group === 'test';
  const hidden = () => isTest() && !store.reveal[store.circuit];
  const dat = () => store.data[store.circuit] || (store.data[store.circuit] = { t1: {}, t2: {} });
  const tVi = () => D() && D().id === 'wien' ? store.vi : D() && D().type === 'diff' ? store.vi2 : D() && D().type === 'rlc_step' ? store.vsq4 : (D() ? D().vpp : 4);
  const isDiff = () => !!D() && D().type === 'diff';
  /** Tablo 1 anahtarları (devre tipine göre) */
  const T1K = (d = D()) => d && d.type === 'diff' ? ['sinVo', 'vpos', 'vneg', 'fdist'] : d && d.type === 'rlc_step' ? ['rcrit', 'f0', 'rU', 'zU', 'vpk', 'os', 'tsU', 'tsC', 'rO', 'tsO'] : ['vi', 'vo', 'is', 'gain', 'phase'];
  const F0 = () => D() ? D().f : 50;
  const SWEEP = () => D() ? D().sweep : [];
  const stepIdx = () => store.steps[store.circuit] || 0;

  /** Teori: AC analizden; Vi = hedef Vpp kabul edilir */
  function theory(f) {
    const r = Circuits.response(f); if (!r) return null;
    const V = tVi();
    return { H: r.H, ph: r.ph, vo: r.H * V, ipk: (r.Irel || 0) * V / 2, iph: r.iph || 0, vr: (r.vrRel || 0) * V };
  }
  const fph = (v) => (v >= 0 ? '+' : '') + (+v).toFixed(2) + '°';
  const fq = (f) => fmt(f, 'Hz', 4).replace(/\.0+(?=[a-zA-Z])/, '').replace(/(\.\d*?)0+(?=[a-zA-Z])/, '$1');

  /* ---------------- devre / ölçüm yardımcıları ---------------- */
  const fg = () => Bench.model.comps.find(c => c.type === 'FG');
  const comp = (name) => Bench.model.comps.find(c => c.name === name);
  const node = (name) => Bench.nodes().find(g => g.name === name);
  const probeNode = (ch) => { const p = Bench.model.probes[ch]; const g = p.tip && Bench.nodeOf(p.tip); return g ? g.name : null; };
  const gndNode = (ch) => { const p = Bench.model.probes[ch]; const g = p.gnd && Bench.nodeOf(p.gnd); return g ? g.gnd : null; };
  const val = (name, s1, s2 = 'CH2') => { try { return Measure.value({ name, s1, s2 }); } catch (e) { return null; } };
  const hasMeas = (name, s1, s2) => S().meas.items.some(it => it.name === name && it.s1 === s1 && (!s2 || it.s2 === s2));
  function addMeas(name, s1, s2 = 'CH2') {
    if (hasMeas(name, s1, Measure.catOf(name) === 'D' ? s2 : null)) return;
    const m = S().meas;
    if (m.items.length >= 8) m.items.shift();
    m.items.push({ name, s1, s2 }); Measure.resetStats();
  }
  const isLoaded = () => D() && !!fg() && !!node('Vo') && !!node('Vi') && (D().sense ? !!comp(D().sense) : true);
  const mathSub = () => { const M = S().math; return M.on && M.kind === 'dual' && M.s1 === 'CH1' && M.op === '−' && M.s2 === 'CH2'; };
  function cursorDt() { const Cu = S().cursor; if (Cu.mode !== 'H') return null; const inf = Renderer.cursorInfo(); return inf.tAt(Cu.h[1]) - inf.tAt(Cu.h[0]); }
  /** Akım ölçme düzeni: 'single' = direncin bir ucu toprakta (CH2 o uçta, I = V/R) · değilse CH1 − CH2 (Math) */
  function senseInfo() {
    const s = Circuits.sense(); if (!s) return null;
    const single = s.lo === null;
    return { ...s, R: s.comp.value, name: s.comp.name, single, ch2: single ? s.hi : s.lo };
  }
  const freqOK = (f) => fg() && Math.abs(fg().freq - f) <= f * 1e-3;

  /* ---------------- canlı değerler ---------------- */
  const pp = (r) => r ? fmt(r.v, 'V', 4) : '?';
  function curNow() {
    const si = senseInfo(); if (!si || probeNode(1) !== si.ch2) return null;
    if (si.single) { const r = val('Pk-Pk', 'CH2'); return r ? { pp: r.v, ph: val('Phase', 'CH1', 'CH2') } : null; }
    if (!mathSub()) return null;
    const r = val('Pk-Pk', 'Math'); return r ? { pp: r.v, ph: val('Phase', 'CH1', 'Math') } : null;
  }
  const LIVE = {
    vi: () => { const r = val('Pk-Pk', 'CH1'); return { t: pp(r), bad: !r || Math.abs(r.v - tVi()) > tVi() * 0.02 }; },
    vo: () => { const r = val('Pk-Pk', 'CH2'); return { t: pp(r), bad: !r }; },
    gain: () => { const a = val('Pk-Pk', 'CH1'), b = val('Pk-Pk', 'CH2'); return a && b ? { t: (b.v / a.v).toFixed(4) } : { t: '?', bad: true }; },
    phase: () => { const r = val('Phase', 'CH1', 'CH2'); return r ? { t: (r.v >= 0 ? '+' : '') + r.v.toFixed(1) + '°' } : { t: '?', bad: true }; },
    freq: () => { const g = fg(); return { t: g ? fq(g.freq) : '—' }; },
    thPhase: () => { const g = fg(), t = g && theory(g.freq); return { t: t ? fph(t.ph) : '—' }; },
    thGain: () => { const g = fg(), t = g && theory(g.freq); return { t: t ? t.H.toFixed(4) : '—' }; },
    dt: () => { const d = cursorDt(); return d === null ? { t: 'imleç kapalı', bad: true } : { t: fmt(d, 's', 4) }; },
    phic: () => { const d = cursorDt(), g = fg(); return d === null || !g ? { t: '?', bad: true } : { t: (360 * g.freq * d).toFixed(1) + '°' }; },
    vr: () => { const c = curNow(); return c ? { t: fmt(c.pp, 'V', 4) } : { t: 'düzen kurulmadı', bad: true }; },
    is: () => { const c = curNow(), si = senseInfo(); return c && si ? { t: fmt(c.pp / 2 / si.R, 'A', 4) } : { t: '?', bad: true }; },
    phI: () => { const c = curNow(); return c && c.ph ? { t: (c.ph.v >= 0 ? '+' : '') + c.ph.v.toFixed(1) + '°' } : { t: '?', bad: true }; },
    vmax2: () => { const r = val('Max', 'CH2'); return r ? { t: fmt(r.v, 'V', 4) } : { t: '?', bad: true }; },
    vmin2: () => { const r = val('Min', 'CH2'); return r ? { t: fmt(r.v, 'V', 4) } : { t: '?', bad: true }; },
    thAv: () => { const g = fg(); return { t: g ? dth(g.freq).av.toFixed(3) : '—' }; },
    status: () => ({ t: State.R.status, bad: State.R.status !== "Trig'd" }),
    vdiv1: () => ({ t: fmt(State.vdiv(0), 'V') + '/div' }), vdiv2: () => ({ t: fmt(State.vdiv(1), 'V') + '/div' }), tdiv: () => ({ t: fmt(State.tdiv(), 's') + '/div' }),
  };

  /* ---------------- koşullar (adım ✓) ---------------- */
  const noClip = () => { const r = State.R.rec; return r && !r.clip[0] && !r.clip[1]; };
  const CHK = {
    loaded: isLoaded,
    p1Vi: () => probeNode(0) === 'Vi', p2Vo: () => probeNode(1) === 'Vo',
    p2sense: () => { const si = senseInfo(); return !!si && probeNode(1) === si.ch2; },
    gnd: () => gndNode(0) && gndNode(1),
    fgSine: () => fg() && fg().wave === 'sine', fgF: () => freqOK(F0()),
    fgAmp: () => fg() && Math.abs(fg().vpp - tVi()) / tVi() < 0.06,
    ch1on: () => S().ch[0].on, ch2on: () => S().ch[1].on,
    trig: () => State.R.status === "Trig'd", noclip: noClip,
    mPk1: () => hasMeas('Pk-Pk', 'CH1'), mPk2: () => hasMeas('Pk-Pk', 'CH2'), mPh: () => hasMeas('Phase', 'CH1', 'CH2'),
    vi4: () => { const r = val('Pk-Pk', 'CH1'); return r && Math.abs(r.v - tVi()) <= tVi() * 0.011; },
    cursH: () => S().cursor.mode === 'H',
    math: mathSub, curOK: () => !!curNow(),
    t2: () => SWEEP().every(f => isFinite(dat().t2[f])),
    t1: () => T1K().every(k => isFinite(dat().t1[k])),
    fgTri: () => fg() && fg().wave === 'triangle' && freqOK(100), fgS1k: () => fg() && fg().wave === 'sine' && freqOK(1000),
    mMax2: () => hasMeas('Max', 'CH2'), mMin2: () => hasMeas('Min', 'CH2'),
    capSin: () => isFinite(dat().t1.sinVo), capTri: () => isFinite(dat().t1.vpos) && isFinite(dat().t1.vneg), fdist: () => isFinite(dat().t1.fdist),
    xy: () => S().acq.xy,
    fchar: () => { const fc = Circuits.charFreq(); return fc && fg() && Math.abs(fg().freq / fc - 1) < 0.03; },
  };

  /* ---------------- eylemler ("⚡ Yap") ---------------- */
  let flash = null;
  function note(t, lvl = 'good', ms = 4500) { flash = { t, lvl, until: performance.now() + ms }; renderTip(true); }
  function attachProbe(ch, nodeName) {
    const g = node(nodeName); if (!g) return note(`"${nodeName}" düğümü bulunamadı — devreyi yeniden yükle.`, 'warn');
    BenchUI.checkpoint();
    Bench.model.probes[ch].tip = BenchUI.pinForNode(g.key);
    const gg = Bench.nodes().find(n => n.gnd);
    if (gg) Bench.model.probes[ch].gnd = BenchUI.pinForNode(gg.key);
    Bench.changed(); BenchUI.render();
  }
  function setFG(o) { const g = fg(); if (!g) return note('Tezgâhta jeneratör yok.', 'warn'); BenchUI.checkpoint(); Object.assign(g, o); Bench.changed(); BenchUI.render(); }
  function vppNow(ch) { const r = val('Cycle RMS', ch); if (r) return r.v * 2 * Math.SQRT2; const p = val('Pk-Pk', ch); return p ? p.v : null; }
  /** Ekranda dalganın ≤ 6 kare olacağı en hassas V/div kademesi */
  function vIdxFor(pp, c) {
    const a = S().ch[c].atten;
    for (let k = 0; k < State.VDIV.length; k++) if (pp / (State.VDIV[k] * a) <= 6) return k;
    return State.VDIV.length - 1;
  }
  /** Autoset'in çalışmadığı (≈ 20 Hz civarı ve altı) durumlar için elle ayar */
  function manualSet(f) {
    const s = S(), t = theory(f);
    s.ch[0].on = s.ch[1].on = true;
    [0, 1].forEach(c => { s.ch[c].atten = Bench.model.probes[c].x10 ? 10 : 1; s.ch[c].pos = 0; s.ch[c].coupling = 'DC'; });
    s.ch[0].vdivIdx = vIdxFor(tVi(), 0);
    s.ch[1].vdivIdx = vIdxFor(t ? Math.max(t.vo, 0.005) : tVi(), 1);
    let ti = State.TDIV.length - 1;
    for (let k = 0; k < State.TDIV.length; k++) if (State.TDIV[k] * 10 >= 2 / f) { ti = k; break; }
    s.tdivIdx = ti; s.hpos = 0;
    Object.assign(s.trig, { src: 'CH1', level: 0, slope: 'rise', mode: 'Auto', coupling: 'DC' });
    Sim.refilterTrig(); Acq.resetArm(); State.R.persistClear = true; State.R.run = true;
  }
  function autoset() {
    const ok = Acq.autoset();
    if (ok) { Menus.open('autoset'); State.R.persistClear = true; return true; }
    const g = fg(); if (g) { manualSet(g.freq); note(`Autoset bu frekansta (${fq(g.freq)}) çalışmadı (20 Hz civarı ve altında yetersiz). Ayarlar elle yapıldı: TIME/DIV ${fmt(State.tdiv(), 's')}/div.`, 'warn'); }
    return false;
  }
  const ACT = {
    load: () => loadCircuit(store.circuit),
    probes: () => { attachProbe(0, 'Vi'); attachProbe(1, 'Vo'); note('CH1 → Vi, CH2 → Vo; iki timsah da GND\'de.'); },
    fg: () => { if (isRlc()) return ACT.fgSq4(); setFG({ wave: 'sine', freq: F0(), vpp: tVi(), offset: 0 }); note(`Jeneratör: sinüs, ${fq(F0())}, ${tVi()} Vpp.`); },
    ch2on: () => { S().ch[1].on = true; State.R.persistClear = true; Menus.open('ch2'); },
    ch12: () => { const s = S(); s.ch[0].on = s.ch[1].on = true; [0, 1].forEach(c => s.ch[c].atten = Bench.model.probes[c].x10 ? 10 : 1); },
    autoset: () => { ACT.ch12(); autoset(); },
    attenFix: () => { [0, 1].forEach(c => S().ch[c].atten = Bench.model.probes[c].x10 ? 10 : 1); note('Menüdeki prob zayıflatması, probun üstündeki anahtarla eşitlendi.'); },
    mPk1: () => { Menus.open('measure'); addMeas('Pk-Pk', 'CH1'); },
    mPk2: () => { Menus.open('measure'); addMeas('Pk-Pk', 'CH2'); },
    mPh: () => { Menus.open('measure'); addMeas('Phase', 'CH1', 'CH2'); },
    mFreq: () => { Menus.open('measure'); addMeas('Frequency', 'CH1'); },
    tuneVi: () => {
      if (isRlc()) return note(`Bu deneyde jeneratör sabit: 0 → ${tVi()} V kare dalga — değiştirilmez.`, 'warn');
      if (isDiff()) return note(`Bu deneyde jeneratörün genliği sabit kalır (${tVi()} Vpp) — değiştirilmez.`, 'warn');
      const g = fg(), m = vppNow('CH1');
      if (!g || !m) return note('Önce CH1\'de dalga görünmeli (Autoset).', 'warn');
      setFG({ vpp: +(g.vpp * tVi() / m).toPrecision(4) });
      note(`Jeneratör genliği ${fmt(fg().vpp, 'Vpp', 4)} yapıldı → CH1 artık ≈ ${tVi()}.00 V okumalı.`);
    },
    ch2fine: () => { const t = theory(fg() ? fg().freq : F0()); if (t) { S().ch[1].vdivIdx = vIdxFor(t.vo, 1); State.R.persistClear = true; Acq.markDirty(); } },
    cursors: () => {
      const rec = State.R.rec, A1 = Measure.A('CH1'), A2 = Measure.A('CH2');
      if (!rec || !A1 || !A2 || !A1.rises.length || !A2.rises.length) return note('Önce iki kanalda da dalga görünmeli (Autoset).', 'warn');
      const toDiv = (A, r) => (A.t0 + r * A.step) / rec.tdiv - 5;
      const vi = A1.rises.map(r => toDiv(A1, r)).reduce((b, x) => Math.abs(x) < Math.abs(b) ? x : b);
      const vo = A2.rises.map(r => toDiv(A2, r)).reduce((b, x) => Math.abs(x - vi) < Math.abs(b - vi) ? x : b);
      const Cu = S().cursor;
      Cu.mode = 'H'; Cu.h = [Math.max(-5, Math.min(5, vo)), Math.max(-5, Math.min(5, vi))]; Cu.sel = 0; Cu.hunit = 'S'; Cu.src = 'CH1';
      Menus.open('cursor');
      note('① imleç Vo\'nun (mavi), ② imleç Vi\'nin (sarı) yükselen sıfır geçişine kondu. Δ = t_in − t_out.');
    },
    cursOpen: () => { const Cu = S().cursor; Menus.open('cursor'); Cu.mode = 'H'; Cu.sel = 0; },
    degUnit: () => {
      const p = val('Period', 'CH1'); if (!p) return note('Periyot ölçülemedi.', 'warn');
      const Cu = S().cursor; Cu.hRef = p.v; Cu.hunit = '°'; if (Cu.mode !== 'H') ACT.cursors();
      note('İmleç birimi derece: 1 periyot = 360°. Artık Δ doğrudan faz farkını gösterir.');
    },
    current: () => {
      const si = senseInfo(); if (!si) return note('Bu devrede akım ölçme direnci bulunamadı.', 'warn');
      if (probeNode(1) !== si.ch2) attachProbe(1, si.ch2);
      ACT.ch12(); autoset();
      if (si.single) {
        S().math.on = false;
        addMeas('Pk-Pk', 'CH2'); addMeas('Phase', 'CH1', 'CH2');
        note(`Akım düzeni hazır: CH2 = ${si.ch2} (${si.name} üzerindeki gerilim). I = V / ${fmt(si.R, 'Ω')}.`);
      } else {
        const s = S(), k = vIdxFor(tVi(), 0);
        [0, 1].forEach(c => { s.ch[c].vdivIdx = k; s.ch[c].pos = 0; });
        const M = s.math; Object.assign(M, { on: true, kind: 'dual', s1: 'CH1', op: '−', s2: 'CH2', pos: 0 });
        const t = theory(fg().freq); M.vdiv = Units.seq125(1e-3, 1e3).find(v => v * 6 >= (t ? t.vr : 1)) || 1;
        State.R.persistClear = true; Menus.open('math'); addMeas('Pk-Pk', 'Math'); addMeas('Phase', 'CH1', 'Math');
        note(`Akım düzeni hazır: kırmızı (Math) dalga = CH1 − CH2 = V_${si.name}.`);
      }
    },
    back: () => { if (probeNode(1) !== 'Vo') attachProbe(1, 'Vo'); S().math.on = false; S().meas.items = S().meas.items.filter(it => it.s1 !== 'Math' && it.s2 !== 'Math'); autoset(); note('CH2 Vo\'da, Math kapalı.'); },
    xy: () => { S().acq.xy = true; State.R.persistClear = true; Menus.open('acquire'); },
    yt: () => { S().acq.xy = false; State.R.persistClear = true; },
    avg: () => { S().acq.mode = 'Average'; S().acq.avgIdx = 3; Acq.markDirty(); },
    fchar: () => { const fc = Circuits.charFreq(); if (!fc) return note('Bu devrede karakteristik frekans bulunamadı.', 'warn'); setFG({ freq: +fc.toPrecision(4) }); ACT.ch12(); autoset(); addMeas('Phase', 'CH1', 'CH2'); },
    img: () => App.saveImage(),
    level50: () => { Acq.level50(); App.showLevel(); },
    run: () => { State.R.run = true; State.R.single = false; Acq.resetArm(); },
    dc: () => { S().ch[0].coupling = S().ch[1].coupling = 'DC'; Sim.refilterTrig(); },
    cap1: () => captureT1(),
    copy1: () => copyTable(1), copy2: () => copyTable(2), csv: () => downloadCSV(),
    clearTables: () => { store.data[store.circuit] = { t1: {}, t2: {} }; save(); render(); },
    trigCh1: () => { const T = S().trig; T.src = 'CH1'; T.mode = 'Auto'; T.coupling = 'DC'; Sim.refilterTrig(); Acq.level50(); },
    reveal: () => { store.reveal[store.circuit] = true; save(); render(); },
    hide: () => { delete store.reveal[store.circuit]; save(); render(); },
    check: () => { dat().checked = true; save(); render(); },
    library: () => openLibrary(),
    next: () => stepCircuit(1),
  };
  function sweepSet(f) {
    if (!isLoaded()) loadCircuit(store.circuit);
    if (probeNode(1) !== 'Vo') attachProbe(1, 'Vo');
    if (probeNode(0) !== 'Vi') attachProbe(0, 'Vi');
    S().math.on = false; S().acq.xy = false;
    if (isDiff()) {
      // Prelab 02: üçgen dalga, genlik tarama boyunca sabit (hep aynı jeneratör ayarı)
      setFG({ freq: f, wave: 'triangle', vpp: tVi(), offset: 0 }); ACT.ch12(); autoset();
      addMeas('Pk-Pk', 'CH1'); addMeas('Pk-Pk', 'CH2');
      return note(`Jeneratör: üçgen ${fq(f)}, ${tVi()} Vpp. Autoset yapıldı. CH1 ve CH2 Pk-Pk değerlerini oku.`);
    }
    setFG({ freq: f, wave: 'sine' });
    ACT.ch12();
    const ok = f >= 25 ? autoset() : (manualSet(f), false);
    addMeas('Phase', 'CH1', 'CH2'); addMeas('Pk-Pk', 'CH2');
    if (ok) note(`Jeneratör ${fq(f)} yapıldı ve Autoset yapıldı. Faz değeri birkaç saniyede oturur.`);
    else if (f < 25) note(`Jeneratör ${fq(f)} yapıldı. Autoset bu kadar düşük frekansta çalışmaz → elle ayarlandı (TIME/DIV ${fmt(State.tdiv(), 's')}/div).`);
  }
  function sweepSave(f) {
    const g = fg();
    if (!freqOK(f)) return note(`Jeneratör şu an ${g ? fq(g.freq) : '?'} — önce "Ayarla"ya bas.`, 'warn');
    if (isDiff()) {
      if (g.wave !== 'triangle') return note('Bu tablo üçgen dalga içindir — önce "Ayarla"ya bas.', 'warn');
      const a = val('Pk-Pk', 'CH1'), b = val('Pk-Pk', 'CH2');
      if (!a || !b) return note('Vi,pp / Vo,pp ölçülemedi (dalga ekrandan taşıyor mu?).', 'warn');
      const T = dat(); T.t2[f] = +(b.v / a.v).toFixed(4); (T.pp || (T.pp = {}))[f] = [+a.v.toFixed(4), +b.v.toFixed(4)]; save(); render();
      return note(`${fq(f)}: Vi,pp = ${fmt(a.v, 'V', 4)}, Vo,pp = ${fmt(b.v, 'V', 4)} → Av = ${(b.v / a.v).toFixed(3)} kaydedildi.`);
    }
    const r = val('Phase', 'CH1', 'CH2'); if (!r) return note('Faz ölçülemedi (dalga ekrandan taşıyor ya da ekranda tam periyot yok).', 'warn');
    dat().t2[f] = +r.v.toFixed(2); save(); render();
    note(`${fq(f)}: φ = ${r.v.toFixed(2)}° kaydedildi.`);
  }
  function captureT1() {
    if (isDiff()) return captureDiff();
    if (isRlc()) return captureRlc();
    const got = [], T = dat().t1;
    if (!freqOK(F0())) return note(`Tablo 1 için jeneratör ${fq(F0())} olmalı.`, 'warn');
    const vi = val('Pk-Pk', 'CH1'), vo = val('Pk-Pk', 'CH2'), ph = val('Phase', 'CH1', 'CH2');
    if (probeNode(1) === 'Vo') {
      if (vi) { T.vi = +vi.v.toFixed(4); got.push('Vi'); }
      if (vo) { T.vo = +vo.v.toFixed(4); got.push('Vo'); }
      if (vi && vo) { T.gain = +(vo.v / vi.v).toFixed(4); got.push('kazanç'); }
      if (ph) { T.phase = +ph.v.toFixed(2); got.push('faz'); }
    }
    const c = curNow(), si = senseInfo();
    if (c && si) { T.is = +(c.pp / 2 / si.R).toExponential(4); got.push('akım'); }
    save(); render();
    note(got.length ? `Kaydedildi: ${got.join(', ')}.` + (isFinite(T.is) ? '' : ' Akım için G4 düzenini kur ve tekrar bas.') : 'Kaydedilecek ölçüm bulunamadı (CH2 Vo\'da mı?).', got.length ? 'good' : 'warn');
  }

  /* ---------------- devre yükleme / kütüphane ---------------- */
  function loadCircuit(id) {
    BenchUI.checkpoint();
    store.circuit = id; if (Circuits.get(id) && Circuits.get(id).isNew) store.seen[id] = true; save();
    App.loadPreset(id);
    if (Circuits.get(id)) {
      // osiloskop fabrika ayarında başlar; öğrenci Autoset'e kendisi basar
      State.set(State.defaults()); Sim.refilterTrig(); Acq.resetArm(); State.R.persistClear = true;
    }
    BenchUI.render(); updateHeader(); render();
    const d = Circuits.get(id);
    note(d ? `"${d.title}" yüklendi. ${d.group === 'test' ? 'Test modu: kılavuz gizli.' : 'Kılavuz bu devre için hazır.'}` : 'Devre yüklendi (bu devre için kılavuz yok).');
  }
  const ORDER = () => Circuits.DEFS.map(d => d.id);
  function stepCircuit(dir) {
    const o = ORDER(); let i = o.indexOf(store.circuit);
    i = i < 0 ? 0 : (i + dir + o.length) % o.length;
    loadCircuit(o[i]);
  }
  const EXTRA = [['comp', 'Prob kompanzasyon', '2 V / 1 kHz kare dalga'], ['rc', 'RC filtre (159 Hz, eski)', 'Serbest çalışma'], ['rlc', 'Seri RLC (eski)', 'Serbest çalışma'], ['rect', 'Yarım dalga doğrultucu', 'Diyot + kondansatör'], ['empty', 'Boş tezgâh', 'Kendi devreni kur']];
  function cstatus(id) {
    const d = store.data[id]; if (!d) return '';
    const cd = Circuits.get(id), n2 = cd ? cd.sweep.length : 7;
    const K = T1K(cd), t1 = K.filter(k => isFinite(d.t1 && d.t1[k])).length, t2 = Object.keys(d.t2 || {}).length;
    if (d.checked && d.score) return `<span class="cst ok">Skor ${d.score}</span>`;
    if (t1 === K.length && t2 >= n2) return '<span class="cst ok">✓ Tamam</span>';
    if (t1 || t2) return `<span class="cst">Devam: ${t1 + t2}/${K.length + n2}</span>`;
    return '';
  }
  function card(d) {
    const inf = Circuits.info(d);
    return `<div class="ccard ${d.group} ${d.isNew ? 'new' : ''} ${d.id === store.circuit ? 'cur' : ''}" data-load="${d.id}">
      <div class="ct">${d.group === 'lab' ? '⭐ ' : ''}${d.title}${d.isNew ? '<span class="newb">YENİ</span>' : ''}</div><div class="ck">${inf.kind}</div>
      <div class="cf">${fq(d.f)}${d.type === 'diff' ? ' sinüs + üçgen' : d.type === 'rlc_step' ? ' kare dalga (0 → V<sub>SQ</sub>)' : ''} · ${d.group === 'lab' ? 'S\'ye göre' : d.vpp} Vpp ${d.group === 'test' ? '· <b>kılavuz gizli</b>' : '· kılavuzlu'}</div>${cstatus(d.id)}</div>`;
  }
  function openLibrary() {
    const modal = document.getElementById('modal'), box = document.getElementById('modalBox');
    const G = (g) => Circuits.DEFS.filter(d => d.group === g);
    box.classList.add('lib');
    box.innerHTML = `<div class="libHead"><h2>📚 Devre Kütüphanesi</h2><button class="ui" data-close="1">✕ Kapat</button></div>
      <p class="muted">Bir karta tıkla → devre tezgâha kurulur, kılavuz o devre için hazırlanır. Osiloskop fabrika ayarına döner (Autoset'e sen basarsın).</p>
      <h3>⭐ Laboratuvar deneyleri</h3><div class="cgrid">${G('lab').map(card).join('')}</div>
      <h3>🎓 Öğretmeli devreler <small>— her görev adım adım anlatılır (${G('learn').length})</small></h3><div class="cgrid">${G('learn').map(card).join('')}</div>
      <h3>📝 Kendini test et <small>— kılavuz ve cevaplar gizli; bitirince "Kontrol et" (${G('test').length})</small></h3><div class="cgrid">${G('test').map(card).join('')}</div>
      <h3>🧰 Diğer</h3><div class="cgrid">${EXTRA.map(([id, t, k]) => `<div class="ccard other ${id === store.circuit ? 'cur' : ''}" data-load="${id}"><div class="ct">${t}</div><div class="ck">${k}</div><div class="cf">kılavuz yok</div></div>`).join('')}</div>`;
    modal.style.display = 'flex';
    newBadge();
    box.onclick = (e) => {
      const c = e.target.closest('[data-load]'); if (c) { modal.style.display = 'none'; box.classList.remove('lib'); box.onclick = null; loadCircuit(c.dataset.load); return; }
      if (e.target.closest('[data-close]')) { modal.style.display = 'none'; box.classList.remove('lib'); box.onclick = null; }
    };
  }
  /** Henüz açılmamış yeni deney varsa 📚 Devreler düğmesinde ⭐ */
  function newBadge() {
    const b = document.getElementById('libBtn'); if (!b) return;
    const n = Circuits.DEFS.filter(d => d.isNew && !store.seen[d.id]);
    b.classList.toggle('hasNew', n.length > 0);
    b.title = n.length ? `Yeni: ${n.map(d => d.title).join(', ')}` : 'Tüm devreler: laboratuvar deneyleri, öğretmeli devreler, test devreleri';
  }
  function updateHeader() {
    newBadge();
    const el = document.getElementById('curName'); if (!el) return;
    const d = D(), x = EXTRA.find(e => e[0] === store.circuit);
    el.innerHTML = d ? `${d.group === 'test' ? '📝' : d.group === 'lab' ? '⭐' : '🎓'} ${d.title}` : (x ? '🧰 ' + x[1] : '—');
  }

  /* ---------------- adım üretimi (her devre için) ---------------- */
  const show = (ids, txt = '👁 Göster') => `<button data-show="${ids}">${txt}</button>`;
  const doit = (a, txt = '⚡ Benim için yap') => `<button class="do" data-do="${a}">${txt}</button>`;
  const acts = (...b) => `<span class="acts">${b.join('')}</span>`;
  const live = (n) => `<span class="live" data-live="${n}">…</span>`;
  const B = (cls, html) => `<div class="gbox ${cls}">${html}</div>`;
  const KNOB = (n) => `<b>${n}</b> düğmesini çevir`;
  const BOT = (i, n) => `ekranın <b>altındaki ${i}. tuşa</b> (<i>${n}</i>) bas`;
  const SIDE = (i, n) => `ekranın <b>sağındaki ${i}. tuşa</b> (<i>${n}</i>) bas`;

  const FORMULA = {
    wien: 'H = Z<sub>p</sub> / (Z<sub>s</sub> + Z<sub>p</sub>), Z<sub>s</sub> = R1 + 1/(jωC1), Z<sub>p</sub> = R2 ∥ 1/(jωC2)<br>(R1 = R2 = R, C1 = C2 = C ise: H = 1 / [3 + j(ωRC − 1/ωRC)])',
    rc_lp: 'H = 1 / (1 + jωRC) &nbsp;·&nbsp; |H| = 1/√(1 + (ωRC)²) &nbsp;·&nbsp; φ = −arctan(ωRC)',
    cr_hp: 'H = jωRC / (1 + jωRC) &nbsp;·&nbsp; φ = 90° − arctan(ωRC)',
    rl_hp: 'H = jωL / (R + jωL) &nbsp;·&nbsp; φ = 90° − arctan(ωL/R)',
    lr_lp: 'H = R / (R + jωL) &nbsp;·&nbsp; φ = −arctan(ωL/R)',
    rlc_bp: 'H = R / [R + j(ωL − 1/ωC)] &nbsp;·&nbsp; φ = −arctan[(ωL − 1/ωC)/R]',
    rlc_lp: 'H = (1/jωC) / [R + jωL + 1/(jωC)] = 1 / (1 − ω²LC + jωRC)',
    tank: 'H = Z<sub>LC</sub> / (R + Z<sub>LC</sub>), Z<sub>LC</sub> = jωL / (1 − ω²LC)',
    rc2_lp: 'R1 = R2 = R, C1 = C2 = C ise: H = 1 / (1 − (ωRC)² + 3jωRC)',
    cr2_hp: 'Rs ihmal edilirse ve değerler eşitse: H = (jωRC)² / (1 − (ωRC)² + 3jωRC)',
    lag: 'H = (R2 + 1/jωC) / (R1 + R2 + 1/jωC)',
    lead: 'H = R2 / (R2 + Z<sub>1</sub>), Z<sub>1</sub> = R1 ∥ 1/(jωC1)',
    twint: 'İki T yolunun düğüm denklemleri; çentik: f = 1/(2πRC) (R3 = R/2, C3 = 2C)',
    rc_loaded: 'H = Z<sub>p</sub> / (R1 + Z<sub>p</sub>), Z<sub>p</sub> = R2 ∥ 1/(jωC) &nbsp;·&nbsp; DC kazanç = R2/(R1+R2)',
    diff: 'v<sub>o</sub>(t) = −R1·C1 · dv<sub>i</sub>/dt &nbsp;·&nbsp; H(jω) = −jωR1C1 &nbsp;·&nbsp; |H| = ωR1C1, φ = −90°',
  };
  function reactances(f) {
    const out = [];
    for (const c of Bench.model.comps) {
      if (c.type === 'C') out.push(`${c.name}: X<sub>C</sub> = 1/(2πfC) = <b>${fmt(1 / (2 * Math.PI * f * c.value), 'Ω', 3)}</b>`);
      if (c.type === 'L') out.push(`${c.name}: X<sub>L</sub> = 2πfL = <b>${fmt(2 * Math.PI * f * c.value, 'Ω', 3)}</b>`);
    }
    const rs = Bench.model.comps.filter(c => c.type === 'R').map(c => `${c.name} = ${fmt(c.value, 'Ω')}`);
    return out.join(' · ') + (rs.length ? ` &nbsp;(dirençler: ${rs.join(', ')})` : '');
  }
  const nodeNames = () => [...new Set(Object.values(Bench.model.netNames))];

  function buildSteps() {
    if (isDiff()) return diffSteps();
    if (isRlc()) return rlcSteps();
    const d = D(), inf = I(), isW = d.id === 'wien';
    const t0 = theory(F0()) || { H: 0, ph: 0, vo: 0, ipk: 0, iph: 0, vr: 0 };
    const si = senseInfo();
    const T = 1 / F0(), dtTh = t0.ph / 360 * T;
    const lead = t0.ph >= 0;
    const fc = Circuits.charFreq();
    const vRec = (v) => fmt(State.VDIV[vIdxFor(v, 1)] * S().ch[1].atten, 'V') + '/div';
    const steps = [];

    steps.push({ kind: 'start', code: 'Başla', t: 'Bu devrede ne yapacağız?', chk: 'loaded', html: () => `
      <div class="ccard cur" style="cursor:default"><div class="ct">${d.title}</div><div class="ck">${inf.kind}</div><div class="cf">${fq(F0())} · ${tVi()} Vpp</div></div>
      ${B('simple', inf.simple + ' Biz osiloskopla <b>kazancı</b> (Vo/Vi) ve <b>faz farkını</b> (φ) ölçüp tablolara yazacağız.')}
      <h3>Kılavuz nasıl düzenlendi?</h3>
      <table>
        <tr><td><span class="kind prep">HAZIRLIK</span></td><td>Ölçüme hazırlanma (devre, jeneratör, ekran). Tabloya bir şey yazılmaz.</td></tr>
        <tr><td><span class="kind task">GÖREV</span></td><td>Asıl ölçüm. Sonucu tabloya yazılır.</td></tr>
        <tr><td><span class="kind bonus">BONUS</span></td><td>İsteğe bağlı.</td></tr>
      </table>
      <p>Her sayfadaki numaralı kutular (1, 2, 3 …) o işin <b>adımları</b>dır. Yapınca kutu yeşil ✓ olur.</p>
      <h3>Görev haritası</h3>
      <table><tr><th>Görev</th><th>Ne ölçülür</th><th>Nereye</th></tr>
        <tr><td><b>G1</b></td><td>Giriş gerilimi Vi,pp (CH1)</td><td>Tablo 1 · Vi,pp</td></tr>
        <tr><td><b>G2</b></td><td>Çıkış Vo,pp (CH2) ve kazanç Vo/Vi</td><td>Tablo 1 · Vo,pp, Kazanç</td></tr>
        <tr><td><b>G3</b></td><td>Faz farkı φ (${fq(F0())})</td><td>Tablo 1 · Faz</td></tr>
        <tr><td><b>G4</b></td><td>${si ? `${si.name} direncinin akımı (tepe)` : 'Akım'}</td><td>Tablo 1 · Is,peak</td></tr>
        <tr><td><b>G5</b></td><td>${SWEEP().length} frekansta faz farkı</td><td>Tablo 2</td></tr></table>
      ${isW ? B('tip', 'Bu devre raporundaki deneyin aynısı. Tablo 1 ve Tablo 2 rapordaki tablolarla aynı sırada.') : ''}
      <h3>Panel nasıl kullanılır?</h3>
      <ul><li><b>Düğme çevirmek:</b> fareyi düğmenin üstüne getir, <b>tekerleği çevir</b> (yukarı = saat yönü).</li>
        <li><b>Tuşa basmak:</b> tıkla. POSITION/LEVEL düğmelerine tıklamak sıfırlar.</li>
        <li>Ekranın <b>altındaki 7 tuş</b> alttaki menü kutularını, <b>sağındaki 5 tuş</b> sağdaki menüyü seçer.</li>
        <li>Ekrandaki turuncu <b>!</b> işaretlerine bas: o bölgenin ne gösterdiğini detaylı anlatır.</li></ul>
      <ol class="steps"><li data-chk="loaded">Devre tezgâhta kurulu olmalı. ${acts(doit('load', '⚡ Devreyi (yeniden) kur'))}</li></ol>` });

    steps.push({ kind: 'prep', code: 'H1', t: 'Devreyi tanı, probları bağla', chk: ['p1Vi', 'p2Vo', 'gnd'], html: () => `
      ${B('simple', inf.simple)}
      <div class="formula">${Circuits.diagram()}</div>
      <p>Tezgâhtaki kırmızı etiketler düğümlerin adları: <b>${nodeNames().join(', ')}</b>. Vi = jeneratörün çıkışı, Vo = ölçtüğümüz çıkış.</p>
      <ol class="steps">
        <li data-chk="p1Vi"><b>Sarı CH1 probunun ucunu Vi'ye</b> tak: ucu sürükleyip Vi etiketli noktaya bırak ya da tezgâhın sağındaki "Problar" kutusundan seç.</li>
        <li data-chk="p2Vo"><b>Mavi CH2 probunun ucunu Vo'ya</b> tak.</li>
        <li data-chk="gnd">İki probun da <b>siyah timsah klipsini GND'ye</b> tak. ${acts(doit('probes'))}</li>
      </ol>
      ${B('why', 'Osiloskop her zaman <b>ucun gerilimini toprağa göre</b> ölçer. Timsahlar osiloskobun içinde birbirine ve şebeke toprağına bağlıdır; timsahı topraktan başka bir yere takarsan o noktayı toprağa kısa devre edersin.')}
      ${d.sense === 'Rs' ? B('tip', 'Girişteki <b>Rs</b> direnci akımı ölçebilmek için konuldu (akım ölçme / shunt direnci). Devrenin bir parçasıdır; teorik değerler onu da hesaba katar.') : ''}` });

    steps.push({ kind: 'prep', code: 'H2', t: `Jeneratörü ayarla: ${fq(F0())} sinüs`, chk: ['fgSine', 'fgF', 'fgAmp'], html: () => `
      ${B('simple', `Jeneratöre "saniyede ${F0()} kez git-gel yapan, tepeden tepeye ${tVi()} V'luk bir sinüs üret" diyoruz.`)}
      ${isW ? `<p><b>Genlik seçimi (S'ye göre):</b> 0 ≤ S ≤ 6 → <b>4 Vpp</b> · 6 &lt; S ≤ 12 → 8 Vpp · 12 &lt; S ≤ 18 → 12 Vpp. Seçimin: <select id="viSel" class="ui">${[4, 8, 12].map(v => `<option ${store.vi === v ? 'selected' : ''}>${v}</option>`).join('')}</select> Vpp</p>` : ''}
      <ol class="steps">
        <li data-chk="fgSine">Tezgâhta <b>jeneratöre (FG1) tıkla</b>; sağda ayarları açılır. Dalga: <b>Sinüs</b>.</li>
        <li data-chk="fgF">Frekans: <b>${fq(F0())}</b> düğmesine tıkla (ya da kutuya yaz).</li>
        <li data-chk="fgAmp">Genlik: <b>${tVi()} Vpp</b>. ${acts(doit('fg'))}</li>
      </ol>
      ${B('why', `<b>Vpp</b> = dalganın en üst ve en alt noktası arasındaki fark. ${tVi()} Vpp sinüs +${tVi() / 2} V ile −${tVi() / 2} V arasında gidip gelir. Bir dalganın süresi (periyot) T = 1/f = <b>${fmt(T, 's', 4)}</b>.`)}` });

    steps.push({ kind: 'prep', code: 'H3', t: 'Kanalları aç ve Autoset yap', chk: ['ch1on', 'ch2on', 'trig', 'noclip'], html: () => `
      ${B('simple', 'Osiloskoba "iki kanalı da göster ve ekranı kendin ayarla" diyoruz.')}
      <ol class="steps">
        <li data-chk="ch1on"><b>CH1</b> tuşu sarı yanıyor olmalı. ${acts(show('ch1'))}</li>
        <li data-chk="ch2on"><b>CH2</b> tuşuna bas → tuş mavi yanar. ${acts(show('ch2'), doit('ch2on'))}</li>
        <li data-chk="trig"><b>Autoset</b> tuşuna bas. Sağ üstte yeşil <b>Trig'd</b> yazmalı. ${acts(show('autoset'), doit('autoset'))}</li>
        <li data-chk="noclip">İki dalga da ekranın içinde, taşmıyor.</li>
      </ol>
      ${B('see', `Sarı dalga = Vi, mavi dalga = Vo. Bu frekansta mavi, sarıdan ${lead ? '<b>önce</b> yükseliyor (sola kaymış) → Vo önde' : '<b>sonra</b> yükseliyor (sağa kaymış) → Vo geride'}. Durum: ${live('status')}`)}
      ${F0() < 30 ? B('warn', 'Autoset 20 Hz civarında ve altında çalışmayabilir. "Benim için yap" bu durumda ayarları elle yapar.') : ''}
      ${B('why', '<b>Tetik</b>: osiloskop her çizimde dalgayı aynı noktadan başlatsın diye "sinyal şu seviyeyi yukarı doğru geçince çizmeye başla" kuralı. Tetik olmazsa dalga ekranda kayar.')}` });

    steps.push({ kind: 'prep', code: 'H4', t: 'Ekranı okumayı öğren', html: () => `
      ${B('simple', 'Ekranın altındaki yazılar "bir kare kaç volt, kaç saniye" bilgisini verir. Kare sayısı × kare değeri = ölçüm. Ekrandaki turuncu <b>!</b> işaretlerine basarak her bölgenin detaylı açıklamasını görebilirsin.')}
      <table><tr><th>Ekranda</th><th>Anlamı</th></tr>
        <tr><td>Altta <span style="color:var(--ch1)">■1</span> ${live('vdiv1')}</td><td>CH1'de dikeyde bir kare bu kadar volt.</td></tr>
        <tr><td>Altta <span style="color:var(--ch2)">■2</span> ${live('vdiv2')}</td><td>CH2'de bir kare bu kadar volt.</td></tr>
        <tr><td>Altta <b>H</b> ${live('tdiv')}</td><td>Yatayda bir kare bu kadar süre.</td></tr>
        <tr><td>Sol kenardaki ▶1 ▶2</td><td>Kanalların <b>0 V</b> çizgisi.</td></tr>
        <tr><td>Üstteki turuncu ▼</td><td>Tetik anı (t = 0).</td></tr>
        <tr><td>Sağ kenardaki ◀</td><td>Tetik seviyesi.</td></tr>
        <tr><td>Sağ alt köşe</td><td>Frekans sayacı.</td></tr>
      </table>
      ${B('tip', `Örnek: bir dalga yatayda 4 kare ve TIME/DIV ${fmt(State.tdiv(), 's')}/div ise T = 4 × ${fmt(State.tdiv(), 's')} = ${fmt(4 * State.tdiv(), 's')} → f = 1/T.`)}` });

    steps.push({ kind: 'task', code: 'G1', short: 'Vi ölç', goes: 'Tablo 1 → Vi,pp', t: `Vi,pp ölç (CH1) — ${tVi()}.00 V olmalı`, chk: ['mPk1', 'vi4'], html: () => `
      ${B('simple', 'Sarı dalganın tepeden tepeye yüksekliğini osiloskoba ölçtürüyoruz.')}
      <ol class="steps">
        <li><b>Measure</b> tuşuna bas. ${acts(show('measure'))}</li>
        <li>${BOT(1, 'Add Measurement')}. Sağda bir menü açılır. ${acts(show('bot0'))}</li>
        <li>Sağdaki menüde <b>Source1</b> altında <b>CH1</b> yazmalı. Yazmıyorsa ${SIDE(4, 'Source1')}. ${acts(show('side3'))}</li>
        <li>${SIDE(1, 'V/I')} → ekranda ölçüm listesi açılır. ${acts(show('side0'))}</li>
        <li>${KNOB('VARIABLE')}, listede <b>Pk-Pk</b>'yı seç (en üstte), sonra <b>Select</b> tuşuna bas. ${acts(show('variable,select'))}</li>
        <li><b>Menu Off</b> ile listeyi kapat. ${acts(show('menuoff'))}</li>
        <li data-chk="mPk1">Ekranın altında <b>CH1 Pk-Pk</b> kutusu çıktı. ${acts(doit('mPk1'))}</li>
        <li data-chk="vi4">Değer = ${live('vi')}. Hedef <b>${tVi()}.00 V</b>. Değilse jeneratörün genliğini biraz değiştir. ${acts(doit('tuneVi', '⚡ Jeneratörü ayarla'))}</li>
      </ol>
      ${B('why', 'Jeneratörün içinde 50 Ω\'luk bir direnç var; devreye bağlanınca ayarladığın gerilimin tamamı devreye ulaşmaz. Bu yüzden <b>Vi her zaman osiloskopla ölçülerek</b> hedef değere getirilir. Devrenin giriş empedansı frekansla değiştiği için bu düşüş her frekansta farklıdır.')}` });

    steps.push({ kind: 'task', code: 'G2', short: 'Vo + kazanç', goes: 'Tablo 1 → Vo,pp ve Kazanç', t: 'Vo,pp ölç (CH2) ve kazancı bul', chk: ['mPk2'], html: () => `
      ${B('simple', 'Mavi dalganın yüksekliğini ölç, sonra mavi ÷ sarı yap. Bu sayı "devre dalgayı kaç katına çevirdi" demek.')}
      <ol class="steps">
        <li><b>Measure</b> → ${BOT(1, 'Add Measurement')}. ${acts(show('measure,bot0'))}</li>
        <li>${SIDE(4, 'Source1')} → altında <b>CH2</b> yazana kadar. ${acts(show('side3'))}</li>
        <li>${SIDE(1, 'V/I')} → ${KNOB('VARIABLE')}, <b>Pk-Pk</b> → <b>Select</b> → <b>Menu Off</b>.</li>
        <li data-chk="mPk2">Ekranın altında <b>CH2 Pk-Pk</b> = ${live('vo')} (teori <b>${fmt(t0.vo, 'V', 4)}</b>) ${acts(doit('mPk2'))}</li>
        <li>Daha hassas olsun: <b>CH2 SCALE</b> düğmesini saat yönünde çevirip yaklaşık <b>${vRec(t0.vo)}</b> yap. Dalga ekranı doldurdukça ölçüm doğrulaşır. ${acts(show('ch2scale'), doit('ch2fine', '⚡ Ayarla'))}</li>
        <li>Kazanç = Vo ÷ Vi = ${live('gain')} (teori <b>${t0.H.toFixed(4)}</b>). Laboratuvarda bunu sen hesaplarsın.</li>
      </ol>
      <div class="formula">${FORMULA[d.type] || ''}</div>
      ${B('why', `${inf.why}<br><br>Bu frekansta (${fq(F0())}): ${reactances(F0())}`)}
      ${t0.H > 1 ? B('see', 'Bu devrede kazanç 1\'den büyük: çıkış girişten büyük. Bu bir hata değil; rezonansta L ve C enerji biriktirir.') : ''}` });

    steps.push({ kind: 'task', code: 'G3', short: 'Faz', goes: 'Tablo 1 → Faz φ', t: `Faz farkı φ (${fq(F0())})`, chk: ['cursH'], html: () => `
      ${B('simple', 'Mavi dalga sarıdan ne kadar ' + (lead ? 'önde' : 'geride') + '? Bunu bir cetvelle (imleç) ölçeceğiz.')}
      <h3>Yöntem A — İmleçle</h3>
      <p>İmleç = ekranda sağa sola kaydırabildiğin <b>iki dikey çizgi</b> (① ve ②). Osiloskop aradaki süreyi sol üst köşede <b>Δ</b> olarak yazar.
      <b>Yükselen sıfır geçişi</b> = dalganın ortadaki yatay çizgiyi <b>aşağıdan yukarı</b> kestiği nokta.</p>
      <ol class="steps">
        <li>İki kanalın 0 V çizgisi ortada olsun: <b>CH1 POSITION</b> ve <b>CH2 POSITION</b> düğmelerine birer kez tıkla. ${acts(show('ch1pos,ch2pos'))}</li>
        <li data-chk="cursH"><b>Cursor</b> tuşuna bir kez bas → iki dikey çizgi çıkar. ${acts(show('cursor'), doit('cursOpen', '⚡ İmleçleri aç'))}</li>
        <li><b>Select</b> tuşuna bas; alttaki "H Cursor" kutusunda sadece <b>①</b> görünene kadar (① → ② → ①②). ${acts(show('select,bot0'))}</li>
        <li>${KNOB('VARIABLE')}: ① çizgisini <b>mavi dalganın</b> yükselen sıfır geçişine getir (tekerlek yukarı = sağa). ${acts(show('variable'))}</li>
        <li><b>Select</b> ile <b>②</b>'ye geç, ②'yi <b>sarı dalganın</b> yükselen sıfır geçişine getir.</li>
        <li>Sol üstte Δ = ${live('dt')} (teori ≈ <b>${fmt(dtTh, 's', 3)}</b>). φ = 360 × ${F0()} × Δt = ${live('phic')} (teori <b>${fph(t0.ph)}</b>)</li>
      </ol>
      <p>${acts(doit('cursors', '⚡ İmleçleri benim için yerleştir'))}</p>
      <div class="formula">φ = 360° · f · Δt &nbsp;(Δt saniye) &nbsp;·&nbsp; Δt = t<sub>in</sub> − t<sub>out</sub></div>
      ${B(lead ? 'see' : 'warn', lead ? 'Bu frekansta mavi sarıdan <b>önce</b> yükselir: ① solda, ② sağda, Δ pozitif → φ pozitif.' : 'Bu frekansta mavi sarıdan <b>sonra</b> yükselir: ① (mavi) ②\'nin <b>sağında</b> kalır, Δ negatif → φ negatif. İşaret önemli, tabloya eksiyle yaz!')}
      ${Math.abs(t0.ph) > 150 ? B('warn', 'Faz ±180°\'ye yakın: dalgalar neredeyse ters. Her zaman sarıya <b>en yakın</b> mavi geçişi seç, yoksa 360° farklı bir sonuç bulursun.') : ''}
      ${B('tip', `<b>Δ doğrudan derece yazsın:</b> ① ve ②'yi <b>sarının</b> art arda iki yükselen geçişine koy (1 periyot) → ${BOT(6, 'Set Cursor Pos. As 100%')} → ${BOT(4, 'H Unit')} → ${SIDE(4, '°')}. Sonra ①'i mavinin geçişine taşı. ${acts(doit('degUnit', '⚡ Birimi derece yap'))}`)}
      <h3>Yöntem B — Otomatik (kontrol için)</h3>
      <ol class="steps">
        <li><b>Measure</b> → ${BOT(1, 'Add Measurement')} → sağda <b>Source1 = CH1</b>, <b>Source2 = CH2</b> olsun.</li>
        <li data-chk="mPh">${SIDE(3, 'Delay')} → VARIABLE ile listenin en altındaki <b>Phase</b> → <b>Select</b>. ${acts(show('measure,bot0,side2'), doit('mPh'))}</li>
        <li>Ekranın altında <b>CH1→CH2 Phase</b> = ${live('phase')} (teori <b>${fph(t0.ph)}</b>)</li>
      </ol>` });

    const curHtml = () => {
      if (!si) return '<p>Bu devrede akım ölçme direnci yok.</p>';
      const Rt = fmt(si.R, 'Ω');
      if (si.single) return `
        ${B('simple', `Osiloskop akımı doğrudan ölçemez. Ama <b>${si.name}</b> direncinin bir ucu toprakta: onun üstündeki gerilimi ölçüp Ohm yasasıyla akımı buluruz: I = V<sub>${si.name}</sub> / ${Rt}.`)}
        <ol class="steps">
          <li data-chk="p2sense"><b>CH2 probu ${si.hi} düğümünde</b> olmalı (${si.name}'in üst ucu). ${si.hi === 'Vo' ? 'Zaten Vo\'da — hiçbir şey taşımana gerek yok.' : ''} ${acts(doit('current', '⚡ Düzeni kur'))}</li>
          <li data-chk="curOK">Measure → Source1 = <b>CH2</b> → V/I → <b>Pk-Pk</b>. V<sub>${si.name},pp</sub> = ${live('vr')} (teori ${fmt(t0.vr, 'V', 4)})</li>
          <li>I<sub>peak</sub> = (V<sub>pp</sub> ÷ 2) ÷ ${Rt} = ${live('is')} (teori <b>${fmt(t0.ipk, 'A', 4)}</b>)</li>
          <li>Akımın fazı (Phase CH1 → CH2) = ${live('phI')} (teori <b>${fph(t0.iph)}</b>)</li>
        </ol>
        ${B('why', `${si.name} seri yolun üzerinde olduğu için içinden geçen akım <b>kaynaktan çekilen akımın</b> aynısı. Dirençte akım ve gerilim aynı fazdadır; bu yüzden V<sub>${si.name}</sub>'in fazı akımın fazıdır.`)}`;
      return `
        ${B('simple', `Osiloskop akımı doğrudan ölçemez, sadece gerilim ölçer. <b>${si.name}</b>'in üstündeki gerilimi bulursak Ohm yasasıyla akımı hesaplarız: I = V<sub>${si.name}</sub> / ${Rt}.`)}
        ${B('warn', `${si.name}'in iki ucu da topraktan farklı! Timsahı ${si.name}'in ucuna takarsan o noktayı toprağa kısa devre edersin. Bu yüzden <b>iki kanal + MATH (çıkarma)</b> kullanıyoruz.`)}
        <ol class="steps">
          <li data-chk="p2sense"><b>CH2 probu ${si.lo} düğümünde</b> olmalı (${si.name}'in Vi'ye uzak ucu). CH1 Vi'de kalsın. ${si.lo === 'Vo' ? 'CH2 zaten Vo\'da — taşımana gerek yok!' : ''} ${acts(doit('current', si.lo !== 'Vo' ? `⚡ CH2 → ${si.lo} ve düzeni kur` : '⚡ Düzeni kur'))}</li>
          <li>İki kanalı <b>aynı ölçeğe</b> getir: CH1 SCALE ve CH2 SCALE aynı V/div olmalı (çıkarma doğru olsun). ${acts(show('ch1scale,ch2scale'))}</li>
          <li data-chk="math"><b>M</b> (MATH) tuşuna bas → ${BOT(1, 'Dual Channel')}. Source1 = CH1, Source2 = CH2; ${BOT(5, 'Operator')} → ${SIDE(2, '−')}. Kırmızı dalga = V<sub>${si.name}</sub>. ${acts(show('math'))}</li>
          <li data-chk="curOK">Measure → Source1'i <b>Math</b> yap → V/I → Pk-Pk. V<sub>${si.name},pp</sub> = ${live('vr')} (teori ${fmt(t0.vr, 'V', 4)})</li>
          <li>I<sub>peak</sub> = (V<sub>pp</sub> ÷ 2) ÷ ${Rt} = ${live('is')} (teori <b>${fmt(t0.ipk, 'A', 4)}</b>)</li>
          <li>Akımın fazı (Phase CH1 → Math) = ${live('phI')} (teori <b>${fph(t0.iph)}</b>)</li>
        </ol>
        <p>${acts(doit('back', '↩ CH2\'yi Vo\'ya geri al, Math\'ı kapat'))}</p>
        ${B('why', `MATH iki kanalın farkını hesaplar: V<sub>Vi</sub> − V<sub>${si.lo}</sub> = ${si.name}'in uçları arasındaki gerilim. Dirençte akım ve gerilim aynı fazdadır; kırmızı dalga akımın şeklinin aynısıdır.`)}`;
    };
    steps.push({ kind: 'task', code: 'G4', short: 'Akım', goes: 'Tablo 1 → Is,peak', t: si ? `Akım: ${si.name} direncinden geçen akım` : 'Akım', chk: si && !si.single ? ['p2sense', 'math', 'curOK'] : ['p2sense', 'curOK'], html: curHtml });

    steps.push({ kind: 'task', code: 'G5', short: 'Frekans taraması', goes: 'Tablo 2 → φ ölçüm', t: `Frekans taraması (${SWEEP().length} frekans)`, chk: ['t2'], html: () => `
      ${B('simple', 'Faz ölçümünü farklı frekanslarda tekrarlıyoruz: devre yavaş ve hızlı dalgalara nasıl davranıyor?')}
      <p>Her frekans için: jeneratörü o frekansa getir → <b>Autoset</b> → fazı oku (G3'teki gibi) → tabloya yaz. <b>▶ Ayarla</b> ilk iki işi, <b>📥 Kaydet</b> yazma işini yapar.</p>
      <p>Şu an: ${live('freq')} · ölçülen φ ${live('phase')} · teori ${live('thPhase')}</p>
      <table class="lab"><tr><th>f</th><th>Teori φ</th><th>Ölçülen φ</th><th></th></tr>
        ${SWEEP().map(f => { const t = theory(f), m = dat().t2[f]; return `<tr><td>${fq(f)}</td><td class="th">${t ? fph(t.ph) : '?'}</td>
          <td>${isFinite(m) ? `<b>${fph(m)}</b> <span class="${t && Math.abs(m - t.ph) <= 2 ? 'good' : 'bad'}">(Δ ${t ? Math.abs(m - t.ph).toFixed(2) : '?'}°)</span>` : '—'}</td>
          <td><span class="acts"><button class="do" data-sweep="${f}">▶ Ayarla</button><button data-save="${f}">📥 Kaydet</button></span></td></tr>`; }).join('')}
      </table>
      ${SWEEP().some(f => f < 25) ? B('warn', 'Autoset 20 Hz civarında ve altında çalışmaz. O frekanslarda TIME/DIV\'i elle yaklaşık 2 periyot gösterecek şekilde ayarla (ör. 20 Hz → 10 ms/div, 10 Hz → 20 ms/div). "Ayarla" bunu senin için yapar. DC kuplaj kullan.') : ''}
      ${B('tip', 'Vo çok küçükse CH2 SCALE\'i saat yönünde çevir ki dalga ekranı doldursun; faz ölçümü daha kararlı olur. Gürültü varsa Acquire → Average.')}
      ${B('why', inf.why)}` });

    steps.push({ kind: 'bonus', code: '+', t: 'Karakteristik frekansı bul', chk: ['fchar'], html: () => `
      ${B('simple', `Bu devrenin en önemli frekansı: <b>${inf.charName}</b>.`)}
      <ol class="steps">
        <li>Jeneratörün frekansını küçük adımlarla değiştir (frekans kutusunun üstünde tekerlek), Phase ölçümünü izle.</li>
        <li data-chk="fchar">Teori: <b>≈ ${fc ? fq(+fc.toPrecision(4)) : '?'}</b>. ${acts(doit('fchar', '⚡ O frekansa git'))} φ = ${live('phase')} · Vo/Vi = ${live('gain')}</li>
        <li>İstersen <b>Acquire</b> → ${BOT(2, 'XY')} → ${SIDE(2, 'Triggered XY')}: faz 0°'de elips düz çizgiye döner. ${acts(doit('xy', '⚡ XY aç'), doit('yt', 'YT\'ye dön'))}</li>
      </ol>` });

    steps.push({ kind: 'end', code: '✓', t: 'Tabloları tamamla', chk: ['t1'], html: () => `
      ${B('simple', 'Ölçümleri tabloya yaz, teoriyle karşılaştır, farkları açıkla.')}
      <ol class="steps">
        <li data-chk="t1"><b>📋 Tablolar</b> sekmesinde Tablo 1'i doldur: ${fq(F0())}'te "Ekrandan al"; akım için G4 düzenindeyken tekrar "Ekrandan al". ${acts(`<button data-tab="tables">📋 Tablolara git</button>`, doit('cap1', '📥 Şimdi al'))}</li>
        <li>Ekran görüntüsü: ekranın solundaki <b>Hardcopy</b> tuşu PNG indirir. ${acts(show('hardcopy'), doit('img', '📷 Görüntü al'))}</li>
        <li>Bitince sıradaki devreye geç. ${acts(doit('next', '▶ Sonraki devre'), doit('library', '📚 Kütüphane'))}</li>
      </ol>
      <h3>Hata analizi için ne yazarım?</h3>
      <ul>
        <li><b>Bileşen toleransı</b>: dirençler ±%5, kondansatörler ±%10–20, bobinler ±%10 ve kendi iç dirençleri var.</li>
        <li><b>Jeneratörün 50 Ω iç direnci</b>: Vi frekansla değişir.</li>
        <li><b>Prob yüklemesi</b>: ×10 prob 10 MΩ ∥ ~16 pF; yüksek empedanslı devrelerde etkisi artar.</li>
        <li><b>Osiloskop doğruluğu</b>: DC kazanç ±%3, 8 bit ADC (bir kare 25 basamak).</li>
        <li><b>İmleç yerleştirme</b>: sıfır geçişini biraz kaçırmak faz hatası demek; yüksek frekansta daha önemli.</li>
      </ul>
      <div class="formula">% fark = |teori − ölçüm| / |teori| × 100 &nbsp;·&nbsp; faz için: |φ<sub>teori</sub> − φ<sub>ölçüm</sub>| (derece)</div>` });
    return steps;
  }

  /* ---------------- Lab 2 (Prelab 02): op-amp türev alıcı ----------------
   * Tablo 1: 1 kHz sinüste Vo,peak · 100 Hz üçgende iki Vo seviyesi · ilk bozulma frekansı
   * Tablo 2 (t2): üçgen taramada Av = Vo,pp / Vi,pp (pp: ölçülen Vi,pp ve Vo,pp)
   * Teori ideal türev alıcıdan: vo = −R1·C1·dvi/dt (op-amp doyumu teoriye girmez; kırpılan satırlar işaretlenir) */
  const vsatNow = () => { const u = Bench.model.comps.find(c => c.type === 'OA'); return u && u.vsat ? u.vsat : Infinity; };
  function dth(f) {
    const R = comp('R1'), C = comp('C1'), RC = R && C ? R.value * C.value : 1e-3, Vp = tVi() / 2;
    const slope = 4 * Vp * f;            // üçgen: yarım periyotta (T/2) 2·Vp değişir → |dvi/dt| = 4·Vp·f
    const lvl = RC * slope;              // çıkış seviyesi (kare dalga)
    return { RC, Vp, slope, lvl, av: 4 * f * RC, vopp: 2 * lvl, clip: lvl > vsatNow(), sinPk: 2 * Math.PI * f * RC * Vp };
  }
  const fdistTh = () => SWEEP().find(f => dth(f).clip) || 0;      // 0 = taramada bozulma yok
  const fdistTxt = (f) => f ? fq(f) : 'yok (ideal)';
  const fdistSel = () => { const v = dat().t1.fdist; return `<select class="ui" data-t1="fdist">${[NaN, 0, ...SWEEP()].map(f => `<option value="${isNaN(f) ? '' : f}" ${v === f || (isNaN(f) && !isFinite(v)) ? 'selected' : ''}>${isNaN(f) ? '— seç —' : f ? fq(f) : 'yok (bozulma görmedim)'}</option>`).join('')}</select>`; };
  const viSel2 = () => `<p><b>Vi,peak seçimi (S'ye göre):</b> 0 ≤ S ≤ 6 → <b>4 V</b> · 6 &lt; S ≤ 12 → <b>5 V</b> · 12 &lt; S ≤ 18 → <b>6 V</b>. Seçimin:
    <select id="viSel2" class="ui">${[8, 10, 12].map(v => `<option value="${v}" ${store.vi2 === v ? 'selected' : ''}>Vi,peak = ${v / 2} V (${v} Vpp)</option>`).join('')}</select></p>`;
  function captureDiff() {
    const g = fg(), T = dat().t1, got = [];
    if (probeNode(1) !== 'Vo') return note('CH2 probu Vo\'da olmalı.', 'warn');
    if (g && g.wave === 'sine' && freqOK(1000)) { const r = val('Max', 'CH2'); if (r) { T.sinVo = +r.v.toFixed(4); got.push('Vo,peak (sinüs)'); } }
    else if (g && g.wave === 'triangle' && freqOK(100)) {
      const lo = val('Min', 'CH2'), hi = val('Max', 'CH2');
      if (lo && hi) { T.vpos = +lo.v.toFixed(4); T.vneg = +hi.v.toFixed(4); got.push('iki Vo seviyesi (üçgen)'); }
    } else return note('Ekrandan al: jeneratör 1 kHz sinüs (G1) ya da 100 Hz üçgen (G2) olmalı. Tarama satırları için ▶ / 📥 kullan.', 'warn');
    save(); render();
    note(got.length ? `Kaydedildi: ${got.join(', ')}.` : 'Ölçülemedi — Autoset yapıp tekrar dene.', got.length ? 'good' : 'warn');
  }
  Object.assign(ACT, {
    fgS1k: () => { setFG({ wave: 'sine', freq: 1000, vpp: tVi(), offset: 0 }); note(`Jeneratör: sinüs, 1 kHz, ${tVi()} Vpp (Vi,peak = ${tVi() / 2} V).`); },
    fgTri: () => { setFG({ wave: 'triangle', freq: 100, vpp: tVi(), offset: 0 }); ACT.ch12(); autoset(); addMeas('Max', 'CH2'); addMeas('Min', 'CH2'); note(`Jeneratör: üçgen, 100 Hz, ${tVi()} Vpp. Autoset yapıldı; CH2 Max ve Min eklendi.`); },
    mMax2: () => { Menus.open('measure'); addMeas('Max', 'CH2'); },
    mMin2: () => { Menus.open('measure'); addMeas('Min', 'CH2'); },
    capSin: () => captureDiff(), capTri: () => captureDiff(),
    unity: () => { const fc = Circuits.charFreq(); if (!fc) return; setFG({ wave: 'sine', freq: +fc.toPrecision(4), vpp: tVi() }); ACT.ch12(); autoset(); addMeas('Pk-Pk', 'CH1'); addMeas('Pk-Pk', 'CH2'); },
  });

  function diffSteps() {
    const d = D(), inf = I(), s1 = dth(1000), t100 = dth(100), Vp = tVi() / 2, vs = vsatNow(), fd = fdistTh();
    const RCt = fmt(s1.RC, 's'), steps = [];
    const MORE = (t, h) => `<details class="recipe"><summary>${t}</summary><div class="in">${h}</div></details>`;
    const at = (code) => steps.findIndex(x => x.code === code);
    const gain1k = (2 * Math.PI * 1000 * s1.RC).toFixed(3), clip1k = s1.sinPk > vs;
    const toCalc = `<button data-tab="calc">🧮 Hesabın tamamı</button>`;
    steps.push({ kind: 'start', code: 'Başla', t: 'Bu deneyde ne yapacağız?', chk: 'loaded', html: () => `
      <div class="ccard lab new cur" style="cursor:default"><div class="ct">⭐ ${d.title}<span class="newb">YENİ</span></div><div class="ck">${inf.kind} · Prelab 02</div><div class="cf">R1 = 1 kΩ · C1 = 1 µF · LM741 (±15 V) · Vi,peak = ${Vp} V</div></div>
      <h3>Bu deney 1 dakikada</h3>
      ${B('simple', 'Bu devre girişteki dalganın <b>ne kadar hızlı değiştiğini</b> çıkışa verir. Bir arabayı düşün: <b>sarı</b> dalga arabanın <b>yeri</b>, <b>mavi</b> dalga arabanın <b>hızı</b>. Araba dururken hız 0; hızlı giderken hız büyük; geri giderken hız eksi.')}
      <p><b>① Sinüs verirsen</b> → çıkış yine yumuşak bir dalga olur, sadece çeyrek periyot kayar. (Bu deneyde çıkış çok büyük olmak ister, op-amp sınırında tepeleri kesilir.)</p>
      ${wavePic('sine')}
      <p><b>② Üçgen verirsen</b> → çıkış <b>kare dalga</b> olur. Çünkü üçgen sabit hızla çıkar, sabit hızla iner: hız sadece iki değer alır.</p>
      ${wavePic('tri')}
      <ul>
        <li><b>Ters çevirir:</b> sarı çıkarken mavi eksidedir, sarı inerken mavi artıdadır.</li>
        <li><b>Hızlı dalga = büyük çıkış:</b> frekansı artırırsan çıkış da büyür.</li>
        <li><b>Sınırı var:</b> op-amp ±${vs} V'tan büyük çıkış veremez, fazlası düz kesilir.</li>
      </ul>
      <h3>Senden istenen: önce Vi'yi seç</h3>
      ${viSel2()}
      <p class="muted">Prelab tepe değeri verir (Vi,peak = ${Vp} V). Jeneratör tepeden tepeye ister: jeneratöre <b>${tVi()} Vpp</b> yazacağız ve deney boyunca <b>hiç değiştirmeyeceğiz</b>.</p>
      <h3>Sonra 4 görev</h3>
      <p>Her görev Prelab Table 1'deki satırları doldurur. Biten görev yeşil ✓ olur. Satıra tıklarsan o göreve gidersin.</p>
      <table>
        <tr><th>Görev</th><th>Ne yapacaksın?</th><th>Tabloya</th></tr>
        <tr data-goto="${at('G1')}" style="cursor:pointer"><td><b>G1</b></td><td>1 kHz <b>sinüs</b> ver, mavi dalganın tepe değerini oku</td><td>1 sayı</td></tr>
        <tr data-goto="${at('G2')}" style="cursor:pointer"><td><b>G2</b></td><td>100 Hz <b>üçgen</b> ver, mavi kare dalganın alt ve üst seviyesini oku</td><td>2 sayı</td></tr>
        <tr data-goto="${at('G3')}" style="cursor:pointer"><td><b>G3</b></td><td>Üçgeni <b>${SWEEP().length} frekansta</b> ver, her birinde kazancı (Av) bul</td><td>${SWEEP().length} sayı</td></tr>
        <tr data-goto="${at('G4')}" style="cursor:pointer"><td><b>G4</b></td><td>G3 sırasında mavinin <b>ilk kesildiği</b> frekansı yaz</td><td>1 frekans</td></tr>
      </table>
      <p>Görevlerden önce <b>2 kısa hazırlık</b> sayfası var (H1: problar, H2: jeneratör + Autoset).</p>
      ${B('tip', `Table 1'in <b>Theoretical</b> sütunu: üstteki <b>🧮 Teorik hesaplar</b> sekmesinde adım adım hesaplı. <b>Simulation</b> = burada ölçtüğün. <b>Experimental</b> = laboratuvarda ölçtüğün. ${acts(toCalc)}`)}
      <ol class="steps"><li data-chk="loaded">Devre tezgâhta kurulu olmalı. ${acts(doit('load', '⚡ Devreyi (yeniden) kur'))}</li></ol>` });

    steps.push({ kind: 'prep', code: 'H1', t: 'Probları bağla', chk: ['p1Vi', 'p2Vo', 'gnd'], html: () => `
      ${B('simple', 'Osiloskobun iki probunu devreye takıyoruz: sarı girişi, mavi çıkışı görecek.')}
      <div class="formula">${Circuits.diagram()}</div>
      <ol class="steps">
        <li data-chk="p1Vi"><b>Sarı CH1 probunun ucunu Vi'ye</b> tak (jeneratörün çıkışı, C1'in sol ucu).</li>
        <li data-chk="p2Vo"><b>Mavi CH2 probunun ucunu Vo'ya</b> tak (op-amp'ın çıkışı).</li>
        <li data-chk="gnd">İki probun da <b>siyah timsahını GND'ye</b> tak. ${acts(doit('probes'))}</li>
      </ol>
      ${B('tip', 'Laboratuvarda op-amp\'ı beslemeyi unutma: <b>+15 V → pin 7</b>, <b>−15 V → pin 4</b>, ortak uç → GND. (Pin 2 = − giriş, pin 3 = + giriş, pin 6 = çıkış.)')}
      ${MORE('Devre nasıl çalışıyor? (isteğe bağlı)', `<p>Girişte C1, geri beslemede (çıkıştan − ucuna) R1 var; op-amp'ın + ucu toprakta.</p>
        <p>Op-amp − ucunu + ucuyla aynı gerilimde tutmaya çalışır. + ucu toprakta olduğu için − ucu da ≈ 0 V olur (<b>sanal toprak</b>, tezgâhta <b>V−</b>). Bu yüzden C1'den geçen akım i = C1·dVi/dt olur. Bu akım R1'den geçer: Vo = −R1·i = <b>−R1·C1·dVi/dt</b>.</p>
        <p>Op-amp'ın çıkışı besleme gerilimini geçemez: ±15 V beslemede çıkış en fazla yaklaşık <b>±${vs} V</b> olur (<b>doyum</b>).</p>`)}` });

    steps.push({ kind: 'prep', code: 'H2', t: 'Jeneratör: 1 kHz sinüs, sonra Autoset', chk: ['fgS1k', 'fgAmp', 'ch2on', 'trig'], html: () => `
      ${B('simple', `Girişe 1 kHz, ${tVi()} Vpp bir sinüs veriyoruz ve osiloskobu Autoset ile otomatik ayarlatıyoruz.`)}
      <ol class="steps">
        <li>Tezgâhta <b>jeneratöre (FG1) tıkla</b>; sağda ayarları açılır.</li>
        <li data-chk="fgS1k">Dalga: <b>Sinüs</b>, frekans: <b>1 kHz</b> (çipe tıkla).</li>
        <li data-chk="fgAmp">Genlik: <b>${tVi()} Vpp</b>. Bu genliği deney bitene kadar <b>değiştirme</b>. ${acts(doit('fgS1k'))}</li>
        <li data-chk="ch2on">Osiloskopta <b>CH2</b> tuşuna bas → mavi yanar (CH1 zaten sarı yanıyor). ${acts(show('ch2'), doit('ch2on'))}</li>
        <li data-chk="trig"><b>Autoset</b> tuşuna bas. Sağ üstte yeşil <b>Trig'd</b> yazmalı. ${acts(show('autoset'), doit('autoset'))}</li>
      </ol>
      ${B('see', `Sarı = giriş: düzgün bir sinüs. Mavi = çıkış: ${clip1k ? 'sinüse benzer ama <b>tepeleri düz kesilmiş</b>. Bu normal, nedenini G1\'de anlatıyoruz.' : 'düzgün bir sinüs.'} Durum: ${live('status')}`)}
      ${MORE('Prelab\'daki "cos(6283.18·t)" ne demek?', `6283.18 = 2π × 1000 → frekans <b>1 kHz</b>, periyot T = 1 ms. Önündeki ${Vp} sayısı tepe değeridir (${Vp} V).`)}` });

    steps.push({ kind: 'task', code: 'G1', short: 'Sinüs Vo,peak', goes: 'Tablo 1 → Sinusoidal Output Vo,peak', t: 'Sinüs (1 kHz): çıkışın tepe değeri', chk: ['mPk1', 'mMax2', 'capSin'], html: () => `
      ${B('simple', 'Mavi dalganın en üst noktasını (<b>Vo,peak</b>) osiloskoba ölçtürüp tabloya yazacağız.')}
      <ol class="steps">
        <li data-chk="mPk1">Önce girişi kontrol et: <b>Measure</b> → ${BOT(1, 'Add Measurement')} → Source1 = <b>CH1</b> → ${SIDE(1, 'V/I')} → VARIABLE ile <b>Pk-Pk</b> → <b>Select</b>. CH1 Pk-Pk = ${live('vi')} (jeneratörde <b>${tVi()} Vpp</b> yazıyor). ${acts(show('measure,bot0'), doit('mPk1'))}</li>
        <li>Jeneratörün genliğine <b>dokunma</b>: bu deneyde hep <b>${tVi()} Vpp</b> kalır. CH1 biraz farklı okursa (ör. 7.9 V) bu normaldir: jeneratörün içindeki 50 Ω direnç gerilimin bir kısmını yer.</li>
        <li data-chk="mMax2">${BOT(1, 'Add Measurement')} → ${SIDE(4, 'Source1')} ile <b>CH2</b> → ${SIDE(1, 'V/I')} → ${KNOB('VARIABLE')}, listede <b>Max</b>'ı seç → <b>Select</b> → <b>Menu Off</b>. ${acts(show('side3,side0,variable,select'), doit('mMax2'))}</li>
        <li data-chk="capSin">CH2 Max = ${live('vmax2')} → bu senin <b>Vo,peak</b> değerin. ${acts(doit('capSin', '📥 Tabloya kaydet'))}</li>
      </ol>
      <h3>Ekranda ne göreceksin?</h3>
      ${wavePic('sine')}
      ${B('why', `Araba benzetmesi: sarı = yer, mavi = hız.
        <ul><li><b>①</b> Sarı <b>tepede</b>: araba bir an durur → hız 0 → <b>mavi 0</b>.</li>
        <li><b>②</b> Sarı <b>ortadan (0 V) geçerken</b>: en dik hâli, araba en hızlı → <b>mavi tepede</b>.</li></ul>
        Bu yüzden mavi de dalga şeklindedir ama sarıya göre çeyrek periyot kaymıştır ("90° faz farkı").`)}
      ${clip1k ? B('warn', `Hesaba göre mavi <b>${s1.sinPk.toFixed(2)} V</b>'a kadar çıkmalı (kesik çizgi). Ama op-amp ±15 V ile beslendiği için ${vs} V'u geçemez, tepeler <b>düz kesilir</b>. Bu yüzden CH2 Max ≈ <b>${vs} V</b> okursun. Bu bir hata değil, <b>doyum</b>.`) : ''}
      ${B('write', `Table 1 → <b>Sinusoidal Output Vo,peak</b>: Theoretical = <b>${s1.sinPk.toFixed(2)} V</b> · Simulation = okuduğun CH2 Max${clip1k ? ` (≈ ${vs} V). Raporda: "İdeal ${s1.sinPk.toFixed(2)} V, op-amp doyumu yüzünden ≈ ${vs} V ölçüldü."` : '.'}`)}
      ${MORE(`${s1.sinPk.toFixed(2)} V nereden çıktı?`, `<div class="formula">Vo,peak = 2π·f·R1·C1·V<sub>p</sub> = 6283.2 × ${RCt} × ${Vp} = <b>${s1.sinPk.toFixed(2)} V</b></div>Adım adım hali: ${acts(toCalc)}`)}` });

    steps.push({ kind: 'task', code: 'G2', short: 'Üçgen iki seviye', goes: 'Tablo 1 → Vo,max (+ / − eğim)', t: 'Üçgen (100 Hz): çıkışın iki seviyesi', chk: ['fgTri', 'mMax2', 'mMin2', 'capTri'], html: () => `
      ${B('simple', 'Girişi <b>üçgen</b> yapıyoruz. Üçgen dümdüz bir çizgiyle çıkar, dümdüz bir çizgiyle iner. Yani hızı hep aynıdır → çıkış iki sabit seviye arasında gidip gelen bir <b>kare dalga</b> olur. Bu iki seviyeyi okuyacağız.')}
      <ol class="steps">
        <li data-chk="fgTri">Jeneratöre tıkla → Dalga: <b>Üçgen</b>, frekans <b>100 Hz</b>. Genlik aynı kalır (<b>${tVi()} Vpp</b>). Sonra <b>Autoset</b>. ${acts(show('autoset'), doit('fgTri'))}</li>
        <li data-chk="mMax2">Measure → Source1 = <b>CH2</b> → V/I → <b>Max</b> → Select. ${acts(doit('mMax2'))}</li>
        <li data-chk="mMin2">Aynı yoldan <b>Min</b> ekle (listede Max'ın altında). ${acts(doit('mMin2'))}</li>
        <li data-chk="capTri">Okuduğun değerleri kaydet. ${acts(doit('capTri', '📥 Tabloya kaydet'))}</li>
      </ol>
      <h3>Ekranda ne göreceksin?</h3>
      ${wavePic('tri')}
      ${B('see', 'Sarı yukarı çıkarken mavi <b>aşağıda</b> (eksi), sarı inerken mavi <b>yukarıda</b> (artı). Ters olmasının sebebi formüldeki eksi işareti (devre ters çeviren tipte).')}
      ${B('write', `<table><tr><th>Table 1 satırı</th><th>Ekranda</th><th>Şu an</th><th>Theoretical</th></tr>
        <tr><td>Vo,max (Positive Slope) — sarı <b>çıkarken</b></td><td>CH2 <b>Min</b></td><td>${live('vmin2')}</td><td><b>${(-t100.lvl).toFixed(3)} V</b></td></tr>
        <tr><td>Vo,max (Negative Slope) — sarı <b>inerken</b></td><td>CH2 <b>Max</b></td><td>${live('vmax2')}</td><td><b>+${t100.lvl.toFixed(3)} V</b></td></tr></table>`)}
      ${MORE(`±${t100.lvl.toFixed(1)} V nereden çıktı?`, `<div class="formula">Üçgen 5 ms'de ${2 * Vp} V yükselir → eğim = ${2 * Vp} / 0.005 = <b>${t100.slope.toFixed(0)} V/s</b><br>Vo = −R1C1 × eğim = −${RCt} × ${t100.slope.toFixed(0)} = <b>${(-t100.lvl).toFixed(3)} V</b></div>Adım adım hali: ${acts(toCalc)}`)}
      ${MORE('Kare dalganın köşeleri neden biraz yuvarlak?', 'Jeneratörün 50 Ω iç direnci C1 ile küçük bir gecikme yapar (50 Ω × 1 µF = 50 µs). Gerçek devrede op-amp\'ın sınırlı hızı (slew rate) da eklenir. Ölçümü etkilemez.')}` });

    steps.push({ kind: 'task', code: 'G3', short: 'Frekans taraması', goes: 'Tablo 1 → Triangular Gain (7 frekans)', t: `Üçgen: ${SWEEP().length} frekansta kazanç`, chk: ['t2'], html: () => `
      ${B('simple', `Aynı üçgeni ${SWEEP().length} farklı frekansta veriyoruz. Frekans artınca üçgen daha hızlı çıkıp iner → kare dalga büyür. Her frekansta kazancı bulup yazıyoruz: <b>Av = Vo,pp / Vi,pp</b> (mavinin boyu ÷ sarının boyu).`)}
      <p><b>Her satır için 2 tık:</b> önce <b>▶ Ayarla</b> (jeneratörün sadece frekansını değiştirir + Autoset), sonra <b>📥 Kaydet</b> (CH1 ve CH2 Pk-Pk'yi okur, Av'yi hesaplar). Genliğe <b>dokunma</b>.</p>
      <p>Şu an: ${live('freq')} · CH1 ${live('vi')} · CH2 ${live('vo')} · Av ${live('gain')} (beklenen ${live('thAv')})</p>
      <table class="lab"><tr><th>f</th><th>Beklenen Av</th><th>Ölçülen Av</th><th></th></tr>
        ${SWEEP().map(f => { const t = dth(f), m = dat().t2[f]; return `<tr><td>${fq(f)}</td><td class="th">${t.av.toFixed(2)}${t.clip ? ' <span class="bad" title="çıkış kesilir">⚠</span>' : ''}</td>
          <td>${isFinite(m) ? `<b>${(+m).toFixed(3)}</b> <span class="${Math.abs(m / t.av - 1) <= 0.05 ? 'good' : 'bad'}">(${(Math.abs(m / t.av - 1) * 100).toFixed(1)}%)</span>` : '—'}</td>
          <td><span class="acts"><button class="do" data-sweep="${f}">▶ Ayarla</button><button data-save="${f}">📥 Kaydet</button></span></td></tr>`; }).join('')}
      </table>
      ${B('see', `<b>G4 için şimdiden bak:</b> frekansları sırayla gezerken mavi kare dalgaya dikkat et. Bir frekanstan sonra üstü/altı <b>düz kesilir</b> (±${vs} V'ta takılır). ⚠ işaretli satırlarda bu olur ve ölçülen Av beklenenden <b>küçük</b> çıkar — bu normal.`)}
      ${B('write', `Table 1 → <b>Triangular Gain</b> satırları: Theoretical = "Beklenen Av" sütunu · Simulation = "Ölçülen Av" sütunu. Beklenen Av = 4 × f × R1C1 (ör. 100 Hz: 4 × 100 × ${RCt} = ${dth(100).av.toFixed(2)}). ${acts(toCalc)}`)}
      ${MORE('Ölçtüğüm Av beklenenden birkaç % büyük çıkıyor, neden?', 'CH1\'de okunan Vi,pp frekansla biraz değişir (jeneratörün 50 Ω iç direnci). Yüksek frekansta üçgenin uçları biraz yuvarlanır: Vi,pp küçülür ama eğim aynı kalır, bu yüzden Av birkaç % büyük çıkar. Gerçekçi bir durum.')}` });

    steps.push({ kind: 'task', code: 'G4', short: 'İlk bozulma', goes: 'Tablo 1 → First distorted frequency', t: 'Çıkış hangi frekansta bozulmaya başladı?', chk: ['fdist'], html: () => `
      ${B('simple', `G3'te gördüğün şeyi yazıyorsun: mavi kare dalganın üstü/altı <b>ilk hangi frekansta</b> düz kesildi (±${vs} V'ta takıldı)?`)}
      <ol class="steps">
        <li>Nasıl anlarım? CH2 Pk-Pk artık büyümüyor (≈ ${2 * vs} V'ta kalıyor) ve Av beklenenden belirgin küçük.</li>
        <li data-chk="fdist">Gördüğün ilk frekans: ${fdistSel()}</li>
      </ol>
      ${B('write', `Table 1 → <b>First frequency with noticeable distortion</b>: Theoretical = <b>none</b> (ideal türev alıcının çıkışı sınırsız büyüyebilir) · Simulation = gördüğün frekans (beklenen <b>${fdistTxt(fd)}</b>).`)}
      ${MORE('Neden tam bu frekans?', `<div class="formula">Kare dalganın seviyesi = R1C1 × 4·V<sub>p</sub>·f. Bu ${vs} V'u geçince kesilir:<br>f &gt; ${vs} / (4 × ${Vp} × ${RCt}) = <b>${fq(+(vs / (4 * Vp * s1.RC)).toPrecision(4))}</b> → taramada bunu geçen ilk frekans <b>${fdistTxt(fd)}</b></div>Adım adım hali: ${acts(toCalc)}`)}` });

    steps.push({ kind: 'bonus', code: '+', t: 'Kazancın 1 olduğu frekans', chk: ['fchar'], html: () => `
      ${B('simple', 'Sinüste |Vo/Vi| = ωR1C1. Bu oranın tam 1 olduğu frekansta çıkış ile giriş aynı büyüklükte olur.')}
      <ol class="steps"><li data-chk="fchar">f = 1 / (2π·R1C1) = <b>${fq(+(1 / (2 * Math.PI * s1.RC)).toPrecision(4))}</b>. ${acts(doit('unity', '⚡ O frekansta sinüs ver'))} Vo/Vi = ${live('gain')}</li>
        <li>Bu frekansın altında türev alıcı sinyali küçültür, üstünde büyütür.</li></ol>` });

    steps.push({ kind: 'end', code: '✓', t: 'Tabloları tamamla ve hata analizi', chk: ['t1', 't2'], html: () => `
      <ol class="steps">
        <li data-chk="t1,t2"><b>📋 Tablolar</b> sekmesinde Prelab Table 1'in tüm satırları dolu olmalı. ${acts(`<button data-tab="tables">📋 Tablolara git</button>`)}</li>
        <li>Ekran görüntüsü: ekranın solundaki <b>Hardcopy</b> tuşu. Rapora sinüsün (G1) ve üçgenin (G2) görüntüsünü koy. ${acts(show('hardcopy'), doit('img', '📷 Görüntü al'))}</li>
      </ol>
      <div class="formula">Error % = (Simulation Value − Experimental Value) / Simulation Value × 100</div>
      <h3>Hata %5'i geçerse ne yazarım?</h3>
      <ul>
        <li><b>Besleme doyumu</b>: LM741 ±15 V'ta yaklaşık ±13 V'tan büyük çıkış veremez.</li>
        <li><b>Slew rate</b> (≈ 0.5 V/µs): çıkış 26 V'luk bir geçişi ≈ 50 µs'de yapabilir; kare dalganın kenarları eğikleşir.</li>
        <li><b>GBW</b> (≈ 1 MHz) ve op-amp'ın sonlu kazancı.</li>
        <li><b>Bileşen toleransı</b>: R ±%5, C ±%10–20 → R1C1 ve Av doğrudan değişir.</li>
        <li><b>Jeneratörün 50 Ω iç direnci</b> ve breadboard parazitikleri (kablo, kontak kapasitesi).</li>
        <li><b>Osiloskop</b>: DC kazanç doğruluğu ±%3, 8 bit ADC.</li>
      </ul>` });
    return steps;
  }

  function diffTables() {
    const T = dat(), t1 = T.t1, pp = T.pp || {}, t100 = dth(100), s1 = dth(1000);
    const pct = (m, th) => th ? Math.abs(m - th) / Math.abs(th) * 100 : null;
    const row = (lbl, inp, th, m, f, clip) => {
      const e = isFinite(m) && th ? pct(m, th) : null;
      return `<tr><td>${lbl}</td><td class="th">${f(th)}${clip ? ' <span class="bad" title="ideal değer besleme sınırını aşıyor">⚠</span>' : ''}</td><td>${inp}</td>
        <td class="err ${e === null ? '' : e <= 5 ? 'good' : 'bad'}">${e === null ? '' : e.toFixed(1) + '%'}</td></tr>`;
    };
    const f3 = (v) => (+v).toFixed(3), sg = (v) => (v >= 0 ? '+' : '') + (+v).toFixed(3);
    const inp1 = (k) => `<input data-t1="${k}" value="${isFinite(t1[k]) ? (+t1[k]).toFixed(3) : ''}" placeholder="—">`;
    const inp2 = (f) => `<input data-t2="${f}" value="${isFinite(T.t2[f]) ? (+T.t2[f]).toFixed(3) : ''}" placeholder="—">`;
    const fd = fdistTh();
    return `<h3>Tablo 1 — Prelab 02 sonuçları</h3>
      <table class="lab"><tr><th>Parametre</th><th>Teori (ideal)</th><th>Ölçüm</th><th>Fark</th></tr>
        ${row('Sinüs çıkışı Vo,peak (1 kHz) [V]', inp1('sinVo'), s1.sinPk, t1.sinVo, f3, s1.sinPk > vsatNow())}
        ${SWEEP().map(f => row(`Üçgen kazanç |Vo/Vi| (${fq(f)})`, inp2(f), dth(f).av, T.t2[f], f3, dth(f).clip)).join('')}
        ${row('Üçgen Vo, pozitif eğim (Vi yükselirken) [V]', inp1('vpos'), -t100.lvl, t1.vpos, sg)}
        ${row('Üçgen Vo, negatif eğim (Vi düşerken) [V]', inp1('vneg'), t100.lvl, t1.vneg, sg)}
        <tr><td>İlk bozulma / kırpılma frekansı</td><td class="th">${fdistTxt(fd)}</td>
          <td>${fdistSel()}</td>
          <td class="err ${!isFinite(t1.fdist) ? '' : t1.fdist === fd ? 'good' : 'bad'}">${!isFinite(t1.fdist) ? '' : t1.fdist === fd ? '✓' : '≠'}</td></tr>
      </table>
      <p class="muted">Teori sütunu ideal türev alıcıdır (vo = −R1C1·dvi/dt). İdeal türev alıcıda bozulma olmaz; buradaki tahmin op-amp'ın ±${vsatNow()} V doyumuna göredir. ⚠ = ideal değer besleme sınırını aşıyor (ölçüm teoriden küçük çıkar).</p>
      <h3>Tablo 2 — Üçgen tarama ayrıntısı</h3>
      <table class="lab"><tr><th>f</th><th>Vi,pp</th><th>Vo,pp</th><th>Av</th><th>İdeal Av</th><th></th></tr>
        ${SWEEP().map(f => { const p = pp[f]; return `<tr><td>${fq(f)}</td><td>${p ? fmt(p[0], 'V', 4) : '—'}</td><td>${p ? fmt(p[1], 'V', 4) : '—'}</td>
          <td>${isFinite(T.t2[f]) ? (+T.t2[f]).toFixed(3) : '—'}</td><td class="th">${dth(f).av.toFixed(2)}</td>
          <td><span class="acts"><button class="do" data-sweep="${f}">▶</button><button data-save="${f}">📥</button></span></td></tr>`; }).join('')}
      </table>`;
  }
  function diffText(n) {
    const T = dat(), t1 = T.t1, pp = T.pp || {}, x = (v) => isFinite(v) ? (+v).toFixed(4) : '';
    if (n === 1) {
      const fd = fdistTh();
      return ['Parameter\tTheoretical Value\tSimulation Value',
        `Sinusoidal Output Vo,peak (f = 1 kHz) (V)\t${dth(1000).sinPk.toFixed(3)}\t${x(t1.sinVo)}`,
        ...SWEEP().map(f => `Triangular Gain |Vo/Vi| (f = ${f} Hz)\t${dth(f).av.toFixed(3)}\t${x(T.t2[f])}`),
        `Triangular Input Vo,max (Positive Slope) (V)\t${(-dth(100).lvl).toFixed(3)}\t${x(t1.vpos)}`,
        `Triangular Input Vo,max (Negative Slope) (V)\t${dth(100).lvl.toFixed(3)}\t${x(t1.vneg)}`,
        `First frequency with noticeable distortion / clipping / saturation\tIdeal: none (±${vsatNow()} V rail: ${fd ? fd + ' Hz' : 'none'})\t${isFinite(t1.fdist) ? (t1.fdist ? t1.fdist + ' Hz' : 'none') : ''}`].join('\n');
    }
    return ['Frequency (Hz)\tVi,pp (V)\tVo,pp (V)\tAv = Vo,pp/Vi,pp\tAv theory (4fRC)', ...SWEEP().map(f => `${f}\t${pp[f] ? pp[f][0] : ''}\t${pp[f] ? pp[f][1] : ''}\t${x(T.t2[f])}\t${dth(f).av.toFixed(3)}`)].join('\n');
  }
  function diffTheory() {
    const d = D(), inf = I(), s1 = dth(1000), t100 = dth(100), Vp = tVi() / 2, vs = vsatNow();
    return `<h2>🧠 Teori — ${d.title}</h2>
      ${B('simple', inf.simple)}
      <div class="formula">${Circuits.diagram()}</div>
      ${viSel2()}
      <h3>Temel bağıntı</h3>
      <div class="formula">${FORMULA.diff}<br>R1·C1 = ${fmt(comp('R1') ? comp('R1').value : 0, 'Ω')} × ${fmt(comp('C1') ? comp('C1').value : 0, 'F')} = <b>${fmt(s1.RC, 's')}</b></div>
      <h3>Neden böyle davranıyor?</h3><p>${inf.why}</p>
      <h3>Sinüs (1 kHz)</h3>
      <div class="formula">Vi(t) = ${Vp}·cos(6283.18t) → Vo(t) = ωR1C1·${Vp}·sin(6283.18t) = <b>${s1.sinPk.toFixed(2)}·sin(6283.18t) V</b><br>Vo,peak = <b>${s1.sinPk.toFixed(2)} V</b> · |Vo/Vi| = <b>${(2 * Math.PI * 1000 * s1.RC).toFixed(3)}</b> · Vo, Vi'den 90° geride</div>
      ${s1.sinPk > vs ? B('warn', `İdeal çıkış ${s1.sinPk.toFixed(2)} V, op-amp sınırı ±${vs} V → laboratuvarda ve simülasyonda tepeleri kırpılmış bir sinüs görürsün.`) : ''}
      <h3>Üçgen (100 Hz, T = 10 ms)</h3>
      <div class="formula">Yükselen: dVi/dt = +4V<sub>p</sub>f = +${t100.slope.toFixed(0)} V/s → Vo = <b>${(-t100.lvl).toFixed(3)} V</b><br>Düşen: dVi/dt = −${t100.slope.toFixed(0)} V/s → Vo = <b>+${t100.lvl.toFixed(3)} V</b></div>
      <h3>Teorik tarama tablosu</h3>
      <table><tr><th>f</th><th>|dVi/dt|</th><th>İdeal Vo</th><th>İdeal Vo,pp</th><th>Av = 4fR1C1</th></tr>
        ${SWEEP().map(f => { const t = dth(f); return `<tr><td>${fq(f)}</td><td>${t.slope.toFixed(0)} V/s</td><td>±${t.lvl.toFixed(2)} V</td><td>${t.vopp.toFixed(2)} V${t.clip ? ' <span class="bad">⚠ kırpılır</span>' : ''}</td><td>${t.av.toFixed(2)}</td></tr>`; }).join('')}</table>
      <p>Kırpılma sınırı: f &gt; ${vs} / (4·V<sub>p</sub>·R1C1) = <b>${fq(+(vs / (4 * Vp * s1.RC)).toPrecision(4))}</b> → taramadaki ilk frekans <b>${fdistTxt(fdistTh())}</b>.</p>
      ${B('tip', 'Teorik değerler tezgâhtaki R1 ve C1\'den hesaplanır. Bir değeri değiştirirsen tablo da değişir.')}`;
  }

  /** Lab 2 için küçük dalga çizimi: sarı = Vi, mavi = Vo (ölçekli değil, şekli anlatmak için) */
  function wavePic(kind) {
    const W = 400, H = 150, m = 75, x0 = 30, w = W - x0 - 8;
    const X = (t) => (x0 + t / 2 * w).toFixed(1);
    const line = (fn, col, extra = '') => `<polyline fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round" ${extra} points="${Array.from({ length: 401 }, (_, i) => { const t = i / 200; return `${X(t)},${(m - fn(t)).toFixed(1)}`; }).join(' ')}"/>`;
    const txt = (x, y, s, col, anc = 'start') => `<text x="${x}" y="${y}" fill="${col}" font-size="11" text-anchor="${anc}">${s}</text>`;
    const mark = (t, n) => `<line x1="${X(t)}" x2="${X(t)}" y1="8" y2="${H - 8}" stroke="#aaa" stroke-dasharray="2 3"/><circle cx="${X(t)}" cy="12" r="8" fill="#ff9d3d"/>${txt(X(t), 16, n, '#000', 'middle')}`;
    let body = '', note = '';
    if (kind === 'sine') {
      const s1 = dth(1000), vs = vsatNow(), A = 60, L = isFinite(vs) && s1.sinPk > vs ? A * vs / s1.sinPk : A, S = (t) => A * Math.sin(2 * Math.PI * t);
      if (L < A) body += line(S, '#4fc3ff', 'stroke-dasharray="3 4" opacity=".4"')
        + [1, -1].map(k => `<line x1="${x0}" x2="${W - 8}" y1="${m - k * L}" y2="${m - k * L}" stroke="#ff8a5c" stroke-dasharray="5 4"/>`).join('')
        + txt(W - 10, m - L - 4, `sınır +${vs} V`, '#ff8a5c', 'end') + txt(W - 10, m + L + 12, `sınır −${vs} V`, '#ff8a5c', 'end');
      body += line(t => 30 * Math.cos(2 * Math.PI * t), '#ffe14a') + line(t => Math.max(-L, Math.min(L, S(t))), '#4fc3ff') + mark(1, '①') + mark(1.25, '②');
      note = '① sarı tepede → mavi 0 · ② sarı 0\'dan geçerken → mavi tepede' + (L < A ? ' · kesik mavi = op-amp sınırı olmasaydı' : '');
    } else {
      const tri = (t) => { const u = t % 1; return u < 0.5 ? -32 + 128 * u : 32 - 128 * (u - 0.5); };
      body += line(tri, '#ffe14a') + line(t => (t % 1) < 0.5 ? -22 : 22, '#4fc3ff')
        + txt(X(0.25), m - 52, 'sarı çıkıyor ↗', '#ffe14a', 'middle') + txt(X(0.25), m + 38, 'mavi aşağıda (−)', '#4fc3ff', 'middle')
        + txt(X(0.75), m - 52, 'sarı iniyor ↘', '#ffe14a', 'middle') + txt(X(0.75), m - 30, 'mavi yukarıda (+)', '#4fc3ff', 'middle');
      note = 'Üçgenin eğimi sabit → çıkış sadece iki seviye alır (kare dalga)';
    }
    return `<div class="wpic"><svg viewBox="0 0 ${W} ${H}"><line x1="${x0}" x2="${W - 8}" y1="${m}" y2="${m}" stroke="#555"/>${txt(4, m + 4, '0 V', '#888')}${body}</svg>
      <div class="leg"><span style="color:var(--ch1)">━ sarı = Vi (giriş, CH1)</span><span style="color:var(--ch2)">━ mavi = Vo (çıkış, CH2)</span></div><div class="leg muted">${note}</div></div>`;
  }

  /* ---------------- Lab 4 (Prelab 04): seri RLC basamak yanıtı ----------------
   * Giriş: 0 → VSQ kare dalga (5 kHz, %50 → her yarım periyot 100 µs). Her yükselen kenar bir basamaktır.
   * R = 0.5 / 1 / 2 × Rcrit (toplam seri direnç). Tezgâhta toplam = R1 + jeneratörün iç direnci (rout).
   * Teori: ideal kaynak + Prelab'daki R; "tezgâhta beklenen": gerçek toplam R ile.
   * t1 (Prelab Table 1): rcrit, f0 (kHz), rU, zU, vpk (V), os (%), tsU, tsC (µs), rO, tsO (µs)
   * x (ek ölçümler): td (µs), rC, osC, osO · ex (deney sütunu, laboratuvarda doldurulur) */
  const isRlc = () => !!D() && D().type === 'rlc_step';
  const CASES = {
    U: { k: 0.5, code: 'U', name: 'Az sönümlü', en: 'Underdamped', col: '#ff9d3d', ref: 0 },
    C: { k: 1, code: 'C', name: 'Kritik sönümlü', en: 'Critically damped', col: '#5fdc7a', ref: 1 },
    O: { k: 2, code: 'O', name: 'Aşırı sönümlü', en: 'Overdamped', col: '#c79bff', ref: 2 },
  };
  const dat4 = () => { const T = dat(); if (!T.x) T.x = {}; if (!T.ex) T.ex = {}; return T; };
  function rlcVals() {
    const R = comp('R1'), Lc = comp('L1'), Cc = comp('C1'), g = fg();
    const L = Lc ? Lc.value : 1e-3, C = Cc ? Cc.value : 4.7e-9, rg = g ? g.rout : 50, R1 = R ? R.value : 0;
    return { L, C, rg, R1, Rt: R1 + rg, w0: 1 / Math.sqrt(L * C), Rc: 2 * Math.sqrt(L / C) };
  }
  /** Birim basamak yanıtı (y → 1) ve özellikleri; R = toplam seri direnç */
  const stepCache = new Map();
  function stepTh(R, L, C) {
    const key = R.toPrecision(7) + '|' + L + '|' + C;
    if (stepCache.has(key)) return stepCache.get(key);
    const w0 = 1 / Math.sqrt(L * C), a = R / (2 * L), z = a / w0;
    const o = { R, L, C, w0, f0: w0 / 2 / Math.PI, a, z };
    if (Math.abs(z - 1) < 1e-4) { o.kind = 'C'; o.s = [-w0, -w0]; o.y = (t) => 1 - (1 + w0 * t) * Math.exp(-w0 * t); }
    else if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      Object.assign(o, { kind: 'U', wd, fd: wd / 2 / Math.PI, Td: 2 * Math.PI / wd, tp: Math.PI / wd });
      o.y = (t) => 1 - Math.exp(-a * t) * (Math.cos(wd * t) + a / wd * Math.sin(wd * t));
    } else {
      const d = Math.sqrt(a * a - w0 * w0), s1 = -a + d, s2 = -a - d;
      o.kind = 'O'; o.s = [s1, s2]; o.y = (t) => 1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1);
    }
    o.os = o.kind === 'U' ? Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)) * 100 : 0;
    o.peak = 1 + o.os / 100;
    // %2 yerleşme: ±%2 bandının dışına son çıkış (tarama + ikiye bölme)
    const slow = o.kind === 'O' ? -o.s[0] : o.kind === 'C' ? w0 / 1.3 : a;
    const H = 10 / slow, N = 6000, out = (t) => Math.abs(o.y(t) - 1) > 0.02;
    let k = 0; for (let i = 0; i <= N; i++) if (out(H * i / N)) k = i;
    let lo = H * k / N, hi = H * (k + 1) / N;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (out(m)) lo = m; else hi = m; }
    o.ts = hi;
    o.tsApprox = 4 / (o.kind === 'O' ? -o.s[0] : a);
    if (stepCache.size > 200) stepCache.clear();
    stepCache.set(key, o);
    return o;
  }
  const thCase = (k) => { const v = rlcVals(); return stepTh(CASES[k].k * v.Rc, v.L, v.C); };
  const thBench = () => { const v = rlcVals(); return stepTh(v.Rt, v.L, v.C); };
  /** Tezgâhtaki toplam R hangi duruma karşılık geliyor? (±%2) */
  const caseNow = () => { const v = rlcVals(); return Object.keys(CASES).find(k => Math.abs(v.Rt / (CASES[k].k * v.Rc) - 1) < 0.02) || null; };
  const zFromOs = (p) => { const L = Math.log(p / 100); return -L / Math.sqrt(Math.PI * Math.PI + L * L); };
  const us = (s) => +(s * 1e6).toFixed(3);
  const n4 = (v, k = 3) => (+v).toFixed(k);
  const sqOK = () => { const g = fg(), V = tVi(); return g && g.wave === 'square' && freqOK(5000) && Math.abs(g.vpp - V) < V * 0.01 && Math.abs(g.offset - V / 2) < V * 0.01; };

  /** Ekrandaki kayıttan: yükselen kenar, %2 yerleşme, ilk iki tepe (otomatik kontrol ve "⚡ imleçleri koy" için) */
  function rlcScan() {
    const rec = State.R.rec, A1 = Measure.A('CH1'), A2 = Measure.A('CH2');
    if (!rec || !A1 || !A2 || !A1.rises.length || !(A1.amp > 0)) return null;
    const st = A2.step, a = A2.arr, n = a.length;
    const toI = (A, x) => (A.t0 + x * A.step - A2.t0) / st;
    const r = A1.rises[0], ir = Math.max(0, Math.round(toI(A1, r)));
    const fl = A1.falls.find(x => x > r), end = fl === undefined ? n : Math.min(n, Math.round(toI(A1, fl)));
    const fin = A1.high, h = A1.high - A1.low;     // DC'de akım 0 → Vo, Vi'nin üst seviyesine oturur
    let last = ir;
    for (let i = ir; i < end; i++) if (!isNaN(a[i]) && Math.abs(a[i] - fin) > 0.02 * h) last = i;
    const xd = (i) => (A2.t0 + i * st) / rec.tdiv - 5;
    /** Tepe (sg = +1) ya da çukur (sg = −1): 8 bit basamak + gürültüde tek örnek seçilmesin diye uç bölgenin ağırlık merkezi */
    const pext = (i0, i1, sg) => {
      i0 = Math.max(0, Math.round(i0)); i1 = Math.min(end, Math.round(i1)); if (i1 - i0 < 2) return null;
      let m = -Infinity; for (let i = i0; i < i1; i++) if (sg * a[i] > m) m = sg * a[i];
      const thr = sg * fin + 0.5 * (m - sg * fin); let s = 0, c = 0;
      for (let i = i0; i < i1; i++) if (sg * a[i] > thr) { const w = sg * a[i] - thr; s += i * w; c += w; }
      return c > 0 && m > sg * fin ? { i: s / c, v: sg * m } : null;
    };
    const th = thBench();
    let p1 = null, v1 = null;
    if (th.kind === 'U') { const w = th.Td / st; p1 = pext(ir, ir + 0.75 * w, 1); if (p1) v1 = pext(p1.i + 0.25 * w, p1.i + 0.75 * w, -1); }
    return { ir, ts: last < end - 3 ? (last + 1 - ir) * st : null, x0: xd(ir), xts: xd(last + 1), fin, h,
      p1: p1 && { x: xd(p1.i), v: p1.v }, v1: v1 && { x: xd(v1.i), v: v1.v }, half: p1 && v1 ? (v1.i - p1.i) * st : null };
  }
  function setCursors(x1, x2, msg) {
    const Cu = S().cursor;
    Cu.mode = 'H'; Cu.h = [Math.max(-5, Math.min(5, x1)), Math.max(-5, Math.min(5, x2))]; Cu.sel = 1; Cu.hunit = 'S'; Cu.src = 'CH2';
    Menus.open('cursor'); note(msg);
  }
  /** İlk tepe (≈ 1.163·VSQ) sıfır çizgisi −3.5 karedeyken ekrana sığsın: 1.2·VSQ ≤ 7.2 kare */
  function vIdx4(atten = 10) { for (let i = 0; i < State.VDIV.length; i++) if (1.2 * tVi() / (State.VDIV[i] * atten) <= 7.2) return i; return State.VDIV.length - 1; }
  /** Kenar görünümü: iki kanal aynı ölçek/konum (aynı eksen), 10 µs/div, kenar soldan 2. karede */
  function edgeView() {
    const s = S(), V = tVi();
    s.ch[0].on = s.ch[1].on = true;
    [0, 1].forEach(c => { s.ch[c].atten = Bench.model.probes[c].x10 ? 10 : 1; s.ch[c].coupling = 'DC'; s.ch[c].pos = -3.5; });
    s.ch[0].vdivIdx = s.ch[1].vdivIdx = vIdx4(s.ch[0].atten);
    s.tdivIdx = State.TDIV.findIndex(t => Math.abs(t / 10e-6 - 1) < 1e-6); s.hpos = 30e-6; s.zoom.on = false;
    Object.assign(s.trig, { src: 'CH1', type: 'Edge', slope: 'rise', level: V / 2, mode: 'Auto', coupling: 'DC' });
    s.acq.xy = false; s.math.on = false;
    Sim.refilterTrig(); Acq.resetArm(); State.R.persistClear = true; State.R.run = true; State.R.single = false;
  }
  const viewOK = () => { const s = S(); return Math.abs(State.tdiv() - 10e-6) < 1e-9 && s.ch[0].on && s.ch[1].on && s.ch[0].vdivIdx === s.ch[1].vdivIdx && Math.abs(s.ch[0].pos - s.ch[1].pos) < 0.05 && s.hpos > 5e-6; };

  /* -------- kayıt (📥) -------- */
  function capPk() {
    if (caseNow() !== 'U') return note('Önce R1\'i az sönümlü değere ayarla (toplam R = 0.5 × Rcrit).', 'warn');
    if (!sqOK()) return note('Jeneratör 0 → ' + tVi() + ' V kare dalga (5 kHz) olmalı.', 'warn');
    const mx = val('Max', 'CH2'), os = val('ROVShoot', 'CH2');
    if (!mx || !os) return note('CH2 Max ve ROVShoot ölçülemedi — ekran ayarlı mı (H3), ölçümler ekli mi?', 'warn');
    const T = dat4(), t1 = T.t1, v = rlcVals();
    t1.vpk = +mx.v.toFixed(4); t1.os = +os.v.toFixed(2); t1.rU = +v.Rt.toFixed(1);
    if (os.v > 0) { t1.zU = +zFromOs(os.v).toFixed(4); t1.rcrit = +(v.Rt / t1.zU).toFixed(1); }
    if (isFinite(T.x.td) && isFinite(t1.zU)) t1.f0 = +(1000 / T.x.td / Math.sqrt(1 - t1.zU * t1.zU)).toFixed(3);
    save(); render();
    note(`Kaydedildi: Vo,peak = ${t1.vpk} V, aşma = ${t1.os} % → ζ = ${t1.zU}, Rcrit = ${t1.rcrit} Ω, Runder = ${t1.rU} Ω.`);
  }
  function capTs(k) {
    if (caseNow() !== k) return note(`R1 şu an ${CASES[k].name.toLowerCase()} durum için ayarlı değil — önce "R1'i ayarla".`, 'warn');
    const d = cursorDt(); if (d === null || !(d > 0)) return note('Önce yatay imleçleri (H Cursor) koy: ① kenarda, ② yerleşme noktasında.', 'warn');
    const T = dat4(), v = rlcVals();
    T.t1['ts' + k] = us(d);
    if (k === 'O') T.t1.rO = +v.Rt.toFixed(1);
    if (k === 'C') T.x.rC = +v.Rt.toFixed(1);
    const os = val('ROVShoot', 'CH2'); if (os && k !== 'U') T.x['os' + k] = +os.v.toFixed(2);
    save(); render();
    note(`${CASES[k].name}: yerleşme süresi t<sub>s</sub> = ${T.t1['ts' + k]} µs kaydedildi.`);
  }
  function capTd() {
    if (caseNow() !== 'U') return note('Td az sönümlü durumda ölçülür.', 'warn');
    const d = cursorDt(); if (d === null || !(d > 0)) return note('İmleçleri koy: ① ilk tepe, ② hemen sonraki çukur.', 'warn');
    const T = dat4(); T.x.td = us(2 * d);
    if (isFinite(T.t1.zU)) T.t1.f0 = +(1000 / T.x.td / Math.sqrt(1 - T.t1.zU * T.t1.zU)).toFixed(3);
    save(); render();
    note(`Td = 2 × ${us(d)} = ${T.x.td} µs → f_d = ${(1000 / T.x.td).toFixed(2)} kHz${isFinite(T.t1.f0) ? `, f₀ = ${T.t1.f0} kHz` : ' (f₀ için önce G1\'i kaydet)'}.`);
  }
  function captureRlc() {
    const k = caseNow();
    if (k === 'U' && S().cursor.mode !== 'H') return capPk();
    if (k && S().cursor.mode === 'H') return capTs(k);
    note('Ekrandan al: R1 bir duruma (0.5 / 1 / 2 × Rcrit) ayarlı olmalı. Az sönümlüde tepe ve aşma; imleçler açıksa yerleşme süresi alınır.', 'warn');
  }
  Object.assign(ACT, {
    fgSq4: () => { setFG({ wave: 'square', freq: 5000, vpp: tVi(), offset: tVi() / 2 }); note(`Jeneratör: kare dalga, 5 kHz, ${tVi()} Vpp, ofset ${tVi() / 2} V → çıkış 0 V ile ${tVi()} V arasında.`); },
    edgeView: () => { edgeView(); note(`Ekran ayarlandı: iki kanal ${fmt(State.vdiv(0), 'V')}/div ve aynı sıfır çizgisi, TIME/DIV 10 µs, yükselen kenar soldan 2. karede.`); },
    setU: () => setR4('U'), setC: () => setR4('C'), setO: () => setR4('O'),
    mOS2: () => { Menus.open('measure'); addMeas('ROVShoot', 'CH2'); },
    capPk: () => capPk(), capTsU: () => capTs('U'), capTsC: () => capTs('C'), capTsO: () => capTs('O'), capTd: () => capTd(),
    tsCurs: () => { const r = rlcScan(); if (!r) return note('Önce ekranda yükselen kenar görünmeli (H3).', 'warn'); if (r.ts === null) return note('Dalga ekranda yerleşmiyor — TIME/DIV\'i büyüt.', 'warn'); setCursors(r.x0, r.xts, `① kenarda, ② dalganın ±%2 bandına son girdiği yerde. Δ = ${fmt(r.ts, 's', 4)}.`); },
    tdCurs: () => { const r = rlcScan(); if (!r || !r.p1 || !r.v1) return note('Tepe ve çukur bulunamadı — az sönümlü durumda ve H3 ekranında ol.', 'warn'); setCursors(r.p1.x, r.v1.x, `① ilk tepede, ② ilk çukurda. Δ = Td/2 = ${fmt(r.half, 's', 4)} → Td = ${fmt(2 * r.half, 's', 4)}.`); },
    ref4U: () => saveRef4('U'), ref4C: () => saveRef4('C'), ref4O: () => saveRef4('O'),
    refsOn: () => { let n = 0; S().ref.slice(0, 3).forEach(r => { if (r.data) { r.on = true; n++; } }); State.R.persistClear = true; note(n ? `${n} referans dalga ekranda (beyaz).` : 'Kayıtlı referans yok — önce G1, G3, G4\'te REF\'e kaydet.', n ? 'good' : 'warn'); },
    copyM: () => { const t = matlabCode(); const done = () => note('MATLAB kodu panoya kopyalandı.'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done); },
  });
  function setR4(k) {
    const R = comp('R1'), g = fg(); if (!R || !g) return note('Tezgâhta R1 ya da jeneratör yok — devreyi yeniden kur.', 'warn');
    BenchUI.checkpoint();
    if (store.rg4 === 'ideal') g.rout = 0; else if (!(g.rout > 0)) g.rout = 50;
    const tgt = CASES[k].k * rlcVals().Rc;
    R.value = +(tgt - g.rout).toFixed(1);
    Bench.changed(); BenchUI.render();
    note(`R1 = ${fmt(R.value, 'Ω', 4)} yapıldı → toplam R = R1 + ${g.rout} Ω = <b>${fmt(R.value + g.rout, 'Ω', 4)}</b> = ${CASES[k].k} × Rcrit (${CASES[k].name.toLowerCase()}).`);
  }
  function saveRef4(k) {
    if (caseNow() !== k) return note(`Ekrandaki dalga ${CASES[k].name.toLowerCase()} değil — önce R1'i ayarla.`, 'warn');
    if (Menus.saveRef(CASES[k].ref, 'CH2')) { Menus.open('ref'); note(`CH2 (${CASES[k].name.toLowerCase()}) → R${CASES[k].ref + 1}'e kaydedildi. Ekranda beyaz çizgi olarak kalır.`); }
  }
  Object.assign(CHK, {
    sqW: () => fg() && fg().wave === 'square', sqF: () => freqOK(5000),
    sqA: () => fg() && Math.abs(fg().vpp - tVi()) < tVi() * 0.01, sqO: () => fg() && Math.abs(fg().offset - tVi() / 2) < tVi() * 0.01,
    view: viewOK, mOS2: () => hasMeas('ROVShoot', 'CH2'),
    rU: () => caseNow() === 'U', rC: () => caseNow() === 'C', rO: () => caseNow() === 'O',
    capPk: () => isFinite(dat4().t1.vpk) && isFinite(dat4().t1.os),
    tsU: () => isFinite(dat4().t1.tsU), tsC: () => isFinite(dat4().t1.tsC), tsO: () => isFinite(dat4().t1.tsO), td: () => isFinite(dat4().x.td),
    cursH2: () => S().cursor.mode === 'H' && S().cursor.src === 'CH2',
    refU: () => !!S().ref[0].data, refC: () => !!S().ref[1].data, refO: () => !!S().ref[2].data,
    refsOn: () => S().ref.slice(0, 3).every(r => r.data && r.on),
  });
  Object.assign(LIVE, {
    rtot: () => { const v = rlcVals(); return { t: `${fmt(v.R1, 'Ω', 4)} + ${fmt(v.rg, 'Ω')} = ${fmt(v.Rt, 'Ω', 4)}` }; },
    zeta: () => { const v = rlcVals(); return { t: (v.Rt / v.Rc).toFixed(3) }; },
    caseNow: () => { const k = caseNow(); return k ? { t: CASES[k].name } : { t: 'hiçbiri (R hedefte değil)', bad: true }; },
    os2: () => { const r = val('ROVShoot', 'CH2'); return r ? { t: r.v.toFixed(2) + ' %' } : { t: '?', bad: true }; },
    hi1: () => { const r = val('High', 'CH1'); return r ? { t: fmt(r.v, 'V', 4) } : { t: '?', bad: true }; },
    tsAuto: () => { const r = isRlc() && rlcScan(); return r && r.ts !== null ? { t: fmt(r.ts, 's', 4) } : { t: '?', bad: true }; },
    tdAuto: () => { const r = isRlc() && rlcScan(); return r && r.half ? { t: 'Td ≈ ' + fmt(2 * r.half, 's', 4) } : { t: '?', bad: true }; },
    thBts: () => ({ t: fmt(thBench().ts, 's', 4) }), thBos: () => ({ t: thBench().os.toFixed(2) + ' %' }),
  });
  const viSel4 = () => `<p><b>V<sub>SQ</sub> seçimi (S'ye göre):</b> 0 ≤ S ≤ 6 → <b>3 V</b> · 6 &lt; S ≤ 12 → <b>5 V</b> · 12 &lt; S ≤ 18 → <b>7 V</b>. Seçimin:
    <select id="viSel4" class="ui">${[3, 5, 7].map(v => `<option value="${v}" ${store.vsq4 === v ? 'selected' : ''}>V<sub>SQ</sub> = ${v} V (0 → ${v} V)</option>`).join('')}</select></p>`;
  const rgSel4 = () => `<p><b>Jeneratörün 50 Ω'u:</b> <select id="rgSel4" class="ui">
    <option value="comp" ${store.rg4 !== 'ideal' ? 'selected' : ''}>Laboratuvar gibi: R1 = R − 50 Ω (önerilen)</option>
    <option value="ideal" ${store.rg4 === 'ideal' ? 'selected' : ''}>LTspice gibi: ideal kaynak (0 Ω), R1 = R</option></select></p>`;

  /* -------- çizimler -------- */
  /** Üç durumun basamak yanıtı (gerçek ölçekli, tezgâhtaki L ve C ile). only: tek durumu vurgula */
  function stepPic(only) {
    const v = rlcVals(), W = 400, H = 190, x0 = 34, y0 = 160, w = W - x0 - 10, hgt = 120, tmax = 50e-6;
    const X = (t) => (x0 + t / tmax * w).toFixed(1), Y = (y) => (y0 - y * hgt).toFixed(1);
    const txt = (x, y, s, col, anc = 'start', sz = 11) => `<text x="${x}" y="${y}" fill="${col}" font-size="${sz}" text-anchor="${anc}">${s}</text>`;
    let b = '';
    for (let t = 0; t <= 50; t += 10) b += `<line x1="${X(t * 1e-6)}" x2="${X(t * 1e-6)}" y1="${Y(0)}" y2="${Y(1.25)}" stroke="#2a2f36"/>` + txt(X(t * 1e-6), y0 + 13, t + ' µs', '#888', 'middle', 10);
    b += `<rect x="${x0}" y="${Y(1.02)}" width="${w}" height="${(0.04 * hgt).toFixed(1)}" fill="#ffffff" opacity=".07"/>`
      + [0.98, 1.02].map(q => `<line x1="${x0}" x2="${W - 10}" y1="${Y(q)}" y2="${Y(q)}" stroke="#888" stroke-dasharray="3 3"/>`).join('')
      + txt(W - 12, +Y(1.02) - 3, '±%2 bandı', '#aaa', 'end', 10);
    b += `<line x1="${x0}" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="#555"/>` + txt(4, +Y(0) + 4, '0', '#888') + txt(4, +Y(1) + 4, 'V<tspan font-size="8">SQ</tspan>', '#888');
    b += `<polyline fill="none" stroke="#ffe14a" stroke-width="2" points="${x0},${Y(0)} ${x0},${Y(1)} ${W - 10},${Y(1)}"/>`;
    for (const k of Object.keys(CASES)) {
      const th = thCase(k), dim = only && only !== k;
      const pts = Array.from({ length: 301 }, (_, i) => { const t = i / 300 * tmax; return `${X(t)},${Y(th.y(t))}`; }).join(' ');
      b += `<polyline fill="none" stroke="${CASES[k].col}" stroke-width="${dim ? 1.2 : 2.4}" opacity="${dim ? 0.3 : 1}" points="${pts}"/>`;
      // t_s etiketleri altta, üst üste binmesin diye kademeli (C ve U birbirine yakın)
      const ly = { U: 0.2, C: 0.08, O: 0.08 }[k];
      if (!dim && th.ts < tmax) b += `<line x1="${X(th.ts)}" x2="${X(th.ts)}" y1="${Y(1.05)}" y2="${Y(0)}" stroke="${CASES[k].col}" stroke-dasharray="2 3"/>`
        + `<rect x="${+X(th.ts) + 2}" y="${+Y(ly) - 10}" width="54" height="13" fill="#111417" opacity=".85"/>` + txt(+X(th.ts) + 4, Y(ly), 't<tspan font-size="8" dy="2">s</tspan><tspan dy="-2">=' + n4(th.ts * 1e6, 1) + 'µs</tspan>', CASES[k].col, 'start', 10);
      if (!dim && k === 'U') b += `<circle cx="${X(th.tp)}" cy="${Y(th.peak)}" r="3" fill="${CASES.U.col}"/>` + txt(+X(th.tp) + 6, +Y(th.peak) + 3, `ilk tepe (+${n4(th.os, 1)} %)`, CASES.U.col, 'start', 10);
    }
    return `<div class="wpic"><svg viewBox="0 0 ${W} ${H}">${b}</svg>
      <div class="leg"><span style="color:var(--ch1)">━ giriş Vi (basamak)</span>${Object.keys(CASES).map(k => `<span style="color:${CASES[k].col}">━ ${CASES[k].name} (R = ${CASES[k].k} × Rcrit)</span>`).join('')}</div>
      <div class="leg muted">Gerçek ölçekli: L = ${fmt(v.L, 'H')}, C = ${fmt(v.C, 'F')}. Dikey çizgiler = %2 yerleşme süreleri.</div></div>`;
  }
  /** s-düzlemi: üç durumun kökleri */
  function splanePic() {
    const v = rlcVals(), W = 400, H = 190, cx = 330, cy = 95, sc = 60 / v.w0;   // ω0 = 60 px
    const P = (re, im) => [(cx + re * sc).toFixed(1), (cy - im * sc).toFixed(1)];
    const txt = (x, y, s, col, anc = 'start', sz = 10) => `<text x="${x}" y="${y}" fill="${col}" font-size="${sz}" text-anchor="${anc}">${s}</text>`;
    let b = `<line x1="8" x2="${W - 8}" y1="${cy}" y2="${cy}" stroke="#666"/><line x1="${cx}" x2="${cx}" y1="8" y2="${H - 8}" stroke="#666"/>`
      + txt(W - 10, cy - 4, 'σ (gerçek)', '#999', 'end') + txt(cx + 4, 16, 'jω (sanal)', '#999')
      + `<circle cx="${cx}" cy="${cy}" r="60" fill="none" stroke="#555" stroke-dasharray="3 3"/>` + txt(cx - 44, cy - 50, '|s| = ω₀', '#888', 'end');
    const dot = (re, im, col, lab, dy = -6) => { const [x, y] = P(re, im); return `<text x="${x}" y="${+y + 4}" fill="${col}" font-size="14" font-weight="700" text-anchor="middle">×</text>` + (lab ? txt(x, +y + dy, lab, col, 'middle') : ''); };
    const U = thCase('U'), C = thCase('C'), O = thCase('O');
    b += dot(-U.a, U.wd, CASES.U.col, 'az sönümlü') + dot(-U.a, -U.wd, CASES.U.col, '', 0);
    b += dot(-C.w0, 0, CASES.C.col, 'kritik (çift kök)', 22);
    b += dot(O.s[0], 0, CASES.O.col, 'aşırı', -8) + dot(O.s[1], 0, CASES.O.col, 'aşırı', -8);
    return `<div class="wpic"><svg viewBox="0 0 ${W} ${H}">${b}</svg>
      <div class="leg muted">Kökler sol yarı düzlemde → hepsi kararlı (sönen). Sanal kısmı olan kök (turuncu) = salınım. R büyüdükçe kökler daire üstünden gerçek eksene iner, sonra ayrılır: biri yavaşa (sağa, 0'a yakın), biri hızlıya.</div></div>`;
  }

  /* -------- adımlar -------- */
  function rlcSteps() {
    const d = D(), v = rlcVals(), V = tVi(), U = thCase('U'), C = thCase('C'), O = thCase('O');
    const steps = [], MORE = (t, h) => `<details class="recipe"><summary>${t}</summary><div class="in">${h}</div></details>`;
    const at = (code) => steps.findIndex(x => x.code === code);
    const toCalc = `<button data-tab="calc">🧮 Hesabın tamamı</button>`, toTh = `<button data-tab="theory">🧠 Teori</button>`;
    const R1for = (k) => fmt(CASES[k].k * v.Rc - (store.rg4 === 'ideal' ? 0 : 50), 'Ω', 4);
    const band = `${n4(0.98 * V, 2)} V … ${n4(1.02 * V, 2)} V`;
    const rgTxt = store.rg4 === 'ideal' ? 'Jeneratör ideal (0 Ω) seçildi: R1 doğrudan Prelab\'daki R olur.' : `Jeneratörün içinde <b>50 Ω</b> var ve devreye seri bağlıdır. Bu yüzden R1'e <b>R − 50 Ω</b> yazıyoruz: toplam yine tam R olur.`;
    const refStep = (k) => `<li data-chk="ref${k}">Bu dalgayı karşılaştırma için sakla (G5'te kullanacağız): <b>R</b> (REF) tuşuna bas → ${BOT(CASES[k].ref + 1, 'R' + (CASES[k].ref + 1))} → ${SIDE(2, 'Source')} (ekranda <b>CH2</b> yazana kadar) → ${SIDE(3, 'Save')}. ${acts(show('ref,bot' + CASES[k].ref + ',side1,side2'), doit('ref4' + k))}</li>`;
    const setRli = (k) => `<li data-chk="r${k}">Tezgâhta <b>R1'e tıkla</b>, sağdaki kutuya <b>${R1for(k)}</b> yaz, Enter. ${rgTxt} ${acts(doit('set' + k, '⚡ R1\'i ayarla'))}<br>Şu an toplam R = ${live('rtot')} · ζ = ${live('zeta')} · durum: ${live('caseNow')}</li>`;
    const tsHow = (k) => `
        <li data-chk="cursH2"><b>Cursor</b> tuşuna bas → ${BOT(1, 'H Cursor')} (iki dikey çizgi çıkar) → ${BOT(3, 'Source')} → sağdan <b>CH2</b>'yi seç. Artık sol üstteki kutu, imlecin olduğu yerde <b>Vo</b>'nun değerini yazar. ${acts(show('cursor,bot0,bot2'))}</li>
        <li>${KNOB('VARIABLE')}: <b>① imleci sarının yükselen kenarına</b> getir (t = 0 anı). Sonra <b>Select</b>'e bas (② seçilir).</li>
        <li>② imleci sağa götür. Kutudaki <b>②</b> satırında Vo değeri <b>${band}</b> aralığına girdiği ve <b>bir daha hiç çıkmadığı</b> ilk yerde dur.${k === 'U' ? ' (Dikkat: az sönümlüde dalga bandın içine girip tekrar çıkar — <b>son</b> girişi bul.)' : ''} ${acts(doit('tsCurs', '⚡ İmleçleri benim için koy'))}</li>
        <li data-chk="ts${k}">Kutudaki <b>Δ</b> = yerleşme süresi t<sub>s</sub> (şu an Δ = ${live('dt')}). ${acts(doit('capTs' + k, '📥 Tabloya kaydet'))} <span class="muted">Otomatik kontrol: ${live('tsAuto')}</span></li>`;

    steps.push({ kind: 'start', code: 'Başla', t: 'Bu deneyde ne yapacağız?', chk: 'loaded', html: () => `
      <div class="ccard lab new cur" style="cursor:default"><div class="ct">⭐ ${d.title}<span class="newb">YENİ</span></div><div class="ck">${I().kind} · Prelab 04</div><div class="cf">L1 = 1 mH · C1 = 4.7 nF · R1 = 0.5 / 1 / 2 × Rcrit · kare dalga 0 → ${V} V, 5 kHz</div></div>
      <h3>Bu deney 1 dakikada</h3>
      ${B('simple', `Girişe bir <b>basamak</b> veriyoruz: gerilim bir anda 0 V'tan ${V} V'a zıplıyor. Kondansatörün gerilimi (Vo) bu yeni değere <b>nasıl</b> gidiyor, ona bakıyoruz. Cevap dirence bağlı.`)}
      <p><b>Araba amortisörü benzetmesi:</b> Arabayla bir kaldırımdan iniyorsun.</p>
      <table>
        <tr><th>Devrede</th><th>Arabada</th><th>Ne yapar?</th></tr>
        <tr><td><b>L</b> (bobin)</td><td>arabanın <b>kütlesi</b></td><td>Akımın aniden değişmesine direnir (atalet). Hızla giden araba hemen duramaz.</td></tr>
        <tr><td><b>C</b> (kondansatör)</td><td><b>yay</b></td><td>Enerjiyi depolar ve geri verir.</td></tr>
        <tr><td><b>R</b> (direnç)</td><td><b>amortisör</b></td><td>Enerjiyi ısıya çevirip yok eder: salınımı söndürür.</td></tr>
      </table>
      ${stepPic()}
      <ul>
        <li><b style="color:${CASES.U.col}">Az sönümlü</b> (R küçük, zayıf amortisör): hedefi <b>geçer</b>, bir süre aşağı yukarı <b>zıplar</b> (salınım), sonra durulur.</li>
        <li><b style="color:${CASES.C.col}">Kritik sönümlü</b> (R = Rcrit, tam ayarlı amortisör): <b>hiç geçmeden</b>, hedefe <b>en hızlı</b> ulaşır.</li>
        <li><b style="color:${CASES.O.col}">Aşırı sönümlü</b> (R büyük, çok sert amortisör): geçmez ama hedefe <b>yavaş yavaş</b> sürünerek gider.</li>
      </ul>
      <p>Neden <b>kare dalga</b>? Kare dalga her 100 µs'de bir kendiliğinden 0 → ${V} V (ve geri) zıplar: yani basamağı saniyede binlerce kez tekrarlar. Osiloskop bu tekrarlanan olayı sabit bir görüntü olarak gösterebilir.</p>
      <h3>Senden istenen: önce V<sub>SQ</sub>'yu seç</h3>
      ${viSel4()}
      <p class="muted">S = öğrenci numaralarının son hanelerinin toplamı (tek başına çalışıyorsan kendi numaranın son hanesi). Seçtiğin V<sub>SQ</sub> deney boyunca <b>hiç değişmez</b>.</p>
      ${rgSel4()}
      ${MORE('Bu 50 Ω seçimi ne demek? (önemli)', `<p>Gerçek jeneratörün içinde 50 Ω'luk bir direnç vardır ve devreye <b>seri</b> girer. RLC devresinde seri direnç doğrudan sönümü belirlediği için bu 50 Ω hesabı değiştirir: örneğin az sönümlüde R1 = ${fmt(U.R, 'Ω', 4)} takarsan toplam ${fmt(U.R + 50, 'Ω', 4)} olur, aşma %${n4(U.os, 1)} yerine %${n4(stepTh(U.R + 50, v.L, v.C).os, 1)} çıkar.</p>
        <p><b>Önerilen</b>: R1 = R − 50 Ω yaz, toplam tam R olsun (laboratuvarda da böyle yap). <b>LTspice gibi</b>: jeneratörün iç direncini 0 yapar, R1 = R olur — sonuçlar aynı çıkar, sadece tezgâhta yazan R1 değişir.</p>`)}
      <h3>Sonra 5 görev</h3>
      <p>Satıra tıklarsan o göreve gidersin. Biten görev yeşil ✓ olur.</p>
      <table>
        <tr><th>Görev</th><th>Ne yapacaksın?</th><th>Table 1'e</th></tr>
        <tr data-goto="${at('G1')}" style="cursor:pointer"><td><b>G1</b></td><td style="color:${CASES.U.col}">Az sönümlü: ilk tepe ve aşma (%)</td><td>Runder, ζ, Vo,peak, overshoot, Rcrit</td></tr>
        <tr data-goto="${at('G2')}" style="cursor:pointer"><td><b>G2</b></td><td style="color:${CASES.U.col}">Az sönümlü: yerleşme süresi + salınım periyodu</td><td>settling time, f0</td></tr>
        <tr data-goto="${at('G3')}" style="cursor:pointer"><td><b>G3</b></td><td style="color:${CASES.C.col}">Kritik sönümlü: yerleşme süresi</td><td>critical settling time</td></tr>
        <tr data-goto="${at('G4')}" style="cursor:pointer"><td><b>G4</b></td><td style="color:${CASES.O.col}">Aşırı sönümlü: yerleşme süresi</td><td>Rover, settling time</td></tr>
        <tr data-goto="${at('G5')}" style="cursor:pointer"><td><b>G5</b></td><td>Üç dalgayı aynı ekranda karşılaştır</td><td>rapordaki şekil</td></tr>
      </table>
      <p>Görevlerden önce <b>3 kısa hazırlık</b> var: H1 problar, H2 jeneratör, H3 ekran.</p>
      ${B('tip', `Table 1'in <b>Theoretical</b> sütunu <b>🧮 Teorik hesaplar</b> sekmesinde adım adım (türetme dahil). <b>Simulation</b> = burada ölçtüğün. <b>Experimental</b> = laboratuvarda. ${acts(toCalc, toTh)}`)}
      <ol class="steps"><li data-chk="loaded">Devre tezgâhta kurulu olmalı. ${acts(doit('load', '⚡ Devreyi (yeniden) kur'))}</li></ol>` });

    steps.push({ kind: 'prep', code: 'H1', t: 'Devreyi tanı, probları bağla', chk: ['p1Vi', 'p2Vo', 'gnd'], html: () => `
      ${B('simple', 'Sarı prob (CH1) girişi, mavi prob (CH2) çıkışı yani <b>kondansatörün gerilimini</b> görecek.')}
      <div class="formula">${Circuits.diagram()}</div>
      <ol class="steps">
        <li data-chk="p1Vi"><b>Sarı CH1 probunun ucunu Vi'ye</b> tak (jeneratörün çıkışı, R1'in sol ucu).</li>
        <li data-chk="p2Vo"><b>Mavi CH2 probunun ucunu Vo'ya</b> tak (L1 ile C1'in birleştiği nokta = C1'in üst ucu).</li>
        <li data-chk="gnd">İki probun da <b>siyah timsahını GND'ye</b> tak (C1'in alt ucu toprakta, Şekil 1'deki "−" uç). ${acts(doit('probes'))}</li>
      </ol>
      ${B('why', 'Vo, C1\'in iki ucu arasındaki gerilimdir. C1\'in alt ucu zaten toprakta olduğu için CH2 ucunu üst uca takmak yeter. Osiloskop her zaman "uç − toprak" ölçer.')}
      ${MORE('Seri devrede akım her yerde aynı — ne demek?', `<p>Tek bir halka var: jeneratör → R1 → L1 → C1 → geri. Bu yüzden R1'den, L1'den ve C1'den <b>aynı akım</b> i(t) geçer. Kondansatörün akımı i = C1·dVo/dt olduğu için Vo'yu bilmek akımı da bilmek demek. Teorik türetme bu fikirle başlar. ${acts(toCalc)}</p>`)}` });

    steps.push({ kind: 'prep', code: 'H2', t: `Jeneratör: 0 → ${V} V kare dalga, 5 kHz`, chk: ['sqW', 'sqF', 'sqA', 'sqO'], html: () => `
      ${B('simple', `Jeneratörün kare dalgası normalde eksiden artıya gider (−${V / 2} V … +${V / 2} V). Bize <b>0 V … ${V} V</b> lazım. Bunun için dalgayı <b>${V / 2} V yukarı kaydırıyoruz</b> (DC ofset).`)}
      <ol class="steps">
        <li>Tezgâhta <b>jeneratöre (FG1) tıkla</b>; sağda ayarları açılır.</li>
        <li data-chk="sqW">Dalga: <b>Kare</b>.</li>
        <li data-chk="sqF">Frekans: <b>5 kHz</b> (çipe tıkla).</li>
        <li data-chk="sqA">Genlik: <b>${V} Vpp</b> (tepeden tepeye = basamağın boyu V<sub>SQ</sub>).</li>
        <li data-chk="sqO">DC ofset: <b>${V / 2} V</b> (genliğin yarısı). ${acts(doit('fgSq4'))}</li>
      </ol>
      <div class="formula">en düşük = ofset − Vpp/2 = ${V / 2} − ${V / 2} = <b>0 V</b> &nbsp;·&nbsp; en yüksek = ofset + Vpp/2 = <b>${V} V</b></div>
      ${B('why', `5 kHz → periyot T = 1/5000 = <b>200 µs</b>; %50 görev oranı → <b>100 µs</b> yüksek, <b>100 µs</b> alçak. En yavaş durumun (aşırı sönümlü) yerleşmesi ≈ ${n4(O.ts * 1e6, 0)} µs sürer: 100 µs'den kısa olduğu için her kenardan önce devre tamamen durulur. Yani her yükselen kenar "sıfır başlangıç koşullu" temiz bir basamaktır (Prelab'ın istediği).`)}
      ${MORE('Prelab\'daki "Use a transient time step small enough" ne demek?', `LTspice gibi programlar zamanı küçük adımlarla ilerletir. Salınım periyodu ≈ ${n4(U.Td * 1e6, 1)} µs; bir periyotta en az 50–100 nokta olmalı → adım ≤ ~0.2 µs (ör. <code>.tran 0 400u 0 0.1u</code>). Bu simülatör adımı kendisi küçük seçer (≈ 0.1 µs).`)}` });

    steps.push({ kind: 'prep', code: 'H3', t: 'Ekranı kenara odakla (aynı zaman ekseni)', chk: ['view', 'trig'], html: () => `
      ${B('simple', 'Yükselen kenarın hemen sonrasını büyüterek göreceğiz. İki kanalı da <b>aynı ölçek</b> ve <b>aynı sıfır çizgisi</b>yle ayarlıyoruz ki sarı ile mavi doğrudan karşılaştırılabilsin.')}
      <ol class="steps">
        <li>Önce <b>CH2</b> tuşuyla mavi kanalı aç, sonra <b>Autoset</b>. Ekranda ~2.5 kare dalga görürsün; dalgalanma çok sıkışık. ${acts(show('ch2,autoset'), doit('autoset'))}</li>
        <li><b>TIME/DIV</b> (HORIZONTAL SCALE) düğmesini saat yönünde çevir → <b>10 µs/div</b> (ekran 100 µs = tam bir yüksek yarım periyot). Şu an: ${live('tdiv')} ${acts(show('hscale'))}</li>
        <li><b>H POSITION</b> düğmesini çevir: üstteki turuncu tetik işareti (▼) <b>soldan 2. çizgiye</b> gelsin (H POSITION = 30 µs). Kenarın öncesini de biraz görürüz. ${acts(show('hpos'))}</li>
        <li><b>CH1 SCALE</b> ve <b>CH2 SCALE</b> ikisini de <b>${fmt(State.VDIV[vIdx4()] * 10, 'V')}/div</b> yap; iki <b>POSITION</b> düğmesiyle iki sıfır çizgisini (soldaki ▶1 ▶2) <b>aynı yere</b>, alttan yarım kare yukarı getir. ${acts(show('ch1scale,ch2scale,ch1pos,ch2pos'))}</li>
        <li data-chk="view,trig">Tetik: kaynak CH1, yükselen kenar, seviye ≈ ${V / 2} V (Autoset zaten böyle yapar). Sağ üstte <b>Trig'd</b>. ${acts(doit('edgeView', '⚡ Hepsini benim için ayarla'))}</li>
      </ol>
      ${B('see', `Sarı: soldan 2. çizgide 0'dan ${V} V'a dik bir basamak. Mavi: aynı anda yükselmeye başlar ve R1'e göre ya zıplar ya yavaşça yaklaşır. Sarının kenardan hemen sonra hafif çukurlaşması normaldir: akım jeneratörün 50 Ω'unda gerilim düşürür.`)}
      ${B('why', 'Neden aynı ölçek? Raporda "Vi ve Vo aynı zaman ekseninde" isteniyor ve aşmayı göz kararı görmek için mavinin sarıyı ne kadar geçtiği doğrudan okunabilmeli.')}` });

    steps.push({ kind: 'task', code: 'G1', short: 'Az sönümlü: tepe', goes: 'Table 1 → Runder, ζ, Vo,peak, overshoot, Rcrit', t: 'Az sönümlü (R = 0.5·Rcrit): ilk tepe ve aşma', chk: ['rU', 'mMax2', 'mOS2', 'capPk'], html: () => `
      ${B('simple', `Zayıf amortisör: Vo hedefi (${V} V) <b>geçecek</b> ve zıplayacak. En yüksek noktayı (<b>ilk tepe</b>) ve hedefi yüzde kaç geçtiğini (<b>aşma, overshoot</b>) ölçüyoruz.`)}
      <ol class="steps">
        ${setRli('U')}
        <li data-chk="mMax2"><b>Measure</b> → ${BOT(1, 'Add Measurement')} → ${SIDE(4, 'Source1')} ile <b>CH2</b> → ${SIDE(1, 'V/I')} → ${KNOB('VARIABLE')}, <b>Max</b> → <b>Select</b>. ${acts(show('measure,bot0,side3,side0,variable,select'), doit('mMax2'))}</li>
        <li data-chk="mOS2">Aynı listede biraz aşağıda <b>ROVShoot</b> ("Rising OVerShoot" = yükselen kenardan sonraki aşma %) → <b>Select</b> → <b>Menu Off</b>. ${acts(doit('mOS2'))}</li>
        <li data-chk="capPk">CH2 Max = ${live('vmax2')} → <b>Vo,peak</b> · ROVShoot = ${live('os2')} → <b>aşma</b>. ${acts(doit('capPk', '📥 Tabloya kaydet'))}</li>
      </ol>
      ${stepPic('U')}
      ${B('see', `Mavi, sarının basamağını geçip ≈ ${n4(U.peak * V, 2)} V'a çıkar, sonra aşağı yukarı birkaç kez sallanarak ${V} V'ta durulur. Bu sallanma bobin ile kondansatörün enerjiyi birbirine paslamasıdır.`)}
      ${B('why', `Aşma (%) = (ilk tepe − son değer) / basamak boyu × 100. Osiloskobun ROVShoot ölçümü tam olarak bunu yapar. Aşma sadece ζ'ya bağlıdır: %OS = 100·e<sup>−πζ/√(1−ζ²)</sup>. Tersinden ζ bulunur: ζ = −ln(OS)/√(π² + ln²(OS)). Kaydet tuşu bunu da yapar ve <b>Rcrit = R / ζ</b> ile kritik direnci ölçümden hesaplar.`)}
      ${B('write', `<table><tr><th>Table 1 satırı</th><th>Theoretical</th><th>Simulation</th></tr>
        <tr><td>Underdamped Runder (Ω)</td><td><b>${n4(U.R, 1)}</b></td><td>toplam R (R1 + jeneratör)</td></tr>
        <tr><td>Underdamped ratio ζ</td><td><b>0.500</b></td><td>aşmadan hesaplanan ζ</td></tr>
        <tr><td>First peak Vo,peak (V)</td><td><b>${n4(U.peak * V)}</b></td><td>CH2 Max</td></tr>
        <tr><td>Overshoot (%)</td><td><b>${n4(U.os, 2)}</b></td><td>ROVShoot</td></tr>
        <tr><td>Critical resistance Rcrit (Ω)</td><td><b>${n4(v.Rc, 1)}</b></td><td>Runder / ζ<sub>ölçülen</sub></td></tr></table>`)}
      ${MORE(`%${n4(U.os, 2)} ve ${n4(U.peak * V, 3)} V nereden çıktı?`, `<div class="formula">%OS = 100·e<sup>−π·0.5/√(1−0.25)</sup> = 100·e<sup>−1.8138</sup> = <b>${n4(U.os, 2)} %</b><br>Vo,peak = V<sub>SQ</sub>·(1 + OS) = ${V} × ${n4(U.peak, 4)} = <b>${n4(U.peak * V)} V</b> · t<sub>p</sub> = π/ω<sub>d</sub> = <b>${n4(U.tp * 1e6, 2)} µs</b>'de</div>Adım adım hali: ${acts(toCalc)}`)}
      <ol class="steps">${refStep('U')}</ol>` });

    steps.push({ kind: 'task', code: 'G2', short: 'Az sönümlü: t<sub>s</sub>, Td', goes: 'Table 1 → Underdamped settling time, f0', t: 'Az sönümlü: yerleşme süresi ve salınım periyodu', chk: ['rU', 'tsU', 'td'], html: () => `
      ${B('simple', `<b>Yerleşme süresi (t<sub>s</sub>)</b>: kenardan sonra Vo'nun ${V} V'un <b>±%2</b>'si içine girip <b>bir daha çıkmadığı</b> ana kadar geçen süre. Yani "zıplama bitti" anı. Bunu osiloskobun dikey imleç çizgileriyle ölçeceğiz.`)}
      <p>±%2 bandı: ${V} × 0.98 = <b>${n4(0.98 * V, 2)} V</b> ile ${V} × 1.02 = <b>${n4(1.02 * V, 2)} V</b> arası.</p>
      <ol class="steps">
        ${setRli('U')}
        ${tsHow('U')}
      </ol>
      <h3>Salınım periyodu Td (Prelab 5.2)</h3>
      ${B('simple', `Prelab "iki ardışık tepe arası" diyor. Ama ζ = 0.5'te her yarım salınım bir öncekinin yalnızca <b>%${n4(U.os, 1)}</b>'i kadar: ilk tepe +%${n4(U.os, 1)}, sonraki çukur −%${n4(U.os * U.os / 100, 2)}, ikinci tepe sadece <b>+%${n4(U.os ** 3 / 1e4, 2)}</b> (${n4(U.os ** 3 / 1e6 * V * 1000, 0)} mV) — ekranda <b>görünmez</b>. Bu yüzden ilk tepe ile ilk çukur arasını ölçüyoruz: bu <b>yarım periyot</b>tur, Td = 2 × Δ.`)}
      <ol class="steps">
        <li>① imleci <b>ilk tepeye</b> (mavinin en yüksek yeri), ② imleci <b>hemen sonraki çukura</b> (hedefin altına indiği en düşük yer) koy. Kutudaki ① gerilimi en büyük, ② gerilimi en küçük olsun. ${acts(doit('tdCurs', '⚡ İmleçleri benim için koy'))}</li>
        <li data-chk="td">Δ = <b>Td/2</b>. Şu an Δ = ${live('dt')}. Kaydet tuşu 2 ile çarpar. ${acts(doit('capTd', '📥 Tabloya kaydet (Td = 2Δ)'))} <span class="muted">Otomatik kontrol: ${live('tdAuto')}</span></li>
      </ol>
      ${B('why', `Ardışık iki tepe (ya da tepe → çukur → tepe) arası süre, <b>sönümlü</b> salınımın periyodudur: Td = 2π/ω<sub>d</sub>, ω<sub>d</sub> = ω<sub>0</sub>·√(1 − ζ²). Kaydet tuşu ölçtüğün Td ve ζ'dan doğal frekansı hesaplar: f<sub>0</sub> = (1/Td) / √(1 − ζ²). Teori: Td = <b>${n4(U.Td * 1e6, 2)} µs</b>, f<sub>d</sub> = ${n4(U.fd / 1000, 2)} kHz, f<sub>0</sub> = ${n4(U.f0 / 1000, 2)} kHz.`)}
      ${B('write', `<table><tr><th>Table 1 satırı</th><th>Theoretical</th><th>Simulation</th></tr>
        <tr><td>Underdamped settling time (μs)</td><td><b>${n4(U.ts * 1e6, 2)}</b></td><td>imleç Δ</td></tr>
        <tr><td>Natural frequency f0 (kHz)</td><td><b>${n4(U.f0 / 1000, 2)}</b></td><td>(1/Td)/√(1−ζ²)</td></tr></table>`)}
      ${B('tip', `±%2 bandı sadece ${n4(0.04 * V, 2)} V genişliğinde; 8 bitlik ekranda bu 2–4 ADC basamağı eder. Bu yüzden imleçle ölçtüğün t<sub>s</sub> teoriden ~1 µs farklı çıkabilir — normaldir, raporda "ölçüm çözünürlüğü" diye yaz.`)}
      ${MORE('Kitaptaki t_s ≈ 4/(ζω₀) neden biraz farklı?', `4/(ζω₀) = ${n4(U.tsApprox * 1e6, 2)} µs sadece zarfın (e<sup>−αt</sup>) %2'ye indiği andır, bir <b>yaklaşım</b>dır. Gerçek dalga zarfa her zaman değmez; Prelab'ın tanımına göre tam değer (dalganın banda son girişi) <b>${n4(U.ts * 1e6, 2)} µs</b>. Raporda ikisini de yazıp farkı açıklayabilirsin.`)}` });

    steps.push({ kind: 'task', code: 'G3', short: 'Kritik: t<sub>s</sub>', goes: 'Table 1 → Critical settling time', t: 'Kritik sönümlü (R = Rcrit): yerleşme süresi', chk: ['rC', 'tsC'], html: () => `
      ${B('simple', `Tam ayarlı amortisör: Vo hedefi <b>hiç geçmeden</b> ve aşmasız durumlar içinde <b>en hızlı</b> şekilde ${V} V'a ulaşır.`)}
      <ol class="steps">
        ${setRli('C')}
        <li>ROVShoot şimdi ≈ <b>0 %</b> olmalı: ${live('os2')}. (Ekranda küçük bir sayı görürsen 8 bitlik ölçüm çözünürlüğündendir.)</li>
        ${tsHow('C')}
        ${refStep('C')}
      </ol>
      ${stepPic('C')}
      ${B('write', `Critical settling time (μs): Theoretical = <b>${n4(C.ts * 1e6, 2)}</b> · Simulation = imleç Δ. Kritikte aşma yoktur: "first peak" = <b>N/A</b>.`)}
      ${MORE(`${n4(C.ts * 1e6, 2)} µs nereden çıktı?`, `<div class="formula">Vo = V<sub>SQ</sub>[1 − (1 + ω<sub>0</sub>t)e<sup>−ω<sub>0</sub>t</sup>] → (1 + x)e<sup>−x</sup> = 0.02 → x = ω<sub>0</sub>t<sub>s</sub> = 5.834<br>t<sub>s</sub> = 5.834 / ${sci(C.w0)} = <b>${n4(C.ts * 1e6, 2)} µs</b></div>${acts(toCalc)}`)}` });

    steps.push({ kind: 'task', code: 'G4', short: 'Aşırı: t<sub>s</sub>', goes: 'Table 1 → Rover, Overdamped settling time', t: 'Aşırı sönümlü (R = 2·Rcrit): yerleşme süresi', chk: ['rO', 'tsO'], html: () => `
      ${B('simple', 'Çok sert amortisör: Vo hedefi yine geçmez ama <b>yavaş</b> tırmanır. Direnç enerjiyi o kadar çok yer ki bobin–kondansatör alışverişi hiç başlayamaz.')}
      <ol class="steps">
        ${setRli('O')}
        ${tsHow('O')}
        ${refStep('O')}
      </ol>
      ${stepPic('O')}
      ${B('write', `<table><tr><th>Table 1 satırı</th><th>Theoretical</th><th>Simulation</th></tr>
        <tr><td>Overdamped Rover (Ω)</td><td><b>${n4(O.R, 1)}</b></td><td>toplam R</td></tr>
        <tr><td>Overdamped settling time (μs)</td><td><b>${n4(O.ts * 1e6, 2)}</b></td><td>imleç Δ</td></tr></table>`)}
      ${B('why', `Aşırı sönümde iki gerçek kök var: s₁ = ${sci(O.s[0])} ve s₂ = ${sci(O.s[1])} 1/s. Hızlı olan (s₂) çabucak söner; geriye yavaş olan (s₁) kalır ve yerleşmeyi o belirler: t<sub>s</sub> ≈ 4/|s₁| = ${n4(O.tsApprox * 1e6, 1)} µs (tam değer ${n4(O.ts * 1e6, 2)} µs). R'yi artırdıkça s₁ sıfıra yaklaşır → devre daha da <b>yavaşlar</b>.`)}` });

    steps.push({ kind: 'task', code: 'G5', short: 'Üçü bir arada', goes: 'Rapor → üç dalga aynı zaman ekseninde', t: 'Üç durumu aynı ekranda karşılaştır', chk: ['refsOn'], html: () => `
      ${B('simple', 'G1, G3 ve G4\'te kaydettiğin üç mavi dalga beyaz referans (REF) çizgisi olarak ekranda duruyor. Hepsi <b>aynı zaman ekseninde</b> — rapordaki karşılaştırma şekli bu.')}
      <ol class="steps">
        <li data-chk="refsOn"><b>R</b> (REF) tuşu → R1, R2, R3 için ${SIDE(1, 'Display')} = <b>On</b>. ${acts(show('ref,side0'), doit('refsOn', '⚡ Üçünü de göster'))}</li>
        <li>Ekran görüntüsü al: ekranın solundaki <b>Hardcopy</b>. ${acts(show('hardcopy'), doit('img', '📷 Görüntü al'))}</li>
      </ol>
      ${B('see', `En çok zıplayan beyaz çizgi = R1 (az sönümlü). Hiç geçmeden en hızlı yerleşen = R2 (kritik). En yavaş tırmanan = R3 (aşırı). Raporda bu üçünü etiketle.`)}
      ${stepPic()}
      <h3>Prelab'ın sorduğu 3 soru — cevaplar</h3>
      <table>
        <tr><td><b>Hangisi salınır?</b></td><td style="color:${CASES.U.col}">Az sönümlü (ζ = 0.5 &lt; 1): karmaşık eşlenik kökler → salınım.</td></tr>
        <tr><td><b>Hangisi aşmadan en hızlı yerleşir?</b></td><td style="color:${CASES.C.col}">Kritik sönümlü (ζ = 1): t<sub>s</sub> = ${n4(C.ts * 1e6, 1)} µs.</td></tr>
        <tr><td><b>Hangisi daha yavaş yükselir?</b></td><td style="color:${CASES.O.col}">Aşırı sönümlü (ζ = 2): t<sub>s</sub> = ${n4(O.ts * 1e6, 1)} µs.</td></tr>
      </table>
      ${B('tip', `İlginç: az sönümlü (${n4(U.ts * 1e6, 1)} µs) hedefe kritikten <b>daha erken çıkar</b> (t<sub>p</sub> = ${n4(U.tp * 1e6, 1)} µs) ama zıpladığı için yerleşmesi daha uzun sürer. "En hızlı ve aşmasız" sadece kritik sönümdür.`)}` });

    steps.push({ kind: 'bonus', code: '+', t: 'Keşfet: R\'yi değiştir, sönümü izle', chk: [], html: () => `
      ${B('simple', 'R1\'in değer kutusunun üstünde fare tekerleğini çevir: R değişir, ekrandaki dalga anında değişir. Aşmanın nasıl kaybolduğunu kendi gözünle gör.')}
      <p>Şu an: toplam R = ${live('rtot')} · ζ = ${live('zeta')} · beklenen aşma ${live('thBos')} (ölçülen ${live('os2')}) · beklenen t<sub>s</sub> ${live('thBts')}</p>
      <h3>Enerji gözüyle (Prelab 5.2)</h3>
      <ul>
        <li>Kondansatör enerjisi ½·C·Vo², bobin enerjisi ½·L·i². Vo tepedeyken akım 0'dır: <b>bütün enerji kondansatörde</b>. Vo hedefi en hızlı geçerken akım en büyüktür: <b>enerji bobinde</b>.</li>
        <li>Bu iki depo enerjiyi sürekli birbirine paslar → salınım. Pas sıklığı ω<sub>0</sub> = 1/√(LC) ile belirlenir.</li>
        <li>Direnç her paslaşmada R·i² kadar gücü <b>ısıya</b> çevirir. Küçük R: az kayıp → çok tur zıplar, aşma büyük, yerleşme uzun. Kritik R: enerji ilk turu tamamlayamadan tükenir → aşma yok, en hızlı. Büyük R: akım çok kısılır, kondansatör yavaş dolar → yerleşme yine uzar.</li>
      </ul>
      ${splanePic()}
      ${acts(toTh)}` });

    steps.push({ kind: 'end', code: '✓', t: 'Tabloyu tamamla, hata analizi ve rapor', chk: ['t1'], html: () => `
      <ol class="steps">
        <li data-chk="t1"><b>📋 Tablolar</b> sekmesinde Table 1'in Simulation sütunu dolu olmalı. ${acts(`<button data-tab="tables">📋 Tablolara git</button>`)}</li>
        <li>Ekran görüntüleri: her durum için bir tane (kenar + yerleşme görünsün) ve G5'teki üçlü karşılaştırma. ${acts(show('hardcopy'), doit('img', '📷 Görüntü al'))}</li>
      </ol>
      <h3>Hata yüzdesi (Prelab 5.1)</h3>
      <div class="formula">Error (%) = |teorik − simülasyon| / |teorik| × 100</div>
      <p>Teorik değeri <b>sıfır</b> olan aşmalarda (kritik, aşırı) yüzde hesaplanamaz: <b>yüzde puan farkını</b> yaz (ör. ölçülen 0.4 % → fark 0.4 puan).</p>
      <h3>Fark %5'i geçerse ne yazarım?</h3>
      <ul>
        <li><b>Direnç seçimi</b>: standart değer kullandıysan (ör. 470 Ω, 910 Ω, 1.8 kΩ) ζ değişir. Jeneratörün <b>50 Ω</b>'u ve bobinin kendi direnci (gerçek bobinde birkaç Ω – onlarca Ω) da seriye eklenir.</li>
        <li><b>Kaynağın sonlu yükselme süresi</b>: gerçek kare dalga anında zıplamaz; kenar yavaşsa aşma azalır.</li>
        <li><b>Simülasyon zaman adımı</b>: adım büyükse tepe kaçırılır (aşma küçük çıkar).</li>
        <li><b>İmleç konumlandırma</b>: ±%2 bandı çok dar (${n4(0.04 * V, 2)} V), birkaç ADC basamağı. 8 bit osiloskopta t<sub>s</sub> ±1 µs oynayabilir.</li>
        <li><b>Bileşen toleransı</b>: L ±%10, C ±%5–10 → ω<sub>0</sub> ve Rcrit değişir.</li>
        <li><b>Prob</b>: ×10 probun ~10–15 pF'ı C1'e (4.7 nF) paralel eklenir (%0.3, küçük).</li>
      </ul>
      <h3>Rapor kontrol listesi</h3>
      <ul>
        <li>☐ Şema (Şekil 1) ve üç R için etiketli Vi, Vo grafikleri</li>
        <li>☐ KVL → diferansiyel denklem → H(s) türetmesi, ω<sub>0</sub>, ζ, Rcrit (${acts(toCalc)})</li>
        <li>☐ Her durum için karakteristik kökler ve basamak yanıtı formülü</li>
        <li>☐ MATLAB kodu ve grafikleri (hazır kod: 🧮 Teorik hesaplar → en alt)</li>
        <li>☐ Table 1, hata analizi, sönüm ve enerji tartışması (Td ↔ ω<sub>d</sub> karşılaştırması)</li>
      </ul>` });
    return steps;
  }

  /* -------- tablolar -------- */
  const ROWS4 = () => {
    const v = rlcVals(), V = tVi(), U = thCase('U'), C = thCase('C'), O = thCase('O');
    return [
      ['rcrit', 'Critical resistance Rcrit (Ω)', v.Rc, 1],
      ['f0', 'Natural frequency f0 (kHz)', U.f0 / 1000, 3],
      ['rU', 'Underdamped Runder (Ω)', U.R, 1],
      ['zU', 'Underdamped ratio ζ', U.z, 3],
      ['vpk', 'Underdamped first peak Vo,peak (V)', U.peak * V, 3],
      ['os', 'Underdamped overshoot (%)', U.os, 2],
      ['tsU', 'Underdamped settling time (μs)', U.ts * 1e6, 2],
      ['tsC', 'Critical settling time (μs)', C.ts * 1e6, 2],
      ['rO', 'Overdamped Rover (Ω)', O.R, 1],
      ['tsO', 'Overdamped settling time (μs)', O.ts * 1e6, 2],
    ];
  };
  const pctErr = (m, th) => Math.abs(th - m) / Math.abs(th) * 100;
  function rlcTables() {
    const T = dat4(), U = thCase('U');
    const errCell = (m, th) => { if (!isFinite(m)) return '<td class="err"></td>'; const e = pctErr(m, th); return `<td class="err ${e <= 5 ? 'good' : 'bad'}">${e.toFixed(2)}%</td>`; };
    const inp = (attr, k, m, dg) => `<input data-${attr}="${k}" value="${isFinite(m) ? (+m).toFixed(dg) : ''}" placeholder="—">`;
    const rows = ROWS4().map(([k, lbl, th, dg]) => `<tr><td>${lbl}</td><td class="th">${(+th).toFixed(dg)}</td>
      <td>${inp('t1', k, T.t1[k], dg)}</td>${errCell(T.t1[k], th)}<td>${inp('ex', k, T.ex[k], dg)}</td>${errCell(T.ex[k], th)}</tr>`).join('');
    const pp = (m) => isFinite(m) ? `<td class="err ${Math.abs(m) <= 1 ? 'good' : 'bad'}">${Math.abs(m).toFixed(2)} puan</td>` : '<td class="err"></td>';
    const x = T.x;
    return `<h3>Table 1 — Theoretical, simulated and experimental comparison</h3>
      <table class="lab"><tr><th>Parameter</th><th>Theoretical</th><th>Simulation</th><th>Hata</th><th>Experimental</th><th>Hata</th></tr>${rows}</table>
      <p class="muted">Teori: ideal kaynak, toplam seri direnç = Prelab'daki R. Hata = |teorik − ölçüm| / |teorik| × 100 (Prelab 5.1). <b>Experimental</b> sütununu laboratuvarda doldur.</p>
      <h3>Ek ölçümler (5.1 sıfır aşmalar · 5.2 sönüm analizi)</h3>
      <table class="lab"><tr><th>Büyüklük</th><th>Teori</th><th>Ölçüm</th><th>Fark</th></tr>
        <tr><td>Salınım periyodu Td (µs) — 2 × (tepe → çukur)</td><td class="th">${n4(U.Td * 1e6, 3)}</td><td>${inp('x', 'td', x.td, 3)}</td>${errCell(x.td, U.Td * 1e6)}</tr>
        <tr><td>Sönümlü frekans f<sub>d</sub> = 1/Td (kHz)</td><td class="th">${n4(U.fd / 1000, 3)}</td><td>${isFinite(x.td) ? n4(1000 / x.td, 3) : '—'}</td>${errCell(isFinite(x.td) ? 1000 / x.td : NaN, U.fd / 1000)}</tr>
        <tr><td>Kritik sönümlü aşma (%)</td><td class="th">0</td><td>${inp('x', 'osC', x.osC, 2)}</td>${pp(x.osC)}</tr>
        <tr><td>Aşırı sönümlü aşma (%)</td><td class="th">0</td><td>${inp('x', 'osO', x.osO, 2)}</td>${pp(x.osO)}</tr>
        <tr><td>Kritik durumda kullanılan toplam R (Ω)</td><td class="th">${n4(rlcVals().Rc, 1)}</td><td>${inp('x', 'rC', x.rC, 1)}</td>${errCell(x.rC, rlcVals().Rc)}</tr>
      </table>
      <p class="muted">Kritik ve aşırı sönümlüde "first peak" = <b>N/A</b>. Sıfır beklenen aşmalarda fark yüzde puan olarak verilir.</p>`;
  }
  function rlcText(n) {
    const T = dat4(), x = (v, dg) => isFinite(v) ? (+v).toFixed(dg) : '';
    if (n === 1) return ['Parameter\tTheoretical Value\tSimulation Value\tExperimental Value', ...ROWS4().map(([k, lbl, th, dg]) => `${lbl}\t${(+th).toFixed(dg)}\t${x(T.t1[k], dg)}\t${x(T.ex[k], dg)}`)].join('\n');
    const U = thCase('U');
    return ['Quantity\tTheoretical\tSimulation',
      `Damped period Td (us)\t${n4(U.Td * 1e6)}\t${x(T.x.td, 3)}`,
      `Damped frequency fd (kHz)\t${n4(U.fd / 1000)}\t${isFinite(T.x.td) ? n4(1000 / T.x.td) : ''}`,
      `Critical overshoot (%)\t0\t${x(T.x.osC, 2)}`, `Overdamped overshoot (%)\t0\t${x(T.x.osO, 2)}`].join('\n');
  }

  /* -------- teori sekmesi -------- */
  function rlcTheory() {
    const d = D(), inf = I(), v = rlcVals(), U = thCase('U');
    return `<h2>🧠 Teori — ${d.title}</h2>
      ${B('simple', inf.simple)}
      <div class="formula">${Circuits.diagram()}</div>
      <h3>Neden salınır? (enerji alışverişi)</h3><p>${inf.why}</p>
      <table><tr><th></th><th>Kondansatör C</th><th>Bobin L</th><th>Direnç R</th></tr>
        <tr><td>Ne yapar?</td><td>Gerilimi aniden değişmez</td><td>Akımı aniden değişmez</td><td>Enerjiyi ısıya çevirir</td></tr>
        <tr><td>Enerji</td><td>½·C·v²</td><td>½·L·i²</td><td>p = R·i² (kayıp)</td></tr>
        <tr><td>Bağıntı</td><td>i = C·dv/dt</td><td>v = L·di/dt</td><td>v = R·i</td></tr></table>
      <h3>Denklem ve transfer fonksiyonu</h3>
      <div class="formula">LC·Vo'' + RC·Vo' + Vo = Vi &nbsp;→&nbsp; H(s) = Vo(s)/Vi(s) = 1 / (LCs² + RCs + 1) = ω<sub>0</sub>² / (s² + 2ζω<sub>0</sub>s + ω<sub>0</sub>²)</div>
      <div class="formula">ω<sub>0</sub> = 1/√(LC) = <b>${sci(v.w0)} rad/s</b> (f<sub>0</sub> = ${n4(v.w0 / 2 / Math.PI / 1000, 2)} kHz) · ζ = (R/2)·√(C/L) · R<sub>crit</sub> = 2√(L/C) = <b>${n4(v.Rc, 1)} Ω</b></div>
      <h3>Üç durum</h3>
      <table><tr><th>Durum</th><th>ζ</th><th>Kökler s<sub>1,2</sub> = −α ± √(α² − ω<sub>0</sub>²)</th><th>Yanıt</th></tr>
        <tr><td style="color:${CASES.U.col}">Az sönümlü</td><td>&lt; 1</td><td>karmaşık eşlenik: −α ± jω<sub>d</sub></td><td>aşar, salınır</td></tr>
        <tr><td style="color:${CASES.C.col}">Kritik</td><td>= 1</td><td>çift gerçek: −ω<sub>0</sub></td><td>aşmaz, en hızlı</td></tr>
        <tr><td style="color:${CASES.O.col}">Aşırı</td><td>&gt; 1</td><td>iki farklı gerçek</td><td>aşmaz, yavaş</td></tr></table>
      <p class="muted">α = R/(2L) "sönüm hızı", ω<sub>d</sub> = ω<sub>0</sub>√(1 − ζ²) "sönümlü açısal frekans".</p>
      ${stepPic()}
      ${splanePic()}
      <h3>🧮 Hesap makinesi (herhangi bir R için)</h3>
      <div class="calc"><span>Toplam R (Ω)</span><input id="c4R" value="${n4(U.R, 1)}"><span>V<sub>SQ</sub> (V)</span><input id="c4V" value="${tVi()}">
        <span>ζ</span><b id="o4z"></b><span>Durum</span><b id="o4k"></b><span>Kökler</span><b id="o4s"></b><span>Aşma</span><b id="o4os"></b><span>İlk tepe</span><b id="o4pk"></b><span>t<sub>s</sub> (%2)</span><b id="o4ts"></b><span>Td</span><b id="o4td"></b></div>
      ${B('tip', 'L ve C tezgâhtaki değerlerden alınır. Bir bileşeni değiştirirsen bütün teori de değişir.')}`;
  }
  function calc4() {
    const g = (id) => { const e = document.getElementById(id); return e ? Units.parse(e.value) : NaN; };
    const o = (id, t) => { const el = document.getElementById(id); if (el) el.innerHTML = t; };
    const R = g('c4R'), V = g('c4V'), v = rlcVals();
    if (!(R > 0) || !(V > 0)) { o('o4z', '?'); return; }
    const th = stepTh(R, v.L, v.C);
    o('o4z', th.z.toFixed(4)); o('o4k', { U: 'Az sönümlü', C: 'Kritik', O: 'Aşırı sönümlü' }[th.kind]);
    o('o4s', th.kind === 'U' ? `−${sci(th.a)} ± j${sci(th.wd)}` : th.kind === 'C' ? `−${sci(th.w0)} (çift)` : `${sci(th.s[0])}, ${sci(th.s[1])}`);
    o('o4os', th.os.toFixed(2) + ' %'); o('o4pk', th.kind === 'U' ? fmt(th.peak * V, 'V', 4) + ` (t = ${fmt(th.tp, 's', 3)})` : 'N/A');
    o('o4ts', fmt(th.ts, 's', 4)); o('o4td', th.kind === 'U' ? fmt(th.Td, 's', 4) : '—');
  }

  /* -------- teorik hesaplar sekmesi -------- */
  function matlabCode() {
    const v = rlcVals();
    return `% EE212 Prelab 4 - Seri RLC basamak yaniti (Vo = C1 gerilimi)
L = ${v.L}; C = ${v.C}; VSQ = ${tVi()};
Rcrit = 2*sqrt(L/C);                 % kritik direnc
R = [0.5 1 2]*Rcrit;                 % az / kritik / asiri sonumlu
w0 = 1/sqrt(L*C);
t = linspace(0, 60e-6, 6001);        % 0 ... 60 us
names = {'Underdamped','Critically damped','Overdamped'};
figure; hold on; grid on;
plot(t*1e6, VSQ*ones(size(t)), 'k:', 'LineWidth', 1);   % giris basamagi
for k = 1:3
    a = R(k)/(2*L); z = a/w0;
    if abs(z-1) < 1e-9
        y = 1 - (1 + w0*t).*exp(-w0*t);
    elseif z < 1
        wd = w0*sqrt(1 - z^2);
        y = 1 - exp(-a*t).*(cos(wd*t) + a/wd*sin(wd*t));
    else
        s1 = -a + sqrt(a^2 - w0^2); s2 = -a - sqrt(a^2 - w0^2);
        y = 1 - (s2*exp(s1*t) - s1*exp(s2*t))/(s2 - s1);
    end
    Vo = VSQ*y;
    plot(t*1e6, Vo, 'LineWidth', 1.6);
    out = find(abs(y - 1) > 0.02, 1, 'last');            % +-2% bandindan son cikis
    fprintf('%-18s R = %7.1f ohm  zeta = %.2f  peak = %.3f V  OS = %5.2f %%  ts = %6.2f us\\n', ...
        names{k}, R(k), z, max(Vo), (max(y) - 1)*100*(max(y) > 1), t(out + 1)*1e6);
end
yline(0.98*VSQ, '--'); yline(1.02*VSQ, '--');
xlabel('t (\\mus)'); ylabel('V_o (V)');
legend(['V_i', names, {'\\pm2% band'}], 'Location', 'southeast');
title('Series RLC step response (V_o across C_1)');

% Control System Toolbox varsa ayni sonuc:
% H = tf(1, [L*C R(1)*C 1]); stepinfo(VSQ*H, 'SettlingTimeThreshold', 0.02)`;
  }
  function rlcCalc() {
    const v = rlcVals(), V = tVi(), U = thCase('U'), C = thCase('C'), O = thCase('O'), w0 = v.w0;
    const LC = v.L * v.C, n = n4;
    const caseBlock = (k, th) => {
      const R = th.R, a = th.a;
      let roots, resp, ex;
      if (k === 'U') {
        roots = `α² − ω<sub>0</sub>² = ${sci(a * a)} − ${sci(w0 * w0)} &lt; 0 → <b>karmaşık eşlenik</b><br>s<sub>1,2</sub> = −α ± jω<sub>d</sub>, ω<sub>d</sub> = √(ω<sub>0</sub>² − α²) = <b>${sci(th.wd)} rad/s</b><br>s<sub>1,2</sub> = <b>−${sci(a)} ± j${sci(th.wd)} 1/s</b>`;
        resp = `Genel çözüm: Vo = V<sub>SQ</sub> + e<sup>−αt</sup>(A·cos ω<sub>d</sub>t + B·sin ω<sub>d</sub>t)<br>Vo(0) = 0 → A = −V<sub>SQ</sub> &nbsp;·&nbsp; i(0) = C·Vo'(0) = 0 → −αA + ω<sub>d</sub>B = 0 → B = −V<sub>SQ</sub>·α/ω<sub>d</sub><br><b>Vo(t) = ${V}·[1 − e<sup>−${sci(a)}t</sup>(cos(${sci(th.wd)}t) + ${n(a / th.wd, 4)}·sin(${sci(th.wd)}t))] V</b>`;
        ex = `İlk tepe: Vo' = 0 → t<sub>p</sub> = π/ω<sub>d</sub> = <b>${n(th.tp * 1e6, 3)} µs</b><br>%OS = 100·e<sup>−απ/ω<sub>d</sub></sup> = 100·e<sup>−πζ/√(1−ζ²)</sup> = <b>${n(th.os, 2)} %</b> → Vo,peak = ${V}·(1 + ${n(th.os / 100, 4)}) = <b>${n(th.peak * V)} V</b><br>Td = 2π/ω<sub>d</sub> = <b>${n(th.Td * 1e6, 3)} µs</b> (f<sub>d</sub> = ${n(th.fd / 1000, 3)} kHz)<br>t<sub>s</sub> (%2, tam) = <b>${n(th.ts * 1e6, 2)} µs</b> · yaklaşık 4/α = ${n(th.tsApprox * 1e6, 2)} µs`;
      } else if (k === 'C') {
        roots = `α = ω<sub>0</sub> → α² − ω<sub>0</sub>² = 0 → <b>çift gerçek kök</b> s<sub>1</sub> = s<sub>2</sub> = −ω<sub>0</sub> = <b>−${sci(w0)} 1/s</b>`;
        resp = `Genel çözüm: Vo = V<sub>SQ</sub> + (A + Bt)e<sup>−ω<sub>0</sub>t</sup><br>Vo(0) = 0 → A = −V<sub>SQ</sub> &nbsp;·&nbsp; Vo'(0) = 0 → B − ω<sub>0</sub>A = 0 → B = −ω<sub>0</sub>V<sub>SQ</sub><br><b>Vo(t) = ${V}·[1 − (1 + ${sci(w0)}t)·e<sup>−${sci(w0)}t</sup>] V</b>`;
        ex = `Aşma yok (Vo' ≥ 0 her zaman) → first peak = <b>N/A</b><br>t<sub>s</sub>: (1 + x)e<sup>−x</sup> = 0.02 → x = 5.834 → t<sub>s</sub> = 5.834/ω<sub>0</sub> = <b>${n(th.ts * 1e6, 2)} µs</b>`;
      } else {
        const [s1, s2] = th.s;
        roots = `α² − ω<sub>0</sub>² = ${sci(a * a - w0 * w0)} &gt; 0 → <b>iki farklı gerçek kök</b><br>s<sub>1</sub> = −α + √(α² − ω<sub>0</sub>²) = <b>${sci(s1)} 1/s</b> · s<sub>2</sub> = −α − √(α² − ω<sub>0</sub>²) = <b>${sci(s2)} 1/s</b>`;
        resp = `Genel çözüm: Vo = V<sub>SQ</sub> + A·e<sup>s<sub>1</sub>t</sup> + B·e<sup>s<sub>2</sub>t</sup><br>Vo(0) = 0 → A + B = −V<sub>SQ</sub> &nbsp;·&nbsp; Vo'(0) = 0 → s<sub>1</sub>A + s<sub>2</sub>B = 0 → A = −V<sub>SQ</sub>·s<sub>2</sub>/(s<sub>2</sub> − s<sub>1</sub>) = ${n(-V * s2 / (s2 - s1), 4)}, B = V<sub>SQ</sub>·s<sub>1</sub>/(s<sub>2</sub> − s<sub>1</sub>) = ${n(V * s1 / (s2 - s1), 4)}<br><b>Vo(t) = ${V} − ${n(V * s2 / (s2 - s1), 4)}·e<sup>${sci(s1)}t</sup> + ${n(V * s1 / (s2 - s1), 4)}·e<sup>${sci(s2)}t</sup> V</b>`;
        ex = `Aşma yok → first peak = <b>N/A</b><br>Yavaş kök baskın: t<sub>s</sub> ≈ 4/|s<sub>1</sub>| = ${n(th.tsApprox * 1e6, 2)} µs · tam (%2) = <b>${n(th.ts * 1e6, 2)} µs</b>`;
      }
      return cstep(1, 'Direnç ve sönüm oranı', `<div class="formula">R = ${CASES[k].k} × R<sub>crit</sub> = <b>${n(R, 1)} Ω</b> · α = R/(2L) = <b>${sci(a)} 1/s</b> · ζ = α/ω<sub>0</sub> = <b>${n(th.z, 3)}</b></div>`)
        + cstep(2, 'Karakteristik kökler', `<div class="formula">${roots}</div>`)
        + cstep(3, 'Basamak yanıtı (0 → V<sub>SQ</sub>, sıfır başlangıç koşulu)', `<div class="formula">${resp}</div>`)
        + cstep(4, 'Tepe, aşma, yerleşme', `<div class="formula">${ex}</div>`, k === 'U' ? `Vo,peak = ${n(th.peak * V)} V · OS = ${n(th.os, 2)} % · t<sub>s</sub> = ${n(th.ts * 1e6, 2)} µs` : `t<sub>s</sub> = ${n(th.ts * 1e6, 2)} µs`);
    };
    return `<h2>🧮 Teorik hesaplamalar — ${D().title}</h2>
      ${B('simple', 'Prelab Table 1\'in <b>Theoretical Value</b> sütunu ve Prelab\'ın istediği türetmeler. Her adım sayılarla. Rapora bu sırayla yazabilirsin.')}
      ${viSel4()}
      <h3>Kısaca sonuçlar (Theoretical sütunu)</h3>
      <table class="lab"><tr><th>Table 1 satırı</th><th>Theoretical</th></tr>
        ${ROWS4().map(([, lbl, th, dg]) => `<tr><td>${lbl}</td><td class="th"><b>${(+th).toFixed(dg)}</b></td></tr>`).join('')}</table>

      <h3>0) Elimizdeki değerler</h3>
      <table><tr><td>L1</td><td><b>${sci(v.L)} H</b></td></tr><tr><td>C1</td><td><b>${sci(v.C)} F</b></td></tr>
        <tr><td>V<sub>SQ</sub> (basamak boyu)</td><td><b>${V} V</b> (0 → ${V} V)</td></tr><tr><td>Kare dalga</td><td>T = 200 µs, 5 kHz, her yarı 100 µs</td></tr></table>

      <h3>1) Diferansiyel denklem (KVL)</h3>
      ${cstep(1, 'Halkada gerilimlerin toplamı', `<div class="formula">Vi = v<sub>R</sub> + v<sub>L</sub> + Vo</div><p class="muted">Seri devre: R1, L1 ve C1'den aynı akım i(t) geçer.</p>`)}
      ${cstep(2, 'Her gerilimi Vo ile yaz', `<div class="formula">i = C·dVo/dt<br>v<sub>R</sub> = R·i = RC·dVo/dt<br>v<sub>L</sub> = L·di/dt = LC·d²Vo/dt²</div>`)}
      ${cstep(3, 'Yerine koy', `<div class="formula"><b>LC·d²Vo/dt² + RC·dVo/dt + Vo = Vi</b><br>LC'ye böl: d²Vo/dt² + (R/L)·dVo/dt + (1/LC)·Vo = (1/LC)·Vi</div>`, 'Devrenin diferansiyel denklemi')}

      <h3>2) Transfer fonksiyonu H(s)</h3>
      ${cstep(1, 'Laplace (başlangıç koşulları sıfır): d/dt → s', `<div class="formula">(LCs² + RCs + 1)·Vo(s) = Vi(s)</div>`)}
      ${cstep(2, 'Oran', `<div class="formula"><b>H(s) = Vo(s)/Vi(s) = 1 / (LCs² + RCs + 1) = (1/LC) / (s² + (R/L)s + 1/LC)</b></div>`)}
      ${cstep(3, 'Standart 2. derece biçimle karşılaştır', `<div class="formula">H(s) = ω<sub>0</sub>² / (s² + 2ζω<sub>0</sub>s + ω<sub>0</sub>²) → ω<sub>0</sub>² = 1/LC · 2ζω<sub>0</sub> = R/L</div><p class="muted">Karakteristik denklem: paydanın sıfırı → s² + (R/L)s + 1/LC = 0.</p>`)}

      <h3>3) ω<sub>0</sub>, f<sub>0</sub>, ζ ve R<sub>crit</sub></h3>
      ${cstep(1, 'Doğal (sönümsüz) frekans', `<div class="formula">LC = ${sci(v.L)} × ${sci(v.C)} = ${sci(LC)} s² · √LC = ${sci(Math.sqrt(LC))} s<br>ω<sub>0</sub> = 1/√LC = <b>${sci(w0)} rad/s</b> · f<sub>0</sub> = ω<sub>0</sub>/2π = <b>${n(w0 / 2 / Math.PI / 1000, 3)} kHz</b></div>`, `f0 = ${n(w0 / 2 / Math.PI / 1000, 3)} kHz`)}
      ${cstep(2, 'Sönüm oranı', `<div class="formula">2ζω<sub>0</sub> = R/L → ζ = R/(2Lω<sub>0</sub>) = <b>(R/2)·√(C/L)</b></div>`)}
      ${cstep(3, 'Kritik direnç (ζ = 1)', `<div class="formula">R<sub>crit</sub> = 2·√(L/C) = 2·√(${sci(v.L)} / ${sci(v.C)}) = 2·√${sci(v.L / v.C)} = 2 × ${n(Math.sqrt(v.L / v.C), 2)} = <b>${n(v.Rc, 2)} Ω</b></div>`, `Rcrit = ${n(v.Rc, 1)} Ω`)}
      ${cstep(4, 'Üç direnç', `<table><tr><th></th><th>R</th><th>ζ</th></tr><tr><td style="color:${CASES.U.col}">R<sub>under</sub> = 0.5·R<sub>crit</sub></td><td><b>${n(U.R, 1)} Ω</b></td><td>0.5</td></tr><tr><td style="color:${CASES.C.col}">R<sub>critical</sub> = R<sub>crit</sub></td><td><b>${n(C.R, 1)} Ω</b></td><td>1</td></tr><tr><td style="color:${CASES.O.col}">R<sub>over</sub> = 2·R<sub>crit</sub></td><td><b>${n(O.R, 1)} Ω</b></td><td>2</td></tr></table>
        ${store.rg4 === 'ideal' ? '' : '<p class="muted">Tezgâhta/laboratuvarda R1 = R − 50 Ω (jeneratörün 50 Ω\'u seride).</p>'}`)}

      <h3 style="color:${CASES.U.col}">4) Az sönümlü (R = ${n(U.R, 1)} Ω)</h3>${caseBlock('U', U)}
      <h3 style="color:${CASES.C.col}">5) Kritik sönümlü (R = ${n(C.R, 1)} Ω)</h3>${caseBlock('C', C)}
      <h3 style="color:${CASES.O.col}">6) Aşırı sönümlü (R = ${n(O.R, 1)} Ω)</h3>${caseBlock('O', O)}

      <h3>7) Grafik ve karşılaştırma</h3>
      ${stepPic()}
      ${cstep(1, 'Her yanıt bir sonraki kenardan önce yerleşiyor mu?', `<p>En uzun t<sub>s</sub> = ${n(O.ts * 1e6, 1)} µs &lt; yarım periyot 100 µs → <b>evet</b>. Her yükselen kenar sıfır başlangıç koşullu bir basamaktır.</p>`)}
      ${cstep(2, 'Prelab sorusu', `<p><b style="color:${CASES.U.col}">Salınan</b>: az sönümlü · <b style="color:${CASES.C.col}">Aşmadan en hızlı</b>: kritik · <b style="color:${CASES.O.col}">En yavaş yükselen</b>: aşırı sönümlü.</p>`)}

      <h3>8) Sönüm ve enerji (Prelab 5.2)</h3>
      ${cstep(1, 'Ardışık iki tepe arası', `<div class="formula">Td = 2π/ω<sub>d</sub> = <b>${n(U.Td * 1e6, 3)} µs</b> → f<sub>d</sub> = ${n(U.fd / 1000, 3)} kHz (f<sub>0</sub> = ${n(U.f0 / 1000, 3)} kHz'ten √(1−ζ²) = ${n(Math.sqrt(1 - U.z * U.z), 4)} kat küçük)</div><p>Ardışık tepeler arası = Td. ζ = 0.5'te ikinci tepe çok küçük (+%${n(U.os ** 3 / 1e4, 2)}) olduğundan ölçümde tepe → çukur (Td/2) alınıp 2 ile çarpılır. Ayrıca ilk tepe zamanı t<sub>p</sub> = Td/2 = ${n(U.tp * 1e6, 3)} µs.</p>`)}
      ${cstep(2, 'Enerji yorumu', `<p>Enerji kondansatör (½CVo²) ile bobin (½Li²) arasında gidip gelir. R her turda R·i² kadar ısıya çevirir. R küçük → kayıp az → çok tur, büyük aşma, uzun t<sub>s</sub>. R = R<sub>crit</sub> → enerji ilk turu tamamlamadan biter: aşmasız en hızlı. R büyük → akım kısılır, C yavaş dolar: t<sub>s</sub> yine uzar.</p>`)}

      <h3>9) MATLAB kodu (Prelab: "share your code")</h3>
      <p>Toolbox gerekmez. Üç yanıtı çizer, ζ, tepe, aşma ve t<sub>s</sub>'yi yazdırır. ${acts(doit('copyM', '📋 Kodu kopyala'))}</p>
      <pre class="code">${matlabCode().replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>

      <h3>10) Hata yüzdesi (Prelab 5.1)</h3>
      <div class="formula">Error (%) = |teorik − simülasyon| / |teorik| × 100<br>Örnek: teori ${n(U.os, 2)} %, simülasyon ${n(U.os * 0.97, 2)} % → |${n(U.os, 2)} − ${n(U.os * 0.97, 2)}| / ${n(U.os, 2)} × 100 = <b>3.00 %</b></div>
      <p>Sıfır beklenen aşma için yüzde puan farkı yazılır.</p>
      ${B('tip', 'Bütün sayılar tezgâhtaki L1, C1 ve seçtiğin V<sub>SQ</sub>\'dan hesaplanır.')}`;
  }

  /* -------- 🎖️ Brifing: lab sırasında sorulacak teori, formüller ve türetmeleri (sade, emir kipinde) -------- */
  function briefHtml() {
    const v = rlcVals(), V = tVi(), U = thCase('U'), C = thCase('C'), O = thCase('O'), n = n4;
    const rg = store.rg4 === 'ideal' ? 0 : 50;
    const SEC = (no, title, cmd, body) => `<section class="sec"><h3><span class="sno">${no}</span><span>${title}</span></h3>${cmd ? `<div class="cmd">${cmd}</div>` : ''}${body}</section>`;
    const DRV = (...l) => `<div class="drv">${l.join('<br>')}</div>`;
    const KEY = (h) => `<div class="key">${h}</div>`;
    const ofs = O.s[1] / (O.s[1] - O.s[0]);
    return `<div class="brief">
      <div class="bhead"><h2>🎖️ Lab 4 Brifingi</h2>${acts(doit('printBrief', '🖨 Yazdır / PDF'))}</div>
      <p class="lead">Dinle. Bugün tek bir şey yapıyoruz: <b>aynı L ve C ile R'yi değiştirip kondansatör geriliminin bir basamağa nasıl cevap verdiğini ölçmek</b>. Hoca aşağıdakilerin dışına çıkmaz. Sırayla oku, türetmeyi anla, kutulu formülleri deftere yaz.</p>

      ${SEC('0', 'Hedef', '<b>Objektif:</b> az, kritik ve aşırı sönümü göster; aşmayı ve %2 yerleşme süresini ölç; teoriyle karşılaştır.', `
        <p>R, devrenin ne kadar zıplayacağını <b>tek başına</b> belirler. Bu yüzden önce sınırı, yani <b>R<sub>crit</sub></b>'i buluyoruz. Sonra R'yi bu sınırın 0.5, 1 ve 2 katına kuruyoruz.</p>
        <table><tr><td>L</td><td><b>${fmt(v.L, 'H')}</b></td><td>C</td><td><b>${fmt(v.C, 'F')}</b></td></tr>
        <tr><td>Giriş</td><td><b>0 → ${V} V</b> kare</td><td>f</td><td><b>5 kHz</b> (her yarı 100 µs)</td></tr>
        <tr><td>Çıkış Vo</td><td colspan="3"><b>C üzerindeki gerilim</b></td></tr></table>`)}

      ${SEC('1', 'Devre denklemi', '▶ Vo için diferansiyel denklemi kur. Her şey buradan çıkıyor.', `
        ${DRV('Tek halka, tek akım. KVL: &nbsp;V<sub>i</sub> = v<sub>R</sub> + v<sub>L</sub> + V<sub>o</sub>',
          'Kondansatör: &nbsp;i = C·dV<sub>o</sub>/dt',
          'Direnç: &nbsp;v<sub>R</sub> = R·i = RC·dV<sub>o</sub>/dt',
          'Bobin: &nbsp;v<sub>L</sub> = L·di/dt = LC·d²V<sub>o</sub>/dt²')}
        ${KEY('LC·V<sub>o</sub>″ + RC·V<sub>o</sub>′ + V<sub>o</sub> = V<sub>i</sub>')}`)}

      ${SEC('2', 'Transfer fonksiyonu → ω<sub>0</sub> ve ζ', '▶ Laplace al, standart 2. derece biçimle eşle.', `
        ${DRV('Başlangıç koşulları sıfır, d/dt → s: &nbsp;(LCs² + RCs + 1)·V<sub>o</sub>(s) = V<sub>i</sub>(s)')}
        ${KEY('H(s) = V<sub>o</sub>/V<sub>i</sub> = 1 / (LCs² + RCs + 1) = (1/LC) / (s² + (R/L)s + 1/LC)')}
        ${DRV('Standart biçim: &nbsp;ω<sub>0</sub>² / (s² + 2ζω<sub>0</sub>s + ω<sub>0</sub>²). Katsayıları eşle:',
          'ω<sub>0</sub>² = 1/LC &nbsp;&nbsp;·&nbsp;&nbsp; 2ζω<sub>0</sub> = R/L')}
        ${KEY(`ω<sub>0</sub> = 1/√(LC) &nbsp;&nbsp;&nbsp; ζ = (R/2)·√(C/L) &nbsp;&nbsp;&nbsp; α = R/(2L) = ζω<sub>0</sub>`)}
        ${DRV(`ω<sub>0</sub> = 1/√(${sci(v.L)} × ${sci(v.C)}) = <b>${sci(v.w0)} rad/s</b> &nbsp;→&nbsp; f<sub>0</sub> = ω<sub>0</sub>/2π = <b>${n(v.w0 / 2 / Math.PI / 1000, 2)} kHz</b>`)}`)}

      ${SEC('3', 'Kritik direnç', '▶ Salınımın bittiği sınırı bul.', `
        ${DRV('Karakteristik denklem: &nbsp;s² + (R/L)s + 1/LC = 0',
          'Kökler: &nbsp;s = −R/2L ± √( (R/2L)² − 1/LC )',
          'Karekökün içi sıfır olunca salınım tam biter: &nbsp;(R/2L)² = 1/LC')}
        ${KEY(`R<sub>crit</sub> = 2·√(L/C) = 2·√(${sci(v.L)} / ${sci(v.C)}) = <b>${n(v.Rc, 1)} Ω</b> &nbsp;&nbsp;(ζ = 1)`)}
        <table><tr><th></th><th>R (toplam)</th><th>ζ</th><th>Kökler</th>${rg ? '<th>Takılan R1 = R − 50</th>' : ''}</tr>
          <tr><td class="cu">Az sönümlü</td><td><b>${n(U.R, 1)} Ω</b></td><td>0.5</td><td>−${sci(U.a)} ± j${sci(U.wd)}</td>${rg ? `<td>${n(U.R - 50, 1)} Ω</td>` : ''}</tr>
          <tr><td class="cc">Kritik</td><td><b>${n(C.R, 1)} Ω</b></td><td>1</td><td>−${sci(C.w0)} (çift)</td>${rg ? `<td>${n(C.R - 50, 1)} Ω</td>` : ''}</tr>
          <tr><td class="co">Aşırı</td><td><b>${n(O.R, 1)} Ω</b></td><td>2</td><td>${sci(O.s[0])}, ${sci(O.s[1])}</td>${rg ? `<td>${n(O.R - 50, 1)} Ω</td>` : ''}</tr></table>
        <p class="muted">Kökler 1/s birimindedir. Karmaşık kök = salınım. Gerçek kök = salınım yok.</p>`)}

      ${SEC('4', 'Basamak yanıtı', '▶ Son değeri ve iki başlangıç koşulunu yaz. Formülün katsayılarını bunlar belirler.', `
        ${DRV('<b>Son değer:</b> DC\'de C açık devre, akım 0 → R ve L\'de gerilim yok → V<sub>o</sub>(∞) = V<sub>SQ</sub>',
          '<b>Koşul 1:</b> kondansatör gerilimi aniden değişmez → V<sub>o</sub>(0) = 0',
          '<b>Koşul 2:</b> bobin akımı aniden değişmez → i(0) = 0 → V<sub>o</sub>′(0) = i(0)/C = 0',
          'Çözüm = V<sub>SQ</sub> + homojen kısım. Koşulları uygula. Az sönümlü için:',
          '&nbsp;&nbsp;V<sub>o</sub> = V<sub>SQ</sub> + e<sup>−αt</sup>(A cos ω<sub>d</sub>t + B sin ω<sub>d</sub>t) &nbsp;→&nbsp; A = −V<sub>SQ</sub>, &nbsp;B = −V<sub>SQ</sub>·α/ω<sub>d</sub>')}
        ${KEY(`<span class="cu">Az:</span> &nbsp;V<sub>o</sub> = V<sub>SQ</sub>[1 − e<sup>−αt</sup>(cos ω<sub>d</sub>t + (α/ω<sub>d</sub>) sin ω<sub>d</sub>t)], &nbsp; ω<sub>d</sub> = ω<sub>0</sub>√(1 − ζ²)`)}
        ${KEY(`<span class="cc">Kritik:</span> &nbsp;V<sub>o</sub> = V<sub>SQ</sub>[1 − (1 + ω<sub>0</sub>t)·e<sup>−ω<sub>0</sub>t</sup>]`)}
        ${KEY(`<span class="co">Aşırı:</span> &nbsp;V<sub>o</sub> = V<sub>SQ</sub>[1 − (s<sub>2</sub>e<sup>s<sub>1</sub>t</sup> − s<sub>1</sub>e<sup>s<sub>2</sub>t</sup>) / (s<sub>2</sub> − s<sub>1</sub>)]`)}`)}

      ${SEC('5', 'Az sönümlü: tepe, aşma, periyot', '▶ İlk tepenin zamanını bul, yerine koy, aşmayı çıkar.', `
        ${DRV('Türev al: &nbsp;V<sub>o</sub>′ = V<sub>SQ</sub>·(ω<sub>0</sub>²/ω<sub>d</sub>)·e<sup>−αt</sup>·sin ω<sub>d</sub>t',
          'Sıfıra eşitle. İlk sıfır sin ω<sub>d</sub>t = 0, yani ω<sub>d</sub>t = π:')}
        ${KEY(`t<sub>p</sub> = π/ω<sub>d</sub> = <b>${n(U.tp * 1e6, 2)} µs</b>`)}
        ${DRV('Yerine koy: cos π = −1, sin π = 0 &nbsp;→&nbsp; V<sub>o</sub>(t<sub>p</sub>) = V<sub>SQ</sub>(1 + e<sup>−απ/ω<sub>d</sub></sup>)',
          'α/ω<sub>d</sub> = ζ/√(1 − ζ²) olduğu için:')}
        ${KEY(`%OS = 100·e<sup>−πζ/√(1−ζ²)</sup> = <b>${n(U.os, 2)} %</b> &nbsp;&nbsp; V<sub>o,peak</sub> = V<sub>SQ</sub>(1 + OS) = <b>${n(U.peak * V)} V</b>`)}
        ${DRV('Tersine çevir. Ölçtüğün aşmadan ζ bulunur, oradan da R<sub>crit</sub>:')}
        ${KEY('ζ = −ln(OS) / √(π² + ln²(OS)) &nbsp;&nbsp;&nbsp; R<sub>crit</sub> = R / ζ')}
        ${DRV('Ardışık tepeler arası süre bir sönümlü periyottur. Doğal frekansı ölçümden geri bul:')}
        ${KEY(`T<sub>d</sub> = 2π/ω<sub>d</sub> = <b>${n(U.Td * 1e6, 2)} µs</b> &nbsp; (f<sub>d</sub> = ${n(U.fd / 1000, 2)} kHz) &nbsp;&nbsp; f<sub>0</sub> = f<sub>d</sub> / √(1 − ζ²)`)}`)}

      ${SEC('6', '%2 yerleşme süresi', '▶ Tanım: kenardan sonra V<sub>o</sub> son değerin ±%2\'sine girip <b>bir daha çıkmadığı</b> an.', `
        ${DRV(`<span class="cu">Az:</span> zarf e<sup>−αt</sup> = 0.02 → t = ln 50/α ≈ 4/α = 4/(ζω<sub>0</sub>) = ${n(U.tsApprox * 1e6, 2)} µs`,
          `<span class="cc">Kritik:</span> (1 + ω<sub>0</sub>t)e<sup>−ω<sub>0</sub>t</sup> = 0.02 → ω<sub>0</sub>t = 5.834 → t = 5.834/ω<sub>0</sub>`,
          `<span class="co">Aşırı:</span> hızlı kök çabuk söner, yavaş kök (s<sub>1</sub>) kalır: [s<sub>2</sub>/(s<sub>2</sub> − s<sub>1</sub>)]·e<sup>s<sub>1</sub>t</sup> = 0.02`,
          `&nbsp;&nbsp;→ t = ln(50 × ${n(ofs, 4)}) / |s<sub>1</sub>| ≈ 4/|s<sub>1</sub>|`)}
        ${KEY(`t<sub>s</sub>: &nbsp;<span class="cu">az ${n(U.ts * 1e6, 2)} µs</span> &nbsp;·&nbsp; <span class="cc">kritik ${n(C.ts * 1e6, 2)} µs</span> &nbsp;·&nbsp; <span class="co">aşırı ${n(O.ts * 1e6, 2)} µs</span>`)}
        <p class="muted">Az sönümlüde 4/α bir yaklaşımdır. Tam değer (${n(U.ts * 1e6, 2)} µs), dalganın banda son girdiği andır. İkisini de bil.</p>`)}

      ${SEC('7', 'Sonuç kartı — Table 1 teorik sütunu', '▶ Bunu deftere çerçeve içine yaz.', `
        <table class="lab">${ROWS4().map(([, lbl, th, dg]) => `<tr><td>${lbl}</td><td class="th"><b>${(+th).toFixed(dg)}</b></td></tr>`).join('')}</table>
        ${KEY('Hata (%) = |teorik − ölçüm| / |teorik| × 100 &nbsp;·&nbsp; teorisi 0 olan aşma → yüzde puan farkı')}`)}

      ${SEC('8', 'Hoca sorarsa', '▶ Cevaplar kısa. Önce sonucu söyle, sonra tek cümleyle nedenini.', `<dl class="qa">
        <dt>Neden kare dalga?</dt><dd>Her yükselen kenar bir basamak. En uzun t<sub>s</sub> (${n(O.ts * 1e6, 0)} µs) yarım periyottan (100 µs) kısa. Yani her kenar sıfır başlangıç koşullu, temiz bir basamak.</dd>
        <dt>V<sub>o</sub>(0) = 0 ve V<sub>o</sub>′(0) = 0 nereden?</dt><dd>Kondansatör gerilimi ve bobin akımı aniden değişemez. i = C·V<sub>o</sub>′ olduğu için i(0) = 0, yani V<sub>o</sub>′(0) = 0.</dd>
        <dt>Hangisi salınır, hangisi en hızlı, hangisi en yavaş?</dt><dd>Salınan: az sönümlü (karmaşık kök). Aşmadan en hızlı: kritik. En yavaş: aşırı sönümlü.</dd>
        <dt>Kritik neden en hızlı?</dt><dd>R daha küçükse hedefi geçer ve salınım yüzünden geç yerleşir. R daha büyükse yavaş kök sıfıra yaklaşır ve geç varır. İkisinin tam sınırı kritiktir.</dd>
        <dt>R artınca ne olur?</dt><dd>ζ = (R/2)√(C/L) büyür. Aşma azalır. ζ &gt; 1'de salınım yok ama yanıt yavaşlar. ω<sub>0</sub> değişmez, çünkü R'ye bağlı değil.</dd>
        <dt>Enerji açısından ne oluyor?</dt><dd>Enerji C (½CV²) ile L (½Li²) arasında gidip gelir; bu salınımdır. R her turda R·i² kadarını ısıya çevirir. R büyüdükçe enerji salınım tamamlanmadan biter.</dd>
        <dt>f<sub>0</sub> ile f<sub>d</sub> farkı?</dt><dd>f<sub>0</sub> sönümsüz frekanstır (R = 0). f<sub>d</sub> = f<sub>0</sub>√(1 − ζ²) ekranda gördüğün salınımın frekansıdır. ζ = 0.5'te f<sub>d</sub> = 0.866·f<sub>0</sub>.</dd>
        <dt>Jeneratörün 50 Ω'u?</dt><dd>R1'e seri eklenir, toplam R'yi büyütür. O yüzden R1 = R − 50 Ω takılır. Takılmazsa az sönümlüde aşma %${n(U.os, 1)} yerine %${n(stepTh(U.R + 50, v.L, v.C).os, 1)} çıkar.</dd>
        <dt>T<sub>d</sub>'yi neden tepe → çukur ile ölçtün?</dt><dd>Her yarım salınım bir öncekinin %${n(U.os, 1)}'i. İkinci tepe sadece +%${n(U.os ** 3 / 1e4, 2)}, ekranda görünmez. Tepe → çukur = T<sub>d</sub>/2.</dd>
        <dt>Çıkış neden V<sub>SQ</sub>'ya oturuyor?</dt><dd>H(0) = 1. DC'de devre bir alçak geçirendir ve kazancı 1'dir.</dd>
        <dt>Hata kaynakları?</dt><dd>Direnç toleransı, jeneratörün 50 Ω'u ve bobinin kendi direnci (hepsi R'ye eklenir). Kaynağın sonlu yükselme süresi. Osiloskobun 8 bit çözünürlüğü (±%2 bandı birkaç basamak) ve imleç konumu. L ve C toleransı. Prob kapasitesi.</dd>
      </dl>`)}

      ${SEC('9', 'Lab\'da tuş tuş ne yapacaksın', '▶ Sadece sırayla yap. Her satır tek iş. 👀 = ekranda ne görmelisin, ✍️ = nereye yazacaksın.', (() => {
        const vd = fmt(State.VDIV[vIdx4()] * 10, 'V'), lo = n(0.98 * V, 2), hi = n(1.02 * V, 2);
        const L = (t, see) => `<li>${t}${see ? `<div class="see">👀 ${see}</div>` : ''}</li>`;
        const W = (t) => `<li class="wr">✍️ ${t}</li>`;
        const meas = (what, side) => `<b>Measure</b> tuşuna bas → ekranın <b>altındaki 1. tuşa</b> (Add Measurement) bas → <b>sağdaki 4. tuşa</b> (Source1) basarak <b>CH2</b> yap → <b>sağdaki 1. tuşa</b> (V/I) bas → <b>VARIABLE</b> düğmesini çevir, listede <b>${what}</b>'a gel → <b>Select</b>'e bas.`;
        const ts = `
          ${L('<b>Cursor</b> tuşuna bas → ekranın <b>altındaki 1. tuşa</b> (H Cursor) bas.', 'ekranda iki dikey çizgi çıkar.')}
          ${L('Ekranın <b>altındaki 3. tuşa</b> (Source) bas → sağdan <b>CH2</b>\'yi seç.', 'sol üstte küçük bir kutu var, ① ve ② satırlarında birer zaman ve birer volt yazar.')}
          ${L('<b>VARIABLE</b> düğmesini çevir → ① çizgisini <b>sarının dik yükseldiği yere</b> getir.')}
          ${L('<b>Select</b>\'e bas (artık ② çizgisi hareket eder).')}
          ${L(`<b>VARIABLE</b>'ı çevir → ② çizgisini yavaş yavaş sağa götür. Kutudaki <b>② satırının voltuna</b> bak. Volt <b>${lo} ile ${hi}</b> arasına girip <b>bir daha dışına çıkmadığı ilk yerde dur</b>.`, 'mavi çizgi o noktadan sonra dümdüz.')}`;
        const sw = (name, rTxt, extra, post = '') => `
          <h4>${name}</h4><ol class="bstep">
          ${L(`Jeneratörün çıkışını kapat (Output). Eski direnci çıkar, <b>${rTxt}</b> direnci aynı yere tak. Çıkışı tekrar aç.`)}
          ${extra}
          ${ts}
          ${W(`Kutudaki <b>Δ</b> yazan süre = <b>yerleşme süresi</b>. Tabloya yaz.`)}
          ${post}
          ${L('Ekranın solundaki <b>Hardcopy</b> tuşuna bas (resim kaydedilir, rapora koyacaksın).')}
          </ol>`;
        return `
        <h4>A) Devreyi kur</h4><ol class="bstep">
          ${L('Breadboard\'a sırayla tak: <b>direnç → bobin → kondansatör</b>. Uç uca, zincir gibi.')}
          ${L('Jeneratörün <b>kırmızı</b> kablosunu direncin boştaki ucuna, <b>siyah</b> kablosunu kondansatörün boştaki ucuna tak. Bu siyah uç = <b>toprak</b>.')}
          ${L('<b>Sarı prob</b> (CH1) ucunu jeneratörün kırmızı kablosunun olduğu yere tak.')}
          ${L('<b>Mavi prob</b> (CH2) ucunu <b>bobin ile kondansatörün birleştiği yere</b> tak.')}
          ${L('İki probun da <b>siyah timsahını</b> toprağa (jeneratörün siyah kablosu) tak.')}
        </ol>
        <h4>B) Jeneratörü ayarla</h4><ol class="bstep">
          ${L('Dalga şeklini <b>kare</b> (⊓⊔) seç.')}
          ${L('Frekansı <b>5 kHz</b> yap.')}
          ${L(`Genliği (Ampl) <b>${V} Vpp</b> yap.`)}
          ${L(`Ofseti (Offset) <b>${V / 2} V</b> yap.`)}
          ${L('Çıkışı aç (<b>Output</b> tuşu, ışığı yanar).')}
        </ol>
        <h4>C) Osiloskobu ayarla</h4><ol class="bstep">
          ${L('<b>CH2</b> tuşuna bas.', 'CH2 tuşu mavi yanar.')}
          ${L('<b>Autoset</b> tuşuna bas.', 'sarı kare dalga ve mavi dalga çıkar.')}
          ${L(`Sarıya bak: altı <b>0 V</b>, üstü <b>${V} V</b> olmalı. Değilse jeneratörün genliğini/ofsetini düzelt.`)}
          ${L('HORIZONTAL bölümündeki <b>SCALE</b> düğmesini çevir → ekranın altında <b>10µs</b> yazana kadar.')}
          ${L('HORIZONTAL <b>POSITION</b> düğmesini çevir → sarının dik yükselişi ekranın <b>soldan 2. çizgisine</b> gelene kadar.')}
          ${L(`<b>CH1 SCALE</b> ve <b>CH2 SCALE</b> düğmelerini çevir → ikisi de <b>${vd}</b> olsun.`)}
          ${L('İki <b>POSITION</b> düğmesini çevir → sarı ve mavinin alt çizgisi <b>aynı yerde</b>, ekranın altına yakın olsun.', 'sarı dik çıkıyor, mavi onun arkasından çıkıyor.')}
        </ol>
        ${sw('D) Az sönümlü — hocanın verdiği küçük direnç (≈ 470 Ω)', 'küçük', `
          ${L(meas('Max'), 'ekranın altında "CH2 Max" ve bir volt değeri çıkar.')}
          ${L(meas('ROVShoot'), 'ekranın altında "CH2 ROVShoot" ve bir yüzde çıkar.')}
          ${L('<b>Menu Off</b>\'a bas.', 'mavi dalga önce sarıyı geçiyor, sonra aşağı yukarı sallanıp duruyor.')}
          ${W('<b>CH2 Max</b> değerini → <b>Vo,peak</b> satırına yaz.')}
          ${W('<b>CH2 ROVShoot</b> değerini → <b>overshoot (%)</b> satırına yaz.')}`, `
          ${L('<b>VARIABLE</b> + <b>Select</b> ile: ① çizgisini <b>mavinin en tepesine</b>, ② çizgisini <b>hemen sonraki en dip noktaya</b> getir.')}
          ${W('Kutudaki <b>Δ</b> süresini <b>2 ile çarp</b> → bu <b>Td</b> (salınım periyodu). Not al.')}`)}
        ${sw('E) Kritik sönümlü — orta direnç (≈ 1 kΩ)', 'orta', L('Bak: mavi artık sarıyı <b>geçmiyor</b>, sallanmıyor.'))}
        ${sw('F) Aşırı sönümlü — büyük direnç (≈ 1.8 kΩ)', 'büyük', L('Bak: mavi <b>yavaş yavaş</b> çıkıyor.'))}
        <h4>G) Bitir</h4><ol class="bstep">
          ${W('Taktığın üç direncin değerini yaz (Runder, Rover satırları).')}
          ${W('Ölçtüklerini Table 1\'in <b>Experimental</b> sütununa yaz. Teorik sütun aynı kalır.')}
        </ol>`;
      })())}
    </div>`;
  }
  ACT.printBrief = () => {
    const w = window.open('', '_blank'); if (!w) return note('Açılır pencere engellendi — tarayıcıda izin ver.', 'warn');
    const body = briefHtml().replace(/<span class="acts">[\s\S]*?<\/span>/, '');
    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Lab 4 Brifingi<\/title><style>
      body{font:13px/1.5 Segoe UI,Arial,sans-serif;color:#111;max-width:820px;margin:18px auto;padding:0 14px}
      h2{margin:0 0 6px} h3{margin:0 0 6px;font-size:15px} .lead{font-size:13.5px}
      .sec{border:1px solid #bbb;border-radius:8px;padding:8px 12px;margin:10px 0;break-inside:avoid}
      .sno{display:inline-block;width:20px;height:20px;border-radius:10px;background:#111;color:#fff;text-align:center;line-height:20px;font-size:12px;margin-right:6px}
      .cmd{border-left:4px solid #d48a00;padding:3px 8px;margin:4px 0;font-weight:600;background:#fff6e5}
      .drv{font-family:Cambria,Georgia,serif;font-size:13.5px;line-height:1.7;padding:2px 8px}
      .key{font-family:Cambria,Georgia,serif;font-size:14.5px;border:2px solid #111;border-radius:6px;padding:5px 10px;margin:6px 0;text-align:center}
      table{border-collapse:collapse;margin:4px 0} td,th{border:1px solid #ccc;padding:3px 7px;text-align:left}
      dt{font-weight:700;margin-top:6px} dd{margin:1px 0 4px 14px} .muted{color:#555;font-size:12px}
      .cu{color:#c25e00}.cc{color:#16843a}.co{color:#6b3fb3} h4{margin:10px 0 4px} .bstep li{margin:3px 0} .see{color:#555;font-size:12px} .wr{list-style:none;margin-left:-16px;font-weight:600}<\/style><\/head><body>${body}<\/body><\/html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };

  /* ---------------- teorik hesaplar sekmesi ---------------- */
  const cstep = (no, title, body, res) => `<div class="cstep"><div class="ch"><span class="no">${no}</span>${title}</div>${body}${res ? `<div class="res">✅ ${res}</div>` : ''}</div>`;
  const sci = (v) => { if (!v) return '0'; const e = Math.floor(Math.log10(Math.abs(v))); return e >= -3 && e <= 4 ? String(+v.toPrecision(4)) : `${+(v / 10 ** e).toPrecision(4)} × 10<sup>${e}</sup>`; };
  function diffCalc() {
    const R = comp('R1'), C = comp('C1'), Rv = R ? R.value : 1000, Cv = C ? C.value : 1e-6, RC = Rv * Cv;
    const Vp = tVi() / 2, vs = vsatNow(), s1 = dth(1000), t100 = dth(100), w = 2 * Math.PI * 1000, fd = fdistTh();
    const rc = sci(RC), n = (v, k = 3) => (+v).toFixed(k), lim = vs / (4 * Vp * RC);
    return `<h2>🧮 Teorik hesaplamalar — ${D().title}</h2>
      ${B('simple', 'Prelab Table 1\'deki <b>Theoretical Value</b> sütununun her satırı burada sayılarla, adım adım hesaplandı. Sadece çarpma ve bölme var.')}
      ${viSel2()}
      <h3>Kısaca sonuçlar (Theoretical sütunu)</h3>
      <table class="lab"><tr><th>Table 1 satırı</th><th>Theoretical</th></tr>
        <tr><td>Sinusoidal Output Vo,peak (1 kHz)</td><td class="th"><b>${n(s1.sinPk, 2)} V</b></td></tr>
        ${SWEEP().map(f => `<tr><td>Triangular Gain |Vo/Vi| (${fq(f)})</td><td class="th"><b>${n(dth(f).av, 2)}</b></td></tr>`).join('')}
        <tr><td>Triangular Vo,max (Positive Slope)</td><td class="th"><b>${n(-t100.lvl)} V</b></td></tr>
        <tr><td>Triangular Vo,max (Negative Slope)</td><td class="th"><b>+${n(t100.lvl)} V</b></td></tr>
        <tr><td>First distorted frequency</td><td class="th"><b>none</b> (ideal)</td></tr></table>

      <h3>0) Elimizdeki değerler</h3>
      <table>
        <tr><td>R1</td><td>${fmt(Rv, 'Ω')} = <b>${sci(Rv)} Ω</b></td></tr>
        <tr><td>C1</td><td>${fmt(Cv, 'F')} = <b>${sci(Cv)} F</b></td></tr>
        <tr><td>R1 × C1</td><td>${sci(Rv)} × ${sci(Cv)} = <b>${rc} s</b></td></tr>
        <tr><td>Vi,peak (V<sub>p</sub>)</td><td><b>${Vp} V</b> (jeneratörde ${tVi()} Vpp)</td></tr>
        ${isFinite(vs) ? `<tr><td>Op-amp çıkış sınırı</td><td>±15 V besleme → en fazla <b>±${vs} V</b></td></tr>` : ''}
      </table>
      <div class="formula">Ana formül: <b>Vo = −R1·C1 × (dVi/dt)</b><br>Türkçesi: çıkış = −${rc} × (girişin 1 saniyede kaç volt değiştiği)</div>

      <h3>1) Sinüs çıkışı Vo,peak (f = 1 kHz)</h3>
      ${cstep(1, 'Açısal frekans ω', `<div class="formula">ω = 2π × f = 2 × 3.1416 × 1000 = <b>${n(w, 1)} rad/s</b></div><p class="muted">Prelab'daki cos(<b>6283.18</b>·t) bu sayı.</p>`)}
      ${cstep(2, 'Girişin en hızlı değişimi', `<p>Sinüs en hızlı 0 V'tan geçerken değişir. Bu hız = ω × V<sub>p</sub>:</p><div class="formula">${n(w, 1)} × ${Vp} = <b>${n(w * Vp, 0)} V/s</b></div>`)}
      ${cstep(3, 'Çıkışın tepe değeri', `<div class="formula">Vo,peak = R1C1 × ${n(w * Vp, 0)} = ${rc} × ${n(w * Vp, 0)} = <b>${n(s1.sinPk, 2)} V</b></div>`, `Theoretical = ${n(s1.sinPk, 2)} V`)}
      ${cstep(4, 'Çıkışın tamamı (Prelab Mathematical Modeling)', `<div class="formula">Vi(t) = ${Vp}·cos(6283.18·t)<br>dVi/dt = −${n(w * Vp, 0)}·sin(6283.18·t)<br>Vo(t) = −${rc} × dVi/dt = <b>${n(s1.sinPk, 2)}·sin(6283.18·t) V</b></div><p class="muted">Kazanç |Vo/Vi| = ω·R1C1 = ${n(w * RC, 3)} → çıkış girişin ${n(w * RC, 2)} katı, 90° kaymış.</p>`)}
      ${s1.sinPk > vs ? B('warn', `${n(s1.sinPk, 2)} V &gt; ${vs} V: op-amp bunu veremez, simülasyonda ve laboratuvarda ≈ ${vs} V ölçersin. Tabloya teori olarak yine <b>${n(s1.sinPk, 2)} V</b> yazılır, farkı raporda "op-amp doyumu" diye açıkla.`) : ''}

      <h3>2) Üçgen (100 Hz): çıkışın iki seviyesi</h3>
      ${cstep(1, 'Periyot', `<div class="formula">T = 1 / f = 1 / 100 = <b>0.01 s</b> (10 ms) → yükselme süresi T/2 = <b>0.005 s</b></div>`)}
      ${cstep(2, 'Eğim (girişin hızı)', `<p>Üçgen yarım periyotta −${Vp} V'tan +${Vp} V'a çıkar, yani ${2 * Vp} V değişir:</p><div class="formula">eğim = ${2 * Vp} V / 0.005 s = <b>${n(t100.slope, 0)} V/s</b></div>`)}
      ${cstep(3, 'Sarı çıkarken (pozitif eğim)', `<div class="formula">Vo = −${rc} × (+${n(t100.slope, 0)}) = <b>${n(-t100.lvl)} V</b></div>`, `Positive Slope: ${n(-t100.lvl)} V`)}
      ${cstep(4, 'Sarı inerken (negatif eğim)', `<div class="formula">Vo = −${rc} × (−${n(t100.slope, 0)}) = <b>+${n(t100.lvl)} V</b></div>`, `Negative Slope: +${n(t100.lvl)} V`)}

      <h3>3) Üçgen kazancı Av (${SWEEP().length} frekans)</h3>
      ${cstep(1, 'Kısa formül', `<p>Eğim = 4·V<sub>p</sub>·f. Kare dalganın boyu Vo,pp = 2 × R1C1 × 4·V<sub>p</sub>·f, girişin boyu Vi,pp = 2·V<sub>p</sub>. Böl, V<sub>p</sub>'ler sadeleşir:</p><div class="formula">Av = Vo,pp / Vi,pp = <b>4 × f × R1C1</b> (genliğe bağlı değil)</div>`)}
      ${cstep(2, 'Her frekans için', `<table><tr><th>f</th><th>Hesap</th><th>Av</th><th>Vo,pp (ideal)</th></tr>
        ${SWEEP().map(f => { const t = dth(f); return `<tr><td>${fq(f)}</td><td>4 × ${f} × ${rc}</td><td><b>${n(t.av, 2)}</b></td><td>${n(t.vopp, 2)} V${t.clip ? ' <span class="bad">⚠ kesilir</span>' : ''}</td></tr>`; }).join('')}</table>
        ${isFinite(vs) ? `<p class="muted">⚠ = ideal Vo,pp ${2 * vs} V'u geçiyor: gerçekte kesilir, ölçülen Av daha küçük çıkar.</p>` : ''}`)}

      <h3>4) Çıkış ilk hangi frekansta bozulur?</h3>
      ${isFinite(vs) ? cstep(1, 'Kesilme sınırı', `<p>Kare dalganın seviyesi R1C1 × 4·V<sub>p</sub>·f. Bu ${vs} V'u geçince kesilir:</p><div class="formula">f &gt; ${vs} / (4 × ${Vp} × ${rc}) = <b>${fq(+lim.toPrecision(4))}</b></div>`) + cstep(2, 'Taramadaki ilk frekans', `<p>${fq(+lim.toPrecision(4))}'in üstündeki ilk tarama frekansı: <b>${fdistTxt(fd)}</b>.</p>`, `Theoretical = none (ideal türev alıcı kesilmez) · ±${vs} V sınırıyla beklenen: ${fdistTxt(fd)}`) : '<p>İdeal op-amp: kesilme yok → <b>none</b>.</p>'}

      <h3>Bonus: kazancın 1 olduğu frekans</h3>
      ${cstep('+', 'Sinüste |Vo/Vi| = 2π·f·R1C1 = 1', `<div class="formula">f = 1 / (2π × R1C1) = 1 / (2 × 3.1416 × ${rc}) = <b>${fq(+(1 / (2 * Math.PI * RC)).toPrecision(5))}</b></div>`)}

      <h3>Hata yüzdesi (raporda)</h3>
      <div class="formula">Error % = (Simulation − Experimental) / Simulation × 100<br>Örnek: simülasyon 1.600 V, deney 1.552 V → (1.600 − 1.552) / 1.600 × 100 = <b>3.0 %</b></div>
      ${B('tip', 'Bütün sayılar tezgâhtaki R1, C1 ve seçtiğin Vi\'den hesaplanır. Vi seçimini değiştirirsen bu sayfa da değişir.')}`;
  }
  function calcHtml() {
    if (!D()) return noCircuit();
    if (isDiff()) return diffCalc();
    if (isRlc()) return rlcCalc();
    const d = D();
    if (hidden() && !dat().checked) return `<h2>🧮 Teorik hesaplamalar — ${d.title}</h2>${B('warn', 'Test devresi: hesaplar, "Kontrol et"ten ya da "Kılavuzu aç"tan sonra görünür.')}`;
    const f = F0(), w = 2 * Math.PI * f, t = theory(f);
    if (!t) return '<p>Teori hesaplanamadı (devre eksik mi?).</p>';
    const parts = Bench.model.comps.filter(c => ['R', 'C', 'L'].includes(c.type)).map(c => `<tr><td>${c.name}</td><td><b>${fmt(c.value, c.type === 'R' ? 'Ω' : c.type === 'C' ? 'F' : 'H')}</b></td></tr>`).join('');
    return `<h2>🧮 Teorik hesaplamalar — ${d.title}</h2>
      ${B('simple', `Tablo 1'in teori değerleri ${fq(f)} ve Vi = ${tVi()} Vpp için adım adım.`)}
      <h3>0) Elimizdeki değerler</h3><table>${parts}<tr><td>f</td><td><b>${fq(f)}</b></td></tr><tr><td>Vi,pp</td><td><b>${tVi()} V</b></td></tr></table>
      ${cstep(1, 'Açısal frekans', `<div class="formula">ω = 2π × f = 2 × 3.1416 × ${f} = <b>${(+w.toPrecision(5))} rad/s</b></div>`)}
      ${cstep(2, 'Kondansatör / bobin empedansları', `<p>${reactances(f) || 'Bu devrede C ya da L yok.'}</p>`)}
      ${wienCalc()}
      ${cstep(3, 'Kazanç ve faz (fazör analizi)', `<div class="formula">${FORMULA[d.type] || ''}</div><div class="formula">|H| = <b>${t.H.toFixed(4)}</b> · φ = <b>${fph(t.ph)}</b></div>`, `Kazanç = ${t.H.toFixed(4)} · Faz = ${fph(t.ph)}`)}
      ${cstep(4, 'Çıkış gerilimi', `<div class="formula">Vo,pp = |H| × Vi,pp = ${t.H.toFixed(4)} × ${tVi()} = <b>${t.vo.toFixed(3)} V</b></div>`, `Vo,pp = ${t.vo.toFixed(3)} V`)}
      ${t.ipk ? cstep(5, 'Akım (tepe)', `<div class="formula">I<sub>peak</sub> = <b>${fmt(t.ipk, 'A', 4)}</b> (Vi'ye göre ${fph(t.iph)})</div>`, `Is,peak = ${fmt(t.ipk, 'A', 4)}`) : ''}
      <h3>Frekans taraması (teori)</h3>
      <table><tr><th>f</th><th>|H|</th><th>φ</th><th>Vo,pp</th></tr>${[...new Set([...SWEEP(), f])].sort((a, b) => a - b).map(g => { const x = theory(g); return x ? `<tr><td>${fq(g)}</td><td>${x.H.toFixed(4)}</td><td>${fph(x.ph)}</td><td>${fmt(x.vo, 'V', 3)}</td></tr>` : ''; }).join('')}</table>`;
  }

  /* ---------------- test modu ---------------- */
  const TOL = { vi: 3, vo: 5, is: 8, gain: 5, phase: 3 };
  function scoreOf() {
    const T = dat(), th = theory(F0()); if (!th) return null;
    let ok = 0, n = 0;
    const thv = { vi: tVi(), vo: th.vo, is: th.ipk, gain: th.H, phase: th.ph };
    for (const k in thv) { if (!isFinite(T.t1[k])) continue; n++; const e = k === 'phase' ? Math.abs(T.t1[k] - thv[k]) : Math.abs(T.t1[k] / thv[k] - 1) * 100; if (e <= TOL[k]) ok++; }
    for (const f of SWEEP()) { if (!isFinite(T.t2[f])) continue; n++; const t = theory(f); if (t && Math.abs(T.t2[f] - t.ph) <= 3) ok++; }
    if (isFinite(T.fchar)) { n++; const fc = Circuits.charFreq(); if (fc && Math.abs(T.fchar / fc - 1) <= 0.06) ok++; }
    return { ok, n, total: 5 + SWEEP().length + 1 };
  }
  function testHtml() {
    const d = D(), inf = I(), si = senseInfo(), T = dat(), chk = !!T.checked;
    const sc = chk ? scoreOf() : null;
    if (sc) { T.score = `${sc.ok}/${sc.total}`; save(); }
    return `<div class="stepHead"><span class="kind test">TEST</span><span class="goes">Kılavuz gizli · kendi başına ölç, sonra kontrol et</span></div>
      <h2>📝 ${d.title}</h2>
      ${B('simple', `Tezgâhta bir <b>${inf.kind}</b> var. Bileşen değerleri tezgâhta yazıyor. Yardım almadan aşağıdaki görevleri yap, değerleri tabloya yaz (ya da "Ekrandan al"), bitince <b>Kontrol et</b>.`)}
      <div class="formula">${Circuits.diagram()}</div>
      <h3>Görevler</h3>
      <ol class="steps">
        <li><b>Hazırlık:</b> CH1 → Vi, CH2 → Vo, timsahlar GND. Jeneratör: sinüs <b>${fq(F0())}</b>, <b>${tVi()} Vpp</b>. Autoset.</li>
        <li><b>G1:</b> CH1'de Vi'nin tam <b>${tVi()}.00 Vpp</b> olduğunu ölç (gerekirse jeneratörü ayarla).</li>
        <li><b>G2:</b> Vo,pp'yi ölç ve kazancı (Vo/Vi) hesapla.</li>
        <li><b>G3:</b> Faz farkı φ'yi <b>imleçle</b> ölç (işaretiyle!).</li>
        <li><b>G4:</b> ${si ? `<b>${si.name}</b> (${fmt(si.R, 'Ω')}) direncinden geçen akımın tepe değerini bul. ${si.single ? 'İpucu: direncin bir ucu toprakta.' : 'İpucu: iki ucu da topraktan farklı.'}` : ''}</li>
        <li><b>G5:</b> Aşağıdaki ${SWEEP().length} frekansta φ'yi ölç.</li>
        <li><b>Bonus:</b> ${inf.charName} kaç Hz?</li>
      </ol>
      <h3>Cevapların</h3>
      ${tablesInner(true)}
      <table class="lab"><tr><td>Bonus: karakteristik frekans (Hz)</td><td><input data-fchar="1" value="${isFinite(T.fchar) ? T.fchar : ''}" placeholder="—"></td>
        <td class="th">${chk ? fq(+(Circuits.charFreq() || 0).toPrecision(4)) : '🔒'}</td></tr></table>
      ${sc ? B(sc.ok >= sc.total * 0.7 ? 'see' : 'warn', `<b>Skor: ${sc.ok} / ${sc.total}</b> (cevapladığın ${sc.n} sorudan ${sc.ok} doğru). Tolerans: gerilim/kazanç %5, akım %8, faz ±3°, frekans %6.`) : ''}
      <p style="display:flex;gap:6px;flex-wrap:wrap">${acts(doit('cap1', '📥 Ekrandan al (Tablo 1)'), doit('check', '✅ Kontrol et'), `<button data-do="reveal">📖 Kılavuzu aç</button>`, `<button data-do="clearTables">🔄 Sıfırla</button>`)}</p>
      ${B('tip', 'Takıldığın yerde "📖 Kılavuzu aç" bu devre için tüm görevleri adım adım gösterir (teorik değerlerle). Ekrandaki <b>!</b> işaretleri kılavuz gizliyken de çalışır.')}`;
  }

  /* ---------------- tablolar ---------------- */
  function tablesInner(testMode) {
    if (isDiff()) return diffTables();
    if (isRlc()) return rlcTables();
    const th = theory(F0()), T = dat(), hide = (testMode || hidden()) && !T.checked;
    if (!th) return '<p>Teori hesaplanamadı (devre eksik mi?).</p>';
    const row = (lbl, k, thv, f) => {
      const m = T.t1[k], has = isFinite(m);
      const e = has && !hide ? (k === 'phase' ? Math.abs(m - thv) : Math.abs(m - thv) / Math.abs(thv) * 100) : null;
      return `<tr><td>${lbl}</td><td class="th">${hide ? '🔒' : f(thv)}</td>
        <td><input data-t1="${k}" value="${has ? f(m) : ''}" placeholder="—"></td>
        <td class="err ${e === null ? '' : (k === 'phase' ? e <= 3 : e <= 5) ? 'good' : 'bad'}">${e === null ? '' : k === 'phase' ? e.toFixed(2) + '°' : e.toFixed(2) + '%'}</td></tr>`;
    };
    const f4 = (v) => (+v).toPrecision(4), fp = (v) => ((+v >= 0 ? '+' : '') + (+v).toFixed(2));
    return `<h3>Tablo 1 — ${fq(F0())} temel sonuçlar</h3>
      <table class="lab"><tr><th>Parametre</th><th>Teori</th><th>Ölçüm</th><th>Fark</th></tr>
        ${row('Vi,pp (V)', 'vi', tVi(), f4)}
        ${row('Vo,pp (V)', 'vo', th.vo, f4)}
        ${row('Is,peak (A)', 'is', th.ipk, v => (+v).toExponential(3))}
        ${row('Kazanç Vo/Vi', 'gain', th.H, f4)}
        ${row('Faz φ (°)', 'phase', th.ph, fp)}
      </table>
      <h3>Tablo 2 — Faz farkı ve frekans</h3>
      <table class="lab"><tr><th>f</th><th>Teori φ</th><th>Ölçüm φ</th><th>|Δ|</th>${hide ? '' : '<th></th>'}</tr>
        ${SWEEP().map(f => { const t = theory(f), m = T.t2[f], e = isFinite(m) && t && !hide ? Math.abs(m - t.ph) : null; return `<tr><td>${fq(f)}</td><td class="th">${hide ? '🔒' : t ? fp(t.ph) : '?'}</td>
          <td><input data-t2="${f}" value="${isFinite(m) ? fp(m) : ''}" placeholder="—"></td><td class="err ${e === null ? '' : e <= 3 ? 'good' : 'bad'}">${e === null ? '' : e.toFixed(2) + '°'}</td>
          ${hide ? '' : `<td><span class="acts"><button class="do" data-sweep="${f}">▶</button><button data-save="${f}">📥</button></span></td>`}</tr>`; }).join('')}
      </table>`;
  }
  function tablesHtml() {
    if (!D()) return noCircuit();
    const si = senseInfo();
    return `<h2>📋 Tablolar — ${D().title}</h2>
      <p>Ölçümleri buraya kaydet; teoriyle farkı otomatik hesaplanır. Değerleri elle de yazabilirsin. Her devrenin tabloları ayrı saklanır.</p>
      ${isDiff() ? viSel2() : ''}${isRlc() ? viSel4() : ''}
      ${D().id === 'wien' ? `<p>Vi,pp seçimi: <select id="viSel" class="ui">${[4, 8, 12].map(v => `<option ${store.vi === v ? 'selected' : ''}>${v}</option>`).join('')}</select> V</p>` : ''}
      ${hidden() && !dat().checked ? B('warn', 'Test devresi: teorik değerler 🔒 gizli. Lab sekmesinde "Kontrol et"e basınca açılır.') : ''}
      ${tablesInner(false)}
      <p>${acts(doit('cap1', '📥 Ekrandan al (Tablo 1)'), `<button data-do="copy1">📄 Tablo 1 kopyala</button>`, `<button data-do="copy2">📄 Tablo 2 kopyala</button>`, `<button data-do="csv">⬇ CSV indir</button>`, `<button data-do="clearTables">🗑 Temizle</button>`)}</p>
      ${isRlc() ? B('tip', '<b>Ekrandan al</b>: R1 az sönümlü değerdeyken CH2 Max ve ROVShoot ölçümlerini (tepe, aşma, ζ, Rcrit) kaydeder; yatay imleçler açıksa yerleşme süresini kaydeder. Değerleri elle de yazabilirsin. Experimental sütunu laboratuvar içindir.') : isDiff() ? B('tip', '<b>Ekrandan al</b>: jeneratör 1 kHz sinüsteyse Vo,peak; 100 Hz üçgendeyse iki Vo seviyesini kaydeder. Tarama satırları için ▶ / 📥.') : B('tip', `Vi, Vo, kazanç ve faz: CH1 = Vi, CH2 = Vo düzeninde al. Akım: ${si ? (si.single ? `CH2 ${si.hi}'da iken` : `CH2 ${si.lo}'da ve Math (CH1 − CH2) açıkken`) : ''} "Ekrandan al".`)}
      ${isDiff() || isRlc() ? '' : B('why', 'Faz için yüzde yerine derece farkı yazılır: φ sıfıra yakınken küçük bir sapma bile çok büyük yüzde çıkar ve yanıltır.')}`;
  }
  function tableText(n) {
    if (isDiff()) return diffText(n);
    if (isRlc()) return rlcText(n);
    const th = theory(F0()), T = dat().t1, x = (v, f) => isFinite(v) ? f(v) : '';
    const p = (v) => fph(v).replace('°', '');
    if (n === 1) return ['Parameter\tTheoretical\tMeasurement',
      `Input Vi,pp (V)\t${tVi()}\t${x(T.vi, v => v.toFixed(3))}`,
      `Output Vo,pp (V)\t${th.vo.toFixed(4)}\t${x(T.vo, v => v.toFixed(4))}`,
      `Source current Is,peak (A)\t${th.ipk.toExponential(3)}\t${x(T.is, v => v.toExponential(3))}`,
      `Gain Vo/Vi\t${th.H.toFixed(4)}\t${x(T.gain, v => v.toFixed(4))}`,
      `Phase φ (°)\t${p(th.ph)}\t${x(T.phase, p)}`].join('\n');
    return ['Frequency (Hz)\tTheoretical φ (°)\tMeasurement φ (°)', ...SWEEP().map(f => { const t = theory(f); return `${f}\t${t ? p(t.ph) : ''}\t${x(dat().t2[f], p)}`; })].join('\n');
  }
  function copyTable(n) {
    if (hidden() && !dat().checked) return note('Test devresinde önce "Kontrol et" (teori gizli).', 'warn');
    const t = tableText(n);
    const done = () => note(`Tablo ${n} panoya kopyalandı — Word'de tabloya yapıştır.`);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) { } a.remove(); }
  function downloadCSV() {
    if (hidden() && !dat().checked) return note('Test devresinde önce "Kontrol et".', 'warn');
    const t = (tableText(1) + '\n\n' + tableText(2)).replace(/\t/g, ',');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' })); a.download = `olcumler_${store.circuit}.csv`; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------------- tarifler / tuşlar ---------------- */
  const RECIPES = [
    ['📏 Tepeden tepeye gerilim (Vpp) nasıl ölçülür?', `
      <p><b>Otomatik:</b> <b>Measure</b> → ekranın altındaki 1. tuş (Add Measurement) → sağda Source1'i doğru kanala getir (4. yan tuş) → 1. yan tuş (V/I) → VARIABLE düğmesiyle <b>Pk-Pk</b> → <b>Select</b> → <b>Menu Off</b>. ${acts(show('measure,bot0'))}</p>
      <p><b>İmleçle:</b> <b>Cursor</b> tuşuna iki kez bas → yatay çizgiler. VARIABLE ile ①'i tepeye koy, <b>Select</b> ile ②'ye geç, onu dibe koy. Sol üstte Δ = Vpp. ${acts(show('cursor,variable,select'))}</p>
      <p><b>Kare sayarak:</b> Vpp = (tepeden dibe kare sayısı) × VOLTS/DIV.</p>
      ${B('tip', 'Dalga ekranın 5–7 karesini kaplasın: daha hassas. Taşarsa ölçüm "?" çıkar.')}`],
    ['⏱️ Frekans ve periyot', `
      <p>Ekranın sağ alt köşesindeki sayaç frekansı sürekli gösterir. Ölçüm olarak: Measure → Add Measurement → 2. yan tuş (Time) → <b>Frequency</b> veya <b>Period</b>. ${acts(doit('mFreq', '⚡ Frequency ekle'))}</p>
      <p>İmleçle: Cursor'a bir kez bas, iki dikey çizgiyi iki ardışık tepeye koy → Δt = T, f = 1/T.</p>`],
    ['🔀 İki sinyal arasındaki faz farkı', `
      <ol><li><b>İmleçle</b>: iki dalganın yükselen sıfır geçişleri arası Δt → φ = 360·f·Δt. Ayrıntısı Lab → G3'te.</li>
      <li><b>Otomatik:</b> Measure → Add Measurement → Source1 = CH1, Source2 = CH2 → 3. yan tuş (Delay) → <b>Phase</b> → Select. + değer: CH2 önde.</li>
      <li><b>XY (Lissajous):</b> Acquire → XY. Elipsin şekli faz farkını gösterir; düz çizgi = 0°.</li></ol>
      ${B('warn', 'İki kanalın da 0 V çizgisi aynı yerde olmalı (POSITION düğmelerine tıkla) ve DC kuplaj kullan.')}`],
    ['⚡ Bir direncin akımı (osiloskop akım ölçmez!)', `
      <p>Direncin bir ucu topraktaysa: probu diğer uca tak, I = V/R. İki ucu da topraktan farklıysa: CH1 bir uca, CH2 diğer uca, <b>M (MATH) → CH1 − CH2</b> = direnç gerilimi. I = V<sub>R</sub>/R.</p>
      ${B('warn', 'Timsah klipsini asla topraktan başka bir noktaya takma: osiloskobun toprağı şebeke toprağıdır, o noktayı kısa devre edersin.')}`],
    ['📉 Kazanç ve desibel (dB)', `<p>Kazanç = Vo/Vi (ikisi de Vpp). dB = 20·log₁₀(Vo/Vi). Örnek: 0.707 → −3 dB (kesim frekansı), 0.5 → −6 dB, 0.1 → −20 dB.</p>`],
    ['〰️ RMS (etkin değer)', `<p>Measure → V/I → <b>RMS</b> veya <b>Cycle RMS</b> (bir tam periyot — daha doğru). Sinüste V<sub>rms</sub> = V<sub>pp</sub> / (2√2) = 0.354·V<sub>pp</sub>.</p>`],
    ['🌀 Dalga kayıyor / titriyor (tetik sorunu)', `
      <p>Ekranın sağ üstünde <b>Auto</b> veya <b>Trig?</b> yazıyorsa tetik yakalanmıyor. Çözüm: TRIGGER bölümündeki <b>50%</b> tuşu. ${acts(show('t50'), doit('level50', '⚡ 50%'))}</p>
      <p>Tetik kaynağı (TRIGGER bölümündeki Menu → Source) ekranda gördüğün kanal olmalı. ${acts(doit('trigCh1', '⚡ Tetik = CH1'))}</p>`],
    ['🔇 Gürültülü dalgayı temizlemek', `<p><b>Acquire</b> → 1. alt tuş (Mode) → <b>Average</b>. ${acts(show('acquire'), doit('avg', '⚡ Average 16'))}</p>`],
    ['⏸️ Görüntüyü dondurmak', `<p><b>Run/Stop</b>: durdurur/başlatır (kırmızı = durdu). <b>Single</b>: tek kayıt alıp durur. Durunca imleç ve ölçümler yine çalışır. ${acts(show('runstop,single'))}</p>`],
    ['🔍 Ayrıntıyı büyütmek', `<p><b>TIME/DIV</b> (HORIZONTAL SCALE) düğmesini saat yönünde çevir, <b>H POSITION</b> ile istediğin yeri ortala. Ya da <b>Zoom</b>. ${acts(show('zoom,hscale,hpos'))}</p>`],
    ['📷 Ekran görüntüsü / veri kaydetmek', `<p>Ekranın solundaki <b>Hardcopy</b> tuşu PNG indirir. Save/Recall → Save Waveform → File (CSV) ile ham veri. ${acts(show('hardcopy,save'), doit('img', '📷 Şimdi al'))}</p>`],
    ['📊 Frekans spektrumu (FFT)', `<p><b>M</b> (MATH) → 2. alt tuş (FFT). Saf sinüste tek bir tepe görürsün.</p>`],
    ['🧲 AC / DC / GND kuplaj', `<p>CH1/CH2 tuşu → 1. alt tuş (Coupling). <b>DC</b>: her şeyi gösterir (önerilen). <b>AC</b>: DC kısmı atar, ~10 Hz altında fazı bozar. <b>GND</b>: 0 V çizgisi. ${acts(doit('dc', '⚡ İkisini DC yap'))}</p>`],
    ['🔧 Prob ×1 / ×10', `<p>Prob üstündeki anahtar ile CH menüsü → 7. alt tuş (Probe) ayarı <b>aynı</b> olmalı. Uyuşmazsa değerler 10 kat yanlış çıkar. ${acts(doit('attenFix', '⚡ Eşitle'))}</p>`],
    ['🆘 Dalga kayboldu / ekran karıştı', `<ol><li><b>Autoset</b>.</li><li>POSITION düğmelerine tıkla.</li><li>Kanal açık mı?</li><li>Prob bağlı mı?</li><li>Menü listesi açık kaldıysa <b>Menu Off</b>.</li><li>Son çare: <b>Default</b>, sonra Autoset.</li></ol>`],
  ];
  const howtoHtml = () => `<h2>🎯 Nasıl ölçerim?</h2><p>Bir başlığa tıkla, tarif açılsın.</p>` + RECIPES.map(([t, h], i) => `<details class="recipe" ${i === 0 ? 'open' : ''}><summary>${t}</summary><div class="in">${h}</div></details>`).join('');

  const KEYDOC = [
    ['Dikey (VERTICAL) — gerilim ekseni', [
      ['ch1scale', 'CH1 SCALE (VOLTS/DIV)', 'Bir karenin kaç volt olduğu. Saat yönü → daha küçük değer → dalga büyür.'],
      ['ch2scale', 'CH2 SCALE (VOLTS/DIV)', 'CH2 için aynı.'],
      ['ch1pos', 'CH1 POSITION', 'Dalgayı yukarı/aşağı kaydırır. Tıkla → 0.'],
      ['ch2pos', 'CH2 POSITION', 'CH2 dalgasını kaydırır. Tıkla → 0.'],
      ['ch1', 'CH1 tuşu', 'Kanalı açar ve menüsünü gösterir. Menü açıkken tekrar basmak kanalı kapatır.'],
      ['ch2', 'CH2 tuşu', 'CH2 için aynı.'],
      ['math', 'M (MATH)', 'İki kanalı toplar/çıkarır/çarpar/böler veya FFT.'],
      ['ref', 'R (REF)', 'Bir dalgayı referans olarak saklar.'],
    ]],
    ['Yatay (HORIZONTAL) — zaman ekseni', [
      ['hscale', 'SCALE (TIME/DIV)', 'Bir karenin kaç saniye olduğu. Saat yönü → daha kısa → dalga genişler.'],
      ['hpos', 'POSITION', 'Dalgayı sağa/sola kaydırır. Tıkla → 0.'],
      ['zoom', 'Zoom', 'Kaydın bir parçasını büyütür.'],
    ]],
    ['Tetik (TRIGGER) — görüntüyü sabitler', [
      ['level', 'LEVEL', 'Tetik seviyesi. Tıkla → 0 V.'],
      ['t50', '50%', 'Seviyeyi sinyalin ortasına koyar.'],
      ['tmenu', 'Menu', 'Tetik kaynağı, eğim, kuplaj, mod.'],
      ['force', 'Force-Trig', 'Tetik yoksa bile bir kez çizdirir.'],
    ]],
    ['Ölçüm ve kontrol', [
      ['autoset', 'Autoset', 'Her şeyi otomatik ayarlar.'],
      ['runstop', 'Run/Stop', 'Yeşil = çalışıyor, kırmızı = durdu.'],
      ['single', 'Single', 'Tek bir kayıt alır ve durur.'],
      ['default', 'Default', 'Fabrika ayarları.'],
      ['measure', 'Measure', 'Otomatik ölçümler, en fazla 8 tane.'],
      ['cursor', 'Cursor', '1. basış: dikey çizgiler (zaman). 2. basış: yatay (gerilim). 3. basış: kapat.'],
      ['variable', 'VARIABLE', 'Menüde ⟲ işaretli ayarı, listedeki seçimi veya imleci hareket ettirir.'],
      ['select', 'Select', 'Listede seçimi onaylar; imleçlerde ① / ② / ikisi arasında geçiş.'],
      ['acquire', 'Acquire', 'Sample / Peak Detect / Average ve XY.'],
      ['display', 'Display', 'Nokta/çizgi, iz kalıcılığı, parlaklık.'],
      ['save', 'Save/Recall', 'Görüntü, dalga, ayar kaydetme.'],
      ['hardcopy', 'Hardcopy', 'Tek tuşla ekran görüntüsü.'],
      ['help', 'Help', 'Basıp sonra bir tuşa basarsan açıklamasını gösterir.'],
      ['menuoff', 'Menu Off', 'Açık listeyi/menüleri kapatır.'],
    ]],
    ['Ekran kenarındaki menü tuşları', [
      ['bot0', 'Alt menü tuşları (7)', 'Ekranın altındaki 7 kutudan karşısındakini seçer.'],
      ['side0', 'Yan menü tuşları (5)', 'Ekranın sağındaki menüde karşısındaki seçeneği seçer.'],
    ]],
  ];
  const keysHtml = () => `<h2>🎛️ Ön panel tuşları</h2>
      <h3>🖱️ Nasıl kullanılır?</h3>
      <ul><li><b>Düğme çevirmek:</b> fareyi düğmenin üstüne getir, <b>tekerleği çevir</b> (yukarı = saat yönü). Tutup sürüklemek de olur.</li>
        <li><b>Tuşa basmak:</b> tıkla. POSITION ve LEVEL düğmelerine tıklamak sıfırlar.</li>
        <li>Ekrandaki turuncu <b>!</b> işaretleri o bölgeyi detaylı açıklar.</li></ul>
      <h3>Tuşlar (tıkla → panelde gösterilir)</h3>
      ${KEYDOC.map(([g, list]) => `<p style="margin:10px 0 2px;color:var(--accent2);font-weight:700">${g}</p>` + list.map(([id, n, d]) => `<div class="keyrow" data-show="${id}"><span class="kn">${n}</span><span class="kd">${d}</span></div>`).join('')).join('')}`;

  /* ---------------- teori ---------------- */
  const wienCalc = () => { if (!D() || D().id !== 'wien') return ''; const t = theory(50); return `
      <h3>50 Hz adım adım (rapordaki hesap)</h3>
      <table><tr><td>ω = 2π·50</td><td>314.16 rad/s</td></tr><tr><td>Z<sub>C1</sub> = Z<sub>C2</sub></td><td>−j3183.1 Ω</td></tr>
      <tr><td>Z<sub>p</sub></td><td>910.2 − j285.9 Ω = 954.0∠−17.44°</td></tr><tr><td>Z<sub>in</sub></td><td>1910.2 − j3469.0 Ω = 3960.2∠−61.16°</td></tr>
      <tr><td>H</td><td>0.2409∠+43.72°</td></tr><tr><td>Vo,pp (Vi = ${store.vi} V)</td><td>${t.vo.toFixed(3)} V</td></tr><tr><td>Is,peak</td><td>${(t.ipk * 1e3).toFixed(3)} mA (Vi'den ${t.iph.toFixed(2)}° önde)</td></tr></table>`; };
  function theoryHtml() {
    if (!D()) return noCircuit();
    if (isDiff()) return diffTheory();
    if (isRlc()) return rlcTheory();
    const d = D(), inf = I();
    if (hidden() && !dat().checked) return `<h2>🧠 Teori — ${d.title}</h2>${B('warn', 'Test devresi: teori, "Kontrol et"ten ya da "Kılavuzu aç"tan sonra görünür.')}${B('simple', inf.simple)}`;
    const fc = Circuits.charFreq();
    return `<h2>🧠 Teori — ${d.title}</h2>
      ${B('simple', inf.simple)}
      <div class="formula">${Circuits.diagram()}</div>
      <h3>Transfer fonksiyonu</h3>
      <div class="formula">${FORMULA[d.type] || ''}</div>
      <h3>Neden böyle davranıyor?</h3><p>${inf.why}</p>
      <h3>Hatırlatma: empedanslar</h3>
      <div class="formula">Z<sub>R</sub> = R &nbsp;·&nbsp; Z<sub>C</sub> = 1/(jωC), |Z<sub>C</sub>| = 1/(2πfC) &nbsp;·&nbsp; Z<sub>L</sub> = jωL, |Z<sub>L</sub>| = 2πfL</div>
      <p>${fq(F0())}'te: ${reactances(F0())}</p>
      <h3>Karakteristik frekans</h3>
      <p>${inf.charName}: <b>${fc ? fq(+fc.toPrecision(4)) : '—'}</b></p>
      ${wienCalc()}
      <h3>🧮 Hesap makinesi (tezgâhtaki devre için)</h3>
      <div class="calc"><span>f (Hz)</span><input id="cF" value="${F0()}"><span>Vi,pp (V)</span><input id="cV" value="${tVi()}">
        <span>|H|</span><b id="oH"></b><span>φ</span><b id="oP"></b><span>dB</span><b id="oD"></b><span>Vo,pp</span><b id="oV"></b><span>I<sub>peak</sub></span><b id="oI"></b></div>
      <h3>Teorik tablo</h3>
      <table><tr><th>f</th><th>|H|</th><th>φ</th><th>Vo,pp</th></tr>${[...new Set([...SWEEP(), F0()])].sort((a, b) => a - b).map(f => { const x = theory(f); return x ? `<tr><td>${fq(f)}</td><td>${x.H.toFixed(4)}</td><td>${fph(x.ph)}</td><td>${fmt(x.vo, 'V', 3)}</td></tr>` : ''; }).join('')}</table>
      ${B('tip', 'Teorik değerler tezgâhtaki devreden (fazör/AC analizle) hesaplanır. Bir bileşenin değerini değiştirirsen teori de değişir.')}`;
  }
  function calc() {
    if (isRlc()) return calc4();
    const g = (id) => { const e = document.getElementById(id); return e ? Units.parse(e.value) : NaN; };
    const f = g('cF'), V = g('cV');
    const o = (id, t) => { const el = document.getElementById(id); if (el) el.innerHTML = t; };
    if (!(f > 0) || !(V > 0)) { o('oH', '?'); return; }
    const r = Circuits.response(f); if (!r) return;
    o('oH', r.H.toFixed(4)); o('oP', fph(r.ph)); o('oD', (20 * Math.log10(r.H)).toFixed(2) + ' dB');
    o('oV', fmt(r.H * V, 'V', 4)); o('oI', r.Irel ? fmt(r.Irel * V / 2, 'A', 4) + ` (∠${fph(r.iph)})` : '—');
  }

  function specsHtml() {
    const T = (rows) => `<table>${rows.map(r => `<tr><td style="width:42%;color:var(--muted)">${r[0]}</td><td>${r[1]}</td></tr>`).join('')}</table>`;
    return `<h2>📘 GW Instek GDS-1102B</h2>
      <p>Laboratuvardaki osiloskop. Simülatör bu değerlere göre yapıldı.</p>
      <h3>Genel</h3>${T([['Bant genişliği', 'DC ~ 100 MHz (−3 dB), 2 kanal + EXT tetik'], ['Yükselme süresi', '3.5 ns'], ['Örnekleme', '1 GSa/s (gerçek zamanlı)'], ['Kayıt derinliği', 'kanal başına 10 Mpts'], ['Dalga güncelleme', '50 000 wfm/s, VPO ekran'], ['Seri çözümleme', 'I²C, SPI, UART, CAN, LIN (standart)']])}
      <h3>Dikey</h3>${T([['Çözünürlük', '8 bit'], ['Hassasiyet', '1 mV ~ 10 V/div'], ['Kuplaj', 'AC, DC, GND'], ['Giriş empedansı', '≈ 1 MΩ ∥ 16 pF'], ['DC kazanç doğruluğu', '±%3 (hata analizinde kullan!)'], ['Polarite', 'Normal / Invert'], ['Maks. giriş', '300 Vrms CAT I (×10 prob ile 300 Vrms CAT II)'], ['Ofset aralığı', '1 mV/div: ±1.25 V · 2–100 mV/div: ±2.5 V · 200 mV–10 V/div: ±125 V']])}
      <h3>Matematik / FFT</h3>${T([['İşlemler', '+, −, ×, ÷, FFT, FFTrms, kullanıcı ifadesi'], ['FFT', '1 Mpts · Linear RMS / dBV RMS'], ['Pencereler', 'Rectangular, Hamming, Hanning, Blackman-Harris']])}
      <h3>Tetikleme</h3>${T([['Kaynak', 'CH1, CH2, Line, EXT'], ['Mod', 'Auto (≥100 ms/div Roll), Normal, Single'], ['Tipler', 'Edge, Pulse Width, Video, Runt, Rise&Fall, Timeout, Alternate, Event-Delay, Time-Delay'], ['Holdoff', '4 ns – 10 s'], ['Kuplaj', 'AC, DC, LF rej., HF rej., Noise rej.'], ['EXT tetik', '±15 V, ~100 mV hassasiyet, 1 MΩ ∥ 16 pF']])}
      <h3>Yatay</h3>${T([['Zaman tabanı', '5 ns/div ~ 100 s/div (1-2-5) · Roll: 100 ms ~ 100 s/div'], ['Ön tetik', 'en fazla 10 div'], ['Doğruluk', '±50 ppm'], ['Edinim', 'Normal, Average (2–256), Peak Detect (2 ns), Single']])}
      <h3>Ölçüm</h3>${T([['İmleçler', 'genlik, zaman; birimler s, Hz, °, %'], ['Otomatik ölçüm', '36 adet: Pk-Pk, Max, Min, Amplitude, High, Low, Mean, RMS, Frequency, Period, Rise/Fall, ±Width, Duty, Phase, FRR…LFF…'], ['Sayaç', '6 hane, 2 Hz – bant genişliği'], ['X-Y', 'X = CH1, Y = CH2; faz hatası ±3° @ 100 kHz']])}
      <h3>Ekran ve diğer</h3>${T([['Ekran', '7" TFT WVGA 800×480, ızgara 8×10'], ['Kalıcılık', '16 ms ~ 4 s, sonsuz'], ['Hafıza', '20 ayar, 24 dalga'], ['Arayüz', 'USB host + device (LAN yok)'], ['Güç', '100–240 V AC, 30 W'], ['Boyut / ağırlık', '380 × 208 × 127 mm, 2.8 kg'], ['Kutu içeriği', 'GTP-100B-4 100 MHz pasif prob']])}
      ${B('tip', 'Kesin değer gerekiyorsa GW Instek\'in resmi GDS-1000B datasheet\'iyle karşılaştır.')}`;
  }
  const noCircuit = () => `<h2>Kılavuz yok</h2>${B('simple', 'Bu tezgâhtaki devre için hazır bir kılavuz yok (serbest çalışma). Kılavuzlu bir devre için 📚 Devreler\'den seç.')}<p>${acts(doit('library', '📚 Devre kütüphanesini aç'))}</p>`;

  /* ---------------- panel çizimi ---------------- */
  const TABS = [['lab', '🧪 Lab'], ['brief', '🎖️ Brifing'], ['tables', '📋 Tablolar'], ['howto', '🎯 Nasıl?'], ['keys', '🎛️ Tuşlar'], ['theory', '🧠 Teori'], ['calc', '🧮 Teorik hesaplar'], ['specs', '📘 Cihaz']];
  let tabsEl, bodyEl, STEPS = [];
  function init() {
    tabsEl = document.getElementById('gTabs'); bodyEl = document.getElementById('gBody');
    drawTabs();
    tabsEl.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { store.tab = b.dataset.tab; save(); render(); bodyEl.scrollTop = 0; } });
    bodyEl.addEventListener('click', onClick);
    bodyEl.addEventListener('change', onChange);
    bodyEl.addEventListener('input', e => { if (e.target.closest('.calc')) calc(); });
    document.getElementById('tipActs').addEventListener('click', onClick);
    document.getElementById('libBtn').onclick = openLibrary;
    document.getElementById('prevC').onclick = () => stepCircuit(-1);
    document.getElementById('nextC').onclick = () => stepCircuit(1);
    document.getElementById('curName').onclick = openLibrary;
    setOpen(store.open !== false);
    updateHeader();
    render();
    setTimeout(() => renderTip(true), 300);
    const nw = Circuits.DEFS.find(d => d.isNew && !store.seen[d.id]);
    if (nw) setTimeout(() => note(`⭐ <b>Yeni deney eklendi:</b> ${nw.title}. Üstteki <b>📚 Devreler</b> → ⭐ Laboratuvar deneyleri.`, 'good', 12000), 900);
  }
  function setOpen(o) {
    store.open = o; save();
    document.getElementById('layout').classList.toggle('noguide', !o);
    document.getElementById('btnGuide').classList.toggle('on', o);
  }
  function toggle() { setOpen(!store.open); }
  function showTab(tab) { setOpen(true); store.tab = tab; save(); render(); bodyEl.scrollTop = 0; }
  const KIND = { start: ['start', 'BAŞLANGIÇ'], prep: ['prep', 'HAZIRLIK'], task: ['task', 'GÖREV'], bonus: ['bonus', 'BONUS'], end: ['end', 'BİTİŞ'] };
  function labHtml() {
    if (!D()) return noCircuit();
    if (hidden()) return testHtml();
    STEPS = buildSteps();
    const i = Math.min(stepIdx(), STEPS.length - 1), st = STEPS[i];
    const nTask = STEPS.filter(x => x.kind === 'task').length, iTask = STEPS.slice(0, i + 1).filter(x => x.kind === 'task').length;
    const [kc, kn] = KIND[st.kind];
    const sub = st.kind === 'task' ? `Görev ${iTask} / ${nTask} · Nereye: <b>${st.goes}</b>` : st.kind === 'prep' ? 'Ölçüme hazırlanıyoruz · görev değil, tabloya bir şey yazılmaz' : st.kind === 'bonus' ? 'İsteğe bağlı' : '';
    const bar = `<div class="taskbar"><span>Bu deneyde <b>${nTask} görev</b> var:</span>${STEPS.map((x, k) => x.kind === 'task' ? `<span class="tchip ${k === i ? 'on' : ''}" data-goto="${k}" title="${x.t}"><b>${x.code}</b> ${x.short || ''}</span>` : '').join('')}</div>`;
    return `${isTest() ? `<div class="gbox warn" style="margin-top:0">Test devresinin kılavuzu açık. ${acts(`<button data-do="hide">🔒 Kılavuzu tekrar gizle</button>`)}</div>` : ''}
      <div id="stepNav"><button class="ui sm" data-step="-1">◀</button><div class="dots">${STEPS.map((x, k) => `<span class="dot k-${x.kind} ${k === i ? 'on' : ''}" data-goto="${k}" title="${x.t}">${x.code}</span>`).join('')}</div><button class="ui sm" data-step="1">▶</button></div>
      ${bar}
      <div class="stepHead"><span class="kind ${kc}">${kn}${st.kind === 'task' ? ' ' + iTask : ''}</span>${sub ? `<span class="goes">${sub}</span>` : ''}</div>
      <h2>${st.t}</h2>${st.html()}
      <div style="display:flex;justify-content:space-between;margin-top:14px">${i > 0 ? '<button class="ui" data-step="-1">◀ Önceki</button>' : '<span></span>'}${i < STEPS.length - 1 ? '<button class="ui primary" data-step="1">Sonraki ▶</button>' : '<button class="ui primary" data-do="next">Sonraki devre ▶</button>'}</div>`;
  }
  /** Brifing sekmesi yalnız Lab 4'te görünür */
  let tabsKey = '';
  function drawTabs() {
    const list = TABS.filter(([k]) => k !== 'brief' || isRlc()), key = list.map(t => t[0]).join();
    if (key !== tabsKey) { tabsKey = key; tabsEl.innerHTML = list.map(([k, n]) => `<button data-tab="${k}">${n}</button>`).join(''); }
  }
  function render(quiet) {
    drawTabs();
    if (store.tab === 'brief' && !isRlc()) store.tab = 'lab';
    tabsEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === store.tab));
    let h = '';
    try {
      if (store.tab === 'lab') h = labHtml();
      else if (store.tab === 'tables') h = tablesHtml();
      else if (store.tab === 'howto') h = howtoHtml();
      else if (store.tab === 'keys') h = keysHtml();
      else if (store.tab === 'theory') h = theoryHtml();
      else if (store.tab === 'calc') h = calcHtml();
      else if (store.tab === 'brief') h = briefHtml();
      else h = specsHtml();
    } catch (e) { console.error(e); h = `<p>Kılavuz çizilemedi: ${e.message}</p>`; }
    bodyEl.innerHTML = `<div class="${quiet ? '' : 'fade'}">${h}</div>`;
    if (store.tab === 'theory') calc();
    updateLive();
  }
  function onClick(e) {
    const b = e.target.closest('[data-show],[data-do],[data-step],[data-goto],[data-sweep],[data-save],[data-tab]');
    if (!b) return;
    if (b.dataset.show) Panel.highlight(b.dataset.show.split(','));
    if (b.dataset.do) { const a = ACT[b.dataset.do]; if (a) { a(); updateLive(); } }
    const n = STEPS.length || 1;
    if (b.dataset.step) { store.steps[store.circuit] = Math.max(0, Math.min(n - 1, stepIdx() + +b.dataset.step)); save(); render(); bodyEl.scrollTop = 0; }
    if (b.dataset.goto) { store.steps[store.circuit] = +b.dataset.goto; save(); render(); bodyEl.scrollTop = 0; }
    if (b.dataset.sweep) sweepSet(+b.dataset.sweep);
    if (b.dataset.save) sweepSave(+b.dataset.save);
    if (b.dataset.tab && b.closest('#gBody')) showTab(b.dataset.tab);
  }
  function onChange(e) {
    const t = e.target;
    if (t.id === 'viSel') { store.vi = +t.value; save(); render(); }
    if (t.id === 'viSel2') { store.vi2 = +t.value; save(); render(); }
    if (t.id === 'viSel4') { store.vsq4 = +t.value; save(); if (isRlc() && fg() && fg().wave === 'square') ACT.fgSq4(); render(); }
    if (t.id === 'rgSel4') { store.rg4 = t.value; save(); const k = caseNow(); if (k) setR4(k); else render(); }
    if (t.dataset.x) { const v = Units.parse(t.value); if (isFinite(v)) dat4().x[t.dataset.x] = v; else delete dat4().x[t.dataset.x]; save(); render(); }
    if (t.dataset.ex) { const v = Units.parse(t.value); if (isFinite(v)) dat4().ex[t.dataset.ex] = v; else delete dat4().ex[t.dataset.ex]; save(); render(); }
    if (t.dataset.t1) { const v = Units.parse(t.value); if (isFinite(v)) dat().t1[t.dataset.t1] = v; else delete dat().t1[t.dataset.t1]; save(); render(); }
    if (t.dataset.t2) { const v = parseFloat(String(t.value).replace(',', '.')); if (isFinite(v)) dat().t2[t.dataset.t2] = v; else delete dat().t2[t.dataset.t2]; save(); render(); }
    if (t.dataset.fchar) { const v = Units.parse(t.value); if (isFinite(v)) dat().fchar = v; else delete dat().fchar; save(); render(); }
  }
  function evalChk(c) { try { return [].concat(c).every(k => CHK[k] && CHK[k]()); } catch (e) { return false; } }
  function updateLive() {
    if (!bodyEl) return;
    bodyEl.querySelectorAll('[data-live]').forEach(el => { const f = LIVE[el.dataset.live]; if (!f) return; let r; try { r = f(); } catch (e) { r = { t: '?', bad: true }; } if (el.textContent !== r.t) el.textContent = r.t; el.classList.toggle('bad', !!r.bad); });
    bodyEl.querySelectorAll('[data-chk]').forEach(el => el.classList.toggle('done', evalChk(el.dataset.chk.split(','))));
    bodyEl.querySelectorAll('[data-goto]').forEach(el => { const s = STEPS[+el.dataset.goto]; el.classList.toggle('ok', !!(s && s.chk) && evalChk(s.chk)); });
  }

  /* ---------------- akıllı ipucu çubuğu ---------------- */
  const GENERIC = [
    'Düğme çevirmek için fareyi düğmenin üstüne getirip <b>tekerleği çevir</b> (yukarı = saat yönü).',
    'Ekrandaki turuncu <b>!</b> işaretlerine bas: o bölgedeki yazıların ne demek olduğunu detaylı anlatır.',
    'Başka bir devreye geçmek için üstteki <b>📚 Devreler</b> ya da ◀ ▶ düğmeleri.',
    '📝 Test devrelerinde kılavuz gizli: önce kendin dene, sonra "Kontrol et".',
    'Dalga ekranı dikeyde ne kadar doldurursa ölçüm o kadar hassas olur (ama taşmasın!).',
    'Ekran karıştıysa: <b>Autoset</b>. Hâlâ karışıksa <b>Default</b>, sonra Autoset.',
    'Bir liste ya da menü açık kaldıysa <b>Menu Off</b> tuşu kapatır.',
    'Faz ölçerken iki kanalın da 0 V çizgisi (soldaki ▶1 ▶2) aynı yerde olmalı: POSITION düğmelerine tıkla.',
    'İmleçlerde <b>Select</b> tuşu ① → ② → ①② arasında geçiş yapar; ①② ikisini birlikte kaydırır.',
    'Tezgâhta kondansatörün/bobinin üstünde beklersen o frekanstaki reaktansını söyler.',
    'Tezgâhta yanlış bir şey mi yaptın? Tezgâhın üstündeki <b>↶ Geri al</b>.',
    'Jeneratöre tıkla: sağda bu devrenin frekansları tek tıkla seçilebilir.',
  ];
  let tipKey = '', genIdx = 0, genT = 0;
  function smartTip() {
    if (flash && performance.now() < flash.until) return { key: 'f' + flash.t, lvl: flash.lvl === 'warn' ? 'warn' : 'good', icon: flash.lvl === 'warn' ? '⚠️' : '✅', text: flash.t };
    const s = S(), R = State.R, rec = R.rec, P = Bench.model.probes;
    if (!App.power) return { key: 'pw', lvl: 'warn', icon: '⏻', text: 'Cihaz kapalı. Sol alttaki <b>POWER</b> tuşuna bas.', acts: [['👁 Göster', 'show:power']] };
    if (Sim.warnings.length) return { key: 'gl', lvl: 'warn', icon: '⚠️', text: 'Bir probun <b>timsah klipsi topraktan farklı bir noktada</b> → o nokta toprağa kısa devre! Timsahı GND\'ye taşı.', acts: [['⚡ Düzelt', 'fixGnd']] };
    const on = [0, 1].filter(c => s.ch[c].on);
    if (!on.length) return { key: 'noch', lvl: 'warn', icon: '📺', text: 'Hiç kanal açık değil. <b>CH1</b> tuşuna bas.', acts: [['👁 Göster', 'show:ch1']] };
    if (s.acq.xy) return { key: 'xy', lvl: '', icon: 'ℹ️', text: 'XY modundasın: yatay = CH1, dikey = CH2. Normal görünüm için Acquire → XY → OFF.', acts: [['↩ YT\'ye dön', 'do:yt']] };
    for (const c of on) {
      const ph = P[c].x10 ? 10 : 1;
      if (ph !== s.ch[c].atten) return { key: 'att' + c, lvl: 'warn', icon: '🔧', text: `CH${c + 1}: probun anahtarı <b>×${ph}</b> ama menüde <b>${s.ch[c].atten}X</b> → ekrandaki değerler ${s.ch[c].atten > ph ? s.ch[c].atten / ph : ph / s.ch[c].atten} kat yanlış!`, acts: [['⚡ Eşitle', 'do:attenFix']] };
      if (!P[c].tip) return { key: 'tip' + c, lvl: 'warn', icon: '🔌', text: `CH${c + 1} açık ama <b>probu hiçbir yere bağlı değil</b>. Tezgâhta probun ucunu bir noktaya sürükle veya sağdaki listeden seç.` };
    }
    if (!R.run) return { key: 'stop', lvl: '', icon: '⏸️', text: 'Görüntü <b>donduruldu (STOP)</b>. Canlı görmek için <b>Run/Stop</b> tuşuna bas.', acts: [['▶ Çalıştır', 'do:run']] };
    if (rec && !rec.roll) {
      for (const c of on) if (rec.clip[c]) return { key: 'clip' + c, lvl: 'warn', icon: '↕️', text: `CH${c + 1} dalgası <b>ekrandan taşıyor</b> → ölçümler "?" çıkar. <b>CH${c + 1} SCALE</b> düğmesini saat yönünün <b>tersine</b> çevir ya da Autoset.`, acts: [['👁 Göster', 'show:ch' + (c + 1) + 'scale'], ['⚡ Autoset', 'do:autoset']] };
      for (const c of on) {
        const r = val('Pk-Pk', 'CH' + (c + 1));
        if (r && P[c].tip && R.freq && R.freq * 10 * State.tdiv() >= 1 && r.v / State.vdiv(c) < 1.2 && r.v > 0.002) return { key: 'small' + c, lvl: '', icon: '🔎', text: `CH${c + 1} dalgası çok küçük (${(r.v / State.vdiv(c)).toFixed(1)} kare). <b>CH${c + 1} SCALE</b> düğmesini saat yönünde çevir — ölçüm daha hassas olur.`, acts: [['👁 Göster', 'show:ch' + (c + 1) + 'scale']] };
      }
    }
    if ((R.status === 'Trig?' || R.status === 'Auto') && rec && (s.trig.src === 'CH1' || s.trig.src === 'CH2')) {
      const c = s.trig.src === 'CH2' ? 1 : 0;
      if (s.ch[c].on) return { key: 'trig', lvl: 'warn', icon: '🌀', text: `<b>Tetiklenmiyor</b> (${R.status}) — dalga kayıyor/donuk. TRIGGER bölümündeki <b>50%</b> tuşuna bas.`, acts: [['⚡ 50%', 'do:level50'], ['👁 Göster', 'show:t50,level']] };
      return { key: 'trigoff', lvl: 'warn', icon: '🌀', text: `Tetik kaynağı ${s.trig.src} ama o kanal kapalı. Trigger Menu → Source ile açık bir kanalı seç.`, acts: [['⚡ Tetik = CH1', 'do:trigCh1']] };
    }
    const g = fg();
    if (g && g.freq < 60 && on.some(c => s.ch[c].coupling === 'AC')) return { key: 'ac', lvl: 'warn', icon: '🧲', text: `Düşük frekansta (${fq(g.freq)}) <b>AC kuplaj</b> açık: faz ve genlik ölçümü bozulur. CH menüsü → Coupling → <b>DC</b>.`, acts: [['⚡ DC yap', 'do:dc']] };
    const fr = R.freq || (g && g.freq);
    if (fr && rec && !rec.roll) {
      const cyc = fr * 10 * State.tdiv();
      if (cyc > 25) return { key: 'many', lvl: '', icon: '↔️', text: `Ekranda ~${Math.round(cyc)} dalga var, çok sık. HORIZONTAL <b>SCALE</b> düğmesini saat yönünde çevir: 2–4 dalga ideal.`, acts: [['👁 Göster', 'show:hscale']] };
      if (cyc < 0.9 && !isRlc()) return { key: 'few', lvl: '', icon: '↔️', text: 'Ekranda bir tam dalga bile yok. HORIZONTAL <b>SCALE</b> düğmesini saat yönünün tersine çevir ya da en kolayı <b>Autoset</b>.', acts: [['⚡ Autoset', 'do:autoset'], ['👁 Göster', 'show:hscale']] };
    }
    if (performance.now() - genT > 11000) { genT = performance.now(); genIdx = (genIdx + 1) % GENERIC.length; }
    return { key: 'g' + genIdx, lvl: '', icon: '💡', text: GENERIC[genIdx] };
  }
  const TIP_ACT = {
    fixGnd: () => { BenchUI.checkpoint(); const gg = Bench.nodes().find(n => n.gnd); Bench.model.probes.forEach(p => { if (p.gnd && gg && !Bench.nodeOf(p.gnd).gnd) p.gnd = BenchUI.pinForNode(gg.key); }); Bench.changed(); BenchUI.render(); },
  };
  function renderTip(force) {
    const t = smartTip();
    if (!force && t.key === tipKey) return;
    tipKey = t.key;
    const bar = document.getElementById('tipBar'), txt = document.getElementById('tipText');
    bar.className = 'bar ' + (t.lvl || '');
    document.getElementById('tipIcon').textContent = t.icon;
    txt.style.opacity = 0;
    setTimeout(() => { txt.innerHTML = t.text; txt.style.opacity = 1; }, 120);
    document.getElementById('tipActs').innerHTML = (t.acts || []).map(([l, a]) => {
      const [k, v] = a.split(':');
      return k === 'show' ? `<span class="acts"><button data-show="${v}">${l}</button></span>` : k === 'do' ? `<span class="acts"><button class="do" data-do="${v}">${l}</button></span>` : `<span class="acts"><button class="do" data-tipact="${a}">${l}</button></span>`;
    }).join('');
    document.querySelectorAll('#tipActs [data-tipact]').forEach(b => b.onclick = () => { TIP_ACT[b.dataset.tipact](); renderTip(true); });
  }

  let liveT = 0, tipT = 0, lastVer = -1;
  function tick(t) {
    if (t - liveT > 250) {
      liveT = t; updateLive();
      // tezgâh değişince (değer, prob) teori ve metinler yenilensin; yazı yazılan kutuyu bozma
      if (Bench.model.version !== lastVer && !(document.activeElement && bodyEl.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) {
        lastVer = Bench.model.version; const sc = bodyEl.scrollTop; render(true); bodyEl.scrollTop = sc;
      }
    }
    if (t - tipT > 600) { tipT = t; renderTip(); }
  }

  return { init, tick, toggle, show: showTab, render, theory, ACT, CHK, rlcScan, loadCircuit, openLibrary, note, get circuit() { return store.circuit; }, get STEPS() { return STEPS; } };
})();
