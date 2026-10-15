/* =====================================================================
 * Menus — veri güdümlü alt menü (7 tuş) / yan menü (5 tuş) sistemi
 *   Menü ağacı GDS-1000B kılavuzundan (Bölüm: Vertical, Measure, Cursor, Math, Acquire, Display,
 *   Trigger, Save/Recall, Utility, Reference, Autoset, Zoom). Yazılar cihazdaki gibi İngilizce.
 *
 *   Alt menü öğesi: { label, value?:()=>str, onPress?:()=>void, side?: { title, items:[...] } }
 *   Yan menü öğesi: { label, value?:()=>str, checked?:()=>bool, onPress?:()=>void, variable?:(adım)=>void }
 *   'variable' olan yan öğeye basılınca VARIABLE düğmesi o parametreye bağlanır.
 * ===================================================================== */
const Menus = (() => {
  const M = { cur: null, sideB: -1, varSel: null, hidden: false, list: null, help: false, helpText: null, refSel: 0, saveSet: 0, recallSet: 0, recallRef: 0, wfSrc: 'CH1', wfDest: 0 };
  const S = () => State.S;
  const fmt = Units.fmt;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const cyc = (arr, cur, d = 1) => arr[(arr.indexOf(cur) + d + arr.length) % arr.length];
  function opt(label, getter, setter, val, after) { return { label, checked: () => getter() === val, onPress: () => { setter(val); after && after(); } }; }
  const attenTxt = (a) => (a < 1 ? (a * 1000) + 'mX' : a + 'X');
  const dirty = () => Acq.markDirty();

  /* ---------------- menü tanımları ---------------- */
  function chMenu(c) {
    const C = S().ch[c];
    return [
      { label: 'Coupling', value: () => C.coupling, onPress: () => { C.coupling = cyc(['DC', 'AC', 'GND'], C.coupling); Sim.refilterTrig(); dirty(); } },
      { label: 'Impedance', value: () => '1MΩ' },
      { label: 'Invert', value: () => C.invert ? 'On' : 'Off', onPress: () => { C.invert = !C.invert; dirty(); } },
      { label: 'Bandwidth', value: () => C.bw, side: { title: 'Bandwidth', items: [
        opt('Full', () => C.bw, v => C.bw = v, 'Full'), opt('20MHz', () => C.bw, v => C.bw = v, '20MHz')] } },
      { label: 'Expand', value: () => 'By ' + C.expand, side: { title: 'Expand', items: [
        opt('By Ground', () => C.expand, v => C.expand = v, 'Ground'), opt('By Center', () => C.expand, v => C.expand = v, 'Center')] } },
      { label: 'Position', value: () => fmt(C.pos * State.vdiv(c), 'V'), side: { title: 'Position', items: [
        { label: 'Position', value: () => fmt(C.pos * State.vdiv(c), 'V'), variable: (n) => { C.pos = clamp(C.pos + n * 0.04, -12, 12); dirty(); } },
        { label: 'Set to 0', onPress: () => { C.pos = 0; dirty(); } }] } },
      { label: 'Probe', value: () => `${C.probeType} ${attenTxt(C.atten)}`, side: { title: 'Probe', items: [
        { label: 'Voltage/Current', value: () => C.probeType, onPress: () => { C.probeType = C.probeType === 'Voltage' ? 'Current' : 'Voltage'; } },
        { label: 'Attenuation', value: () => attenTxt(C.atten), variable: (n) => setAtten(c, State.ATTEN[clamp(State.ATTEN.indexOf(C.atten) + Math.sign(n), 0, State.ATTEN.length - 1)]) },
        { label: 'Set to 10X', onPress: () => setAtten(c, 10) },
        { label: 'Deskew', value: () => fmt(C.deskew, 's'), variable: (n) => { C.deskew = clamp(C.deskew + n * 1e-9, -50e-9, 50e-9); dirty(); } },
        { label: 'Set to 0s', onPress: () => { C.deskew = 0; dirty(); } }] } },
    ];
  }
  function setAtten(c, a) {
    const C = S().ch[c], T = S().trig;
    if ((T.src === 'CH1' && c === 0) || (T.src === 'CH2' && c === 1)) T.level *= a / C.atten;
    C.atten = a; dirty();
  }

  const SRC3 = ['CH1', 'CH2', 'Math'];
  function addMeas(name) {
    const m = S().meas;
    if (m.items.length >= 8) { State.message('Maximum 8 measurements can be displayed'); return; }
    m.items.push({ name, s1: m.src1, s2: m.src2 }); Measure.resetStats();
  }
  function openList(title, items, onSelect) { M.list = { title, items, idx: 0, onSelect }; }
  function measureMenu() {
    const m = S().meas;
    return [
      { label: 'Add Measurement', side: { title: 'Add Measurement', items: [
        { label: 'V/I', onPress: () => openList('Voltage / Current', Measure.V_LIST, i => addMeas(Measure.V_LIST[i])) },
        { label: 'Time', onPress: () => openList('Time', Measure.T_LIST, i => addMeas(Measure.T_LIST[i])) },
        { label: 'Delay', onPress: () => openList('Delay', Measure.D_LIST, i => addMeas(Measure.D_LIST[i])) },
        { label: 'Source1', value: () => m.src1, onPress: () => m.src1 = cyc(SRC3, m.src1), variable: (n) => m.src1 = cyc(SRC3, m.src1, Math.sign(n)) },
        { label: 'Source2', value: () => m.src2, onPress: () => m.src2 = cyc(SRC3, m.src2), variable: (n) => m.src2 = cyc(SRC3, m.src2, Math.sign(n)) }] } },
      { label: 'Remove Measurement', side: { title: 'Remove', items: [
        { label: 'Select Measurement', onPress: () => { if (!m.items.length) return State.message('No measurement'); openList('Remove Measurement', m.items.map(it => `${it.s1} ${it.name}`), i => { m.items.splice(i, 1); Measure.resetStats(); M.list = null; }); } },
        { label: 'Remove All', onPress: () => { m.items = []; Measure.resetStats(); } }] } },
      { label: 'Gating', value: () => ({ Off: 'Off', Screen: 'Screen', Cursors: 'Cursors' })[m.gating], side: { title: 'Gating', items: [
        opt('Off (Full Record)', () => m.gating, v => m.gating = v, 'Off'), opt('Screen', () => m.gating, v => m.gating = v, 'Screen'),
        opt('Between Cursors', () => m.gating, v => m.gating = v, 'Cursors')] } },
      { label: 'Display All', value: () => m.displayAll || 'OFF', side: { title: 'Display All', items: [
        { label: 'Source', value: () => m.displayAll || '—', onPress: () => m.displayAll = m.displayAll === 'CH1' ? 'CH2' : m.displayAll === 'CH2' ? 'Math' : 'CH1' },
        { label: 'OFF', onPress: () => m.displayAll = null }] } },
      { label: 'High-Low', value: () => ({ Histogram: 'Histogram', MinMax: 'Min-Max', Auto: 'Auto' })[m.highlow], side: { title: 'High-Low', items: [
        opt('Histogram', () => m.highlow, v => m.highlow = v, 'Histogram'), opt('Min-Max', () => m.highlow, v => m.highlow = v, 'MinMax'),
        opt('Auto', () => m.highlow, v => m.highlow = v, 'Auto'), { label: 'Set to Defaults', onPress: () => m.highlow = 'Auto' }] } },
      { label: 'Statistics', value: () => m.stats ? 'On' : 'Off', side: { title: 'Statistics', items: [
        { label: 'Statistics', value: () => m.stats ? 'On' : 'Off', onPress: () => { m.stats = !m.stats; Measure.resetStats(); } },
        { label: 'Samples', value: () => String(m.statN), variable: (n) => m.statN = clamp(m.statN + n * (m.statN >= 100 ? 10 : 1), 2, 1000) },
        { label: 'Reset Statistics', onPress: () => Measure.resetStats() }] } },
      { label: 'Reference Levels', side: { title: 'Ref Levels', items: [
        { label: 'High Ref', value: () => m.refs.hi.toFixed(1) + '%', variable: (n) => m.refs.hi = clamp(m.refs.hi + n * 0.5, m.refs.mid + 0.5, 100) },
        { label: 'Mid Ref', value: () => m.refs.mid.toFixed(1) + '%', variable: (n) => m.refs.mid = clamp(m.refs.mid + n * 0.5, m.refs.lo + 0.5, m.refs.hi - 0.5) },
        { label: 'Low Ref', value: () => m.refs.lo.toFixed(1) + '%', variable: (n) => m.refs.lo = clamp(m.refs.lo + n * 0.5, 0, m.refs.mid - 0.5) },
        { label: 'Set to Defaults', onPress: () => m.refs = { hi: 90, mid: 50, lo: 10 } }] } },
    ];
  }
  function cursorMenu() {
    const Cu = S().cursor;
    const selTxt = () => ['①', '②', '①②'][Cu.sel];
    return [
      { label: 'H Cursor', value: () => Cu.mode === 'H' ? selTxt() : 'Off', onPress: () => { if (Cu.mode !== 'H') { Cu.mode = 'H'; Cu.sel = 0; } else Cu.sel = (Cu.sel + 1) % 3; M.varSel = null; } },
      { label: 'V Cursor', value: () => Cu.mode === 'V' ? selTxt() : 'Off', onPress: () => { if (Cu.mode !== 'V') { Cu.mode = 'V'; Cu.sel = 0; } else Cu.sel = (Cu.sel + 1) % 3; M.varSel = null; } },
      { label: 'Source', value: () => Cu.src, side: { title: 'Source', items: SRC3.map(s => opt(s, () => Cu.src, v => Cu.src = v, s)) } },
      { label: 'H Unit', value: () => Cu.hunit, side: { title: 'H Unit', items: ['S', 'Hz', '%', '°'].map(s => opt(s, () => Cu.hunit, v => Cu.hunit = v, s)) } },
      { label: 'V Unit', value: () => Cu.vunit, side: { title: 'V Unit', items: ['Base', '%'].map(s => opt(s, () => Cu.vunit, v => Cu.vunit = v, s)) } },
      { label: 'Set Cursor Pos. As 100%', onPress: () => {
        const inf = Renderer.cursorInfo();
        Cu.hRef = Math.abs(inf.tAt(Cu.h[1]) - inf.tAt(Cu.h[0]));
        Cu.vRef = Cu.mode === 'V' ? Math.abs(inf.vOf(Cu.v[1]) - inf.vOf(Cu.v[0])) : Math.abs(inf.vAt(Cu.h[1]) - inf.vAt(Cu.h[0]));
        State.message('Cursor positions set as 100%');
      } },
      { label: 'Cursor Off', onPress: () => { Cu.mode = null; } },
    ];
  }
  function appMenu() {
    const na = () => State.message('This application is not available in the simulator');   // TAHMIN: APP listesi
    return [{ label: 'Go-NoGo', onPress: na }, { label: 'Data Log', onPress: na }, { label: 'DVM', onPress: na }, { label: 'Remote Disk', onPress: na }];
  }
  function acquireMenu() {
    const A = S().acq;
    return [
      { label: 'Mode', value: () => A.mode === 'Average' ? `Average(${State.AVG[A.avgIdx]})` : A.mode === 'Peak' ? 'Peak Detect' : 'Sample', side: { title: 'Mode', items: [
        opt('Sample', () => A.mode, v => A.mode = v, 'Sample', dirty), opt('Peak Detect', () => A.mode, v => A.mode = v, 'Peak', dirty),
        { label: 'Average', value: () => String(State.AVG[A.avgIdx]), checked: () => A.mode === 'Average', onPress: () => { A.mode = 'Average'; dirty(); },
          variable: (n) => { A.avgIdx = clamp(A.avgIdx + Math.sign(n), 0, State.AVG.length - 1); A.mode = 'Average'; dirty(); } }] } },
      { label: 'XY', value: () => A.xy ? 'Triggered XY' : 'OFF (YT)', side: { title: 'XY', items: [
        opt('OFF (YT)', () => A.xy, v => A.xy = v, false, () => State.R.persistClear = true), opt('Triggered XY', () => A.xy, v => A.xy = v, true, () => State.R.persistClear = true)] } },
      { label: 'Record Length', value: () => rlTxt(State.RL[A.rlIdx]), side: { title: 'Record Length', items: State.RL.map((r, i) => opt(rlTxt(r), () => A.rlIdx, v => A.rlIdx = v, i, dirty)) } },
      { label: 'Reset H Position to 0s', onPress: () => { S().hpos = 0; dirty(); } },
    ];
  }
  const rlTxt = (r) => r >= 1e6 ? r / 1e6 + 'M' : r >= 1e3 ? r / 1e3 + 'k' : String(r);
  function displayMenu() {
    const D = S().disp;
    return [
      { label: D.vector ? 'Vector' : 'Dot', value: () => 'Dot/Vector', onPress: () => { D.vector = !D.vector; } },
      { label: 'Persistence', value: () => State.PERSIST_LBL[D.persistIdx], side: { title: 'Persistence', items: [
        { label: 'Time', value: () => State.PERSIST_LBL[D.persistIdx], variable: (n) => { D.persistIdx = clamp(D.persistIdx + Math.sign(n), 0, State.PERSIST.length - 1); State.R.persistClear = true; } },
        { label: 'Clear Persistence', onPress: () => State.R.persistClear = true }] } },
      { label: 'Intensity', side: { title: 'Intensity', items: [
        { label: 'Waveform', value: () => D.wfInt + '%', variable: (n) => D.wfInt = clamp(D.wfInt + n, 0, 100) },
        { label: 'Graticule', value: () => D.gridInt + '%', variable: (n) => D.gridInt = clamp(D.gridInt + n, 10, 100) },
        { label: 'Backlight', value: () => D.backlight + '%', variable: (n) => D.backlight = clamp(D.backlight + n, 2, 100) }] } },
      { label: 'Graticule', value: () => D.grat, side: { title: 'Graticule', items: ['Full', 'Grid', 'Cross Hair', 'Frame'].map(g => opt(g, () => D.grat, v => D.grat = v, g)) } },
    ];
  }
  function triggerMenu() {
    const T = S().trig;
    const rf = () => { Sim.refilterTrig(); Acq.resetArm(); };
    const na = (t) => () => State.message(`${t} trigger is not simulated (Edge only)`);   // TAHMIN: yalnız Edge simüle edildi
    const lvlStep = () => T.src === 'CH1' || T.src === 'CH2' ? State.vdiv(T.src === 'CH2' ? 1 : 0) * 0.04 : 0.02;
    return [
      { label: 'Type', value: () => T.type, side: { title: 'Type', items: [
        opt('Edge', () => T.type, v => T.type = v, 'Edge'), { label: 'Delay', onPress: na('Delay') }, { label: 'Pulse Width', onPress: na('Pulse Width') },
        { label: 'Video', onPress: na('Video') }, { label: 'Others', onPress: na('Pulse Runt / Rise&Fall / Timeout') }] } },
      { label: 'Source', value: () => T.src === 'LINE' ? 'AC Line' : T.src, side: { title: 'Source', items: [
        opt('CH1', () => T.src, v => T.src = v, 'CH1', rf), opt('CH2', () => T.src, v => T.src = v, 'CH2', rf),
        opt('EXT', () => T.src, v => T.src = v, 'EXT', rf), opt('AC Line', () => T.src, v => T.src = v, 'LINE', rf),
        { label: 'Alternate', value: () => 'Off', onPress: () => State.message('Alternate trigger is not simulated') }] } },
      { label: 'Coupling', value: () => ({ DC: 'DC', AC: 'AC', HF: 'HF Reject', LF: 'LF Reject' })[T.coupling] + (T.noiseRej ? ' NR' : ''), side: { title: 'Coupling', items: [
        opt('DC', () => T.coupling, v => T.coupling = v, 'DC', rf), opt('AC', () => T.coupling, v => T.coupling = v, 'AC', rf),
        opt('HF Reject', () => T.coupling, v => T.coupling = v, 'HF', rf), opt('LF Reject', () => T.coupling, v => T.coupling = v, 'LF', rf),
        { label: 'Noise Rejection', value: () => T.noiseRej ? 'On' : 'Off', onPress: () => T.noiseRej = !T.noiseRej }] } },
      { label: 'Slope', value: () => ({ rise: '↗ Rising', fall: '↘ Falling', either: '↕ Either' })[T.slope], onPress: () => { T.slope = cyc(['rise', 'fall', 'either'], T.slope); Acq.resetArm(); } },
      { label: 'Level', value: () => T.src === 'LINE' ? '—' : fmt(T.level, 'V'), side: { title: 'Level', items: [
        { label: 'Level', value: () => fmt(T.level, 'V'), variable: (n) => { T.level += n * lvlStep(); App.showLevel(); } },
        { label: 'Set to TTL 1.4V', onPress: () => T.level = 1.4 }, { label: 'Set to ECL -1.3V', onPress: () => T.level = -1.3 },
        { label: 'Set to 50%', onPress: () => Acq.level50() }] } },
      { label: 'Mode', value: () => T.mode, side: { title: 'Mode', items: [
        opt('Auto (Untriggered Roll)', () => T.mode, v => T.mode = v, 'Auto'), opt('Normal', () => T.mode, v => T.mode = v, 'Normal')] } },
      { label: 'Holdoff', value: () => fmt(T.holdoff, 's'), side: { title: 'Holdoff', items: [
        { label: 'Holdoff', value: () => fmt(T.holdoff, 's'), variable: (n) => T.holdoff = clamp(T.holdoff * Math.pow(1.12, n), 4e-9, 10) },
        { label: 'Set to Minimum', onPress: () => T.holdoff = 4e-9 }] } },
    ];
  }
  function mathMenu() {
    const Mt = S().math, F = Mt.fft;
    const head = [
      { label: 'Dual Channel', value: () => Mt.kind === 'dual' ? '●' : '', onPress: () => { Mt.kind = 'dual'; State.R.persistClear = true; } },
      { label: 'FFT', value: () => Mt.kind === 'fft' ? '●' : '', onPress: () => { Mt.kind = 'fft'; State.R.persistClear = true; } },
      { label: 'Advanced Math', onPress: () => State.message('Advanced Math is not available in the simulator') },  // TAHMIN
    ];
    if (Mt.kind === 'fft') return head.concat([
      { label: 'Source', value: () => F.src, side: { title: 'Source', items: ['CH1', 'CH2'].map(s => opt(s, () => F.src, v => F.src = v, s)) } },
      { label: 'Vertical Units', value: () => F.unit === 'dBV' ? 'dBV RMS' : 'Linear RMS', side: { title: 'Units', items: [
        opt('Linear RMS', () => F.unit, v => F.unit = v, 'Lin'), opt('dBV RMS', () => F.unit, v => F.unit = v, 'dBV')] } },
      { label: 'Window', value: () => F.win, side: { title: 'Window', items: ['Hanning', 'Hamming', 'Rectangular', 'Blackman'].map(s => opt(s, () => F.win, v => F.win = v, s)) } },
      { label: 'Vertical / Horizontal', side: { title: 'FFT Scale', items: [
        { label: 'Position', value: () => F.pos.toFixed(2) + 'div', variable: (n) => F.pos = clamp(F.pos + n * 0.1, -12, 12) },
        { label: 'Scale', value: () => F.unit === 'dBV' ? F.scale + 'dB' : fmt(State.VDIV[F.linIdx ?? 9], 'V'), variable: (n) => { if (F.unit === 'dBV') F.scale = clamp(F.scale + Math.sign(n), 1, 20); else F.linIdx = clamp((F.linIdx ?? 9) + Math.sign(n), 0, State.VDIV.length - 1); } },
        { label: 'Center Freq', value: () => { const sp = MathFn.spectrum(); return fmt(F.hcenter ?? (sp ? sp.fmax / 2 : 0), 'Hz'); }, variable: (n) => { const sp = MathFn.spectrum(); if (!sp) return; const hd = F.hdiv || sp.fmax / 10; F.hcenter = clamp((F.hcenter ?? sp.fmax / 2) + n * hd / 5, 0, sp.fmax); } },
        { label: 'Span/div', value: () => { const sp = MathFn.spectrum(); return fmt(F.hdiv || (sp ? sp.fmax / 10 : 0), 'Hz'); }, variable: (n) => { const sp = MathFn.spectrum(); if (!sp) return; F.hdiv = clamp((F.hdiv || sp.fmax / 10) * Math.pow(n > 0 ? 0.5 : 2, Math.abs(Math.sign(n))), sp.df, sp.fmax / 10); } }] } },
    ]);
    const S2 = ['CH1', 'CH2'];
    return head.concat([
      { label: 'Source1', value: () => Mt.s1, side: { title: 'Source1', items: S2.map(s => opt(s, () => Mt.s1, v => Mt.s1 = v, s)) } },
      { label: 'Operator', value: () => Mt.op, side: { title: 'Operator', items: ['+', '−', '×', '÷'].map(s => opt(s, () => Mt.op, v => Mt.op = v, s)) } },
      { label: 'Source2', value: () => Mt.s2, side: { title: 'Source2', items: S2.map(s => opt(s, () => Mt.s2, v => Mt.s2 = v, s)) } },
      { label: 'Position / Unit', value: () => fmt(Mt.vdiv, (MathFn.dual() || {}).unit ?? 'V') + '/div', side: { title: 'Math', items: [
        { label: 'Position', value: () => Mt.pos.toFixed(2) + 'div', variable: (n) => Mt.pos = clamp(Mt.pos + n * 0.04, -12, 12) },
        { label: 'Unit/div', value: () => fmt(Mt.vdiv, (MathFn.dual() || {}).unit ?? 'V'), variable: (n) => { const L = Units.seq125(1e-3, 1e3); Mt.vdiv = L[clamp(L.findIndex(v => v >= Mt.vdiv * 0.999) + Math.sign(n), 0, L.length - 1)]; } },
        { label: 'Set to 0', onPress: () => Mt.pos = 0 }] } },
    ]);
  }
  function saveRef(i, src) {
    const rec = State.R.rec, Sx = S();
    let arr = null, vdiv, pos;
    if (src === 'Math') { const m = MathFn.dual(); if (m) { arr = m.arr; vdiv = Sx.math.vdiv; pos = Sx.math.pos; } }
    else { const c = src === 'CH2' ? 1 : 0; if (rec && rec.ch[c] && Sx.ch[c].on) { arr = rec.ch[c]; vdiv = State.vdiv(c); pos = Sx.ch[c].pos; } }
    if (!arr) { State.message(`${src} has no waveform to save`); return false; }
    Sx.ref[i] = { on: true, data: Array.from(arr), vdiv, pos, src, tdiv: State.tdiv(), fs: rec.fs, date: new Date().toLocaleString() };
    State.message(`${src} saved to Ref${i + 1}`);
    return true;
  }
  function refMenu() {
    const Sx = S();
    return [0, 1, 2, 3].map(i => ({
      label: 'R' + (i + 1), value: () => Sx.ref[i].data ? (Sx.ref[i].on ? 'On' : 'Off') : 'Empty',
      onPress: () => { M.refSel = i; },
      side: { title: 'Ref' + (i + 1), items: [
        { label: 'Display', value: () => Sx.ref[i].on ? 'On' : 'Off', onPress: () => { if (!Sx.ref[i].data) return State.message('Ref is empty: use Save'); Sx.ref[i].on = !Sx.ref[i].on; State.R.persistClear = true; } },
        { label: 'Source', value: () => M.wfSrc, onPress: () => M.wfSrc = cyc(SRC3, M.wfSrc) },
        { label: 'Save', onPress: () => saveRef(i, M.wfSrc) },
        { label: 'Ref Details', onPress: () => { const r = Sx.ref[i]; State.message(r.data ? `Ref${i + 1}: ${r.src}  ${fmt(r.vdiv, 'V')}/div  ${fmt(r.tdiv, 's')}/div  ${fmt(r.fs, 'Sa/s')}  ${r.date}` : 'Empty', 4000); } },
        { label: 'Clear', onPress: () => { Sx.ref[i] = { on: false }; State.R.persistClear = true; } }] },
    }));
  }
  function saveMenu() {
    const Sx = S();
    const dests = ['Ref1', 'Ref2', 'Ref3', 'Ref4', 'File (CSV)'];
    return [
      { label: 'Save Image', value: () => 'PNG', side: { title: 'Save Image', items: [
        { label: 'File Format', value: () => 'PNG' },
        { label: 'Ink Saver', value: () => Sx.util.inkSaver ? 'On' : 'Off', onPress: () => Sx.util.inkSaver = !Sx.util.inkSaver },
        { label: 'Save Now', onPress: () => App.saveImage() }] } },
      { label: 'Save Waveform', side: { title: 'Save Waveform', items: [
        { label: 'Source', value: () => M.wfSrc, onPress: () => M.wfSrc = cyc(SRC3, M.wfSrc) },
        { label: 'To', value: () => dests[M.wfDest], onPress: () => M.wfDest = (M.wfDest + 1) % 5, variable: (n) => M.wfDest = clamp(M.wfDest + Math.sign(n), 0, 4) },
        { label: 'Save Now', onPress: () => M.wfDest < 4 ? saveRef(M.wfDest, M.wfSrc) : App.saveCSV(M.wfSrc) }] } },
      { label: 'Save Setup', side: { title: 'Save Setup', items: [
        { label: 'To', value: () => 'Set' + (M.saveSet + 1), variable: (n) => M.saveSet = clamp(M.saveSet + Math.sign(n), 0, 19) },
        { label: 'Save Now', onPress: () => App.saveSetup(M.saveSet) }] } },
      { label: 'Recall Waveform', side: { title: 'Recall Wave', items: [
        { label: 'From', value: () => 'Ref' + (M.recallRef + 1), variable: (n) => M.recallRef = clamp(M.recallRef + Math.sign(n), 0, 3) },
        { label: 'Recall Now', onPress: () => { const r = Sx.ref[M.recallRef]; if (!r.data) return State.message('Ref is empty'); r.on = true; State.message(`Ref${M.recallRef + 1} displayed`); } }] } },
      { label: 'Recall Setup', side: { title: 'Recall Setup', items: [
        { label: 'From', value: () => 'Set' + (M.recallSet + 1) + (App.hasSetup(M.recallSet) ? '' : ' (empty)'), variable: (n) => M.recallSet = clamp(M.recallSet + Math.sign(n), 0, 19) },
        { label: 'Recall Now', onPress: () => App.recallSetup(M.recallSet) },
        { label: 'Default Setup', onPress: () => App.defaultSetup() }] } },
    ];
  }
  function utilityMenu() {
    const U = S().util;
    return [
      { label: 'Language', value: () => 'English', onPress: () => State.message('Language: English') },
      { label: 'System', side: { title: 'System', items: [
        { label: 'System Info', onPress: () => State.message('GDS-1102B  ·  Simulator  ·  FW V1.xx (TAHMIN)  ·  S/N SIM000001', 4000) },
        { label: 'Erase Memory', onPress: () => { App.eraseMemory(); State.message('Setups and references erased'); } }] } },
      { label: 'Hardcopy', side: { title: 'Hardcopy', items: [
        { label: 'Function', value: () => 'Save' },
        { label: 'Assign Save To', value: () => U.hcAssign, onPress: () => U.hcAssign = cyc(['Image', 'Waveform', 'Setup'], U.hcAssign) },
        { label: 'Ink Saver', value: () => U.inkSaver ? 'On' : 'Off', onPress: () => U.inkSaver = !U.inkSaver }] } },
      { label: 'Probe Comp.', value: () => fmt(U.compFreq, 'Hz'), side: { title: 'Probe Comp.', items: [
        { label: 'Frequency', value: () => fmt(U.compFreq, 'Hz'), variable: (n) => U.compFreq = clamp(U.compFreq + Math.sign(n) * 1000, 1000, 200000) },
        { label: 'Set to Defaults', onPress: () => U.compFreq = 1000 }] } },
    ];
  }
  function autosetMenu() {
    return [
      { label: 'Fit Screen Mode', value: () => S().autosetMode === 'Fit' ? '●' : '', onPress: () => S().autosetMode = 'Fit' },
      { label: 'AC Priority Mode', value: () => S().autosetMode === 'AC' ? '●' : '', onPress: () => S().autosetMode = 'AC' },
      { label: 'Undo Autoset', onPress: () => { const u = State.R.undoAutoset; if (!u) return State.message('Nothing to undo'); State.set(u); State.R.undoAutoset = null; Sim.refilterTrig(); State.message('Autoset undone'); } },
    ];
  }
  function zoomMenu() {
    const Z = S().zoom;
    return [
      { label: 'Horizontal Position', value: () => Z.knob === 'hpos' ? '●' : '', onPress: () => Z.knob = 'hpos' },
      { label: 'Horizontal Time/Div', value: () => Z.knob === 'htdiv' ? '●' : '', onPress: () => Z.knob = 'htdiv' },
      { label: 'Zoom Position', value: () => Z.knob === 'zoom' ? '●' : '', onPress: () => Z.knob = 'zoom' },
      { label: 'Reset Zoom & H POS to 0s', onPress: () => { Z.pos = 0; S().hpos = 0; dirty(); } },
    ];
  }
  const DEFS = {
    ch1: () => chMenu(0), ch2: () => chMenu(1), measure: measureMenu, cursor: cursorMenu, app: appMenu, acquire: acquireMenu,
    display: displayMenu, trigger: triggerMenu, math: mathMenu, ref: refMenu, save: saveMenu, utility: utilityMenu,
    autoset: autosetMenu, zoom: zoomMenu,
  };

  /* ---------------- etkileşim ---------------- */
  const bottom = () => M.cur ? DEFS[M.cur]() : [];
  const side = () => { if (M.sideB < 0) return null; const b = bottom()[M.sideB]; return b && b.side ? b.side : null; };
  function open(id) {
    if (M.cur !== id) { M.cur = id; M.sideB = -1; M.varSel = null; M.list = null; }
    M.hidden = false;
  }
  function close() { M.cur = null; M.sideB = -1; M.varSel = null; M.list = null; }
  function isOpen(id) { return M.cur === id && !M.hidden; }
  function pressBottom(i) {
    const items = bottom(); const it = items[i];
    if (!it || M.hidden) return;
    M.list = null;
    if (it.onPress) it.onPress();
    if (it.side) {
      M.sideB = i; M.varSel = null;
      const vi = it.side.items.findIndex(s => s.variable);
      if (vi >= 0 && it.side.items.filter(s => s.variable).length === 1 && !it.side.items[vi].onPress) M.varSel = { b: i, s: vi };
    } else if (!it.onPress) { /* yalnız gösterge */ }
    else M.sideB = -1;
  }
  function pressSide(i) {
    const sd = side(); if (!sd || M.hidden) return;
    const it = sd.items[i]; if (!it) return;
    if (it.onPress) it.onPress();
    if (it.variable) M.varSel = { b: M.sideB, s: i };
  }
  /** VARIABLE düğmesi */
  function variable(n) {
    if (M.list) { M.list.idx = clamp(M.list.idx + Math.sign(n), 0, M.list.items.length - 1); return true; }
    if (M.varSel && M.cur) {
      const b = bottom()[M.varSel.b]; const it = b && b.side && b.side.items[M.varSel.s];
      if (it && it.variable) { it.variable(n); return true; }
    }
    const Cu = S().cursor;
    if (Cu.mode) {
      const d = n * 0.04;
      const arr = Cu.mode === 'H' ? Cu.h : Cu.v, lim = Cu.mode === 'H' ? 5 : 4;
      if (Cu.sel === 0 || Cu.sel === 2) arr[0] = clamp(arr[0] + d, -lim, lim);
      if (Cu.sel === 1 || Cu.sel === 2) arr[1] = clamp(arr[1] + d, -lim, lim);
      return true;
    }
    return false;
  }
  /** Select tuşu */
  function select() {
    if (M.list) { const L = M.list; L.onSelect(L.idx); if (M.list === L && L.title !== 'Remove Measurement') { /* liste açık kalır, bir sonraki ekleme için */ } return; }
    const Cu = S().cursor;
    if (Cu.mode) { Cu.sel = (Cu.sel + 1) % 3; return; }
    if (M.varSel) { const b = bottom()[M.varSel.b]; const it = b && b.side && b.side.items[M.varSel.s]; if (it && it.onPress) it.onPress(); }
  }
  /** Menu Off: önce yan menüyü, sonra alt menüyü gizler; ekran mesajlarını temizler */
  function menuOff() {
    State.R.msg = null; M.helpText = null;
    if (M.list) { M.list = null; return; }
    if (S().meas.displayAll) { S().meas.displayAll = null; return; }
    if (M.sideB >= 0) { M.sideB = -1; M.varSel = null; return; }
    close();
  }

  /* ---------------- çizim ---------------- */
  function drawMenus(ctx, L) {
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (M.cur && !M.hidden) {
      const items = bottom();
      for (let i = 0; i < 7; i++) {
        const it = items[i], x = i * L.BOT_W;
        ctx.fillStyle = it ? (M.sideB === i ? '#2f5b96' : '#1c2c44') : '#0c1220';
        ctx.fillRect(x + 2, L.BOT_Y + 1, L.BOT_W - 4, L.H - L.BOT_Y - 3);
        if (!it) continue;
        ctx.strokeStyle = '#4a6a96'; ctx.strokeRect(x + 2.5, L.BOT_Y + 1.5, L.BOT_W - 5, L.H - L.BOT_Y - 4);
        const v = it.value ? it.value() : '';
        ctx.fillStyle = '#e8eef6'; ctx.font = '11.5px "Segoe UI", Arial';
        fitText(ctx, it.label, x + L.BOT_W / 2, v ? L.BOT_Y + 13 : L.BOT_Y + 20, L.BOT_W - 8);
        if (v) { ctx.fillStyle = '#ffd36a'; ctx.font = '11.5px "Segoe UI", Arial'; fitText(ctx, v, x + L.BOT_W / 2, L.BOT_Y + 28, L.BOT_W - 8); }
      }
      const sd = side();
      if (sd) {
        ctx.fillStyle = '#0d1626'; ctx.fillRect(L.SIDE_X, L.SIDE_Y - 2, 100, 5 * L.SIDE_H + 4);
        for (let i = 0; i < 5; i++) {
          const it = sd.items[i], y = L.SIDE_Y + i * L.SIDE_H;
          if (!it) continue;
          const isVar = M.varSel && M.varSel.b === M.sideB && M.varSel.s === i;
          const chk = it.checked && it.checked();
          ctx.fillStyle = isVar ? '#3b6aa8' : chk ? '#27466e' : '#1c2c44';
          ctx.fillRect(L.SIDE_X + 2, y + 2, 96, L.SIDE_H - 4);
          ctx.strokeStyle = isVar ? '#9cc4ff' : '#4a6a96'; ctx.strokeRect(L.SIDE_X + 2.5, y + 2.5, 95, L.SIDE_H - 5);
          ctx.font = '11.5px "Segoe UI", Arial'; ctx.fillStyle = '#e8eef6';
          const v = it.value ? it.value() : null;
          wrapText(ctx, (chk ? '● ' : '') + it.label, L.SIDE_X + 50, y + (v !== null ? L.SIDE_H * 0.32 : L.SIDE_H / 2), 90);
          if (v !== null) { ctx.fillStyle = '#ffd36a'; fitText(ctx, v, L.SIDE_X + 50, y + L.SIDE_H * 0.7, 90); }
          if (it.variable) { ctx.fillStyle = isVar ? '#fff' : '#7f9cc4'; ctx.font = '12px Arial'; ctx.fillText('⟲', L.SIDE_X + 88, y + 12); }
        }
      }
    }
    if (M.list) drawList(ctx, L);
    if (M.help) drawHelp(ctx, L);
    ctx.restore();
  }
  function fitText(ctx, t, x, y, w) {
    let s = String(t);
    while (ctx.measureText(s).width > w && s.length > 3) s = s.slice(0, -2) + '…';
    ctx.fillText(s, x, y);
  }
  function wrapText(ctx, t, x, y, w) {
    if (ctx.measureText(t).width <= w) { ctx.fillText(t, x, y); return; }
    const words = t.split(' '); let a = '', b = '';
    for (const wd of words) { if (!b && ctx.measureText(a + ' ' + wd).width <= w) a = a ? a + ' ' + wd : wd; else b = b ? b + ' ' + wd : wd; }
    ctx.fillText(a, x, y - 7); fitText(ctx, b, x, y + 7, w);
  }
  function drawList(ctx, L) {
    const Ls = M.list, n = Ls.items.length;
    const cols = n > 12 ? 2 : 1, rows = Math.ceil(n / cols);
    const w = cols * 170 + 20, h = rows * 19 + 46;
    const x0 = L.GX + 20, y0 = L.GY + 14;
    ctx.fillStyle = 'rgba(14,22,36,0.95)'; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#6a8fc4'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    ctx.textAlign = 'left'; ctx.font = 'bold 12px "Segoe UI", Arial'; ctx.fillStyle = '#fff';
    ctx.fillText(Ls.title, x0 + 10, y0 + 14);
    ctx.font = '12px "Segoe UI", Arial';
    Ls.items.forEach((s, i) => {
      const cx = x0 + 10 + Math.floor(i / rows) * 170, cy = y0 + 34 + (i % rows) * 19;
      if (i === Ls.idx) { ctx.fillStyle = '#3b6aa8'; ctx.fillRect(cx - 4, cy - 9, 164, 18); }
      ctx.fillStyle = '#e8eef6'; ctx.fillText(s, cx, cy);
    });
    ctx.fillStyle = '#9ab'; ctx.font = '11px Arial';
    ctx.fillText('VARIABLE: select item   Select: confirm   Menu Off: close', x0 + 10, y0 + h - 8);
  }
  function drawHelp(ctx, L) {
    const x0 = L.GX + 30, y0 = L.GY + 30, w = L.GW - 60, h = 220;
    ctx.fillStyle = 'rgba(10,20,34,0.95)'; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = '#f0a040'; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffc072'; ctx.font = 'bold 14px "Segoe UI", Arial';
    const ht = M.helpText;
    ctx.fillText(ht ? 'Help — ' + ht[0] : 'Help', x0 + 14, y0 + 20);
    ctx.fillStyle = '#e8eef6'; ctx.font = '13px "Segoe UI", Arial';
    const text = ht ? ht[1] : 'Yardım modu açık. Açıklamasını görmek istediğiniz tuşa basın veya düğmeyi çevirin. Çıkmak için tekrar Help tuşuna basın.';
    const words = text.split(' '); let line = '', y = y0 + 48;
    for (const wd of words) { if (ctx.measureText(line + wd).width > w - 28) { ctx.fillText(line, x0 + 14, y); line = ''; y += 19; } line += wd + ' '; }
    ctx.fillText(line, x0 + 14, y);
    ctx.fillStyle = '#9ab'; ctx.font = '11px Arial'; ctx.fillText('Press Help again to exit', x0 + 14, y0 + h - 12);
  }

  return { M, open, close, isOpen, pressBottom, pressSide, variable, select, menuOff, drawMenus, saveRef, bottom, side, DEFS };
})();
