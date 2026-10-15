// Duman testi: 30 devreyi yükler, tüm sekmeleri/adımları çizer, akım düzenini kurar, test modunu, "!" pencerelerini ve doğruluk testlerini çalıştırır.
setTimeout(() => {
  const o = []; const log = x => o.push(x);
  const run = (n) => { for (let i = 0; i < n; i++) Acq.tick(1 / 60); };
  try {
    log('header: ' + document.getElementById('curName').innerText);
    Guide.openLibrary(); log('lib cards: ' + document.querySelectorAll('#modalBox .ccard').length);
    document.getElementById('modal').click();
    for (const d of Circuits.DEFS) {
      Guide.loadCircuit(d.id);
      const tabs = [];
      for (const t of ['lab', 'tables', 'howto', 'keys', 'theory', 'specs']) { Guide.show(t); tabs.push(document.getElementById('gBody').innerText.length); }
      Guide.show('lab');
      let stepsOk = 0;
      if (d.group !== 'test') { for (let i = 0; i < Guide.STEPS.length; i++) { document.querySelector('[data-goto="' + i + '"]').click(); stepsOk++; } }
      else { Guide.ACT.reveal(); Guide.show('lab'); for (let i = 0; i < Guide.STEPS.length; i++) { document.querySelector('[data-goto="' + i + '"]').click(); stepsOk++; } Guide.ACT.hide(); }
      // akım düzeni + yakalama
      Guide.ACT.probes(); Guide.ACT.fg(); Guide.ACT.autoset(); run(30);
      Guide.ACT.cap1();
      Guide.ACT.current(); run(30);
      const isTxt = document.querySelector('[data-live="is"]');
      Guide.ACT.cap1();
      const st = JSON.parse(localStorage.getItem('ee212.lab1.v1')).data[d.id] || {};
      const s = Circuits.sense(), th = Guide.theory(d.f);
      log(`${d.id.padEnd(9)} steps=${stepsOk} tabs=${tabs.join('/')} t1=${JSON.stringify(st.t1)} thIs=${(th.ipk).toExponential(3)} sense=${s ? s.comp.name + (s.lo ? '→' + s.lo : '→GND') : '-'}`);
      Guide.ACT.back(); run(5);
    }
    // test modu: kontrol + skor
    Guide.loadCircuit('t01'); Guide.show('lab');
    Guide.ACT.probes(); Guide.ACT.fg(); Guide.ACT.autoset(); run(30); Guide.ACT.cap1(); Guide.ACT.check();
    log('test t01: ' + (document.getElementById('gBody').innerText.match(/Skor: [^\n]*/) || ['?'])[0]);
    // düşük frekans tarama
    Guide.loadCircuit('wien'); document.querySelector('[data-goto="9"]').click();
    document.querySelector('[data-sweep="10"]').click(); run(60); document.querySelector('[data-save="10"]').click();
    log('wien 10Hz saved: ' + JSON.stringify(JSON.parse(localStorage.getItem('ee212.lab1.v1')).data.wien.t2));
    // ! pencereleri
    State.S.cursor.mode = 'H'; Menus.open('measure'); Guide.ACT.mPk1();
    for (const k of Object.keys(Info.TOPIC)) { Info.open(k); log('info ' + k + ': ' + document.getElementById('modalBox').innerText.length + ' chars'); }
    document.getElementById('modal').click();
    Info.tick(1e9);
    log('badges visible: ' + [...document.querySelectorAll('.ibadge')].filter(b => b.style.display !== 'none').map(b => b.dataset.info).join(','));
    // diğer (eski) devre
    Guide.loadCircuit('rect'); Guide.show('lab'); log('rect lab: ' + document.getElementById('gBody').innerText.slice(0, 40));
    Guide.loadCircuit('wien');
    const res = Tests.all(); res.forEach(r => log((r.pass ? 'PASS ' : 'FAIL ') + r.name));
  } catch (e) { log('EXC ' + e.stack); }
  log('ERRORS: ' + JSON.stringify(window.__err));
  document.getElementById('out').textContent = o.join('\n');
}, 2500);
