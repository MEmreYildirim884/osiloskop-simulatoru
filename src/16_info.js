/* =====================================================================
 * Info — ekranın üstüne yerleştirilen "!" açıklama işaretleri
 *   Osiloskobun çizimine dokunmaz: ekranın (canvas) üstünde ayrı bir katman.
 *   Her işaret, o bölgede o an yazan değerleri satır satır açıklayan bir pencere açar
 *   (imleç kutusu, ölçüm satırı, alt/üst bilgi çubukları, menüler, ızgara işaretleri).
 *   Tezgâhta da "!" (data-ihelp) işaretleri var: problar, jeneratör.
 * ===================================================================== */
const Info = (() => {
  const fmt = Units.fmt, S = () => State.S;
  const R_ = Renderer;
  let layer, on = true;
  const BADGES = ['top', 'grid', 'cursor', 'meas', 'status', 'menu', 'side', 'list'];

  function init() {
    layer = document.getElementById('infoLayer');
    // ekran (canvas) ile aynı yer ve boyut (Panel.layoutScreen ile aynı oranlar)
    Object.assign(layer.style, { left: (80 / 1200 * 100) + '%', top: (58 / 620 * 100) + '%', width: (640 / 1200 * 100) + '%', height: (384 / 620 * 100) + '%' });
    layer.innerHTML = BADGES.map(k => `<button class="ibadge pulse" data-info="${k}" title="Bu bölge ne gösteriyor? (tıkla)" style="display:none">!</button>`).join('');
    layer.addEventListener('click', e => { const b = e.target.closest('[data-info]'); if (b) open(b.dataset.info); });
    document.addEventListener('click', e => { const b = e.target.closest('[data-ihelp]'); if (b) { e.stopPropagation(); open(b.dataset.ihelp); } }, true);
    try { on = localStorage.getItem('gds.infoBadges') !== '0'; } catch (e) { }
    const btn = document.getElementById('btnInfo');
    const apply = () => { layer.classList.toggle('off', !on); btn.classList.toggle('on', on); };
    btn.onclick = () => { on = !on; try { localStorage.setItem('gds.infoBadges', on ? '1' : '0'); } catch (e) { } apply(); };
    apply();
  }

  /* ---------------- işaretlerin yeri (canvas 800×480 koordinatı) ---------------- */
  function place(k, x, y, vis) {
    const el = layer.querySelector(`[data-info="${k}"]`);
    if (!vis) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = (x / 800 * 100) + '%'; el.style.top = (y / 480 * 100) + '%';
  }
  let last = 0;
  function tick(t) {
    if (!layer || t - last < 200) return; last = t;
    const s = S(), M = Menus.M, pw = App.power;
    const { GX, GY, GW, GH } = R_;
    place('top', 703, 14, pw);
    place('grid', GX + GW - 12, GY + 14, pw && !s.acq.xy && !Menus.side());
    place('cursor', GX + 180, GY + 8, pw && !!s.cursor.mode && !s.acq.xy);
    const n = s.meas.items.length, rows = Math.ceil(n / 4), bh = s.meas.stats ? 30 : 18;
    place('meas', GX + GW - 8, GY + GH - rows * bh - 9, pw && n > 0 && !s.acq.xy);
    place('status', 700, 427, pw);
    place('menu', 9, 446, pw && !!M.cur && !M.hidden);
    place('side', 791, 37, pw && !!Menus.side() && !M.hidden);
    if (M.list) { const cols = M.list.items.length > 12 ? 2 : 1; place('list', GX + 20 + cols * 170 + 20, GY + 14, pw); } else place('list', 0, 0, false);
  }

  /* ---------------- pencere ---------------- */
  function open(key) {
    const f = TOPIC[key]; if (!f) return;
    const modal = document.getElementById('modal'), box = document.getElementById('modalBox');
    box.className = 'box info';
    let body;
    try { body = f(); } catch (e) { body = `<p>Açıklama hazırlanamadı: ${e.message}</p>`; }
    box.innerHTML = `<div class="libHead"><h2>❗ ${body.t}</h2><span><button class="ui sm" data-refresh="1">🔄 Yenile</button> <button class="ui" data-close="1">✕ Kapat</button></span></div>${body.h}`;
    modal.style.display = 'flex';
    box.onclick = (e) => {
      if (e.target.closest('[data-close]')) { modal.style.display = 'none'; box.className = 'box'; box.onclick = null; }
      else if (e.target.closest('[data-refresh]')) open(key);
      else { const s = e.target.closest('[data-show]'); if (s) { modal.style.display = 'none'; box.className = 'box'; box.onclick = null; Panel.highlight(s.dataset.show.split(',')); } }
    };
  }
  const row = (code, html) => `<div class="row"><code>${code}</code><div class="d">${html}</div></div>`;
  const gb = (cls, html) => `<div class="gbox ${cls}">${html}</div>`;
  const showBtn = (ids, t = '👁 Panelde göster') => `<span class="acts"><button data-show="${ids}">${t}</button></span>`;
  const chCol = (c) => c === 0 ? 'sarı' : 'mavi';

  /* ---------------- konular ---------------- */
  const TOPIC = {
    cursor() {
      const s = S(), Cu = s.cursor, inf = R_.cursorInfo(), src = Cu.src;
      if (!Cu.mode) return { t: 'İmleç (Cursor) okuma kutusu', h: '<p>İmleçler şu an kapalı. <b>Cursor</b> tuşuna bir kez basınca dikey (zaman) imleçleri, iki kez basınca yatay (gerilim) imleçleri açılır; sol üstte okuma kutusu belirir.</p>' + showBtn('cursor') };
      const unitT = (t) => Cu.hunit === 'Hz' ? fmt(1 / t, 'Hz') : (Cu.hunit === '%' || Cu.hunit === '°') && Cu.hRef ? (Cu.hunit === '%' ? (t / Cu.hRef * 100).toFixed(1) + '%' : (t / Cu.hRef * 360).toFixed(1) + '°') : fmt(t, 's');
      const unitV = (v) => Cu.vunit === '%' && Cu.vRef ? (v / Cu.vRef * 100).toFixed(1) + '%' : fmt(v, 'V');
      const sel = ['① (sadece birinci)', '② (sadece ikinci)', '①② (ikisi birlikte)'][Cu.sel];
      let h = '';
      if (Cu.mode === 'H') {
        const [a, b] = Cu.h, ta = inf.tAt(a), tb = inf.tAt(b), va = inf.vAt(a), vb = inf.vAt(b), dt = tb - ta;
        const L = [`① ${fmt(ta, 's')} ${unitV(va)}`, `② ${fmt(tb, 's')} ${unitV(vb)}`, `Δ${unitT(dt)} Δ${unitV(vb - va)}`, `dV/dt ${fmt((vb - va) / dt, 'V/s')}`];
        const fgc = Bench.model.comps.find(c => c.type === 'FG');
        h = `<p>Bu kutu, <b>dikey imleç çizgilerinin</b> (H Cursor — zaman imleçleri) okumasıdır. Ekrandaki kutunun şu anki hâli:</p>
          <div class="scr">${L.join('\n')}</div>
          ${row(L[0], `<b>① çizgisi.</b> Zamanı <b>${fmt(ta, 's')}</b>: tetik anına (ekranın ortası, üstteki turuncu ▼, t = 0) göre ${ta < 0 ? 'ortanın <b>solunda</b> (eksi = önce)' : 'ortanın <b>sağında</b> (artı = sonra)'}. Yanındaki <b>${unitV(va)}</b>: o anda <b>${src}</b> dalgasının gerilimi (hangi dalga okunacağını alt menüdeki <i>Source</i> belirler).`)}
          ${row(L[1], `<b>② çizgisi.</b> Zamanı <b>${fmt(tb, 's')}</b>, o andaki ${src} gerilimi <b>${unitV(vb)}</b>.`)}
          ${row(L[2], `<b>İki çizgi arasındaki fark.</b> Δt = t② − t① = <b>${fmt(dt, 's', 4)}</b>${Cu.hunit !== 'S' ? ` (H Unit = ${Cu.hunit} olduğu için <b>${unitT(dt)}</b> olarak yazıyor)` : ''}. ΔV = ${src} dalgasının iki noktadaki gerilim farkı = <b>${unitV(vb - va)}</b>.`)}
          ${row(L[3], `ΔV ÷ Δt: iki nokta arasındaki <b>ortalama eğim</b> (dalga saniyede ne kadar yükseliyor). Faz/periyot ölçerken kullanılmaz.`)}
          <h3>Bu kutuyla ne ölçerim?</h3>
          <ul><li><b>Periyot:</b> ① ve ②'yi aynı dalganın art arda iki tepesine (ya da iki yükselen geçişine) koy → Δt = T, f = 1/T.${fgc ? ` (Şu an jeneratör ${fmt(fgc.freq, 'Hz', 4)} → T = ${fmt(1 / fgc.freq, 's', 4)})` : ''}</li>
            <li><b>Faz farkı:</b> ①'i mavinin (CH2), ②'yi sarının (CH1) yükselen sıfır geçişine koy → φ = 360 × f × Δt.${fgc && Cu.hunit === 'S' ? ` Şu anki Δt ile: 360 × ${fgc.freq} × ${fmt(dt, 's', 4)} = <b>${(360 * fgc.freq * dt).toFixed(1)}°</b>.` : ''}</li>
            <li><b>Derece okumak:</b> çizgileri 1 periyota koy → alttaki 6. tuş <i>Set Cursor Pos. As 100%</i> → 4. tuş <i>H Unit</i> → sağdaki 4. tuş <b>°</b>.</li></ul>
          ${gb('tip', `Şu an hareket eden imleç: <b>${sel}</b>. <b>Select</b> tuşu sırayı değiştirir, <b>VARIABLE</b> düğmesi çizgiyi kaydırır (tekerlek yukarı = sağa). ${showBtn('select,variable')}`)}`;
      } else {
        const va = inf.vOf(Cu.v[0]), vb = inf.vOf(Cu.v[1]);
        const L = [`① ${unitV(va)}`, `② ${unitV(vb)}`, `Δ${unitV(vb - va)}`];
        h = `<p>Bu kutu, <b>yatay imleç çizgilerinin</b> (V Cursor — gerilim imleçleri) okumasıdır:</p>
          <div class="scr">${L.join('\n')}\ndV/dt …</div>
          ${row(L[0], `<b>① yatay çizgisinin</b> gerilim seviyesi (${src} ölçeğine göre, 0 V çizgisinden itibaren).`)}
          ${row(L[1], `<b>② yatay çizgisinin</b> gerilim seviyesi.`)}
          ${row(L[2], `İki çizgi arasındaki gerilim farkı. ①'i dalganın tepesine, ②'yi dibine koyarsan bu <b>Vpp</b> olur.`)}
          ${gb('tip', `<b>Cursor</b> tuşuna bir daha basarsan imleçler kapanır; bir daha basarsan dikey (zaman) imleçlere döner. ${showBtn('cursor')}`)}`;
      }
      return { t: 'İmleç (Cursor) okuma kutusu', h };
    },

    meas() {
      const res = App.measResults || [];
      const h = `<p>Ekranın altındaki kutular <b>otomatik ölçümlerdir</b>. Osiloskop bunları ekrandaki dalgadan sürekli hesaplar (en fazla 8 tane).</p>
        ${res.map(m => {
          const lbl = Measure.catOf(m.it.name) === 'D' ? `${m.it.s1}→${m.it.s2} ${m.it.name}` : `${m.it.s1} ${m.it.name}`;
          let extra = '';
          if (m.it.name === 'Phase') extra = ` <b>${m.it.s2}</b> dalgasının <b>${m.it.s1}</b> dalgasına göre faz farkı. <b>+</b> = ${m.it.s2} önde (önce yükseliyor), <b>−</b> = geride.`;
          else if (m.it.name === 'Pk-Pk') extra = ` ${m.it.s1} dalgasının en üst noktası ile en alt noktası arasındaki fark (tepeden tepeye, Vpp).`;
          else if (m.it.name === 'Frequency') extra = ' Saniyedeki dalga sayısı.';
          return row(`${lbl}  ${m.text}`, `<b>${Measure.DESC[m.it.name] || m.it.name}</b>.${extra}${m.text === '?' ? ' <span class="bad">"?" = ölçülemiyor: dalga ekrandan taşıyor, kanal kapalı ya da ekranda tam bir periyot yok.</span>' : ''}`);
        }).join('')}
        <h3>Ölçüm eklemek / silmek</h3>
        <ul><li><b>Ekle:</b> Measure → alttaki 1. tuş (Add Measurement) → sağdaki 4./5. tuşlarla Source1/Source2 → V/I, Time veya Delay → VARIABLE ile seç → Select.</li>
          <li><b>Sil:</b> Measure → alttaki 2. tuş (Remove Measurement) → sağdaki 1. tuş (Select Measurement) → VARIABLE ile seç → Select. Hepsi için sağdaki 2. tuş (Remove All).</li></ul>
        ${gb('tip', 'Renkli çizgi ölçümün kaynağını gösterir: sarı = CH1, mavi = CH2, kırmızı = Math. ' + showBtn('measure'))}`;
      return { t: 'Otomatik ölçüm satırı', h };
    },

    status() {
      const s = S(), R = State.R, T = s.trig;
      const cpl = { DC: 'DC — sinyalin tamamı (DC + AC) gösterilir', AC: 'AC — DC kısmı atılır, sadece dalgalanma gösterilir (~10 Hz altında fazı bozar!)', GND: 'GND — giriş kapalı, 0 V çizgisi gösterilir' };
      let h = `<p>Ekranın altındaki bilgi çubuğu: ölçek ayarlarının özeti. Ölçüm yapmak için bu değerleri <b>kare sayısıyla çarparsın</b>.</p>`;
      for (let c = 0; c < 2; c++) {
        if (!s.ch[c].on) continue;
        const C = s.ch[c], txt = `${c + 1}  ${fmt(State.vdiv(c), 'V')} ${C.coupling}${C.bw === '20MHz' ? ' BW' : ''}${C.invert ? ' Inv' : ''}`;
        h += row(txt, `<b>${c + 1}</b> = CH${c + 1} (${chCol(c)} dalga). <b>${fmt(State.vdiv(c), 'V')}</b> = VOLTS/DIV: dikeyde <b>bir kare ${fmt(State.vdiv(c), 'V')}</b>. ${cpl[C.coupling]}.${C.bw === '20MHz' ? ' <b>BW</b> = 20 MHz bant sınırı açık.' : ''}${C.invert ? ' <b>Inv</b> = dalga ters çevrilmiş.' : ''} Değiştirmek: CH${c + 1} SCALE düğmesi. ${showBtn('ch' + (c + 1) + 'scale')}`);
      }
      h += row(`H ${fmt(State.tdiv(), 's')}   ${fmt(s.hpos, 's')}`, `<b>H ${fmt(State.tdiv(), 's')}</b> = TIME/DIV: yatayda <b>bir kare ${fmt(State.tdiv(), 's')}</b>; ekranın tamamı 10 kare = ${fmt(10 * State.tdiv(), 's')}. <b>${fmt(s.hpos, 's')}</b> = H POSITION: tetik anının ekran ortasına göre kayması (0 = tetik tam ortada). ${showBtn('hscale,hpos')}`);
      const sl = T.slope === 'rise' ? '↗' : T.slope === 'fall' ? '↘' : '↕';
      h += row(`${T.src === 'LINE' ? 'AC Line' : T.src} ${sl} ${T.src === 'LINE' ? '' : fmt(T.level, 'V')} ${T.coupling}`, `<b>Tetik</b> bilgisi: kaynak <b>${T.src}</b> · eğim <b>${sl}</b> (${T.slope === 'rise' ? 'dalga yukarı doğru geçerken' : T.slope === 'fall' ? 'aşağı doğru geçerken' : 'her iki yönde'}) · seviye <b>${T.src === 'LINE' ? '—' : fmt(T.level, 'V')}</b> · kuplaj ${T.coupling}. Yani "${T.src} dalgası ${T.src === 'LINE' ? '' : fmt(T.level, 'V') + ' seviyesini '}${T.slope === 'rise' ? 'yukarı doğru' : 'aşağı doğru'} geçince çizmeye başla". ${showBtn('level,t50,tmenu')}`);
      h += row(R.freq ? fmt(R.freq, 'Hz', 6) : '<2Hz', `<b>Frekans sayacı</b>: tetik kaynağındaki sinyalin frekansı (6 hane). "&lt;2Hz" = ölçülemiyor (sinyal yok, çok yavaş ya da tetik seviyesi sinyalin dışında).`);
      return { t: 'Alt bilgi çubuğu', h };
    },

    top() {
      const s = S(), R = State.R, rl = State.RL[s.acq.rlIdx];
      const am = s.acq.mode === 'Average' ? `Avg ${State.AVG[s.acq.avgIdx]}` : s.acq.mode === 'Peak' ? 'Peak' : 'Sample';
      const st = R.single && R.run ? 'Single' : R.status;
      const STAT = { "Trig'd": '<b>Trig\'d</b> (yeşil): tetik yakalandı, görüntü sabit. İstenen durum.', Auto: '<b>Auto</b> (turuncu): tetik bulunamadı, osiloskop yine de çiziyor → dalga kayar. Çözüm: 50% tuşu.', 'Trig?': '<b>Trig?</b>: Normal modda tetik bekleniyor, ekran son görüntüde dondu.', Stop: '<b>Stop</b> (kırmızı): Run/Stop ile durduruldu.', Roll: '<b>Roll</b>: çok yavaş zaman tabanı (≥100 ms/div), dalga sağdan sola akar.', PrTrig: '<b>PrTrig</b>: tetik öncesi veri toplanıyor.', Single: '<b>Single</b>: tek kayıt için tetik bekleniyor.' };
      const h = `<p>Ekranın üstündeki çubuk: edinim (örnekleme) bilgileri ve durum.</p>
        ${row(`${rl >= 1e3 ? rl / 1e3 + 'k' : rl} pts`, `<b>Kayıt uzunluğu</b> (Record Length): ekrandaki bir çizim için alınan nokta sayısı. Acquire → Record Length ile değişir.`)}
        ${row(fmt(State.fs(), 'Sa/s', 3), `<b>Örnekleme hızı</b>: saniyede alınan nokta sayısı = kayıt uzunluğu ÷ ekran süresi (10 × TIME/DIV), en fazla 1 GSa/s. Sinyalin frekansından çok büyük olmalı.`)}
        ${row('▭ ▼ çubuk', `Hafızadaki kaydın tamamı; turuncu <b>▼</b> tetik anının kayıttaki yeri (H POSITION ile kayar).`)}
        ${row(am, `<b>Edinim modu</b>: Sample = normal · Peak = hızlı sivri darbeleri yakalar · Average = birkaç çizimin ortalaması (gürültüyü azaltır). Acquire → Mode.`)}
        ${row(st, STAT[R.status] || st)}
        ${gb('tip', 'Ölçüm yaparken sağ üstte <b>Trig\'d</b> görmelisin. ' + showBtn('acquire,runstop'))}`;
      return { t: 'Üst bilgi çubuğu', h };
    },

    grid() {
      const s = S();
      const h = `<p>Ekranın ızgarası ve kenarlarındaki işaretler:</p>
        ${row('10 × 8 kare', `Yatayda 10, dikeyde 8 büyük kare (div). Her büyük kare 5 küçük çentiğe bölünür. Ölçüm = kare sayısı × (VOLTS/DIV veya TIME/DIV).`)}
        ${row('▶1  ▶2 (sol kenar)', `Kanalların <b>0 V çizgisi</b>. Dalga bu çizginin üstündeyse pozitif. POSITION düğmeleri bunu kaydırır, düğmeye tıklamak ortaya alır.${s.ch[0].on ? ` CH1 şu an ${(s.ch[0].pos).toFixed(2)} kare kaydırılmış.` : ''}${s.ch[1].on ? ` CH2: ${(s.ch[1].pos).toFixed(2)} kare.` : ''} ${showBtn('ch1pos,ch2pos')}`)}
        ${row('◀ (sağ kenar)', `<b>Tetik seviyesi</b> (${s.trig.src} için ${fmt(s.trig.level, 'V')}). Turuncuya dönerse seviye ekranın dışında demektir. LEVEL düğmesi değiştirir. ${showBtn('level')}`)}
        ${row('▼ (üst kenar)', `<b>Tetik anı</b> (t = 0). İmleç zamanları bu ana göre yazılır. H POSITION ile kayar. ${showBtn('hpos')}`)}
        ${row('Renkler', `<span style="color:var(--ch1)">sarı = CH1</span>, <span style="color:var(--ch2)">mavi = CH2</span>, <span style="color:var(--math)">kırmızı = Math</span>, beyaz = Ref.`)}`;
      return { t: 'Izgara ve kenar işaretleri', h };
    },

    menu() {
      const M = Menus.M, items = Menus.bottom();
      const NAMES = { ch1: 'CH1 menüsü', ch2: 'CH2 menüsü', measure: 'Measure (ölçüm) menüsü', cursor: 'Cursor (imleç) menüsü', acquire: 'Acquire menüsü', display: 'Display menüsü', trigger: 'Trigger (tetik) menüsü', math: 'Math menüsü', ref: 'Ref menüsü', save: 'Save/Recall menüsü', utility: 'Utility menüsü', autoset: 'Autoset menüsü', zoom: 'Zoom menüsü', app: 'APP menüsü' };
      const h = `<p><b>${NAMES[M.cur] || M.cur}</b> açık. Ekranın altındaki 7 kutu, hemen altlarındaki 7 tuşla seçilir (soldan sağa 1–7). Üst satır = ayarın adı, sarı alt satır = şu anki değeri.</p>
        ${items.map((it, i) => row(`${i + 1}. ${it.label}${it.value ? ' · ' + it.value() : ''}`, (MENU_HELP[it.label] || 'Bu ayarı değiştirir.') + (it.side ? ' <i>(basınca sağda seçenekler açılır)</i>' : ''))).join('')}
        ${gb('tip', 'Menüyü kapatmak: <b>Menu Off</b> tuşu (ilk basış sağ menüyü, ikinci basış alt menüyü gizler). ' + showBtn('menuoff,bot0'))}`;
      return { t: 'Alt menü', h };
    },

    side() {
      const sd = Menus.side(); if (!sd) return { t: 'Sağ menü', h: '<p>Sağ menü kapalı.</p>' };
      const h = `<p><b>${sd.title}</b> seçenekleri. Ekranın sağındaki 5 tuş, karşısındaki kutuyu seçer (yukarıdan aşağı 1–5). <b>●</b> = seçili seçenek. <b>⟲</b> = bu ayar <b>VARIABLE</b> düğmesiyle değiştirilir (önce o kutunun tuşuna bas, sonra düğmeyi çevir).</p>
        ${sd.items.map((it, i) => row(`${i + 1}. ${it.label}${it.value ? ' · ' + it.value() : ''}${it.variable ? ' ⟲' : ''}`, MENU_HELP[it.label] || '—')).join('')}
        ${gb('tip', showBtn('side0,variable'))}`;
      return { t: 'Sağ menü', h };
    },

    list() {
      const L = Menus.M.list; if (!L) return { t: 'Liste', h: '<p>Liste kapalı.</p>' };
      const cur = L.items[L.idx];
      const h = `<p><b>${L.title}</b> listesi açık. <b>VARIABLE</b> düğmesiyle mavi seçimi aşağı/yukarı götür, <b>Select</b> ile ekle (ya da sil). Bitince <b>Menu Off</b>.</p>
        ${row(cur, Measure.DESC[cur] || '—')}
        <h3>Listedeki ölçümler</h3>
        ${L.items.map(n => row(n, Measure.DESC[n] || '')).join('')}
        ${gb('tip', showBtn('variable,select,menuoff'))}`;
      return { t: 'Seçim listesi', h };
    },

    probes() {
      const h = `<p>Tezgâhta iki prob var: <span style="color:var(--ch1)">sarı = CH1</span>, <span style="color:var(--ch2)">mavi = CH2</span>. Her probun iki ucu var:</p>
        ${row('Uç (kanca)', 'Ölçmek istediğin noktaya takılır. Osiloskop bu noktanın gerilimini gösterir.')}
        ${row('Timsah (siyah)', '<b>Her zaman GND\'ye</b> takılır. Osiloskobun şasesi şebeke toprağına bağlıdır; timsahı başka bir noktaya takarsan o noktayı toprağa kısa devre edersin.')}
        ${row('×1 / ×10 anahtarı', 'Probun üstündeki fiziksel anahtar. ×10: sinyal 10\'a bölünür ve devre daha az yüklenir (10 MΩ). Osiloskopta CH menüsü → Probe ayarı da aynı olmalı (10X), yoksa okunan değerler 10 kat yanlış çıkar.')}
        ${row('Bağlamanın 2 yolu', '1) Tezgâhta probun ucunu sürükleyip bir bileşen ucuna bırak. 2) Sağdaki "Problar" kutusunda Uç / Timsah listesinden düğüm seç (Vi, A, Vo, GND …).')}
        ${gb('tip', 'Bir direncin akımını ölçmek için: direncin bir ucu topraktaysa probu diğer ucuna tak (I = V/R). İki ucu da topraktan farklıysa iki kanal + MATH (CH1 − CH2) kullan.')}`;
      return { t: 'Problar nasıl bağlanır?', h };
    },

    fg() {
      const g = Bench.model.comps.find(c => c.type === 'FG');
      const h = `<p>Fonksiyon jeneratörü devreye sinyal veren cihaz.${g ? ` Şu an: ${{ sine: 'sinüs', square: 'kare', triangle: 'üçgen' }[g.wave]}, ${fmt(g.freq, 'Hz', 4)}, ${fmt(g.vpp, 'Vpp')}.` : ''}</p>
        ${row('Dalga', 'Sinüs, kare veya üçgen. Faz/kazanç deneylerinde <b>sinüs</b> kullanılır.')}
        ${row('Frekans', 'Saniyedeki dalga sayısı. Altındaki düğmeler bu devrenin ölçüm frekansları. Kutunun üstünde fare tekerleği 1-2-5 adımıyla değiştirir.')}
        ${row('Genlik (Vpp)', 'Tepeden tepeye gerilim, <b>yüksüz</b> (devre bağlı değilken) değer.')}
        ${row('DC ofset', 'Dalgayı yukarı/aşağı kaydıran sabit gerilim. Bu deneylerde 0.')}
        ${row('Çıkış direnci', 'Gerçek jeneratörlerde 50 Ω. Devre bağlanınca bu dirençte gerilim düşer, bu yüzden devreye giden Vi ayarladığından biraz azdır → Vi\'yi osiloskopla ölç ve gerekirse genliği artır.')}`;
      return { t: 'Fonksiyon jeneratörü', h };
    },
  };

  /* ---------------- menü öğesi açıklamaları ---------------- */
  const MENU_HELP = {
    'Coupling': 'Kuplaj: DC (her şey), AC (DC kısmı atılır), GND (0 V). Her basışta değişir. Faz ölçerken DC kullan.',
    'Impedance': 'Giriş empedansı: 1 MΩ (değiştirilemez).',
    'Invert': 'Dalgayı ters çevirir (yukarı-aşağı). Normalde Off.',
    'Bandwidth': 'Bant genişliği sınırı: Full (100 MHz) veya 20 MHz (yüksek frekans gürültüsünü keser).',
    'Expand': 'VOLTS/DIV değişirken dalga 0 V çizgisine göre mi (Ground) ekran ortasına göre mi (Center) büyüsün.',
    'Position': 'Kanalın dikey konumu (VARIABLE ile ince ayar, Set to 0 ile sıfırla).',
    'Probe': 'Prob türü ve zayıflatması. Probun üstündeki anahtarla aynı olmalı (×10 → 10X).',
    'Add Measurement': 'Yeni otomatik ölçüm ekler: sağda V/I (gerilim), Time (zaman), Delay (iki kanal arası) ve Source1/Source2.',
    'Remove Measurement': 'Eklenmiş ölçümleri tek tek veya hepsini siler.',
    'Gating': 'Ölçümün hangi bölgeden yapılacağı: tüm kayıt, ekran veya iki imleç arası.',
    'Display All': 'Bir kanalın tüm ölçümlerini birden büyük bir tabloda gösterir.',
    'High-Low': 'High/Low seviyelerinin nasıl bulunacağı (histogram veya min-max).',
    'Statistics': 'Ölçümlerin ortalama/standart sapma istatistiği.',
    'Reference Levels': 'Yükselme süresi gibi ölçümlerde kullanılan %10/%50/%90 seviyeleri.',
    'H Cursor': 'Dikey (zaman) imleçleri. Her basış ① → ② → ①② arasında hangisinin hareket edeceğini değiştirir.',
    'V Cursor': 'Yatay (gerilim) imleçleri.',
    'Source': 'İmleç/ölçümün hangi dalgayı okuyacağı (CH1, CH2, Math).',
    'H Unit': 'Zaman imleç farkının birimi: s, Hz, % veya ° (derece için önce Set Cursor Pos. As 100%).',
    'V Unit': 'Gerilim imleç biriminin türü: Base (V) veya %.',
    'Set Cursor Pos. As 100%': 'İki imleç arasındaki mesafeyi %100 (ve 360°) olarak kaydeder. Bir periyotta yaparsan derece okursun.',
    'Cursor Off': 'İmleçleri kapatır.',
    'Mode': 'Edinim modu: Sample (normal), Peak Detect, Average (gürültüyü azaltır).',
    'XY': 'XY modu: CH1 yatay, CH2 dikey çizilir (Lissajous). Faz farkını elipsle gösterir.',
    'Record Length': 'Bir çizimdeki nokta sayısı.',
    'Reset H Position to 0s': 'Yatay konumu sıfırlar.',
    'Persistence': 'Eski çizimlerin ekranda ne kadar kalacağı (iz kalıcılığı).',
    'Intensity': 'Dalga, ızgara ve ekran parlaklığı.',
    'Graticule': 'Izgara görünümü.',
    'Type': 'Tetik tipi (Edge = kenar tetikleme, en yaygını).',
    'Slope': 'Tetik eğimi: ↗ yükselen, ↘ düşen, ↕ ikisi.',
    'Level': 'Tetik seviyesi (gerilim).',
    'Holdoff': 'İki tetik arasında beklenecek en kısa süre.',
    'Dual Channel': 'İki kanal arası işlem: Source1 (işlem) Source2. Akım için CH1 − CH2.',
    'FFT': 'Sinyalin frekans spektrumu.',
    'Advanced Math': 'Kullanıcı tanımlı ifade (simülatörde yok).',
    'Source1': 'İşlemin/ölçümün birinci kaynağı.',
    'Operator': 'İşlem: + − × ÷.',
    'Source2': 'İşlemin/ölçümün ikinci kaynağı (Delay/Phase ölçümlerinde karşılaştırılan kanal).',
    'Position / Unit': 'Math dalgasının konumu ve ölçeği.',
    'Vertical Units': 'FFT dikey birimi (Linear veya dBV).',
    'Window': 'FFT pencere fonksiyonu.',
    'Vertical / Horizontal': 'FFT ölçek ve frekans aralığı.',
    'Fit Screen Mode': 'Autoset dalgayı ekrana sığdırır.',
    'AC Priority Mode': 'Autoset AC kuplaj kullanır.',
    'Undo Autoset': 'Son Autoset\'ten önceki ayarlara döner.',
    'V/I': 'Gerilim ölçümleri listesi (Pk-Pk, RMS, Max, Min …).',
    'Time': 'Zaman ölçümleri listesi (Frequency, Period, Rise Time …).',
    'Delay': 'İki kanal arası ölçümler (Phase, gecikmeler).',
    'Select Measurement': 'Silinecek ölçümü listeden seç.',
    'Remove All': 'Tüm ölçümleri siler.',
    'Sample': 'Normal örnekleme.', 'Peak Detect': 'Hızlı sivri darbeleri yakalar.', 'Average': 'Birkaç çizimin ortalaması; gürültüyü azaltır.',
    'OFF (YT)': 'Normal görünüm: yatay eksen zaman.', 'Triggered XY': 'XY modu açık.',
    'Full': '100 MHz tam bant.', '20MHz': '20 MHz bant sınırı.',
    'By Ground': '0 V çizgisine göre büyüt.', 'By Center': 'Ekran ortasına göre büyüt.',
    'Set to 0': 'Sıfırla.', 'Set to 10X': 'Prob zayıflatmasını 10X yap.', 'Attenuation': 'Prob zayıflatması (VARIABLE ile).',
    'S': 'Saniye.', 'Hz': '1/Δt (frekans).', '%': 'Kaydedilen %100 aralığına göre yüzde.', '°': 'Kaydedilen periyoda göre derece (faz).',
    'CH1': 'Kanal 1.', 'CH2': 'Kanal 2.', 'Math': 'Math dalgası.',
    'Edge': 'Kenar tetikleme.', 'DC': 'DC kuplaj.', 'AC': 'AC kuplaj.', 'HF Reject': 'Yüksek frekansları tetikte bastırır.', 'LF Reject': 'Düşük frekansları tetikte bastırır.',
    'Auto (Untriggered Roll)': 'Tetik yoksa da çizer.', 'Normal': 'Sadece tetik gelince çizer.',
    'Set to 50%': 'Seviyeyi sinyalin ortasına koyar.',
  };

  return { init, tick, open, TOPIC };
})();
