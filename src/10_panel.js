/* =====================================================================
 * Panel — ön panelin SVG çizimi, tuş/düğme etkileşimi ve Türkçe tooltip'ler
 *   viewBox 1200×620. Ekran (canvas 800×480) SVG içindeki (80,58) noktasına 0.8 ölçekle oturur.
 *   Yerleşim kılavuzun "Front Panel Overview" bölümüne göre (2 kanallı model):
 *     ekranın solunda Hardcopy · altında 7 alt menü tuşu · sağında 5 yan menü tuşu + Menu Off
 *     sağ panel: VARIABLE/Select · Measure Cursor APP Acquire / Display Help Save/Recall Utility
 *                Autoset Run/Stop Single Default · HORIZONTAL · TRIGGER · VERTICAL · BNC girişleri
 *   TAHMIN: milimetrik konumlar ürün fotoğraflarından yaklaşık alınmıştır.
 * ===================================================================== */
const Panel = (() => {
  const SCR = { x: 80, y: 58, w: 640, h: 384 };
  const HELP = {
    power: ['POWER', 'Cihazı açar/kapatır. Kapalıyken ekran söner, ayarlar korunur.'],
    hardcopy: ['Hardcopy', 'Tek tuşla ekran görüntüsünü kaydeder (Utility > Hardcopy ile atanan işlev; varsayılan: PNG resim indir).'],
    menuoff: ['Menu Off', 'İlk basış yan menüyü, ikinci basış alt menüyü gizler; ekrandaki mesajları da temizler.'],
    variable: ['VARIABLE düğmesi', 'Seçili menü parametresini (⟲ işaretli) değiştirir; Cursor açıkken seçili imleci hareket ettirir. Çevir: sürükle veya fare tekerleği.'],
    select: ['Select', 'Seçimi onaylar; Cursor menüsünde hareket edecek imleci (①, ②, ikisi birden) değiştirir.'],
    measure: ['Measure', 'Otomatik ölçüm menüsü: Pk-Pk, frekans, faz gibi 36 ölçümden en fazla 8 tanesini ekranda gösterir.'],
    cursor: ['Cursor', 'İmleç ölçümleri: ilk basış yatay-konum (H, zaman) imleçlerini, ikinci basış dikey-konum (V, gerilim) imleçlerini açar.'],
    app: ['APP', 'Uygulamalar menüsü (Go-NoGo, DVM, Data Log…). Simülatörde yalnız liste gösterilir.'],
    acquire: ['Acquire', 'Edinim modu (Sample / Peak Detect / Average), XY modu ve kayıt uzunluğu.'],
    display: ['Display', 'Dot/Vector çizim, persistence (iz kalıcılığı), parlaklık ve ızgara tipi.'],
    help: ['Help', 'Yardım modunu açar: sonra basılan tuşun ne işe yaradığı ekranda Türkçe açıklanır.'],
    save: ['Save/Recall', 'Ekran görüntüsünü PNG olarak indirir, dalgayı Ref belleğine/CSV dosyasına, ayarları Set1–20 belleğine kaydeder ve geri çağırır.'],
    utility: ['Utility', 'Sistem bilgisi, Hardcopy ataması ve prob kompanzasyon frekansı.'],
    autoset: ['Autoset', 'Açık kanallardaki sinyale göre V/div, zaman tabanı ve tetiği otomatik ayarlar (≥20 Hz, ≥10 mV).'],
    runstop: ['Run/Stop', 'Edinimi başlatır/durdurur. Yeşil: çalışıyor, kırmızı: durdu. Durunca son kayıt ekranda kalır.'],
    single: ['Single', 'Tek seferlik edinim: ilk tetikte bir kayıt alır ve durur. Beklerken tuş beyaz yanar.'],
    default: ['Default', 'Fabrika ayarlarını yükler (100 mV/div, 10 µs/div, CH1 Edge tetik, Auto).'],
    hpos: ['HORIZONTAL POSITION', 'Dalgayı yatay kaydırır (tetik noktasının ekrandaki yeri). Bas: 0 s\'ye döner.'],
    hscale: ['HORIZONTAL SCALE (TIME/DIV)', 'Zaman tabanı: 5 ns/div – 100 s/div (1-2-5). Saat yönü: daha hızlı. ≥100 ms/div Auto modda Roll moduna geçer.'],
    zoom: ['Zoom', 'Kaydın bir bölümünü büyütür: üstte tüm kayıt, altta yakınlaştırılmış pencere.'],
    play: ['Play/Pause', 'Zoom açıkken yakınlaştırma penceresini kayıt boyunca otomatik kaydırır.'],
    search: ['Search', 'Kılavuz: bu modelde kullanılmıyor (Not available).'],
    searchL: ['Search ◀', 'Kılavuz: bu modelde kullanılmıyor (Not available).'],
    searchR: ['Search ▶', 'Kılavuz: bu modelde kullanılmıyor (Not available).'],
    setclear: ['Set/Clear', 'Kılavuz: bu modelde kullanılmıyor (Not available).'],
    level: ['TRIGGER LEVEL', 'Tetik seviyesini ayarlar (sağ kenardaki ok). Bas: seviye 0 V\'ye döner.'],
    tmenu: ['Trigger Menu', 'Tetik menüsü: tip, kaynak, kuplaj, eğim, seviye, mod (Auto/Normal), holdoff.'],
    t50: ['50%', 'Tetik seviyesini sinyalin tepe değerlerinin ortasına ayarlar.'],
    force: ['Force-Trig', 'Tetik koşulu sağlanmasa da tek bir edinimi zorla başlatır.'],
    ch1: ['CH1', 'Kanal 1 menüsü. Kapalıysa açar; menüsü açıkken tekrar basmak kanalı kapatır. Açık kanal sarı yanar.'],
    ch2: ['CH2', 'Kanal 2 menüsü. Kapalıysa açar; menüsü açıkken tekrar basmak kanalı kapatır. Açık kanal mavi yanar.'],
    ch1pos: ['CH1 POSITION', 'Kanal 1 dalgasını dikey kaydırır. Bas: 0\'a döner.'],
    ch2pos: ['CH2 POSITION', 'Kanal 2 dalgasını dikey kaydırır. Bas: 0\'a döner.'],
    ch1scale: ['CH1 SCALE (VOLTS/DIV)', 'Kanal 1 dikey ölçeği: 1 mV – 10 V/div × prob zayıflatması. Saat yönü: daha hassas.'],
    ch2scale: ['CH2 SCALE (VOLTS/DIV)', 'Kanal 2 dikey ölçeği: 1 mV – 10 V/div × prob zayıflatması. Saat yönü: daha hassas.'],
    math: ['MATH', 'Matematik: CH1 ± × ÷ CH2 veya FFT. Menüsü açıkken tekrar basmak kapatır. Açıkken kırmızı yanar.'],
    ref: ['REF', 'Referans dalgalar R1–R4: kaydet, göster/gizle.'],
    bus: ['BUS', 'Seri veri çözümleme (UART/I²C/SPI…). DSIB-BUS modülü gerektirir; simülatörde yok.'],
    bnc1: ['CH1 girişi', 'BNC giriş: 1 MΩ ∥ 16 pF, en fazla 300 Vrms (CAT I). Tezgâhtaki sarı prob buraya bağlıdır.'],
    bnc2: ['CH2 girişi', 'BNC giriş: 1 MΩ ∥ 16 pF. Tezgâhtaki mavi prob buraya bağlıdır.'],
    ext: ['EXT TRIG', 'Harici tetik girişi (±15 V aralık, 1 MΩ ∥ 16 pF, ~100 mV hassasiyet). Tezgâhtaki gri EXT ucunu bir düğüme takın ve Trigger > Source > EXT seçin.'],
    comp: ['Prob kompanzasyon çıkışı', '2 Vpp, 1 kHz kare dalga (0 V / 2 V). Probu buraya takıp Autoset yapın. Frekans: Utility > Probe Comp.'],
    usb: ['USB Host', 'USB bellek için. Simülatörde kayıtlar tarayıcı üzerinden indirilir.'],
  };
  for (let i = 0; i < 5; i++) HELP['side' + i] = ['Yan menü tuşu ' + (i + 1), 'Ekranın sağındaki yan menüde karşısındaki seçeneği seçer.'];
  for (let i = 0; i < 7; i++) HELP['bot' + i] = ['Alt menü tuşu ' + (i + 1), 'Ekranın altındaki menüde üzerindeki öğeyi seçer veya değiştirir.'];

  const knobs = {};     // id → {g, angle, pushable}
  let svg;

  /* ---------------- SVG oluşturma ---------------- */
  const keyW = 52, keyH = 22;
  function key(id, x, y, label, o = {}) {
    const w = o.w || keyW, h = o.h || keyH, fs = o.fs || 10.5;
    const face = o.dark ? 'url(#keyDark)' : 'url(#keyGrad)';
    const tc = o.dark ? '#f2f2f2' : '#262626';
    const lines = String(label).split('\n');
    const txt = lines.map((l, i) => `<text x="${w / 2}" y="${h / 2 + (i - (lines.length - 1) / 2) * (fs + 1) + fs * 0.36}" font-size="${fs}" fill="${tc}" text-anchor="middle" font-family="Arial" font-weight="600">${l}</text>`).join('');
    return `<g class="btn" data-id="${id}" transform="translate(${x - w / 2},${y - h / 2})">
      <rect x="-1.5" y="-1" width="${w + 3}" height="${h + 4}" rx="${o.r ?? 4}" fill="#55595e" opacity=".55"/>
      <g class="cap"><rect class="face" width="${w}" height="${h}" rx="${o.r ?? 3.5}" fill="${face}" stroke="#7a7d80" stroke-width=".8"/>
      <rect class="led" width="${w}" height="${h}" rx="${o.r ?? 3.5}" fill="transparent" style="mix-blend-mode:multiply"/>
      <rect width="${w - 4}" height="${h * 0.42}" x="2" y="1.5" rx="2.5" fill="#fff" opacity=".22"/>${txt}</g></g>`;
  }
  function knob(id, x, y, r, label, pushable, labelBelow) {
    knobs[id] = { angle: 0, pushable, x, y, r };
    let ridges = '';
    for (let i = 0; i < 30; i++) { const a = i * 12 * Math.PI / 180; ridges += `<line x1="${(r - 0.6) * Math.cos(a)}" y1="${(r - 0.6) * Math.sin(a)}" x2="${(r - 3.2) * Math.cos(a)}" y2="${(r - 3.2) * Math.sin(a)}" stroke="#1a1a1a" stroke-width="1.1"/>`; }
    let ticks = '';
    for (let i = 0; i < 24; i++) { const a = i * 15 * Math.PI / 180; ticks += `<line x1="${(r + 4) * Math.cos(a)}" y1="${(r + 4) * Math.sin(a)}" x2="${(r + 6.5) * Math.cos(a)}" y2="${(r + 6.5) * Math.sin(a)}" stroke="#6d7074" stroke-width=".9"/>`; }
    const ly = labelBelow ? y + r + 17 : y - r - 11;
    return `<text x="${x}" y="${ly}" font-size="9.5" text-anchor="middle" fill="#2b2b2b" font-family="Arial" font-weight="700">${label}</text>
      ${pushable ? `<text x="${x}" y="${ly + (labelBelow ? 10 : -9)}" font-size="7" text-anchor="middle" fill="#555" font-family="Arial">PUSH TO ZERO</text>` : ''}
      <g class="knob" data-id="${id}" transform="translate(${x},${y})">
        ${ticks}
        <circle r="${r + 3}" fill="#3a3c3f" filter="url(#sh)"/>
        <g class="rot"><circle r="${r}" fill="url(#knobGrad)"/>${ridges}
          <circle r="${r * 0.72}" fill="url(#knobTop)"/>
          <line x1="0" y1="${-r * 0.2}" x2="0" y2="${-r * 0.68}" stroke="#f4f4f4" stroke-width="2.2" stroke-linecap="round"/></g>
      </g>`;
  }
  function bnc(id, x, y, label, color) {
    return `<g data-id="${id}" class="bnc"><circle cx="${x}" cy="${y}" r="17" fill="url(#metal)" stroke="#555"/>
      <circle cx="${x}" cy="${y}" r="10" fill="#2a2a2a"/><circle cx="${x}" cy="${y}" r="3" fill="#d8b860"/>
      <rect x="${x - 21}" y="${y - 3}" width="5" height="6" fill="#999"/><rect x="${x + 16}" y="${y - 3}" width="5" height="6" fill="#999"/>
      ${color ? `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="${color}" stroke-width="3" opacity=".85"/><path d="M${x} ${y + 20} q 0 18 ${x < 1000 ? -30 : 30} 30" stroke="#222" stroke-width="5" fill="none"/>` : ''}
      <text x="${x}" y="${y - 25}" font-size="10" font-weight="700" text-anchor="middle" fill="#222" font-family="Arial">${label}</text></g>`;
  }
  function section(x, y, w, h, title) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" stroke="#7d8084" stroke-width="1"/>
      <rect x="${x + 10}" y="${y - 7}" width="${title.length * 7.2 + 10}" height="14" fill="#b9bcbf"/>
      <text x="${x + 15}" y="${y + 4}" font-size="10.5" font-weight="700" fill="#2a2a2a" font-family="Arial" letter-spacing=".6">${title}</text>`;
  }

  function build(host) {
    const sideKeys = [0, 1, 2, 3, 4].map(i => key('side' + i, 763, SCR.y + 0.8 * (Renderer.SIDE_Y + Renderer.SIDE_H * (i + 0.5)), '', { w: 40, h: 34 })).join('');
    const botKeys = [0, 1, 2, 3, 4, 5, 6].map(j => key('bot' + j, SCR.x + 0.8 * Renderer.BOT_W * (j + 0.5), 474, '', { w: 66, h: 17 })).join('');
    const s = `
<svg viewBox="0 0 1200 620" xmlns="http://www.w3.org/2000/svg" id="panelSvg">
<defs>
  <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4d6d8"/><stop offset=".5" stop-color="#c3c5c8"/><stop offset="1" stop-color="#a9acb0"/></linearGradient>
  <linearGradient id="keyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbfbfa"/><stop offset="1" stop-color="#cfd1d1"/></linearGradient>
  <linearGradient id="keyDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f6368"/><stop offset="1" stop-color="#36393d"/></linearGradient>
  <radialGradient id="knobGrad" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#6c6f73"/><stop offset=".6" stop-color="#3b3d40"/><stop offset="1" stop-color="#1e1f21"/></radialGradient>
  <radialGradient id="knobTop" cx=".38" cy=".32" r=".9"><stop offset="0" stop-color="#7d8186"/><stop offset="1" stop-color="#2c2e31"/></radialGradient>
  <radialGradient id="metal" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#f4f4f4"/><stop offset=".55" stop-color="#b8babd"/><stop offset="1" stop-color="#6e7074"/></radialGradient>
  <linearGradient id="strip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f59a2a"/><stop offset="1" stop-color="#d9700c"/></linearGradient>
  <filter id="sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="1" dy="2" stdDeviation="1.6" flood-opacity=".45"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 .55 0"/></filter>
  <filter id="inset"><feOffset dy="1"/><feGaussianBlur stdDeviation="1"/><feComposite operator="out" in="SourceGraphic"/></filter>
</defs>
<rect x="2" y="2" width="1196" height="616" rx="16" fill="url(#body)" stroke="#8d9094" stroke-width="2"/>
<rect x="2" y="2" width="1196" height="616" rx="16" filter="url(#grain)" opacity=".14"/>
<!-- turuncu şerit -->
<path d="M18 2 H1182 a16 16 0 0 1 14 12 V36 H4 V14 a16 16 0 0 1 14 -12z" fill="url(#strip)"/>
<text x="22" y="26" font-family="Arial Black,Arial" font-size="19" font-weight="900" fill="#fff" font-style="italic" letter-spacing=".5">GW INSTEK</text>
<text x="160" y="26" font-family="Arial" font-size="17" font-weight="700" fill="#fff">GDS-1102B</text>
<text x="290" y="25" font-family="Arial" font-size="12.5" fill="#fff">Digital Storage Oscilloscope</text>
<text x="470" y="25" font-family="Arial" font-size="12.5" fill="#fff" font-weight="700">100 MHz   1 GS/s</text>
<g transform="translate(1010,8)"><rect width="46" height="20" rx="4" fill="#fff"/><text x="23" y="15" text-anchor="middle" font-family="Arial Black,Arial" font-weight="900" font-size="14" fill="#d9700c">VPO</text>
<text x="54" y="9" font-family="Arial" font-size="8.5" fill="#fff">Visual Persistence</text><text x="54" y="19" font-family="Arial" font-size="8.5" fill="#fff">Oscilloscope</text></g>
<!-- ekran çerçevesi -->
<rect x="64" y="46" width="676" height="412" rx="9" fill="#2b2d30" stroke="#6f7276"/>
<rect x="74" y="52" width="652" height="396" rx="3" fill="#050505"/>
${sideKeys}
${key('menuoff', 763, 434, 'Menu\nOff', { w: 40, h: 30, fs: 9.5 })}
${botKeys}
${key('hardcopy', 34, 92, 'Hard\ncopy', { w: 40, h: 30, fs: 9.5 })}
<!-- alt sıra (sol) -->
${key('power', 46, 560, 'POWER', { w: 54, h: 28, dark: true, fs: 10 })}
<g data-id="usb"><rect x="110" y="548" width="40" height="20" rx="2" fill="#333"/><rect x="116" y="554" width="28" height="8" fill="#888"/><text x="130" y="582" font-size="9" text-anchor="middle" fill="#333" font-family="Arial">USB</text></g>
<g data-id="comp"><rect x="190" y="540" width="16" height="30" fill="url(#metal)" stroke="#666"/><text x="198" y="584" font-size="9" text-anchor="middle" fill="#222" font-family="Arial">⊓ 2V</text>
<rect x="226" y="540" width="16" height="30" fill="url(#metal)" stroke="#666"/><text x="234" y="584" font-size="10" text-anchor="middle" fill="#222" font-family="Arial">⏚</text>
<path d="M198 540 q 10 -26 30 -30" stroke="${'#d8c040'}" stroke-width="2" fill="none" class="compLead" opacity="0"/></g>
<text x="300" y="566" font-size="9" fill="#444" font-family="Arial">PROBE COMP · 2V ⊓ 1kHz</text>
<!-- kontrol paneli -->
${knob('variable', 852, 104, 22, 'VARIABLE', false)}
${key('select', 852, 156, 'Select', { w: 50, h: 20 })}
${key('measure', 925, 78, 'Measure')}${key('cursor', 983, 78, 'Cursor')}${key('app', 1041, 78, 'APP')}${key('acquire', 1099, 78, 'Acquire')}
${key('display', 925, 112, 'Display')}${key('help', 983, 112, 'Help')}${key('save', 1041, 112, 'Save/\nRecall', { fs: 9 })}${key('utility', 1099, 112, 'Utility')}
${key('autoset', 1162, 64, 'Autoset', { w: 58, h: 24, dark: true })}${key('runstop', 1162, 98, 'Run/Stop', { w: 58, h: 24 })}
${key('single', 1162, 132, 'Single', { w: 58, h: 24 })}${key('default', 1162, 166, 'Default', { w: 58, h: 24 })}
${section(812, 196, 232, 136, 'HORIZONTAL')}
${knob('hpos', 852, 246, 16, 'POSITION', true)}
${knob('hscale', 940, 252, 24, 'SCALE', false)}
${key('zoom', 1010, 228, 'Zoom', { w: 46, h: 20 })}${key('play', 1010, 258, '▶/❚❚', { w: 46, h: 20 })}
${key('search', 846, 310, 'Search', { w: 50, h: 18, fs: 9.5 })}${key('searchL', 896, 310, '◀', { w: 30, h: 18 })}${key('searchR', 932, 310, '▶', { w: 30, h: 18 })}${key('setclear', 990, 310, 'Set/Clear', { w: 60, h: 18, fs: 9.5 })}
${section(1052, 196, 140, 136, 'TRIGGER')}
${knob('level', 1094, 256, 19, 'LEVEL', true)}
${key('tmenu', 1160, 226, 'Menu', { w: 48, h: 20 })}${key('t50', 1160, 258, '50%', { w: 48, h: 20 })}${key('force', 1160, 292, 'Force-\nTrig', { w: 48, h: 26, fs: 9 })}
${section(812, 344, 380, 176, 'VERTICAL')}
${knob('ch1pos', 870, 398, 15, 'POSITION', true)}
${key('ch1', 870, 440, 'CH1', { w: 50, h: 24, fs: 12 })}
${knob('ch1scale', 870, 482, 21, 'SCALE', false, true)}
${key('math', 966, 404, 'M', { w: 36, h: 22, fs: 12 })}${key('ref', 966, 440, 'R', { w: 36, h: 22, fs: 12 })}${key('bus', 966, 476, 'B', { w: 36, h: 22, fs: 12 })}
<text x="966" y="384" font-size="8" text-anchor="middle" fill="#444" font-family="Arial">MATH · REF · BUS</text>
${knob('ch2pos', 1062, 398, 15, 'POSITION', true)}
${key('ch2', 1062, 440, 'CH2', { w: 50, h: 24, fs: 12 })}
${knob('ch2scale', 1062, 482, 21, 'SCALE', false, true)}
${bnc('bnc1', 870, 574, 'CH1', '#ffe14a')}${bnc('bnc2', 1062, 574, 'CH2', '#4fc3ff')}${bnc('ext', 1160, 574, 'EXT TRIG', null)}
<text x="966" y="580" font-size="7.5" text-anchor="middle" fill="#333" font-family="Arial">1MΩ∥16pF  300Vrms CAT I</text>
<text x="966" y="590" font-size="7.5" text-anchor="middle" fill="#333" font-family="Arial">⚠ max</text>
<g id="hlLayer"></g>
</svg>`;
    host.insertAdjacentHTML('afterbegin', s);
    svg = host.querySelector('#panelSvg');
    for (const id in knobs) knobs[id].g = svg.querySelector(`.knob[data-id="${id}"] .rot`);
    bind(host);
    layoutScreen(host);
  }
  function layoutScreen(host) {
    const c = host.querySelector('#screen');
    c.style.left = (SCR.x / 1200 * 100) + '%'; c.style.top = (SCR.y / 620 * 100) + '%';
    c.style.width = (SCR.w / 1200 * 100) + '%'; c.style.height = (SCR.h / 620 * 100) + '%';
  }

  /* ---------------- etkileşim ---------------- */
  const tip = () => document.getElementById('tip');
  function showTip(id, e) {
    const h = HELP[id]; if (!h) return;
    const t = tip(); t.innerHTML = `<b>${h[0]}</b><br>${h[1]}`; t.style.display = 'block'; moveTip(e);
  }
  function moveTip(e) { const t = tip(); t.style.left = Math.min(window.innerWidth - 300, e.clientX + 14) + 'px'; t.style.top = (e.clientY + 18) + 'px'; }
  function hideTip() { tip().style.display = 'none'; }

  function bind(host) {
    svg.querySelectorAll('[data-id]').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('pointerenter', e => showTip(id, e));
      el.addEventListener('pointermove', moveTip);
      el.addEventListener('pointerleave', hideTip);
    });
    svg.querySelectorAll('.btn').forEach(el => {
      const id = el.dataset.id;
      el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('pressed'); App.press(id); });
      const up = () => el.classList.remove('pressed');
      el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
    });
    svg.querySelectorAll('.knob').forEach(el => {
      const id = el.dataset.id;
      // kademeli (1-2-5) düğmeler daha az hassas: yanlışlıkla iki kademe atlamasın
      const px = /scale$/.test(id) ? 18 : 7;
      let drag = null, wacc = 0;
      el.addEventListener('pointerdown', e => {
        e.preventDefault(); el.setPointerCapture(e.pointerId);
        drag = { y: e.clientY, x: e.clientX, acc: 0, moved: 0 };
      });
      el.addEventListener('pointermove', e => {
        if (!drag) return;
        const dy = (drag.y - e.clientY) + (e.clientX - drag.x) * 0.6;   // yukarı/sağa sürükleme = saat yönü
        drag.y = e.clientY; drag.x = e.clientX;
        drag.acc += dy; drag.moved += Math.abs(dy);
        while (Math.abs(drag.acc) >= px) { const s = Math.sign(drag.acc); drag.acc -= s * px; turn(id, s); }
      });
      el.addEventListener('pointerup', () => {
        if (drag && drag.moved < 3 && knobs[id].pushable) { App.push(id); pulse(id); }
        drag = null;
      });
      // Tekerlek: fare çentiği (|Δ| ≥ 50) = 1 kademe; dokunmatik yüzeyin küçük adımları biriktirilir
      el.addEventListener('wheel', e => {
        e.preventDefault();
        let d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 100 : 1);
        if (Math.abs(d) >= 50) { wacc = 0; turn(id, d < 0 ? 1 : -1); return; }
        wacc += d;
        if (Math.abs(wacc) >= 40) { turn(id, wacc < 0 ? 1 : -1); wacc = 0; }
      }, { passive: false });
    });
  }
  /** Bir detent dönüş: hızlı ardışık dönüşlerde ivmelenme uygulanır */
  function turn(id, s) {
    const k = knobs[id];
    const now = performance.now();
    const fast = now - (k.last || 0) < 60; k.last = now;
    k.speed = fast ? Math.min((k.speed || 1) + 0.25, 4) : 1;
    k.angle += s * 15;
    k.g.style.transform = `rotate(${k.angle}deg)`;
    App.turn(id, s, Math.round(k.speed));
  }
  function pulse(id) {
    const k = knobs[id], g = k.g;
    g.style.transform = `rotate(${k.angle}deg) scale(.92)`;
    setTimeout(() => g.style.transform = `rotate(${k.angle}deg)`, 130);
  }

  /** Kılavuzdaki "Göster" düğmesi: panel öğelerini yanıp sönen halka ile işaretler */
  let hlTimer = 0;
  function highlight(ids, ms = 4500) {
    const layer = svg.querySelector('#hlLayer');
    layer.innerHTML = '';
    clearTimeout(hlTimer);
    const inv = svg.getScreenCTM().inverse();
    for (const id of [].concat(ids)) {
      const el = svg.querySelector(`[data-id="${id}"]`); if (!el) continue;
      const r = el.getBoundingClientRect();
      const p1 = new DOMPoint(r.left, r.top).matrixTransform(inv), p2 = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
      const pad = 6;
      if (el.classList.contains('knob')) {
        const k = knobs[id];
        layer.insertAdjacentHTML('beforeend', `<circle class="hlRing" cx="${k.x}" cy="${k.y}" r="${k.r + 14}"/>`);
      } else layer.insertAdjacentHTML('beforeend', `<rect class="hlRing" x="${p1.x - pad}" y="${p1.y - pad}" width="${p2.x - p1.x + 2 * pad}" height="${p2.y - p1.y + 2 * pad}" rx="8"/>`);
    }
    const first = svg.querySelector('#hlLayer > *');
    if (first) { const r = first.getBoundingClientRect(); if (r.top < 60 || r.bottom > window.innerHeight) document.getElementById('scopeWrap').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    hlTimer = setTimeout(() => layer.innerHTML = '', ms);
  }

  /** Işıklı tuşların durumunu güncelle (her karede) */
  let ledCache = '';
  function updateLeds() {
    const S = State.S, R = State.R, on = App.power;
    const leds = {
      ch1: on && S.ch[0].on ? 'rgba(255,215,40,.85)' : '', ch2: on && S.ch[1].on ? 'rgba(60,170,255,.85)' : '',
      math: on && S.math.on ? 'rgba(255,70,70,.8)' : '', ref: on && S.ref.some(r => r.on) ? 'rgba(235,235,235,.6)' : '',
      runstop: on ? (R.run ? 'rgba(40,210,80,.85)' : 'rgba(240,50,40,.85)') : '',
      single: on && R.single && R.run ? 'rgba(255,255,255,.95)' : '',
      help: on && Menus.M.help ? 'rgba(255,170,60,.7)' : '',
      zoom: on && S.zoom.on ? 'rgba(120,170,255,.7)' : '',
      power: on ? 'rgba(80,220,120,.35)' : '',
    };
    const key = JSON.stringify(leds); if (key === ledCache) return; ledCache = key;
    for (const id in leds) {
      const r = svg.querySelector(`.btn[data-id="${id}"] .led`);
      if (!r) continue;
      r.setAttribute('fill', leds[id] || 'transparent');
      r.style.mixBlendMode = leds[id] ? (id === 'single' ? 'normal' : 'multiply') : '';
      r.style.filter = leds[id] ? 'drop-shadow(0 0 4px ' + leds[id] + ')' : '';
    }
    const lead = svg.querySelector('.compLead');
    if (lead) lead.setAttribute('opacity', Bench.model.probes.some(p => p.tip && Bench.byId(p.tip.c) && Bench.byId(p.tip.c).type === 'COMP') ? '1' : '0');
  }
  return { build, updateLeds, HELP, showTip, hideTip, moveTip, turn, pulse, highlight, knobs };
})();
