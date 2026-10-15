/* =====================================================================
 * View — görünüm araçları (osiloskobun kendisine dokunmaz)
 *   - Osiloskop boyutu: 🔍− / 🔍+ (%60–%250), Sığdır, Tam ekran
 *   - Büyüteç: ekranın üstünde gezdirince o bölgeyi 3× büyüten mercek
 *   - Kılavuz yazı boyutu: A− / A+
 *   Tercihler tarayıcıda saklanır.
 * ===================================================================== */
const View = (() => {
  const LS = 'gds.view';
  const st = Object.assign({ z: 1, lens: false, gz: 1 }, (() => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { return {}; } })());
  const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { } };
  const ZS = [0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75, 2, 2.5];
  let wrap, bar, lens, lctx, scr;

  function init() {
    wrap = document.getElementById('scopeWrap'); bar = document.getElementById('viewBar'); scr = document.getElementById('screen');
    bar.innerHTML = `<span class="vl">🔍 Osiloskop</span>
      <button class="ui sm" data-v="out" title="Küçült">−</button><span class="vz" id="vzLbl"></span><button class="ui sm" data-v="in" title="Büyüt">+</button>
      <button class="ui sm" data-v="fit" title="Pencereye sığdır">⤢ Sığdır</button>
      <button class="ui sm" data-v="full" title="Osiloskobu tam ekran yap (çıkmak için tekrar bas)">⛶ Tam ekran</button>
      <button class="ui sm" data-v="lens" id="vLens" title="Ekranın üstünde gezdirince 3× büyütür — imleçleri tam oturtmak için">🔎 Büyüteç</button>
      <span class="vsep"></span>
      <span class="vl">📘 Kılavuz yazısı</span><button class="ui sm" data-v="gout" title="Kılavuz yazısını küçült">A−</button><button class="ui sm" data-v="gin" title="Kılavuz yazısını büyüt">A+</button>`;
    bar.addEventListener('click', onBar);
    lens = document.createElement('canvas'); lens.id = 'lens'; wrap.appendChild(lens);
    lctx = lens.getContext('2d');
    wrap.addEventListener('pointermove', onLensMove);
    wrap.addEventListener('pointerleave', () => { lens.style.display = 'none'; lensPos = null; });
    window.addEventListener('resize', apply);
    document.addEventListener('fullscreenchange', apply);
    apply();
  }
  function onBar(e) {
    const b = e.target.closest('[data-v]'); if (!b) return;
    const v = b.dataset.v;
    let i = ZS.indexOf(st.z); if (i < 0) i = 4;
    if (v === 'in') st.z = ZS[Math.min(ZS.length - 1, i + 1)];
    if (v === 'out') st.z = ZS[Math.max(0, i - 1)];
    if (v === 'fit') st.z = 1;
    if (v === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else wrap.requestFullscreen && wrap.requestFullscreen().catch(() => { }); }
    if (v === 'lens') st.lens = !st.lens;
    if (v === 'gin') st.gz = Math.min(1.6, +(st.gz + 0.1).toFixed(2));
    if (v === 'gout') st.gz = Math.max(0.8, +(st.gz - 0.1).toFixed(2));
    save(); apply();
    if (v === 'in' || v === 'out') wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
  /** Osiloskobun piksel genişliği: "sığdır" boyutu × yakınlaştırma */
  function apply() {
    const full = !!document.fullscreenElement;
    if (full) { wrap.style.width = ''; }
    else {
      const lc = document.getElementById('leftCol');
      const fit = Math.max(Math.min(640, lc.clientWidth), Math.min(lc.clientWidth, 1320, (window.innerHeight - 150) * 1.935));
      wrap.style.width = Math.round(fit * st.z) + 'px';
    }
    wrap.style.maxWidth = 'none'; wrap.style.minWidth = '0';
    document.getElementById('vzLbl').textContent = Math.round(st.z * 100) + '%';
    document.getElementById('vLens').classList.toggle('on', st.lens);
    bar.querySelector('[data-v="full"]').textContent = full ? '✕ Tam ekrandan çık' : '⛶ Tam ekran';
    const gb = document.getElementById('gBody'); if (gb) gb.style.zoom = st.gz;
    if (!st.lens) lens.style.display = 'none';
  }

  /* ---------------- büyüteç ---------------- */
  const LZ = 3, LS_PX = 230;
  let lensPos = null, raf = 0;
  function onLensMove(e) {
    if (!st.lens) return;
    const r = scr.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { lens.style.display = 'none'; lensPos = null; return; }
    lensPos = { x: e.clientX, y: e.clientY };
    const wr = wrap.getBoundingClientRect();
    lens.style.display = 'block';
    lens.style.left = (e.clientX - wr.left - LS_PX / 2) + 'px';
    lens.style.top = (e.clientY - wr.top - LS_PX / 2) + 'px';
    if (!raf) raf = requestAnimationFrame(drawLens);
  }
  function drawLens() {
    raf = 0;
    if (!lensPos || !st.lens) return;
    const dpr = window.devicePixelRatio || 1, px = Math.round(LS_PX * dpr);
    if (lens.width !== px) { lens.width = lens.height = px; lens.style.width = lens.style.height = LS_PX + 'px'; }
    const r = scr.getBoundingClientRect(), k = scr.width / r.width;
    const sw = LS_PX / LZ * k, sx = (lensPos.x - r.left) * k - sw / 2, sy = (lensPos.y - r.top) * k - sw / 2;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.fillStyle = '#000'; lctx.fillRect(0, 0, px, px);
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(scr, sx, sy, sw, sw, 0, 0, px, px);
    // ortadaki nişangâh: imleci tam buraya oturt
    lctx.strokeStyle = 'rgba(255,140,40,.9)'; lctx.lineWidth = Math.max(1, dpr);
    lctx.beginPath(); lctx.moveTo(px / 2, px / 2 - 14 * dpr); lctx.lineTo(px / 2, px / 2 + 14 * dpr); lctx.moveTo(px / 2 - 14 * dpr, px / 2); lctx.lineTo(px / 2 + 14 * dpr, px / 2); lctx.stroke();
    lctx.fillStyle = 'rgba(255,255,255,.85)'; lctx.font = `${11 * dpr}px Segoe UI, Arial`; lctx.fillText(LZ + '×', 10 * dpr, px - 12 * dpr);
    raf = requestAnimationFrame(drawLens);   // dalga canlı: mercek de canlı
  }

  return { init, apply };
})();
