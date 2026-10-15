/* =====================================================================
 * BenchUI — devre tezgâhı arayüzü (SVG)
 *   Paletten sürükle-bırak · pinlere tıklayıp/sürükleyip kablo · çift tık: değer düzenle
 *   Döndür / Sil / Geri al / Yinele: tezgâhın üstündeki düğmeler (klavye kısayolu yok)
 *   Problar: uç (renkli kanca) ve timsah toprak klipsi (siyah) ayrı ayrı bir pine sürüklenip bırakılır
 *   ya da sağdaki "Problar" kutusundaki listeden bir düğüm seçilir.
 *   Prob gövdesindeki ×1/×10 etiketi fiziksel zayıflatma anahtarıdır.
 *   Değer kutusunun üstünde fare tekerleği: 1-2-5 adımı.
 * ===================================================================== */
const BenchUI = (() => {
  const B = Bench, T = Bench.TYPES;
  let svg, propsEl, warnEl;
  let sel = null;            // {kind:'comp'|'wire', id|index}
  let drag = null;           // sürükleme durumu
  let wiring = null;         // {from:{c,p}, x, y}
  let hoverPin = null;       // kablo/prob sürüklerken yakalanacak pin
  // görünüm (yakınlaştırma/kaydırma): SVG viewBox
  const VB0 = { x: 0, y: 0, w: 1000, h: 460 };
  let view = { ...VB0 }, pan = null, benchActive = false;
  let lastPropsKey = '';
  const SNAP = 20;
  const ANCHOR = [[1000, 70], [1000, 210]], EXT_ANCHOR = [1000, 380];
  const PCOL = ['#e8c400', '#1e9be0'];

  /* ---------------- geri al / yinele ---------------- */
  const undoStack = [], redoStack = [];
  function checkpoint() {
    const s = B.snapshot();
    if (undoStack[undoStack.length - 1] !== s) undoStack.push(s);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
  }
  function undo() {
    if (!undoStack.length) return State.message('Nothing to undo');
    redoStack.push(B.snapshot()); B.restore(undoStack.pop()); sel = null; wiring = null; render();
  }
  function redo() {
    if (!redoStack.length) return;
    undoStack.push(B.snapshot()); B.restore(redoStack.pop()); sel = null; render();
  }

  function init() {
    svg = document.getElementById('benchSvg');
    propsEl = document.getElementById('props');
    warnEl = document.getElementById('benchWarn');
    buildPalette();
    svg.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    svg.addEventListener('dblclick', onDbl);
    svg.addEventListener('pointerover', onHover);
    svg.addEventListener('pointerout', () => Panel.hideTip());
    // yakınlaştırma: tezgâha bir kez tıkladıktan sonra fare tekerleği (sayfa kaydırmasını bozmasın diye)
    svg.addEventListener('pointerleave', () => { benchActive = false; svg.classList.remove('active'); });
    svg.addEventListener('wheel', e => {
      if (!benchActive) return;
      e.preventDefault();
      zoomAt(pt(e), e.deltaY < 0 ? 1 / 1.15 : 1.15);
    }, { passive: false });
    document.getElementById('bZin').onclick = () => zoomAt([view.x + view.w / 2, view.y + view.h / 2], 1 / 1.25);
    document.getElementById('bZout').onclick = () => zoomAt([view.x + view.w / 2, view.y + view.h / 2], 1.25);
    document.getElementById('bZfit').onclick = () => { view = { ...VB0 }; applyView(); };
    document.getElementById('bUndo').onclick = undo;
    document.getElementById('bRedo').onclick = redo;
    document.getElementById('bRot').onclick = rotateSel;
    document.getElementById('bDel').onclick = deleteSel;
    render();
  }

  /* ---------------- bileşen açıklamaları (fare üstünde) ---------------- */
  function fgFreq() { const g = B.model.comps.find(c => c.type === 'FG'); return g ? g.freq : null; }
  function compTip(c) {
    const f = fgFreq(), fmt = Units.fmt;
    const nm = c.name ? c.name + ' — ' : '';
    switch (c.type) {
      case 'R': return [`${nm}Direnç ${fmt(c.value, 'Ω')}`, 'Akıma karşı koyar. Ohm yasası: V = I·R. Frekansa bağlı değildir; gerilim ve akım aynı fazdadır.'];
      case 'C': {
        let s = 'Gerilimdeki değişime karşı koyar. Düşük frekansta neredeyse açık devre, yüksek frekansta neredeyse kısa devre gibidir. Akım, gerilimden 90° öndedir.';
        if (f) s += `<br>Şu anki frekansta (${fmt(f, 'Hz', 4)}): X<sub>C</sub> = 1/(2πfC) = <b>${fmt(1 / (2 * Math.PI * f * c.value), 'Ω', 4)}</b>`;
        return [`${nm}Kondansatör ${fmt(c.value, 'F')}`, s];
      }
      case 'L': return [`${nm}Bobin ${fmt(c.value, 'H')}`, 'Akımdaki değişime karşı koyar. X<sub>L</sub> = 2πfL' + (f ? ` = <b>${fmt(2 * Math.PI * f * c.value, 'Ω', 4)}</b> @ ${fmt(f, 'Hz', 4)}` : '')];
      case 'FG': return [`${nm}Fonksiyon jeneratörü`, `${{ sine: 'Sinüs', square: 'Kare', triangle: 'Üçgen' }[c.wave]}, ${fmt(c.freq, 'Hz', 4)}, ${fmt(c.vpp, 'Vpp')} (yüksüz). İç direnç ${fmt(c.rout, 'Ω')}: yük ağırlaştıkça çıkış biraz düşer. Tıkla → sağda frekans/genlik düğmeleri.`];
      case 'DC': return [`${nm}DC kaynak ${fmt(c.value, 'V')}`, 'Sabit gerilim verir.'];
      case 'GND': return ['Toprak', 'Devrenin 0 V referansı. Osiloskobun şasesi (prob timsahları) de buraya bağlıdır.'];
      case 'D': return [`${nm}Diyot 1N4148`, 'Akımı yalnız anottan katoda geçirir (~0.6–0.7 V düşüm).'];
      case 'OA': return [`${nm}İdeal op-amp`, 'Çok yüksek kazançlı fark yükselteci.'];
      case 'COMP': return ['Prob kompanzasyon çıkışı', 'Osiloskobun ön panelindeki 2 V / 1 kHz kare dalga çıkışı.'];
    }
    return null;
  }
  function onHover(e) {
    if (drag || wiring || palDrag) return;
    const t = e.target, tip = document.getElementById('tip');
    let h = null;
    if (t.dataset && t.dataset.pin) {
      const [c, p] = t.dataset.pin.split(':').map(Number);
      const g = B.nodeOf({ c, p });
      h = [`Uç: ${B.pinLabel({ c, p })}`, `Düğüm <b>${g ? g.name : '?'}</b>${g && g.desc ? ' — ' + g.desc : ''}<br>Tıkla → başka bir uca tıkla = kablo.`];
    } else {
      const cg = t.closest && t.closest('.bench-comp');
      if (cg) h = compTip(B.byId(+cg.dataset.comp));
      else if (t.closest && t.closest('.probe-sw')) h = ['Prob ×1/×10 anahtarı', 'Probun üstündeki fiziksel anahtar. ×10: sinyal 10\'a bölünür, devre daha az yüklenir. CH menüsündeki Probe ayarı bununla aynı olmalı!'];
      else if (t.closest && t.closest('.probe-h')) {
        const ph = t.closest('.probe-h');
        h = ph.dataset.part === 'gnd' ? ['Timsah toprak klipsi', 'Her zaman devrenin TOPRAĞINA takılır. Başka bir noktaya takarsan o noktayı toprağa kısa devre edersin!']
          : ph.dataset.probe === 'ext' ? ['EXT TRIG ucu', 'Harici tetik girişi. Bir düğüme sürükle.'] : [`CH${+ph.dataset.probe + 1} prob ucu`, 'Ölçmek istediğin noktaya sürükleyip bırak (ya da sağdaki listeden seç).'];
      }
    }
    if (!h) { Panel.hideTip(); return; }
    tip.innerHTML = `<b>${h[0]}</b><br>${h[1]}`; tip.style.display = 'block'; Panel.moveTip(e);
  }

  /* ---------------- sembol çizimi ---------------- */
  function symbol(c, selected) {
    const st = 'stroke="#222" stroke-width="2" fill="none" stroke-linecap="round"';
    let g = '';
    switch (c.type) {
      case 'R': g = `<path d="M-40 0H-24l4-9 8 18 8-18 8 18 8-18 8 18 4-9H40" ${st}/>`; break;
      case 'C': g = `<path d="M-40 0H-5M5 0H40M-5 -15V15M5 -15V15" ${st}/>`; break;
      case 'L': g = `<path d="M-40 0H-24a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0a6 6 0 0 1 12 0H40" ${st}/>`; break;
      case 'D': g = `<path d="M-40 0H40M-11 -12V12L11 0Z" ${st}/><path d="M11 -12V12" ${st}/><path d="M-11 -12L11 0L-11 12Z" fill="#222"/>`; break;
      case 'FG': {
        const w = c.wave === 'square' ? 'M-12 6V-6H0V6H12V-6' : c.wave === 'triangle' ? 'M-13 5L-6.5 -6L0 5L6.5 -6L13 5' : 'M-13 0C-8 -14 -4 -14 0 0S8 14 13 0';
        g = `<path d="M0 -40V-22M0 22V40" ${st}/><circle r="22" fill="#fff" stroke="#222" stroke-width="2"/><path d="${w}" ${st}/><text x="8" y="-26" font-size="12" fill="#c00">+</text>`; break;
      }
      case 'DC': g = `<path d="M0 -40V-5M0 5V40M-15 -5H15M-8 5H8" ${st}/><text x="10" y="-12" font-size="12" fill="#c00">+</text>`; break;
      case 'GND': g = `<path d="M0 -20V0M-13 0H13M-8 5H8M-3 10H3" ${st}/>`; break;
      case 'OA': g = `<path d="M-40 -20H-28M-40 20H-28M28 0H40" ${st}/><path d="M-28 -32V32L30 0Z" fill="#fff" stroke="#222" stroke-width="2"/><text x="-24" y="-15" font-size="14">−</text><text x="-24" y="25" font-size="13">+</text>`; break;
      case 'COMP': g = `<rect x="-42" y="-34" width="62" height="68" rx="5" fill="#cfd2d5" stroke="#555" stroke-width="1.5"/><path d="M20 -20H40M20 20H40" ${st}/>
        <text x="-11" y="-18" font-size="9" text-anchor="middle" font-weight="700">PROBE</text><text x="-11" y="-7" font-size="9" text-anchor="middle" font-weight="700">COMP</text>
        <text x="-11" y="10" font-size="9" text-anchor="middle">2V ⊓</text><text x="-11" y="22" font-size="9" text-anchor="middle">1kHz</text>
        <text x="27" y="-24" font-size="8.5">⊓</text><text x="27" y="31" font-size="9">⏚</text>`; break;
    }
    const hb = c.type === 'GND' ? 'x="-16" y="-22" width="32" height="38"' : c.type === 'FG' || c.type === 'DC' ? 'x="-26" y="-42" width="52" height="84"' : c.type === 'OA' ? 'x="-42" y="-36" width="84" height="72"' : c.type === 'COMP' ? 'x="-44" y="-36" width="86" height="72"' : 'x="-42" y="-18" width="84" height="36"';
    return `<g class="bench-comp" data-comp="${c.id}" transform="translate(${c.x},${c.y}) rotate(${(c.rot || 0) * 90})">
      <rect ${hb} rx="4" fill="${selected ? 'rgba(60,120,230,.13)' : 'transparent'}" stroke="${selected ? '#3b78e0' : 'none'}" stroke-dasharray="4 3"/>${g}</g>`;
  }
  function label(c) {
    let t = '';
    switch (c.type) {
      case 'R': t = Units.fmt(c.value, 'Ω'); break;
      case 'C': t = Units.fmt(c.value, 'F'); break;
      case 'L': t = Units.fmt(c.value, 'H'); break;
      case 'D': t = '1N4148'; break;
      case 'DC': t = Units.fmt(c.value, 'V'); break;
      case 'FG': t = `${{ sine: 'Sine', square: 'Square', triangle: 'Triangle' }[c.wave]} ${Units.fmt(c.freq, 'Hz', 4)}|${Units.fmt(c.vpp, 'Vpp')}${c.offset ? ' ' + Units.fmt(c.offset, 'V') + ' DC' : ''}|Rout ${Units.fmt(c.rout, 'Ω')}`; break;
      case 'OA': t = 'ideal'; break;
      default: return '';
    }
    if (c.name) t = `<tspan font-weight="700" fill="#7a2e00">${c.name}</tspan> ` + t;
    const vert = (c.rot || 0) % 2 === 1;
    let x = c.x, y = c.y, anchor = 'middle';
    if (c.type === 'FG' || c.type === 'DC') { x = c.x + (vert ? 0 : -30); y = c.y - (vert ? 30 : 6); anchor = vert ? 'middle' : 'end'; }
    else if (vert) { x = c.x + 18; anchor = 'start'; } else y = c.y - 20;
    return t.split('|').map((s, i) => `<text x="${x}" y="${y + i * 14}" font-size="12.5" text-anchor="${anchor}" fill="#1b3a6b" font-family="Segoe UI,Arial" pointer-events="none">${s}</text>`).join('');
  }
  function wirePath(a, b) {
    const [ax, ay] = a, [bx, by] = b;
    return `M${ax} ${ay}H${bx}V${by}`;
  }
  const pinXY = (r) => { const c = B.byId(r.c); return c ? B.pinPos(c, r.p) : null; };

  /** Düğüm adı etiketleri (Vi, A, Vo …) */
  function netTags() {
    let s = '';
    for (const k in B.model.netNames) {
      const [c, p] = k.split(':').map(Number);
      const xy = pinXY({ c, p }); if (!xy) continue;
      const name = B.model.netNames[k], w = 12 + name.length * 8;
      const x = xy[0] + 10, y = xy[1] + 9;
      s += `<g class="netTag"><path d="M${xy[0] + 3} ${xy[1] + 3} L${x + 2} ${y + 4}" stroke="#c0392b" stroke-width="1.2"/>
        <rect x="${x}" y="${y}" width="${w}" height="18" rx="9" fill="#c0392b"/><text x="${x + w / 2}" y="${y + 13}" font-size="12" font-weight="700" text-anchor="middle" fill="#fff" font-family="Segoe UI,Arial">${name}</text></g>`;
    }
    return s;
  }

  /* ---------------- probe çizimi ---------------- */
  function probeSvg(p, i) {
    const tip = p.tip && pinXY(p.tip) ? pinXY(p.tip) : p.tipXY;
    const gnd = p.gnd && pinXY(p.gnd) ? pinXY(p.gnd) : p.gndXY;
    const col = PCOL[i], [ax, ay] = ANCHOR[i];
    const bx = tip[0] - 66, by = tip[1] - 40;   // gövde ucun üst-solunda (değer etiketlerini örtmesin)
    return `<g>
      <path d="M${bx + 52} ${by} C ${bx + 140} ${by}, ${ax - 120} ${ay}, ${ax} ${ay}" stroke="#333" stroke-width="5" fill="none" opacity=".85"/>
      <path d="M${bx + 20} ${by + 8} C ${bx + 20} ${by + 50}, ${gnd[0]} ${gnd[1] - 40}, ${gnd[0]} ${gnd[1] - 9}" stroke="#111" stroke-width="2" fill="none" pointer-events="none"/>
      <g class="probe-h" data-probe="${i}" data-part="tip">
        <path d="M${tip[0]} ${tip[1]} L${bx + 50} ${by + 6}" stroke="#999" stroke-width="3"/>
        <circle cx="${tip[0]}" cy="${tip[1]}" r="6" fill="${p.tip ? col : 'none'}" fill-opacity=".35" stroke="${col}" stroke-width="2.5"/>
        <rect x="${bx}" y="${by - 8}" width="56" height="16" rx="7" fill="${col}" stroke="#333"/>
        <text x="${bx + 6}" y="${by + 4}" font-size="10" font-weight="700" fill="#222">CH${i + 1}</text>
        <circle cx="${tip[0]}" cy="${tip[1]}" r="12" fill="transparent"/>
      </g>
      <g class="probe-sw" data-probe="${i}" data-part="sw" style="cursor:pointer">
        <rect x="${bx + 30}" y="${by - 6}" width="24" height="12" rx="3" fill="${p.x10 ? '#222' : '#fff'}" stroke="#222"/>
        <text x="${bx + 42}" y="${by + 3.5}" font-size="9" text-anchor="middle" font-weight="700" fill="${p.x10 ? '#fff' : '#222'}">×${p.x10 ? 10 : 1}</text>
      </g>
      <g class="probe-h" data-probe="${i}" data-part="gnd">
        <path d="M${gnd[0] - 5} ${gnd[1] - 10}h10v8l-2 4h-6l-2-4z" fill="#111"/>
        <path d="M${gnd[0] - 4} ${gnd[1] - 1}l2 3l2 -3l2 3l2-3" stroke="#555" fill="none"/>
        <circle cx="${gnd[0]}" cy="${gnd[1]}" r="3" fill="${p.gnd ? '#3c3' : '#c33'}"/>
        <rect x="${gnd[0] - 11}" y="${gnd[1] - 15}" width="22" height="24" fill="transparent"/>
      </g>
      <text x="${ax - 4}" y="${ay - 8}" font-size="11" text-anchor="end" fill="${col === '#e8c400' ? '#8a7000' : col}" font-weight="700">→ CH${i + 1} BNC</text>
    </g>`;
  }
  function extSvg() {
    const e = B.model.ext;
    const tip = e.tip && pinXY(e.tip) ? pinXY(e.tip) : e.tipXY;
    const [ax, ay] = EXT_ANCHOR;
    return `<g><path d="M${tip[0] + 10} ${tip[1]} C ${tip[0] + 120} ${tip[1]}, ${ax - 120} ${ay}, ${ax} ${ay}" stroke="#777" stroke-width="3" fill="none"/>
      <g class="probe-h" data-probe="ext" data-part="tip"><circle cx="${tip[0]}" cy="${tip[1]}" r="5" fill="none" stroke="#777" stroke-width="2.5"/>
      <rect x="${tip[0] + 6}" y="${tip[1] - 6}" width="30" height="12" rx="5" fill="#999"/><text x="${tip[0] + 21}" y="${tip[1] + 3.5}" font-size="8" text-anchor="middle" fill="#fff" font-weight="700">EXT</text>
      <circle cx="${tip[0]}" cy="${tip[1]}" r="11" fill="transparent"/></g>
      <text x="${ax - 4}" y="${ay - 8}" font-size="11" text-anchor="end" fill="#666" font-weight="700">→ EXT TRIG</text></g>`;
  }

  /* ---------------- render ---------------- */
  function render(skipProps) {
    const m = B.model;
    let s = `<defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="#c9c3b2"/></pattern></defs>
      <rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#dots)" class="bench-bg"/>`;
    m.wires.forEach((w, i) => {
      const a = pinXY(w.a), b = pinXY(w.b); if (!a || !b) return;
      const isSel = sel && sel.kind === 'wire' && sel.id === i;
      s += `<path d="${wirePath(a, b)}" stroke="transparent" stroke-width="12" fill="none" data-wire="${i}" style="cursor:pointer"/>
            <path d="${wirePath(a, b)}" stroke="${isSel ? '#3b78e0' : '#1d5a2a'}" stroke-width="${isSel ? 3.5 : 2}" fill="none" pointer-events="none"/>`;
    });
    for (const c of m.comps) s += symbol(c, sel && sel.kind === 'comp' && sel.id === c.id) + label(c);
    s += netTags();
    // pinler + bağlantı noktaları
    const deg = new Map();
    for (const w of m.wires) for (const r of [w.a, w.b]) { const k = r.c + ':' + r.p; deg.set(k, (deg.get(k) || 0) + 1); }
    for (const c of m.comps) T[c.type].pins.forEach((_, i) => {
      const [x, y] = B.pinPos(c, i), d = deg.get(c.id + ':' + i) || 0;
      if (d >= 2) s += `<circle cx="${x}" cy="${y}" r="4" fill="#1d5a2a" pointer-events="none"/>`;
      s += `<circle class="bench-pin" cx="${x}" cy="${y}" r="5" fill="${d ? 'rgba(29,90,42,.25)' : '#fff'}" stroke="#1d5a2a" stroke-width="1.5" data-pin="${c.id}:${i}"/>
            <circle class="bench-pin" cx="${x}" cy="${y}" r="11" fill="transparent" data-pin="${c.id}:${i}"/>`;
    });
    if (wiring) { const a = pinXY(wiring.from); if (a) s += `<path d="${wirePath(a, [wiring.x, wiring.y])}" stroke="#f08a1c" stroke-width="2" stroke-dasharray="5 4" fill="none" pointer-events="none"/>`; }
    if (hoverPin) { const p = pinXY(hoverPin); if (p) s += `<circle cx="${p[0]}" cy="${p[1]}" r="12" fill="rgba(240,138,28,.25)" stroke="#f08a1c" stroke-width="2" pointer-events="none"/>`; }
    m.probes.forEach((p, i) => s += probeSvg(p, i));
    s += extSvg();
    svg.innerHTML = s;
    applyView();
    renderWarn();
    renderProps(false, skipProps);
    document.getElementById('bUndo').disabled = !undoStack.length;
    document.getElementById('bRedo').disabled = !redoStack.length;
  }
  function renderWarn() {
    const net = B.netlist({ compFreq: State.S.util.compFreq });
    const msgs = [...net.warnings];
    B.model.probes.forEach((p, i) => { if (p.tip && !p.gnd) msgs.push(`CH${i + 1} probunun toprak klipsi takılı değil: ölçüm yine şase toprağına göre yapılır, ancak gerçekte gürültü/çınlama artar.`); });
    warnEl.style.display = net.warnings.length ? 'block' : 'none';
    warnEl.innerHTML = net.warnings.map(w => '⚠ ' + w).join('<br>');
    lastNotes = msgs.filter(x => !net.warnings.includes(x));
  }
  let lastNotes = [];

  /* ---------------- özellik paneli ---------------- */
  // jeneratör frekans düğmeleri: seçili kütüphane devresinin frekansları
  const labF = () => { const d = Circuits.cur; return d ? [...new Set([d.f, ...d.sweep])].sort((a, b) => a - b) : [10, 30, 50, 100, 159.2, 300, 1000, 3000]; };
  const LAB_V = [4, 8, 12];
  /** 1-2-5 dizisinde bir sonraki/önceki değer */
  function next125(v, dir) {
    const e = Math.floor(Math.log10(v) + 1e-9), m = v / Math.pow(10, e);
    const list = [];
    for (let k = e - 1; k <= e + 1; k++) for (const q of [1, 2, 5]) list.push(+(q * Math.pow(10, k)).toPrecision(3));
    if (dir > 0) return list.find(x => x > v * (1 + 1e-9));
    return list.reverse().find(x => x < v * (1 - 1e-9));
  }
  function stepValue(k, v, dir, fine) {
    if (k === 'vpp' || k === 'offset' || (k === 'value' && sel && B.byId(sel.id) && B.byId(sel.id).type === 'DC'))
      return +(v + dir * (fine ? 0.01 : 0.1)).toFixed(4);
    if (fine || v <= 0) return +(v * (1 + dir * 0.01)).toPrecision(5) || (dir > 0 ? 1 : 0);
    return next125(v, dir);
  }
  function probeOptions(sel, gndFirst) {
    const list = B.nodes();
    const cur = B.nodeOf(sel, list);
    let h = `<option value="">— boşta —</option>`;
    for (const g of list) h += `<option value="${g.key}" ${cur && cur.key === g.key ? 'selected' : ''}>${g.name}${g.desc ? ' · ' + g.desc : ''}</option>`;
    return h;
  }
  /** Bir düğüm anahtarından probun takılacağı pini seç (toprakta önce toprak sembolü) */
  function pinForNode(key) {
    const g = B.nodes().find(n => n.key === key); if (!g) return null;
    const pref = g.pins.find(r => { const c = B.byId(r.c); return c && c.type === 'GND'; }) || g.pins.find(r => { const c = B.byId(r.c); return c && c.type !== 'FG'; }) || g.pins[0];
    return { c: pref.c, p: pref.p };
  }
  function renderProps(force, skip) {
    const c = sel && sel.kind === 'comp' ? B.byId(sel.id) : null;
    const key = c ? c.id + JSON.stringify(c) : 'none' + B.snapshot() + lastNotes.join();
    if (skip) { lastPropsKey = key; return; }
    if (!force && key === lastPropsKey) return;
    if (propsEl.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;  // açık listeyi bozma
    lastPropsKey = key;
    if (!c) {
      const P = B.model.probes;
      propsEl.innerHTML = `<h3>🔎 Problar <span class="ihelp" data-ihelp="probes" title="Problar nasıl bağlanır?">!</span> <small style="color:#999;font-weight:400">— hangi noktayı ölçüyorum?</small></h3>
        ${P.map((p, i) => `<div class="probeBox" style="border-left:4px solid ${PCOL[i]}">
          <div class="ttl">CH${i + 1} probu <button class="ui sm" data-sw="${i}" title="Probun üstündeki fiziksel anahtar">×${p.x10 ? 10 : 1}</button></div>
          <label>Uç (ölçülen nokta)<select data-tip="${i}">${probeOptions(p.tip)}</select></label>
          <label>Timsah (toprak)<select data-gnd="${i}">${probeOptions(p.gnd)}</select></label>
        </div>`).join('')}
        <div class="probeBox"><label>EXT TRIG ucu<select data-ext="1">${probeOptions(B.model.ext.tip)}</select></label></div>
        <div class="hint">💡 Uç = ölçmek istediğin nokta. Timsah = <b>her zaman GND</b>. Osiloskop ucun gerilimini toprağa göre gösterir.<br>
        Menüdeki prob ayarı (CH menüsü › Probe) ile buradaki ×1/×10 anahtarı aynı olmalı, yoksa ekrandaki değerler 10 kat yanlış çıkar.</div>
        <div class="hint">Bir bileşene tıklarsan değerleri burada görünür. Jeneratöre tıkla → frekans/genlik düğmeleri.</div>
        ${lastNotes.map(n => `<div class="hint" style="color:#ffb070">• ${n}</div>`).join('')}`;
      propsEl.querySelectorAll('[data-sw]').forEach(b => b.onclick = () => { checkpoint(); const p = B.model.probes[+b.dataset.sw]; p.x10 = !p.x10; B.changed(); render(); });
      const bindSel = (attr, apply) => propsEl.querySelectorAll(`[data-${attr}]`).forEach(s => s.onchange = () => {
        checkpoint(); apply(s, s.value ? pinForNode(s.value) : null); B.changed(); s.blur(); render(); renderProps(true);
      });
      bindSel('tip', (s, r) => { const p = P[+s.dataset.tip]; p.tip = r; if (!r) p.tipXY = [820, 120 + 140 * +s.dataset.tip]; });
      bindSel('gnd', (s, r) => { const p = P[+s.dataset.gnd]; p.gnd = r; if (!r) p.gndXY = [860, 170 + 140 * +s.dataset.gnd]; });
      bindSel('ext', (s, r) => { B.model.ext.tip = r; });
      return;
    }
    const t = T[c.type];
    const inp = (k, lbl, v) => `<label>${lbl}<input data-k="${k}" value="${v}" title="k, m, µ (u), n, p, M ön ekleri · üstünde tekerlek: adım"></label>`;
    let h = `<h3>${c.name ? c.name + ' · ' : ''}${t.name}${c.type === 'FG' ? ' <span class="ihelp" data-ihelp="fg" title="Jeneratör ayarları ne demek?">!</span>' : ''}</h3>`;
    switch (c.type) {
      case 'R': h += inp('value', 'Direnç (Ω)', Units.fmt(c.value, '', 4)); break;
      case 'C': h += inp('value', 'Kapasite (F)', Units.fmt(c.value, '', 4)); break;
      case 'L': h += inp('value', 'Endüktans (H)', Units.fmt(c.value, '', 4)); break;
      case 'DC': h += inp('value', 'Gerilim (V)', Units.fmt(c.value, '', 4)); break;
      case 'D': h += `<div class="hint">1N4148 benzeri: Is = ${Units.fmt(c.Is, 'A')}, n = ${c.N}. Newton-Raphson ile çözülür.</div>`; break;
      case 'FG':
        h += `<label>Dalga<select data-k="wave">${['sine', 'square', 'triangle'].map(w => `<option value="${w}" ${c.wave === w ? 'selected' : ''}>${{ sine: 'Sinüs', square: 'Kare', triangle: 'Üçgen' }[w]}</option>`).join('')}</select></label>`;
        h += inp('freq', 'Frekans (Hz)', Units.fmt(c.freq, '', 5));
        h += `<div class="chips">${labF().map(f => `<span class="chip ${Math.abs(c.freq - f) < f * 1e-3 ? 'on' : ''}" data-f="${f}">${Units.fmt(f, 'Hz', 4).replace('.000', '').replace(/\.0(?=[a-zA-Z])/, '')}</span>`).join('')}</div>`;
        h += `<input type="range" data-k="freqlog" min="0" max="6" step="0.001" value="${Math.log10(c.freq)}">`;
        h += inp('vpp', 'Genlik (Vpp)', Units.fmt(c.vpp, '', 4));
        h += `<div class="chips">${LAB_V.map(v => `<span class="chip ${Math.abs(c.vpp - v) < 1e-6 ? 'on' : ''}" data-v="${v}">${v} Vpp</span>`).join('')}</div>`;
        h += inp('offset', 'DC ofset (V)', Units.fmt(c.offset, '', 4)) + inp('rout', 'Çıkış direnci (Ω)', Units.fmt(c.rout, '', 3));
        h += `<div class="hint">Vpp = tepeden tepeye, <b>yüksüz</b> çıkış gerilimi. Jeneratörün 50 Ω iç direnci yüzünden devreye bağlanınca biraz düşer — bu yüzden laboratuvarda Vi'yi her zaman osiloskopla (CH1) kontrol et.</div>`;
        break;
      case 'OA': h += `<div class="hint">İdeal op-amp: A = 10⁵, Ro = 1 Ω, besleme sınırı yok. Pinler: − (üst), + (alt), çıkış.</div>`; break;
      case 'GND': h += `<div class="hint">Devre toprağı = osiloskop şasesi (şebeke toprağı).</div>`; break;
      case 'COMP': h += `<div class="hint">Osiloskobun prob kompanzasyon çıkışı: 0/2 V kare dalga, ${Units.fmt(State.S.util.compFreq, 'Hz')}, ~1 kΩ çıkış direnci (TAHMIN). ⏚ ucu şaseye bağlıdır.</div>`; break;
    }
    const tp = compTip(c); if (tp && c.type !== 'FG') h += `<div class="hint">${tp[1]}</div>`;
    h += `<div class="hint">🖱️ Değer kutusunun üstünde fare tekerleğini çevir: değer 1-2-5 adımıyla değişir.</div>`;
    if (!T[c.type].fixed) h += `<div style="margin-top:8px;display:flex;gap:6px"><button class="ui sm" id="pRot">⟳ Döndür</button><button class="ui sm" id="pDel">🗑 Sil</button><button class="ui sm" id="pDesel">Kapat</button></div>`;
    propsEl.innerHTML = h;
    propsEl.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      const apply = () => {
        checkpoint();
        if (k === 'wave') c.wave = el.value;
        else if (k === 'freqlog') { c.freq = +Math.pow(10, +el.value).toPrecision(4); const f = propsEl.querySelector('[data-k=freq]'); if (f) f.value = Units.fmt(c.freq, '', 4); }
        else {
          const v = Units.parse(el.value);
          if (!isFinite(v) || (k !== 'offset' && k !== 'value' && v <= 0) || (k === 'value' && c.type !== 'DC' && v <= 0)) { el.style.borderColor = '#f55'; return; }
          el.style.borderColor = '';
          c[k] = v;
        }
        B.changed(); renderSoft();
      };
      el.addEventListener(k === 'freqlog' ? 'input' : 'change', apply);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') { apply(); el.blur(); } });
      // fare tekerleği: kutunun üstündeyken değeri 1-2-5 adımıyla değiştir
      if (el.tagName === 'INPUT' && el.type !== 'range') el.addEventListener('wheel', e => {
        e.preventDefault();
        const v = Units.parse(el.value); if (!isFinite(v)) return;
        const nv = stepValue(k, v, e.deltaY < 0 ? 1 : -1, false);
        if (nv === undefined || !isFinite(nv) || (k !== 'offset' && nv <= 0)) return;
        el.value = Units.fmt(nv, '', 5); apply();
      }, { passive: false });
    });
    propsEl.querySelectorAll('[data-f]').forEach(ch => ch.onclick = () => { checkpoint(); c.freq = +ch.dataset.f; B.changed(); render(); renderProps(true); });
    propsEl.querySelectorAll('[data-v]').forEach(ch => ch.onclick = () => { checkpoint(); c.vpp = +ch.dataset.v; B.changed(); render(); renderProps(true); });
    const r = propsEl.querySelector('#pRot'), d = propsEl.querySelector('#pDel'), x = propsEl.querySelector('#pDesel');
    if (r) r.onclick = () => rotateSel(); if (d) d.onclick = () => deleteSel(); if (x) x.onclick = () => setSelection(null);
  }
  function renderSoft() { render(true); }   // özellik paneli girişlerini bozmadan yalnız SVG'yi yenile
  function pinName(r) { return B.pinLabel(r); }

  /* ---------------- olaylar ---------------- */
  function pt(e) {
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    return [q.x, q.y];
  }
  const snap = (v) => Math.round(v / SNAP) * SNAP;
  function nearestPin(x, y, rad = 16) {
    let best = null, bd = rad;
    for (const c of B.model.comps) T[c.type].pins.forEach((_, i) => {
      const [px, py] = B.pinPos(c, i), d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = { c: c.id, p: i }; }
    });
    return best;
  }
  function zoomAt([px, py], f) {
    const nw = Math.max(250, Math.min(2000, view.w * f)), r = nw / view.w;
    view = { x: px - (px - view.x) * r, y: py - (py - view.y) * r, w: nw, h: nw * VB0.h / VB0.w };
    applyView();
  }
  function applyView() {
    svg.setAttribute('viewBox', `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
    const z = document.getElementById('bZlbl'); if (z) z.textContent = Math.round(VB0.w / view.w * 100) + '%';
  }
  function onDown(e) {
    const t = e.target;
    benchActive = true; svg.classList.add('active');
    const [x, y] = pt(e);
    Panel.hideTip();
    const sw = t.closest('.probe-sw');
    if (sw) { checkpoint(); const p = B.model.probes[+sw.dataset.probe]; p.x10 = !p.x10; B.changed(); render(); return; }
    const ph = t.closest('.probe-h');
    if (ph) {
      const pr = ph.dataset.probe === 'ext' ? B.model.ext : B.model.probes[+ph.dataset.probe];
      const part = ph.dataset.part;
      const cur = pr[part] && pinXY(pr[part]) ? pinXY(pr[part]) : pr[part + 'XY'];
      drag = { kind: 'probe', pr, part, dx: cur[0] - x, dy: cur[1] - y, snap: B.snapshot(), was: pr[part], sx: x, sy: y, moved: false };
      pr[part + 'XY'] = [cur[0], cur[1]];
      e.preventDefault(); return;
    }
    if (t.dataset.pin) {
      const [c, p] = t.dataset.pin.split(':').map(Number);
      if (wiring && !(wiring.from.c === c && wiring.from.p === p)) { checkpoint(); B.connect(wiring.from, { c, p }); wiring = null; hoverPin = null; render(); return; }
      wiring = { from: { c, p }, x, y, startedAt: performance.now(), sx: x, sy: y };
      e.preventDefault(); render(); return;
    }
    if (t.dataset.wire !== undefined) { sel = { kind: 'wire', id: +t.dataset.wire }; wiring = null; render(); return; }
    const cg = t.closest('.bench-comp');
    if (cg) {
      const c = B.byId(+cg.dataset.comp);
      sel = { kind: 'comp', id: c.id }; wiring = null;
      drag = { kind: 'comp', c, dx: c.x - x, dy: c.y - y, moved: false, snap: B.snapshot() };
      render(); e.preventDefault(); return;
    }
    // boş alana basma: sürüklenirse görünüm kayar, sürüklenmezse seçim kalkar
    pan = { sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, k: 1 / svg.getScreenCTM().a, moved: false };
    e.preventDefault();
  }
  function onMove(e) {
    if (palDrag) { movePal(e); return; }
    if (pan) {
      const dx = e.clientX - pan.sx, dy = e.clientY - pan.sy;
      if (!pan.moved && Math.hypot(dx, dy) > 4) { pan.moved = true; svg.style.cursor = 'grabbing'; }
      if (pan.moved) { view.x = pan.vx - dx * pan.k; view.y = pan.vy - dy * pan.k; applyView(); }
      return;
    }
    if (!drag && !wiring) return;
    const [x, y] = pt(e);
    if (wiring) {
      wiring.x = x; wiring.y = y;
      const p = nearestPin(x, y, 14);
      hoverPin = p && !(p.c === wiring.from.c && p.p === wiring.from.p) ? p : null;
      render(true); return;
    }
    if (drag.kind === 'comp') {
      const nx = snap(x + drag.dx), ny = snap(y + drag.dy);
      if (nx !== drag.c.x || ny !== drag.c.y) { drag.c.x = nx; drag.c.y = ny; drag.moved = true; render(true); }
    } else if (drag.kind === 'probe') {
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) > 3) { drag.moved = true; if (drag.pr[drag.part]) { drag.pr[drag.part] = null; B.changed(); } }
      if (!drag.moved) return;
      drag.pr[drag.part + 'XY'] = [x + drag.dx, y + drag.dy];
      hoverPin = nearestPin(x + drag.dx, y + drag.dy, 20);
      render(true);
    }
  }
  function onUp(e) {
    if (palDrag) { dropPal(e); return; }
    if (pan) {
      const moved = pan.moved; pan = null; svg.style.cursor = '';
      if (!moved) { if (wiring) { wiring = null; hoverPin = null; } sel = null; render(); }
      return;
    }
    if (wiring) {
      const [x, y] = pt(e);
      const p = nearestPin(x, y, 14);
      const moved = Math.hypot(x - wiring.sx, y - wiring.sy) > 6;
      if (p && !(p.c === wiring.from.c && p.p === wiring.from.p)) { checkpoint(); B.connect(wiring.from, p); wiring = null; hoverPin = null; render(); }
      else if (moved) { wiring = null; hoverPin = null; render(); }
      // hareket yoksa: tık-tık modunda bir sonraki pin tıklamasını bekle
    }
    if (drag && drag.kind === 'probe') {
      if (drag.moved) {
        const [x, y] = drag.pr[drag.part + 'XY'];
        const p = nearestPin(x, y, 20);
        if (p) drag.pr[drag.part] = p;
        pushIfChanged(drag.snap); B.changed();
      }
      hoverPin = null;
      render();
    }
    if (drag && drag.kind === 'comp') { if (drag.moved) { pushIfChanged(drag.snap); B.changed(); } render(); }
    drag = null;
  }
  function pushIfChanged(s) { if (s !== B.snapshot()) { undoStack.push(s); redoStack.length = 0; } }
  function onDbl(e) {
    const cg = e.target.closest('.bench-comp'); if (!cg) return;
    sel = { kind: 'comp', id: +cg.dataset.comp }; render();
    const f = propsEl.querySelector('input,select'); if (f) { f.focus(); if (f.select) f.select(); }
  }
  function rotateSel() { if (sel && sel.kind === 'comp') { const c = B.byId(sel.id); if (c && !T[c.type].fixed) { checkpoint(); c.rot = ((c.rot || 0) + 1) % 4; B.changed(); render(); } } }
  function deleteSel() {
    if (!sel) return;
    checkpoint();
    if (sel.kind === 'comp') B.remove(sel.id);
    else { B.model.wires.splice(sel.id, 1); B.changed(); }
    sel = null; render();
  }

  /* ---------------- palet ---------------- */
  let palDrag = null, ghost = null;
  function buildPalette() {
    const pal = document.getElementById('palette');
    const items = ['R', 'C', 'L', 'D', 'FG', 'DC', 'GND', 'OA'];
    const icon = {
      R: '<path d="M2 10H8l2-5 4 10 4-10 4 10 2-5h6" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      C: '<path d="M2 10H14M20 10H32M14 3V17M20 3V17" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      L: '<path d="M2 10H6a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0H32" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      D: '<path d="M2 10H32M12 4V16L22 10Z M22 4V16" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      FG: '<circle cx="17" cy="10" r="8" stroke="#ddd" fill="none" stroke-width="1.6"/><path d="M12 10c2-6 4-6 5 0s3 6 5 0" stroke="#ddd" fill="none"/>',
      DC: '<path d="M17 1V7M17 13V19M9 7H25M13 13H21" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      GND: '<path d="M17 2V10M9 10H25M12 14H22M15 18H19" stroke="#ddd" fill="none" stroke-width="1.6"/>',
      OA: '<path d="M8 2V18L28 10Z" stroke="#ddd" fill="none" stroke-width="1.6"/>',
    };
    pal.innerHTML = items.map(k => `<div class="pal" data-type="${k}" title="Sürükleyip tezgâha bırak (ya da tıkla: ortaya eklenir)"><svg viewBox="0 0 34 20">${icon[k]}</svg>${T[k].name.replace(' (1N4148)', '')}</div>`).join('') +
      `<div class="palHint">Tıkla = ortaya ekle<br>Sürükle = istediğin yere bırak</div>`;
    pal.querySelectorAll('.pal').forEach(el => el.addEventListener('pointerdown', e => {
      e.preventDefault();
      palDrag = { type: el.dataset.type, sx: e.clientX, sy: e.clientY };
      ghost = document.createElement('div'); ghost.className = 'pal'; ghost.style.cssText = 'position:fixed;z-index:70;pointer-events:none;opacity:.85;background:#3d444d;border:1px solid #888;border-radius:6px;padding:4px 6px;display:flex;gap:6px;align-items:center;color:#eee;font-size:12px';
      ghost.innerHTML = el.innerHTML; document.body.appendChild(ghost); movePal(e);
    }));
  }
  function movePal(e) { ghost.style.left = e.clientX - 20 + 'px'; ghost.style.top = e.clientY - 12 + 'px'; }
  function dropPal(e) {
    const r = svg.getBoundingClientRect();
    const click = Math.hypot(e.clientX - palDrag.sx, e.clientY - palDrag.sy) < 4;
    if (click || (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)) {
      checkpoint();
      let x, y;
      if (click) {   // tıklama: boş bir yere yerleştir
        x = 500; y = 240;
        while (B.model.comps.some(c => Math.abs(c.x - x) < 60 && Math.abs(c.y - y) < 50)) { x += 80; if (x > 860) { x = 300; y += 80; } if (y > 420) break; }
      } else { [x, y] = pt(e); }
      const c = B.add(palDrag.type, snap(x), snap(y));
      sel = { kind: 'comp', id: c.id };
      render();
    }
    ghost.remove(); ghost = null; palDrag = null;
  }

  function setSelection(s) { sel = s; render(); }
  return { init, render, setSelection, checkpoint, undo, redo, pinForNode, select: (id) => setSelection(id ? { kind: 'comp', id } : null) };
})();
