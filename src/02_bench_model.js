/* =====================================================================
 * Bench — devre tezgâhının veri modeli, netlist üretimi ve hazır devreler
 *   (Arayüz/çizim BenchUI modülündedir; bu modül DOM'a dokunmaz.)
 * ===================================================================== */
const Bench = (() => {
  /** Bileşen tipleri: yerel pin koordinatları (döndürmeden önce) ve varsayılan değerler */
  const TYPES = {
    R:    { name: 'Direnç',        pins: [[-40, 0], [40, 0]], def: { value: 1000 }, unit: 'Ω', ref: 'R' },
    C:    { name: 'Kondansatör',   pins: [[-40, 0], [40, 0]], def: { value: 1e-6 }, unit: 'F', ref: 'C' },
    L:    { name: 'Bobin',         pins: [[-40, 0], [40, 0]], def: { value: 10e-3 }, unit: 'H', ref: 'L' },
    D:    { name: 'Diyot (1N4148)', pins: [[-40, 0], [40, 0]], def: { Is: 2.52e-9, N: 1.752 }, pinNames: ['A', 'K'], ref: 'D' },
    FG:   { name: 'Fonksiyon jeneratörü', pins: [[0, -40], [0, 40]], def: { wave: 'sine', freq: 1000, vpp: 2, offset: 0, rout: 50 }, pinNames: ['+', '−'], ref: 'FG' },
    DC:   { name: 'DC güç kaynağı', pins: [[0, -40], [0, 40]], def: { value: 5 }, unit: 'V', pinNames: ['+', '−'], ref: 'V' },
    GND:  { name: 'Toprak',        pins: [[0, -20]], def: {} },
    OA:   { name: 'İdeal op-amp',  pins: [[-40, -20], [-40, 20], [40, 0]], def: {}, pinNames: ['−', '+', 'out'], ref: 'U' },
    COMP: { name: 'Prob kompanzasyon çıkışı', pins: [[40, -20], [40, 20]], def: {}, pinNames: ['⊓ 2V', '⏚'], fixed: true },
  };

  const model = {
    comps: [], wires: [], nextId: 1,
    // İki prob: uç (tip) ve timsah toprak klipsi (gnd) ayrı ayrı bir pine takılır. x10: probun üstündeki fiziksel anahtar
    probes: [
      { ch: 0, tip: null, gnd: null, tipXY: [820, 120], gndXY: [860, 170], x10: true },
      { ch: 1, tip: null, gnd: null, tipXY: [820, 260], gndXY: [860, 310], x10: true },
    ],
    ext: { tip: null, tipXY: [820, 400] },
    netNames: {},         // 'bileşen:pin' → düğüm adı (ör. Vi, A, Vo); tezgâhta etiket olarak çizilir
    version: 0,           // her değişiklikte artar (Sim yeniden kurulumu için)
  };

  function rotPt(x, y, rot) {
    for (let i = 0; i < (rot & 3); i++) { const t = x; x = -y; y = t; }
    return [x, y];
  }
  function pinPos(c, i) {
    const [px, py] = TYPES[c.type].pins[i];
    const [rx, ry] = rotPt(px, py, c.rot || 0);
    return [c.x + rx, c.y + ry];
  }
  function byId(id) { return model.comps.find(c => c.id === id); }

  /** Yeni bileşen için sıradaki boş etiket: R1, R2, C1 … */
  function nextName(type) {
    const pre = TYPES[type].ref; if (!pre) return '';
    for (let k = 1; ; k++) if (!model.comps.some(c => c.name === pre + k)) return pre + k;
  }
  function add(type, x, y, rot = 0, params = {}) {
    const c = { id: model.nextId++, type, x, y, rot, name: nextName(type), ...JSON.parse(JSON.stringify(TYPES[type].def)), ...params };
    model.comps.push(c); changed(); return c;
  }
  function remove(id) {
    const c = byId(id); if (!c || TYPES[c.type].fixed) return;
    model.comps = model.comps.filter(k => k.id !== id);
    model.wires = model.wires.filter(w => w.a.c !== id && w.b.c !== id);
    for (const p of [...model.probes, model.ext]) {
      if (p.tip && p.tip.c === id) p.tip = null;
      if (p.gnd && p.gnd.c === id) p.gnd = null;
    }
    for (const k in model.netNames) if (+k.split(':')[0] === id) delete model.netNames[k];
    changed();
  }
  function connect(a, b) {
    if (a.c === b.c && a.p === b.p) return;
    if (model.wires.some(w => (same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a)))) return;
    model.wires.push({ a, b }); changed();
  }
  const same = (u, v) => u && v && u.c === v.c && u.p === v.p;
  function changed() { model.version++; }

  /**
   * Kaynak dalga fonksiyonu fn(t, dt) (volt).
   * Kare dalga, adım aralığı [t−dt/2, t+dt/2] üzerinde ortalanarak verilir (kutu filtresi):
   * böylece kenar, çözücü adımının neresine düşerse düşsün doğru zamanda görünür (frekans ölçümü kayık çıkmaz).
   */
  const sqInt = (t, f) => { const u = t * f, p = u - Math.floor(u); return (p < 0.5 ? p : 1 - p) / f; }; // ∫ kare(±1) dt
  function squareAvg(t, dt, f) {
    if (!dt) { const u = t * f; return (u - Math.floor(u)) < 0.5 ? 1 : -1; }
    return (sqInt(t + dt / 2, f) - sqInt(t - dt / 2, f)) / dt;
  }
  function waveFn(c) {
    return (t, dt) => {
      const A = c.vpp / 2, f = c.freq;
      const ph = t * f - Math.floor(t * f);
      switch (c.wave) {
        case 'square': return c.offset + A * squareAvg(t, dt, f);
        case 'triangle': return c.offset + A * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
        default: return c.offset + A * Math.sin(2 * Math.PI * ph);
      }
    };
  }
  const squareEdge = (fget) => (t0, t1) => Math.floor(2 * t0 * fget()) !== Math.floor(2 * t1 * fget());

  /**
   * Netlist üretimi. Pin bağlantılarını (kablolar) union-find ile düğümlere indirger.
   * Dönüş: { nNodes, elems, probeNode:[n1,n2], extNode, warnings[], freqs[], gndShort[] }
   * opts.compFreq: prob kompanzasyon frekansı (Utility menüsünden)
   */
  function netlist(opts) {
    const parent = new Map();
    const key = (c, p) => c + ':' + p;
    const find = (k) => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
    parent.set('GND', 'GND');
    for (const c of model.comps) TYPES[c.type].pins.forEach((_, i) => parent.set(key(c.id, i), key(c.id, i)));
    for (const w of model.wires) if (parent.has(key(w.a.c, w.a.p)) && parent.has(key(w.b.c, w.b.p))) union(key(w.a.c, w.a.p), key(w.b.c, w.b.p));
    for (const c of model.comps) {
      if (c.type === 'GND') union(key(c.id, 0), 'GND');
      if (c.type === 'COMP') union(key(c.id, 1), 'GND');   // kompanzasyon çıkışının toprak terminali = şase
    }
    // Düğüm numaraları: toprak = 0
    const idx = new Map(); idx.set(find('GND'), 0);
    let nn = 1;
    const node = (c, p) => { const r = find(key(c, p)); if (!idx.has(r)) idx.set(r, nn++); return idx.get(r); };
    for (const c of model.comps) TYPES[c.type].pins.forEach((_, i) => node(c.id, i));

    const elems = [], warnings = [], freqs = [], sqFreqs = [], gndShort = [];
    for (const c of model.comps) {
      const n = (i) => node(c.id, i);
      switch (c.type) {
        case 'R': elems.push({ t: 'R', a: n(0), b: n(1), R: Math.max(c.value, 1e-3) }); break;
        case 'C': elems.push({ t: 'C', a: n(0), b: n(1), C: Math.max(c.value, 1e-15) }); break;
        case 'L': elems.push({ t: 'L', a: n(0), b: n(1), L: Math.max(c.value, 1e-12) }); break;
        case 'D': elems.push({ t: 'D', a: n(0), b: n(1), Is: c.Is, N: c.N }); break;
        case 'FG': {
          const e = { t: 'V', a: n(0), b: n(1), R: Math.max(c.rout, 1e-3), fn: waveFn(c), ac: 1 };   // ac: AC analizinde 1 V kaynak
          if (c.wave === 'square') { e.edge = squareEdge(() => c.freq); sqFreqs.push(c.freq); }
          elems.push(e); freqs.push(c.freq); break;
        }
        case 'DC': elems.push({ t: 'V', a: n(0), b: n(1), R: 0.01, fn: () => c.value }); break; // TAHMIN: 10 mΩ iç direnç
        case 'OA': elems.push({ t: 'OA', n: n(0), p: n(1), o: n(2), A: 1e5, Ro: 1 }); break;
        case 'COMP': {
          // Prob kompanzasyon çıkışı: 0 V / 2 V kare dalga, 1 kHz (Utility > Probe Comp ile değişir)
          const f = () => opts.compFreq;
          elems.push({ t: 'V', a: n(0), b: 0, R: 1000,   // TAHMIN: ~1 kΩ çıkış direnci
            fn: (t, dt) => 1 + squareAvg(t, dt, f()), edge: squareEdge(f) });
          // bağlı değilse adım seçimini etkilemesin
          const used = model.wires.some(w => (w.a.c === c.id && w.a.p === 0) || (w.b.c === c.id && w.b.p === 0)) ||
                       [...model.probes, model.ext].some(p => p.tip && p.tip.c === c.id && p.tip.p === 0);
          if (used) { freqs.push(opts.compFreq); sqFreqs.push(opts.compFreq); }
          break;
        }
      }
    }
    // Prob yüklemesi ve toprak klipsi
    const probeNode = [-1, -1];
    for (const p of model.probes) {
      if (p.tip && byId(p.tip.c)) {
        const nd = node(p.tip.c, p.tip.p);
        probeNode[p.ch] = nd;
        if (nd > 0) elems.push({ t: 'R', a: nd, b: 0, R: p.x10 ? 10e6 : 1e6 }); // ×10: 10 MΩ, ×1: 1 MΩ (osiloskop girişi)
      }
      if (p.gnd && byId(p.gnd.c)) {
        const nd = node(p.gnd.c, p.gnd.p);
        if (nd > 0) {
          // Osiloskobun toprağı şebeke toprağına bağlıdır: klips o noktayı toprağa kısa devre eder.
          elems.push({ t: 'R', a: nd, b: 0, R: 0.05 });
          gndShort.push(p.ch);
          warnings.push(`CH${p.ch + 1} probunun toprak klipsi topraktan farklı bir noktaya bağlı! Gerçekte bu nokta osiloskop şasesi üzerinden toprağa kısa devre olur (ground loop). Simülasyonda da kısa devre edildi.`);
        }
      }
    }
    let extNode = -1;
    if (model.ext.tip && byId(model.ext.tip.c)) {
      extNode = node(model.ext.tip.c, model.ext.tip.p);
      if (extNode > 0) elems.push({ t: 'R', a: extNode, b: 0, R: 1e6 });
    }
    if (model.probes.some(p => p.tip && p.gnd && p.tip.c === p.gnd.c && p.tip.p === p.gnd.p)) { /* uç ve klips aynı yerde: 0 V okur */ }
    return { nNodes: nn, elems, probeNode, extNode, warnings, freqs, sqFreqs, gndShort, pin: (c, p) => node(c, p) };
  }

  /**
   * Düğüm listesi (hızlı prob bağlama ve ipuçları için).
   * Dönüş: [{ key, pins:[{c,p}], gnd, name, desc }] — toprak düğümü ilk sırada.
   */
  function nodes() {
    const parent = new Map();
    const key = (c, p) => c + ':' + p;
    const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
    parent.set('GND', 'GND');
    for (const c of model.comps) TYPES[c.type].pins.forEach((_, i) => parent.set(key(c.id, i), key(c.id, i)));
    for (const w of model.wires) if (parent.has(key(w.a.c, w.a.p)) && parent.has(key(w.b.c, w.b.p))) union(key(w.a.c, w.a.p), key(w.b.c, w.b.p));
    for (const c of model.comps) { if (c.type === 'GND') union(key(c.id, 0), 'GND'); if (c.type === 'COMP') union(key(c.id, 1), 'GND'); }
    const groups = new Map();
    const gk = find('GND');
    for (const c of model.comps) TYPES[c.type].pins.forEach((_, i) => {
      const r = find(key(c.id, i));
      if (!groups.has(r)) groups.set(r, { key: r, pins: [], gnd: r === gk });
      groups.get(r).pins.push({ c: c.id, p: i });
    });
    let k = 1;
    const out = [...groups.values()].sort((a, b) => b.gnd - a.gnd);
    for (const g of out) {
      const named = g.pins.map(r => model.netNames[key(r.c, r.p)]).find(Boolean);
      g.name = named || (g.gnd ? 'GND' : 'N' + k++);
      const real = g.pins.filter(r => { const c = byId(r.c); return c && c.type !== 'GND'; });
      g.desc = g.gnd ? 'toprak' + (real.length ? ' · ' + real.map(pinLabel).join(', ') : '') : real.map(pinLabel).join(', ');
    }
    return out;
  }
  /** "R1.2", "FG1 +" gibi okunur pin adı */
  function pinLabel(r) {
    const c = byId(r.c); if (!c) return '?';
    const t = TYPES[c.type];
    const nm = c.name || (c.type === 'GND' ? 'Toprak' : c.type === 'COMP' ? 'PROBE COMP' : c.type);
    if (t.pinNames) return nm + ' ' + t.pinNames[r.p];
    if (t.pins.length === 2) return nm + '.' + (r.p + 1);
    return nm;
  }
  /** Bir pinin bağlı olduğu düğüm (nodes() elemanı) */
  function nodeOf(r, list = nodes()) {
    if (!r) return null;
    return list.find(g => g.pins.some(q => q.c === r.c && q.p === r.p)) || null;
  }

  /* ---------- Geri al / yinele için anlık görüntü ---------- */
  function snapshot() {
    return JSON.stringify({ comps: model.comps, wires: model.wires, probes: model.probes, ext: model.ext, nextId: model.nextId, netNames: model.netNames });
  }
  function restore(json) {
    const o = JSON.parse(json);
    model.comps = o.comps; model.wires = o.wires; model.nextId = o.nextId; model.netNames = o.netNames || {};
    o.probes.forEach((p, i) => Object.assign(model.probes[i], p));
    Object.assign(model.ext, o.ext);
    changed();
  }

  /* ---------- Hazır devreler ---------- */
  function clear() {
    model.comps = []; model.wires = []; model.netNames = {};
    for (const p of model.probes) { p.tip = null; p.gnd = null; }
    model.ext.tip = null;
    changed();
  }
  const W = (a, pa, b, pb) => connect({ c: a.id, p: pa }, { c: b.id, p: pb });

  function preset(name) {
    clear();
    const comp = add('COMP', 70, 400);
    const P = model.probes;
    P[0].x10 = true; P[1].x10 = true;
    const att = (pr, c, p, gc, gp) => { pr.tip = { c: c.id, p }; pr.gnd = gc ? { c: gc.id, p: gp } : null; };
    switch (name) {
      case 'wien': {
        // EE212 Lab 1 (Şekil 1): Vi → R1 (1 kΩ) → C1 (1 µF) → Vo ; Vo düğümünden toprağa C2 (1 µF) ∥ R2 (1 kΩ)
        // Kaynak: 50 Hz, 4 Vpp sinüs. CH1 = Vi (kaynak), CH2 = Vo (R2 üzerindeki gerilim)
        const fg = add('FG', 140, 230, 0, { wave: 'sine', freq: 50, vpp: 4, offset: 0 });
        const g1 = add('GND', 140, 360);
        const r1 = add('R', 300, 110, 0, { value: 1000 });
        const c1 = add('C', 460, 110, 0, { value: 1e-6 });
        const c2 = add('C', 600, 230, 1, { value: 1e-6 });
        const r2 = add('R', 740, 230, 1, { value: 1000 });
        const g2 = add('GND', 600, 360), g3 = add('GND', 740, 360);
        W(r1, 0, fg, 0); W(fg, 1, g1, 0); W(r1, 1, c1, 0); W(c1, 1, c2, 0); W(c1, 1, r2, 0);
        W(c2, 1, g2, 0); W(r2, 1, g3, 0);
        model.netNames[r1.id + ':0'] = 'Vi'; model.netNames[r1.id + ':1'] = 'A'; model.netNames[r2.id + ':0'] = 'Vo';
        att(P[0], r1, 0, g1, 0); att(P[1], r2, 0, g3, 0);
        break;
      }
      case 'comp':
        att(P[0], comp, 0, comp, 1);
        P[1].tipXY = [820, 260]; P[1].gndXY = [860, 310];
        break;
      case 'rc': {
        // 1 kΩ / 1 µF, 4 Vpp sinüs, f = 1/(2πRC) ≈ 159.15 Hz
        const fg = add('FG', 200, 200, 0, { wave: 'sine', freq: 159.15, vpp: 4, offset: 0 });
        const g1 = add('GND', 200, 300), r = add('R', 340, 120, 0, { value: 1000 });
        const c = add('C', 480, 200, 1, { value: 1e-6 }), g2 = add('GND', 480, 300);
        W(fg, 1, g1, 0); W(fg, 0, r, 0); W(r, 1, c, 0); W(c, 1, g2, 0);
        att(P[0], r, 0, g1, 0); att(P[1], c, 0, g2, 0);
        break;
      }
      case 'rlc': {
        // Seri RLC: 100 Ω, 10 mH, 1 µF → f0 = 1/(2π√LC) ≈ 1591.5 Hz. CH2 direnç üzerinde (akımla orantılı)
        const fg = add('FG', 180, 220, 0, { wave: 'sine', freq: 1591.5, vpp: 4, offset: 0 });
        const g1 = add('GND', 180, 320);
        const l = add('L', 300, 140, 0, { value: 10e-3 });
        const c = add('C', 440, 140, 0, { value: 1e-6 });
        const r = add('R', 560, 220, 1, { value: 100 });
        const g2 = add('GND', 560, 320);
        W(fg, 1, g1, 0); W(fg, 0, l, 0); W(l, 1, c, 0); W(c, 1, r, 0); W(r, 1, g2, 0);
        att(P[0], l, 0, g1, 0); att(P[1], r, 0, g2, 0);
        break;
      }
      case 'rect': {
        // Yarım dalga doğrultucu: 10 Vpp 50 Hz → 1N4148 → 1 kΩ ∥ 10 µF
        const fg = add('FG', 180, 220, 0, { wave: 'sine', freq: 50, vpp: 10, offset: 0 });
        const g1 = add('GND', 180, 320);
        const d = add('D', 320, 140, 0);
        const c = add('C', 460, 220, 1, { value: 10e-6 }), r = add('R', 580, 220, 1, { value: 1000 });
        const g2 = add('GND', 460, 320), g3 = add('GND', 580, 320);
        W(fg, 1, g1, 0); W(fg, 0, d, 0); W(d, 1, c, 0); W(c, 0, r, 0); W(c, 1, g2, 0); W(r, 1, g3, 0);
        att(P[0], d, 0, g1, 0); att(P[1], c, 0, g2, 0);
        break;
      }
      case 'empty': default: break;
    }
    changed();
  }

  return { TYPES, model, pinPos, rotPt, byId, add, remove, connect, changed, netlist, preset, clear, nodes, nodeOf, pinLabel, snapshot, restore };
})();
