/* =====================================================================
 * App — ön panel eylemleri, kayıt/geri çağırma, hazır devre yükleme, ana döngü
 * ===================================================================== */
const App = (() => {
  const api = { power: true, levelShowUntil: 0, measResults: [] };
  const S = () => State.S, R = () => State.R;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dirty = () => { Acq.markDirty(); };
  const NA = () => State.message('Not available');

  /* ---------------- tuşlar ---------------- */
  function toggleMenu(id) { if (Menus.isOpen(id)) Menus.close(); else Menus.open(id); }
  function press(id) {
    if (!api.power && id !== 'power') return;
    const M = Menus.M;
    if (M.help && id !== 'help') { M.helpText = Panel.HELP[id] || [id, '']; return; }
    const s = S(), r = R();
    const m = id.match(/^(side|bot)(\d)$/);
    if (m) { m[1] === 'side' ? Menus.pressSide(+m[2]) : Menus.pressBottom(+m[2]); return; }
    switch (id) {
      case 'menuoff': Menus.menuOff(); break;
      case 'select': Menus.select(); break;
      case 'measure': case 'app': case 'acquire': case 'display': case 'save': case 'utility': toggleMenu(id); break;
      case 'tmenu': toggleMenu('trigger'); break;
      case 'cursor': {
        const Cu = s.cursor;
        if (!Menus.isOpen('cursor')) { Menus.open('cursor'); if (!Cu.mode) { Cu.mode = 'H'; Cu.sel = 0; } }
        else if (Cu.mode === 'H') { Cu.mode = 'V'; Cu.sel = 0; }
        else { Cu.mode = null; Menus.close(); }   // TAHMIN: üçüncü basış imleçleri kapatır
        break;
      }
      case 'help': M.help = !M.help; M.helpText = null; break;
      case 'autoset': if (Acq.autoset()) { Menus.open('autoset'); r.persistClear = true; } break;
      case 'runstop': r.run = !r.run; r.single = false; if (r.run) Acq.resetArm(); break;
      case 'single': r.single = true; r.run = true; Acq.resetArm(); r.persistClear = true; break;
      case 'default': defaultSetup(); break;
      case 'zoom':
        s.zoom.on = !s.zoom.on;
        if (s.zoom.on) { s.zoom.tdivIdx = Math.max(0, s.tdivIdx - 3); s.zoom.pos = s.hpos; Menus.open('zoom'); }
        else if (Menus.isOpen('zoom')) Menus.close();
        r.persistClear = true; break;
      case 'play': if (s.zoom.on) s.zoom.play = !s.zoom.play; else State.message('Play/Pause: turn Zoom on first'); break;
      case 'search': case 'searchL': case 'searchR': case 'setclear': NA(); break;
      case 't50': Acq.level50(); api.showLevel(); break;
      case 'force': Acq.forceTrig(); break;
      case 'ch1': case 'ch2': {
        const c = id === 'ch1' ? 0 : 1, C = s.ch[c];
        if (!C.on) { C.on = true; Menus.open(id); }
        else if (Menus.isOpen(id)) { C.on = false; Menus.close(); }
        else Menus.open(id);
        r.persistClear = true; dirty(); break;
      }
      case 'math':
        if (!s.math.on) { s.math.on = true; Menus.open('math'); }
        else if (Menus.isOpen('math')) { s.math.on = false; Menus.close(); }
        else Menus.open('math');
        r.persistClear = true; break;
      case 'ref': toggleMenu('ref'); break;
      case 'bus': State.message('BUS: DSIB-BUS serial decode module is not installed'); break;
      case 'hardcopy':
        if (s.util.hcAssign === 'Image') saveImage();
        else if (s.util.hcAssign === 'Waveform') saveCSV('CH1');
        else saveSetup(0);
        break;
      case 'power':
        api.power = !api.power;
        if (api.power) { r.persistClear = true; State.message('GDS-1102B', 1200); }
        break;
    }
  }

  /* ---------------- düğmeler ---------------- */
  function offsetLimit(c) {
    // Kılavuz: ±1.25 V (1 mV/div), ±2.5 V (2–100 mV/div), ±125 V (200 mV–10 V/div) — prob ×1 cinsinden
    const hw = State.VDIV[S().ch[c].vdivIdx];
    const lim = hw <= 1e-3 ? 1.25 : hw <= 0.1 ? 2.5 : 125;
    return Math.min(lim / hw, 200);
  }
  /** Düğme çevrilince ekranın üstünde beliren değer balonu (HUD) */
  let hudTimer = 0;
  api.hud = (title, value, sub) => {
    const el = document.getElementById('hud'); if (!el) return;
    el.innerHTML = `${title}: <span style="color:#ffe9a8">${value}</span>${sub ? `<small>${sub}</small>` : ''}`;
    el.classList.add('show');
    clearTimeout(hudTimer); hudTimer = setTimeout(() => el.classList.remove('show'), 1400);
  };
  /** Bir düğmenin şu anki değeri: [başlık, değer] */
  function knobReadout(id) {
    const St = S(), f = Units.fmt;
    switch (id) {
      case 'ch1scale': case 'ch2scale': { const c = id[2] === '1' ? 0 : 1; return [`CH${c + 1} VOLTS/DIV`, f(State.vdiv(c), 'V') + '/div']; }
      case 'ch1pos': case 'ch2pos': { const c = id[2] === '1' ? 0 : 1; return [`CH${c + 1} POSITION`, f(St.ch[c].pos * State.vdiv(c), 'V') + ` (${St.ch[c].pos.toFixed(2)} div)`]; }
      case 'hscale': return St.zoom.on && St.zoom.knob === 'zoom' ? ['ZOOM TIME/DIV', f(State.TDIV[St.zoom.tdivIdx], 's') + '/div'] : ['TIME/DIV', f(State.tdiv(), 's') + '/div'];
      case 'hpos': return St.zoom.on && St.zoom.knob === 'zoom' ? ['ZOOM POSITION', f(St.zoom.pos, 's')] : ['H POSITION', f(St.hpos, 's')];
      case 'level': return ['TRIGGER LEVEL', St.trig.src === 'LINE' ? '—' : f(St.trig.level, 'V')];
      case 'variable': {
        const M = Menus.M;
        if (M.list) return [M.list.title, M.list.items[M.list.idx]];
        if (M.varSel && M.cur) { const b = Menus.bottom()[M.varSel.b]; const it = b && b.side && b.side.items[M.varSel.s]; if (it) return [it.label, it.value ? it.value() : '']; }
        const Cu = St.cursor;
        if (Cu.mode) {
          const inf = Renderer.cursorInfo(), sel = ['①', '②', '①②'][Cu.sel];
          if (Cu.mode === 'H') return [`H imleç ${sel}`, `① ${f(inf.tAt(Cu.h[0]), 's')}  ② ${f(inf.tAt(Cu.h[1]), 's')}  Δ ${f(inf.tAt(Cu.h[1]) - inf.tAt(Cu.h[0]), 's')}`];
          return [`V imleç ${sel}`, `① ${f(inf.vOf(Cu.v[0]), 'V')}  ② ${f(inf.vOf(Cu.v[1]), 'V')}  Δ ${f(inf.vOf(Cu.v[1]) - inf.vOf(Cu.v[0]), 'V')}`];
        }
        return null;
      }
    }
    return null;
  }
  api.knobReadout = knobReadout;
  function turn(id, s, speed = 1) {
    if (!api.power) return;
    const M = Menus.M;
    if (M.help) { M.helpText = Panel.HELP[id]; return; }
    const St = S(), n = s * speed;
    afterTurn(id);
    switch (id) {
      case 'variable': if (!Menus.variable(n)) api.hud('VARIABLE', 'bağlı ayar yok', 'Önce yan menüde ⟲ işaretli bir öğe seç ya da Cursor tuşuna bas'); break;
      case 'hpos': {
        const Z = St.zoom;
        if (Z.on && Z.knob === 'zoom') { const zt = State.TDIV[Z.tdivIdx]; Z.pos = clamp(Z.pos - n * 0.1 * zt, St.hpos - 5 * State.tdiv(), St.hpos + 5 * State.tdiv()); }
        else { const td = State.tdiv(); St.hpos = clamp(St.hpos - n * 0.1 * td, -5 * td, 1000 * td); if (Math.abs(St.hpos) < 0.02 * td) St.hpos = 0; dirty(); }
        break;
      }
      case 'hscale': {
        const Z = St.zoom;
        if (Z.on && Z.knob === 'zoom') { Z.tdivIdx = clamp(Z.tdivIdx - s, 0, St.tdivIdx - 1); break; }
        const old = St.tdivIdx;
        St.tdivIdx = clamp(St.tdivIdx - s, 0, State.TDIV.length - 1);
        if (St.tdivIdx !== old) {
          St.hpos = clamp(St.hpos, -5 * State.tdiv(), 1000 * State.tdiv());
          if (Z.on) Z.tdivIdx = Math.min(Z.tdivIdx, St.tdivIdx - 1);
          R().persistClear = true; dirty(); Acq.resetArm();
        }
        break;
      }
      case 'level': {
        const T = St.trig;
        const step = T.src === 'CH1' || T.src === 'CH2' ? State.vdiv(T.src === 'CH2' ? 1 : 0) * 0.04 : 0.02;
        T.level += n * step; api.showLevel(); break;
      }
      case 'ch1pos': case 'ch2pos': {
        const c = id === 'ch1pos' ? 0 : 1, L = offsetLimit(c);
        St.ch[c].pos = clamp(St.ch[c].pos + n * 0.04, -L, L); dirty(); break;
      }
      case 'ch1scale': case 'ch2scale': {
        const c = id === 'ch1scale' ? 0 : 1, C = St.ch[c];
        const old = State.vdiv(c);
        C.vdivIdx = clamp(C.vdivIdx - s, 0, State.VDIV.length - 1);
        if (C.expand === 'Center') C.pos = C.pos * old / State.vdiv(c);   // ekran ortasındaki gerilim sabit kalır
        C.pos = clamp(C.pos, -offsetLimit(c), offsetLimit(c));
        R().persistClear = true; dirty(); break;
      }
    }
  }
  // Değer balonu, çevirme işleminden hemen sonra (yeni değerle) gösterilir
  function afterTurn(id) {
    queueMicrotask(() => { const r = knobReadout(id); if (r) api.hud(r[0], r[1]); });
  }
  function push(id) {
    if (!api.power) return;
    if (Menus.M.help) { Menus.M.helpText = Panel.HELP[id]; return; }
    const St = S();
    switch (id) {
      case 'hpos': if (St.zoom.on && St.zoom.knob === 'zoom') St.zoom.pos = St.hpos; else St.hpos = 0; dirty(); break;
      case 'level': St.trig.level = 0; api.showLevel(); break;
      case 'ch1pos': St.ch[0].pos = 0; dirty(); break;
      case 'ch2pos': St.ch[1].pos = 0; dirty(); break;
    }
    const r = knobReadout(id); if (r) api.hud(r[0], r[1], 'sıfırlandı');
  }
  api.showLevel = () => { api.levelShowUntil = performance.now() + 1500; };

  /* ---------------- kaydetme ---------------- */
  let fileNo = 1;
  function download(name, href) { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  function saveImage() {
    const src = document.getElementById('screen');
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    if (S().util.inkSaver) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.filter = 'invert(1) hue-rotate(180deg)'; }
    x.drawImage(src, 0, 0);
    const name = 'DS' + String(fileNo++).padStart(4, '0') + '.PNG';
    download(name, c.toDataURL('image/png'));
    State.message(`Saved image: ${name}`);
  }
  function saveCSV(src) {
    const rec = R().rec; if (!rec) return State.message('No waveform');
    let arr = null;
    if (src === 'Math') { const m = MathFn.dual(); arr = m && m.arr; } else { const c = src === 'CH2' ? 1 : 0; arr = rec.ch[c]; }
    if (!arr) return State.message(`${src} has no waveform`);
    // TAHMIN: GW "Detail CSV" başlığına benzer biçim
    const lines = ['Format,1.0B', `Memory Length,${arr.length}`, `Source,${src}`, 'Vertical Units,V', `Horizontal Scale,${State.tdiv()}`,
      `Sampling Period,${rec.step}`, 'Horizontal Units,S', 'Model,GDS-1102B', 'Waveform Data,', 'Time(s),Voltage(V)'];
    const t0 = rec.trigT !== null ? (rec.tl - rec.trigT) : -5 * rec.tdiv;
    for (let k = 0; k < arr.length; k++) lines.push(`${(t0 + k * rec.step).toExponential(6)},${isNaN(arr[k]) ? '' : arr[k].toPrecision(6)}`);
    const name = 'DS' + String(fileNo++).padStart(4, '0') + '.CSV';
    download(name, URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/csv' })));
    State.message(`Saved waveform: ${name}`);
  }
  const memSetups = new Array(20).fill(null);
  function loadStore() { try { const s = JSON.parse(localStorage.getItem('gds1102b.setups') || 'null'); if (Array.isArray(s)) s.forEach((v, i) => memSetups[i] = v); } catch (e) { } }
  function saveStore() { try { localStorage.setItem('gds1102b.setups', JSON.stringify(memSetups)); } catch (e) { } }
  function stripRefs(s) { const c = JSON.parse(JSON.stringify(s)); c.ref = c.ref.map(() => ({ on: false })); return c; }
  function saveSetup(i) { memSetups[i] = stripRefs(S()); saveStore(); State.message(`Setup saved to Set${i + 1}`); }
  function hasSetup(i) { return !!memSetups[i]; }
  function deepMerge(base, over) {
    for (const k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && base[k] && typeof base[k] === 'object') deepMerge(base[k], over[k]);
      else base[k] = over[k];
    }
    return base;
  }
  function applyState(ns) {
    const refs = S().ref;
    ns.ref = refs;
    State.set(ns);
    R().run = true; R().single = false; R().avgN = 0; R().persistClear = true;
    Sim.refilterTrig(); Acq.resetArm(); Measure.resetStats();
  }
  function recallSetup(i) {
    if (!memSetups[i]) return State.message(`Set${i + 1} is empty`);
    applyState(deepMerge(State.defaults(), JSON.parse(JSON.stringify(memSetups[i]))));
    State.message(`Setup recalled from Set${i + 1}`);
  }
  function defaultSetup() {
    const d = State.defaults();
    applyState(d);
    S().ref.forEach(r => r.on = false);
    Menus.close();
    State.message('Default Setup');
  }
  function eraseMemory() { memSetups.fill(null); saveStore(); S().ref = [0, 1, 2, 3].map(() => ({ on: false })); }

  /* ---------------- hazır devreler ---------------- */
  function loadPreset(name) {
    Circuits.setCurrent(name);
    if (!Circuits.build(name)) Bench.preset(name);
    const s = S();
    s.ch[0].on = true; s.ch[0].atten = 10;
    s.ch[1].on = name !== 'comp' && name !== 'empty'; s.ch[1].atten = 10;
    s.meas.items = []; s.cursor.mode = null; Menus.close();
    s.ch[0].coupling = s.ch[1].coupling = 'DC';
    s.trig.src = 'CH1'; s.trig.mode = 'Auto';
    s.acq.xy = false; s.math.on = false; s.zoom.on = false;
    R().run = true; R().single = false;
    if (typeof BenchUI !== 'undefined' && BenchUI.setSelection && api.uiReady) BenchUI.setSelection(null);
    Sim.rebuild();
    if (name !== 'empty') Acq.autoset();
    R().persistClear = true;
  }

  /* ---------------- ana döngü ---------------- */
  let last = 0, measT = 0, playT = 0;
  function frame(t) {
    const dt = last ? (t - last) / 1000 : 1 / 60; last = t;
    try {
      if (api.power) {
        Acq.tick(dt);
        const Z = S().zoom;
        if (Z.on && Z.play) { const zt = State.TDIV[Z.tdivIdx]; Z.pos += zt * 0.25; if (Z.pos > S().hpos + 5 * State.tdiv() - 5 * zt) Z.pos = S().hpos - 5 * State.tdiv() + 5 * zt; }
        if (t - measT > 150) { measT = t; api.measResults = Measure.results(); }
      }
      Renderer.draw(t);
      Panel.updateLeds();
      Guide.tick(t);
      Info.tick(t);
      if (Sim.warnings.join() !== api._warn) { api._warn = Sim.warnings.join(); BenchUI.render(); }
    } catch (e) { console.error(e); }
    requestAnimationFrame(frame);
  }

  function init() {
    loadStore();
    const wrap = document.getElementById('scopeWrap');
    Panel.build(wrap);
    Renderer.init(document.getElementById('screen'));
    loadPreset('wien');
    // Gerçek cihazda olduğu gibi açılışta varsayılan ayarlar (öğrenci Autoset'e kendisi basar)
    State.set(Object.assign(State.defaults(), {}));
    Sim.refilterTrig();
    BenchUI.init(); api.uiReady = true;
    // son çalışılan devreyle aç
    if (Guide.circuit !== 'wien') { loadPreset(Guide.circuit); State.set(State.defaults()); Sim.refilterTrig(); BenchUI.render(); }
    Guide.init();
    Info.init();
    document.getElementById('btnTests').onclick = () => Tests.runUi();
    document.getElementById('btnGuide').onclick = () => Guide.toggle();
    document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') { e.target.style.display = 'none'; const b = document.getElementById('modalBox'); b.className = 'box'; b.onclick = null; } });
    State.message('GDS-1102B ready — press Autoset', 3000);
    setupPwa();
    requestAnimationFrame(frame);
  }

  /* ---------------- uygulama (PWA): çevrimdışı çalışma, yükleme, güncelleme ---------------- */
  function setupPwa() {
    // "Uygulamayı yükle" düğmesi (Chrome/Edge/Android)
    let deferred = null;
    const ib = document.getElementById('btnInstall');
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; ib.style.display = ''; });
    ib.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; ib.style.display = 'none'; };
    window.addEventListener('appinstalled', () => { ib.style.display = 'none'; });
    // service worker yalnız http(s) üzerinden çalışır (dosyayı çift tıklayınca açılan file:// sürümde atlanır)
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
    const bar = document.getElementById('updBar');
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then(reg => {
      const offer = (w) => {
        bar.classList.add('show');
        document.getElementById('updBtn').onclick = () => w.postMessage('skipWaiting');
        document.getElementById('updLater').onclick = () => bar.classList.remove('show');
      };
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); });
      });
      // uygulama uzun süre açık kalırsa saatte bir yeni sürüm kontrolü
      setInterval(() => reg.update().catch(() => { }), 3600 * 1000);
    }).catch(() => { });
  }

  Object.assign(api, { init, press, turn, push, saveImage, saveCSV, saveSetup, recallSetup, hasSetup, defaultSetup, eraseMemory, loadPreset });
  return api;
})();
