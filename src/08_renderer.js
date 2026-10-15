/* =====================================================================
 * Renderer — 800×480 WVGA ekranın çizimi (Canvas 2D)
 *   Yerleşim (TAHMIN: piksel ölçüleri kılavuz görsellerinden yaklaşık):
 *     üst bar 0–28 · ızgara x 12–692, y 30–414 (10×8 bölme, 68×48 px) · yan menü 700–800
 *     durum barı 416–438 · alt menü 440–480 (7 kutu)
 *   VPO / fosfor: ayrı bir "phosphor" tuvalinde iz birikir ve persistence süresine göre söner.
 * ===================================================================== */
const Renderer = (() => {
  const W = 800, H = 480;
  const GX = 12, GY = 30, DW = 68, DH = 48, GW = DW * 10, GH = DH * 8;
  const CX = GX + GW / 2, CY = GY + GH / 2;
  const SIDE_X = 700, SIDE_Y = GY, SIDE_H = GH / 5;
  const BOT_Y = 440, BOT_W = W / 7;
  const COL = { ch: ['#ffe14a', '#4fc3ff'], math: '#ff4a4a', ref: '#ffffff', grid: '#8a8f96', txt: '#e8e8e8', menuBg: '#1d2f4a', menuSel: '#3b6aa8' };
  let ctx, ph, pctx, lastT = 0;

  let cv, sc = 0;
  function init(canvas) {
    cv = canvas;
    ctx = canvas.getContext('2d');
    ph = document.createElement('canvas');
    pctx = ph.getContext('2d');
    fitResolution();
  }
  /**
   * Yüksek çözünürlük: tuval, ekranda gösterildiği gerçek piksel boyutunda (× devicePixelRatio) çizilir.
   * Tüm çizim kodu 800×480 mantıksal koordinatla çalışmaya devam eder (ölçek dönüşümüyle).
   */
  function fitResolution() {
    const css = cv.clientWidth || W;
    const s = Math.max(1, Math.min(3, Math.round((window.devicePixelRatio || 1) * css / W * 4) / 4));
    if (s === sc) return;
    sc = s;
    cv.width = Math.round(W * s); cv.height = Math.round(H * s);
    ph.width = Math.round(GW * s); ph.height = Math.round(GH * s);
    pctx.setTransform(s, 0, 0, s, 0, 0);
    State.R.persistClear = true;
  }
  const yOf = (v, vdiv, pos) => CY - (v / vdiv + pos) * DH;

  /* ---------------- ızgara ---------------- */
  function grid(x0 = GX, y0 = GY, w = GW, h = GH, divs = 8) {
    const S = State.S, a = S.disp.gridInt / 100;
    const dh = h / divs;
    ctx.save();
    ctx.strokeStyle = `rgba(150,155,160,${0.9 * a})`; ctx.fillStyle = `rgba(150,155,160,${a})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    const g = S.disp.grat;
    if (g === 'Full' || g === 'Grid') {
      // noktalı ızgara: her bölmede 5 nokta
      for (let i = 1; i < 10; i++) for (let k = 0; k <= divs * 5; k++) ctx.fillRect(x0 + i * DW, y0 + k * dh / 5, 1, 1);
      for (let j = 1; j < divs; j++) for (let k = 0; k <= 50; k++) ctx.fillRect(x0 + k * DW / 5, y0 + j * dh, 1, 1);
    }
    if (g === 'Full' || g === 'Cross Hair') {
      const cx = x0 + w / 2, cy = y0 + h / 2;
      ctx.beginPath(); ctx.moveTo(x0, cy + 0.5); ctx.lineTo(x0 + w, cy + 0.5); ctx.moveTo(cx + 0.5, y0); ctx.lineTo(cx + 0.5, y0 + h); ctx.stroke();
      // orta eksen çentikleri (1/5 bölme)
      for (let k = 0; k <= 50; k++) { const x = x0 + k * DW / 5; ctx.fillRect(x, cy - 2, 1, 5); }
      for (let k = 0; k <= divs * 5; k++) { const y = y0 + k * dh / 5; ctx.fillRect(cx - 2, y, 5, 1); }
    }
    ctx.restore();
  }

  /* ---------------- dalga izi ---------------- */
  /** arr (volt) dizisini fosfor tuvaline çiz. map: k → x, v → y (fosfor koordinatı) */
  function trace(c, arr, color, vdiv, pos, opt = {}) {
    if (!arr) return;
    const S = State.S, n = arr.length;
    const x0 = opt.x0 ?? 0, w = opt.w ?? GW, yc = opt.yc ?? GH / 2, dh = opt.dh ?? DH;
    const i0 = opt.i0 ?? 0, i1 = opt.i1 ?? n - 1;
    const sx = w / (i1 - i0);
    const Y = (v) => yc - (v / vdiv + pos) * dh;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = color; c.fillStyle = color;
    const inten = S.disp.wfInt / 100;
    const vector = S.disp.vector;
    const pts = i1 - i0;
    // iki geçiş: geniş yarı saydam parıltı + ince parlak çekirdek
    for (const pass of [0, 1]) {
      c.globalAlpha = (pass ? 0.8 : 0.1) * inten + (pass ? 0.12 : 0.03);
      c.lineWidth = pass ? 1.2 : 3;
      if (vector) {
        c.beginPath();
        let started = false;
        if (pts > w * 1.5) {
          // sütun başına min/max (yoğun kayıt)
          const cols = Math.ceil(w);
          for (let px = 0; px < cols; px++) {
            const a = Math.floor(i0 + px / sx), b = Math.min(i1, Math.floor(i0 + (px + 1) / sx));
            let mn = Infinity, mx = -Infinity;
            for (let k = a; k <= b; k++) { const v = arr[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
            if (mn === Infinity) { started = false; continue; }
            const ya = Y(mx), yb = Y(mn);
            if (!started) { c.moveTo(x0 + px, ya); started = true; } else c.lineTo(x0 + px, ya);
            c.lineTo(x0 + px, yb + 0.5);
          }
        } else {
          for (let k = Math.max(0, Math.floor(i0)); k <= Math.min(n - 1, Math.ceil(i1)); k++) {
            const v = arr[k];
            if (isNaN(v)) { started = false; continue; }
            const x = x0 + (k - i0) * sx, y = Y(v);
            if (!started) { c.moveTo(x, y); started = true; } else c.lineTo(x, y);
          }
        }
        c.stroke();
      } else {
        if (pass === 0) continue;
        const stepk = Math.max(1, Math.floor(pts / 4000));
        for (let k = Math.max(0, Math.floor(i0)); k <= Math.min(n - 1, i1); k += stepk) {
          const v = arr[k]; if (isNaN(v)) continue;
          c.fillRect(x0 + (k - i0) * sx - 0.8, Y(v) - 0.8, 1.8, 1.8);
        }
      }
    }
    c.restore();
  }

  /** Persistence: fosfor tuvalini geçen süreye göre söndür */
  function fade(dtReal) {
    const S = State.S, R = State.R;
    const p = State.PERSIST[S.disp.persistIdx];
    if (R.persistClear) { pctx.clearRect(0, 0, GW, GH); R.persistClear = false; }
    if (p === Infinity) return;
    const tau = p === 0 ? 0.004 : p;
    const a = p === 0 ? 1 : Math.min(1, 1 - Math.exp(-dtReal / (tau * 0.35)));
    pctx.save();
    pctx.globalCompositeOperation = 'destination-out';
    pctx.fillStyle = `rgba(0,0,0,${a})`;
    pctx.fillRect(0, 0, GW, GH);
    pctx.restore();
  }

  /* ---------------- ana çizim ---------------- */
  function draw(tNow) {
    const S = State.S, R = State.R;
    const dtReal = lastT ? (tNow - lastT) / 1000 : 0.016; lastT = tNow;
    fitResolution();
    ctx.setTransform(sc, 0, 0, sc, 0, 0);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!App.power) { ctx.restore(); return; }
    ctx.font = '12px "Segoe UI", Arial, sans-serif'; ctx.textBaseline = 'middle';

    fade(dtReal);
    const rec = R.rec;
    if (S.acq.xy) drawXY(rec);
    else if (S.math.on && S.math.kind === 'fft') drawFFT(rec);
    else if (S.zoom.on) drawZoom(rec);
    else drawYT(rec, { x0: 0, w: GW, yc: GH / 2, dh: DH });

    if (S.zoom.on && !S.acq.xy) { grid(GX, GY, GW, 120, 2.5); grid(GX, GY + 128, GW, GH - 128, 5.33); }
    else grid();
    ctx.drawImage(ph, GX, GY, GW, GH);
    if (!S.acq.xy) markers();
    if (S.cursor.mode && !S.acq.xy) cursors();
    topBar(); statusBar();
    measBox();
    if (S.meas.displayAll) displayAll();
    Menus.drawMenus(ctx, { SIDE_X, SIDE_Y, SIDE_H, BOT_Y, BOT_W, W, H, GX, GY, GW, GH });
    overlayMsg();
    // arka ışık (Display > Intensity > Backlight)
    const bl = S.disp.backlight / 100;
    if (bl < 1) { ctx.fillStyle = `rgba(0,0,0,${(1 - bl) * 0.85})`; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  function drawYT(rec, o) {
    const S = State.S;
    if (rec) {
      for (let c = 0; c < 2; c++) if (S.ch[c].on && rec.ch[c]) trace(pctx, rec.ch[c], COL.ch[c], State.vdiv(c), S.ch[c].pos, o);
      if (S.math.on && S.math.kind === 'dual') { const m = MathFn.dual(); if (m) trace(pctx, m.arr, COL.math, S.math.vdiv, S.math.pos, o); }
    }
    for (const r of S.ref) if (r.on && r.data) trace(pctx, r.data, COL.ref, r.vdiv, r.pos, o);
  }
  function drawZoom(rec) {
    const S = State.S;
    if (!rec) return;
    // üst pencere: tüm kayıt (küçültülmüş)
    drawYT(rec, { x0: 0, w: GW, yc: 60, dh: 120 / 8 });
    // alt pencere: yakınlaştırılmış bölüm
    const zt = State.TDIV[S.zoom.tdivIdx], span = 10 * rec.tdiv;
    const zc = S.zoom.pos;                        // tetiğe göre zoom merkez zamanı
    const tl = (zc - S.hpos) - 5 * zt + 5 * rec.tdiv; // kayıt başından itibaren
    const i0 = tl / rec.step, i1 = (tl + 10 * zt) / rec.step;
    drawYT(rec, { x0: 0, w: GW, yc: 128 + (GH - 128) / 2, dh: (GH - 128) / 8, i0, i1 });
    // üst pencerede zoom çerçevesi
    const xa = GX + tl / span * GW, xb = GX + (tl + 10 * zt) / span * GW;
    ctx.save(); ctx.fillStyle = 'rgba(80,140,255,0.18)'; ctx.fillRect(Math.max(GX, xa), GY, Math.max(2, Math.min(xb, GX + GW) - Math.max(GX, xa)), 120);
    ctx.fillStyle = '#fff'; ctx.fillText('Z', GX + 4, GY + 136); ctx.restore();
  }
  function drawXY(rec) {
    const S = State.S;
    if (!rec || !rec.ch[0] || !rec.ch[1]) return;
    const a = rec.ch[0], b = rec.ch[1], vx = State.vdiv(0), vy = State.vdiv(1);
    pctx.save(); pctx.globalCompositeOperation = 'lighter'; pctx.strokeStyle = COL.ch[0]; pctx.fillStyle = COL.ch[0];
    pctx.globalAlpha = 0.6 * S.disp.wfInt / 100 + 0.2; pctx.lineWidth = 1.2;
    const X = (v) => GW / 2 + (v / vx + S.ch[0].pos) * DH, Y = (v) => GH / 2 - (v / vy + S.ch[1].pos) * DH;
    if (S.disp.vector) {
      pctx.beginPath();
      const st = Math.max(1, Math.floor(a.length / 5000));
      for (let k = 0; k < a.length; k += st) { if (isNaN(a[k]) || isNaN(b[k])) continue; k ? pctx.lineTo(X(a[k]), Y(b[k])) : pctx.moveTo(X(a[k]), Y(b[k])); }
      pctx.stroke();
    } else for (let k = 0; k < a.length; k += 2) pctx.fillRect(X(a[k]), Y(b[k]), 1.5, 1.5);
    pctx.restore();
  }
  function drawFFT(rec) {
    const S = State.S, F = S.math.fft;
    const sp = MathFn.spectrum(); if (!sp) return;
    const hdiv = F.hdiv || sp.fmax / 10, hc = F.hcenter ?? sp.fmax / 2;
    const f0 = hc - 5 * hdiv;
    const scale = F.unit === 'dBV' ? F.scale : State.VDIV[Math.max(0, Math.min(State.VDIV.length - 1, F.linIdx ?? 9))];
    pctx.save(); pctx.globalCompositeOperation = 'lighter'; pctx.strokeStyle = COL.math; pctx.lineWidth = 1.2; pctx.globalAlpha = 0.9;
    pctx.beginPath();
    for (let px = 0; px < GW; px++) {
      const fa = f0 + px / GW * 10 * hdiv, fb = f0 + (px + 1) / GW * 10 * hdiv;
      let ka = Math.max(0, Math.floor(fa / sp.df)), kb = Math.min(sp.mag.length - 1, Math.max(ka, Math.floor(fb / sp.df)));
      if (fa < 0 || ka >= sp.mag.length) continue;
      let mx = -Infinity; for (let k = ka; k <= kb; k++) mx = Math.max(mx, sp.mag[k]);
      const y = GH / 2 - (mx / scale + F.pos) * DH;
      px ? pctx.lineTo(px, y) : pctx.moveTo(px, y);
    }
    pctx.stroke(); pctx.restore();
    ctx.save(); ctx.fillStyle = COL.math; ctx.textAlign = 'left';
    ctx.fillText(`FFT ${F.src} ${F.win}  ${F.unit === 'dBV' ? F.scale + 'dB' : Units.fmt(scale, 'V')}/div   ${Units.fmt(f0 + 5 * hdiv, 'Hz')} center  ${Units.fmt(hdiv, 'Hz')}/div`, GX + 190, GY + 12);
    ctx.restore();
  }

  /* ---------------- işaretçiler ---------------- */
  function markers() {
    const S = State.S;
    ctx.save(); ctx.font = 'bold 11px Arial'; ctx.textAlign = 'center';
    // kanal toprak seviyesi işaretleri (sol kenar)
    for (let c = 0; c < 2; c++) {
      if (!S.ch[c].on) continue;
      let y = CY - S.ch[c].pos * DH; y = Math.max(GY + 6, Math.min(GY + GH - 6, y));
      ctx.fillStyle = COL.ch[c];
      ctx.beginPath(); ctx.moveTo(GX - 12, y - 6); ctx.lineTo(GX - 3, y - 6); ctx.lineTo(GX + 2, y); ctx.lineTo(GX - 3, y + 6); ctx.lineTo(GX - 12, y + 6); ctx.fill();
      ctx.fillStyle = '#000'; ctx.fillText(String(c + 1), GX - 6, y + 0.5);
    }
    if (S.math.on && S.math.kind === 'dual') { let y = CY - S.math.pos * DH; y = Math.max(GY + 6, Math.min(GY + GH - 6, y)); ctx.fillStyle = COL.math; ctx.fillRect(GX - 12, y - 6, 12, 12); ctx.fillStyle = '#000'; ctx.fillText('M', GX - 6, y); }
    // tetik seviyesi (sağ kenar)
    const T = S.trig;
    if (T.src === 'CH1' || T.src === 'CH2') {
      const c = T.src === 'CH2' ? 1 : 0;
      let y = yOf(T.level, State.vdiv(c), S.ch[c].pos);
      const off = y < GY || y > GY + GH; y = Math.max(GY + 4, Math.min(GY + GH - 4, y));
      ctx.fillStyle = off ? '#ff8a3a' : COL.ch[c];
      ctx.beginPath(); ctx.moveTo(GX + GW + 8, y - 6); ctx.lineTo(GX + GW, y); ctx.lineTo(GX + GW + 8, y + 6); ctx.fill();
      if (App.levelShowUntil > performance.now()) {
        ctx.strokeStyle = COL.ch[c]; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(GX, y + 0.5); ctx.lineTo(GX + GW, y + 0.5); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // tetik konumu (üst kenar)
    const tdiv = State.tdiv();
    let x = CX - S.hpos / tdiv * DW;
    const offx = x < GX || x > GX + GW; x = Math.max(GX + 5, Math.min(GX + GW - 5, x));
    ctx.fillStyle = '#ff9a2a';
    ctx.beginPath(); ctx.moveTo(x - 6, GY); ctx.lineTo(x + 6, GY); ctx.lineTo(x, GY + 8); ctx.fill();
    if (offx) { ctx.fillText(x < CX ? '◀' : '▶', x + (x < CX ? 10 : -10), GY + 6); }
    ctx.restore();
  }

  /* ---------------- cursor ---------------- */
  function cursorInfo() {
    const S = State.S, Cu = S.cursor, rec = State.R.rec;
    const src = Cu.src, c = src === 'CH2' ? 1 : 0;
    const vd = src === 'Math' ? S.math.vdiv : State.vdiv(c), pos = src === 'Math' ? S.math.pos : S.ch[c].pos;
    const tdiv = State.tdiv();
    const tAt = (xd) => xd * tdiv + S.hpos;           // tetiğe göre zaman
    const arr = src === 'Math' ? (MathFn.dual() || {}).arr : rec && rec.ch[c];
    const vAt = (xd) => { if (!arr) return NaN; const k = Math.round((xd + 5) / 10 * (arr.length - 1)); return arr[Math.max(0, Math.min(arr.length - 1, k))]; };
    const vOf = (yd) => (yd - pos) * vd;
    return { tAt, vAt, vOf, vd, pos };
  }
  function cursors() {
    const S = State.S, Cu = S.cursor;
    const info = cursorInfo();
    ctx.save();
    const col = Cu.src === 'Math' ? COL.math : COL.ch[Cu.src === 'CH2' ? 1 : 0];
    const lines = [];
    const fmtV = (v) => Cu.vunit === '%' && Cu.vRef ? (v / Cu.vRef * 100).toFixed(1) + '%' : Units.fmt(v, 'V');
    const fmtT = (t) => {
      if (Cu.hunit === 'Hz') return Units.fmt(1 / t, 'Hz');
      if ((Cu.hunit === '%' || Cu.hunit === '°') && Cu.hRef) return Cu.hunit === '%' ? (t / Cu.hRef * 100).toFixed(1) + '%' : (t / Cu.hRef * 360).toFixed(1) + '°';
      return Units.fmt(t, 's');
    };
    if (Cu.mode === 'H') {
      Cu.h.forEach((xd, i) => {
        const x = CX + xd * DW;
        ctx.strokeStyle = (Cu.sel === i || Cu.sel === 2) ? '#fff' : '#aaa';
        ctx.setLineDash(Cu.sel === i || Cu.sel === 2 ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(x + 0.5, GY); ctx.lineTo(x + 0.5, GY + GH); ctx.stroke();
      });
      const [a, b] = Cu.h, ta = info.tAt(a), tb = info.tAt(b), va = info.vAt(a), vb = info.vAt(b);
      lines.push(`① ${Units.fmt(ta, 's')} ${fmtV(va)}`, `② ${Units.fmt(tb, 's')} ${fmtV(vb)}`,
        `Δ${fmtT(tb - ta)} Δ${fmtV(vb - va)}`, `dV/dt ${Units.fmt((vb - va) / (tb - ta), 'V/s')}`);
    } else {
      Cu.v.forEach((yd, i) => {
        const y = CY - yd * DH;
        ctx.strokeStyle = (Cu.sel === i || Cu.sel === 2) ? '#fff' : '#aaa';
        ctx.setLineDash(Cu.sel === i || Cu.sel === 2 ? [] : [3, 3]);
        ctx.beginPath(); ctx.moveTo(GX, y + 0.5); ctx.lineTo(GX + GW, y + 0.5); ctx.stroke();
      });
      const va = info.vOf(Cu.v[0]), vb = info.vOf(Cu.v[1]);
      const [a, b] = Cu.h, ta = info.tAt(a), tb = info.tAt(b);
      lines.push(`① ${fmtV(va)}`, `② ${fmtV(vb)}`, `Δ${fmtV(vb - va)}`, `dV/dt ${Units.fmt((vb - va) / (tb - ta), 'V/s')}`);
    }
    ctx.setLineDash([]);
    ctx.font = '12px Consolas, monospace'; ctx.textAlign = 'left';
    const bw = 168, bh = lines.length * 15 + 8;
    ctx.fillStyle = 'rgba(20,24,30,0.85)'; ctx.fillRect(GX + 6, GY + 6, bw, bh);
    ctx.strokeStyle = col; ctx.strokeRect(GX + 6.5, GY + 6.5, bw, bh);
    ctx.fillStyle = '#fff';
    lines.forEach((l, i) => ctx.fillText(l, GX + 12, GY + 14 + i * 15));
    ctx.restore();
  }

  /* ---------------- üst bar ve durum barı ---------------- */
  function topBar() {
    const S = State.S, R = State.R;
    ctx.save(); ctx.textAlign = 'left'; ctx.fillStyle = '#d0d4da';
    const rl = State.RL[S.acq.rlIdx];
    const rlTxt = rl >= 1e6 ? rl / 1e6 + 'M' : rl >= 1e3 ? rl / 1e3 + 'k' : rl;
    ctx.fillText(`${rlTxt} pts   ${Units.fmt(State.fs(), 'Sa/s', 3).replace(/\.0+(?=[a-zµ]|Sa)/, '')}`, 10, 14);
    // hafıza çubuğu
    const mx = 210, mw = 300;
    ctx.strokeStyle = '#777'; ctx.strokeRect(mx + 0.5, 6.5, mw, 14);
    if (!(R.rec && R.rec.roll)) {
      ctx.fillStyle = S.ch[0].on ? COL.ch[0] : COL.ch[1];
      ctx.globalAlpha = 0.6; ctx.fillRect(mx + 2, 9, mw - 3, 9); ctx.globalAlpha = 1;
      const tx = mx + mw / 2 - Math.max(-1, Math.min(1, S.hpos / (5 * State.tdiv()))) * mw / 2;
      ctx.fillStyle = '#ff9a2a'; ctx.beginPath(); ctx.moveTo(tx - 5, 4); ctx.lineTo(tx + 5, 4); ctx.lineTo(tx, 11); ctx.fill();
    }
    // acquire modu
    const am = S.acq.mode === 'Average' ? `Avg ${State.AVG[S.acq.avgIdx]}` : S.acq.mode === 'Peak' ? 'Peak' : 'Sample';
    ctx.fillStyle = '#c8ccd2'; ctx.fillText(am, 525, 14);
    if (S.zoom.on) { ctx.fillStyle = '#7fb0ff'; ctx.fillText('Zoom', 590, 14); }
    // tetik durumu
    const st = R.status;
    const colr = st === 'Stop' ? '#ff5050' : st === "Trig'd" ? '#5fe07a' : st === 'Roll' ? '#7fb0ff' : '#ffb84a';
    ctx.fillStyle = colr; ctx.fillRect(712, 4, 80, 20);
    ctx.fillStyle = '#000'; ctx.font = 'bold 13px Arial'; ctx.textAlign = 'center';
    ctx.fillText(R.single && R.run ? 'Single' : st, 752, 14.5);
    if (R.single && R.run) { ctx.font = '9px Arial'; ctx.fillText(st, 752, 22); }
    ctx.restore();
  }
  function statusBar() {
    const S = State.S, R = State.R;
    const y = 427;
    ctx.save(); ctx.textAlign = 'left'; ctx.font = '12px "Segoe UI", Arial';
    let x = 4;
    const box = (txt, col, w) => {
      ctx.fillStyle = col; ctx.fillRect(x, y - 9, 18, 18);
      ctx.fillStyle = '#000'; ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center'; ctx.fillText(txt[0], x + 9, y + 0.5);
      ctx.font = '12px "Segoe UI", Arial'; ctx.textAlign = 'left'; ctx.fillStyle = col; ctx.fillText(txt[1], x + 22, y + 0.5);
      x += w;
    };
    const cpl = { DC: 'DC', AC: 'AC', GND: 'GND' };
    for (let c = 0; c < 2; c++) if (S.ch[c].on) box([String(c + 1), `${Units.fmt(State.vdiv(c), 'V')} ${cpl[S.ch[c].coupling]}${S.ch[c].bw === '20MHz' ? ' BW' : ''}${S.ch[c].invert ? ' Inv' : ''}`], COL.ch[c], 116);
    if (S.math.on && S.math.kind === 'dual') box(['M', `${Units.fmt(S.math.vdiv, (MathFn.dual() || {}).unit ?? 'V')}`], COL.math, 90);
    // yatay
    ctx.fillStyle = '#ddd'; x = Math.max(x, 250);
    ctx.fillText(`H ${Units.fmt(State.tdiv(), 's')}`, x, y); ctx.fillText(`${Units.fmt(S.hpos, 's')}`, x + 74, y);
    // tetik
    const T = S.trig, sl = T.slope === 'rise' ? '↗' : T.slope === 'fall' ? '↘' : '↕';
    const tcol = T.src === 'CH1' ? COL.ch[0] : T.src === 'CH2' ? COL.ch[1] : '#ddd';
    ctx.fillStyle = tcol;
    const lv = T.src === 'LINE' ? '' : Units.fmt(T.level, 'V');
    ctx.fillText(`${T.src === 'LINE' ? 'AC Line' : T.src} ${sl} ${lv} ${T.coupling === 'HF' ? 'HFR' : T.coupling === 'LF' ? 'LFR' : T.coupling}`, x + 160, y);
    // frekans sayacı
    ctx.fillStyle = '#ddd'; ctx.textAlign = 'right';
    ctx.fillText(R.freq ? Units.fmt(R.freq, 'Hz', 6) : '<2Hz', 796, y);
    ctx.restore();
  }

  /* ---------------- ölçüm kutusu ---------------- */
  function measBox() {
    const S = State.S;
    if (!S.meas.items.length) return;
    const res = App.measResults || [];
    const cols = 4, bw = GW / cols, bh = S.meas.stats ? 30 : 18;
    const rows = Math.ceil(res.length / cols);
    const y0 = GY + GH - rows * bh - 2;
    ctx.save(); ctx.font = '12px "Segoe UI", Arial'; ctx.textAlign = 'left';
    res.forEach((m, i) => {
      const x = GX + (i % cols) * bw, y = y0 + Math.floor(i / cols) * bh;
      ctx.fillStyle = 'rgba(15,18,24,0.85)'; ctx.fillRect(x + 1, y, bw - 2, bh - 2);
      const col = m.it.s1 === 'Math' ? COL.math : COL.ch[m.it.s1 === 'CH2' ? 1 : 0];
      ctx.fillStyle = col; ctx.fillRect(x + 1, y, 3, bh - 2);
      const lbl = Measure.catOf(m.it.name) === 'D' ? `${m.it.s1}→${m.it.s2} ${m.it.name}` : `${m.it.s1} ${m.it.name}`;
      ctx.fillStyle = '#bbb'; ctx.fillText(lbl, x + 7, y + 8);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'right'; ctx.fillText(m.text, x + bw - 6, y + 8); ctx.textAlign = 'left';
      if (m.stats) { ctx.fillStyle = '#9ab'; ctx.font = '10px Arial'; ctx.fillText(`μ ${Units.fmt(m.stats.mean, m.stats.u)} σ ${Units.fmt(m.stats.sd, m.stats.u)} n${m.stats.n}`, x + 7, y + 21); ctx.font = '12px "Segoe UI", Arial'; }
    });
    ctx.restore();
  }
  function displayAll() {
    const S = State.S, src = S.meas.displayAll;
    ctx.save();
    ctx.fillStyle = 'rgba(12,16,24,0.9)'; ctx.fillRect(GX + 20, GY + 20, GW - 40, 250);
    ctx.strokeStyle = src === 'CH2' ? COL.ch[1] : COL.ch[0]; ctx.strokeRect(GX + 20.5, GY + 20.5, GW - 41, 250);
    ctx.font = '11.5px "Segoe UI", Arial'; ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.fillText(`Display All — ${src}`, GX + 30, GY + 34);
    const list = [...Measure.V_LIST, ...Measure.T_LIST];
    list.forEach((n, i) => {
      const col = Math.floor(i / 9), row = i % 9;
      const x = GX + 30 + col * 165, y = GY + 56 + row * 23;
      ctx.fillStyle = '#aab'; ctx.fillText(n, x, y);
      ctx.fillStyle = '#fff'; ctx.fillText(Measure.format(Measure.value({ name: n, s1: src })), x + 78, y);
    });
    ctx.restore();
  }
  function overlayMsg() {
    const R = State.R;
    if (R.msg && performance.now() < R.msgUntil) {
      ctx.save(); ctx.font = '13px "Segoe UI", Arial';
      const w = Math.min(640, ctx.measureText(R.msg).width + 30);
      ctx.fillStyle = 'rgba(30,40,60,0.92)'; ctx.fillRect(CX - w / 2, GY + 40, w, 28);
      ctx.strokeStyle = '#8ab'; ctx.strokeRect(CX - w / 2 + 0.5, GY + 40.5, w, 28);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(R.msg, CX, GY + 54.5);
      ctx.restore();
    }
  }
  return { init, draw, cursorInfo, W, H, GX, GY, GW, GH, DW, DH, SIDE_X, SIDE_Y, SIDE_H, BOT_Y, BOT_W, COL, get ctx() { return ctx; } };
})();
