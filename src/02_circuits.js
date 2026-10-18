/* =====================================================================
 * Circuits — Lab 1'e benzer devre kütüphanesi + AC (fazör) analiz
 *   - DEFS: her devre { id, group:'lab'|'learn'|'test', type, title, f, vpp, sweep, sense, ... }
 *   - build(id): devreyi tezgâha çizer (merdiven/ladder yerleşimi: seri elemanlar üst hatta,
 *     paralel kollar toprağa iner), düğüm adlarını (Vi, A, B, Vo) ve probları ayarlar
 *   - response(f): tezgâhtaki GERÇEK devreden karmaşık nodal analizle Vo/Vi ve akım
 *     (kullanıcı bir değeri değiştirirse teori de değişir)
 *   DOM'a dokunmaz.
 * ===================================================================== */
const Circuits = (() => {
  const B = Bench, fmt = Units.fmt;
  const E = (t, v, name) => ({ t, v, name });

  /* ---------------- tip açıklamaları (çok basit dille) ---------------- */
  const TYPES = {
    wien: { kind: 'Band geçiren (Wien ağı)', target: { ph: 0 }, charName: 'merkez frekans f₀ (φ = 0°, kazanç en büyük)',
      simple: 'Seri bir R–C kolu ile toprağa inen paralel R∥C kolundan oluşan bir gerilim bölücü. Orta frekansları geçirir, çok düşük ve çok yüksek frekansları zayıflatır.',
      why: 'Düşük frekansta seri kondansatör akımı engeller (çıkış küçük, Vo önde). Yüksek frekansta paralel kondansatör R\'yi kısa devre eder (çıkış küçük, Vo geride). Arada, kondansatörlerin etkisinin dengelendiği f₀\'da faz 0° olur.' },
    rc_lp: { kind: 'Alçak geçiren RC filtre', target: { ph: -45 }, charName: 'kesim frekansı f_c (φ = −45°, kazanç 0.707)',
      simple: 'Önce bir direnç, sonra toprağa inen bir kondansatör. Çıkış kondansatörün üstünden alınır. Yavaş dalgaları geçirir, hızlıları zayıflatır.',
      why: 'Düşük frekansta kondansatörün direnci (X_C) çok büyük, neredeyse açık devre: Vo ≈ Vi. Yüksek frekansta X_C küçülür ve çıkışı toprağa çeker: Vo küçülür ve Vi\'nin gerisinde kalır (en fazla −90°).' },
    cr_hp: { kind: 'Yüksek geçiren CR filtre', target: { ph: 45 }, charName: 'kesim frekansı f_c (φ = +45°, kazanç 0.707)',
      simple: 'Önce bir kondansatör, sonra toprağa inen bir direnç. Çıkış direncin üstünden alınır. Hızlı dalgaları geçirir, yavaşları engeller.',
      why: 'Düşük frekansta seri kondansatör akımı engeller: Vo küçük ve Vi\'nin önünde (en fazla +90°). Yüksek frekansta kondansatör kısa devre gibidir: Vo ≈ Vi.' },
    rl_hp: { kind: 'Yüksek geçiren RL filtre', target: { ph: 45 }, charName: 'kesim frekansı f_c = R/(2πL) (φ = +45°)',
      simple: 'Önce bir direnç, sonra toprağa inen bir bobin. Çıkış bobinin üstünden alınır.',
      why: 'Bobinin direnci X_L = 2πfL frekansla BÜYÜR. Düşük frekansta bobin kısa devre gibidir: Vo küçük ve önde. Yüksek frekansta bobin açık devre gibidir: Vo ≈ Vi.' },
    lr_lp: { kind: 'Alçak geçiren LR filtre', target: { ph: -45 }, charName: 'kesim frekansı f_c = R/(2πL) (φ = −45°)',
      simple: 'Önce bir bobin, sonra toprağa inen bir direnç. Çıkış direncin üstünden alınır.',
      why: 'Düşük frekansta bobin kısa devre gibidir: Vo ≈ Vi. Yüksek frekansta bobinin direnci büyür ve akımı engeller: Vo küçülür ve geride kalır.' },
    rlc_bp: { kind: 'Seri RLC band geçiren', target: { ph: 0 }, charName: 'rezonans frekansı f₀ = 1/(2π√LC) (φ = 0°, kazanç ≈ 1)',
      simple: 'Bobin ve kondansatör seri, çıkış toprağa inen direncin üstünden. Rezonans frekansında L ile C birbirini sıfırlar ve tüm gerilim dirence düşer.',
      why: 'Düşük frekansta kondansatör engeller (Vo önde), yüksek frekansta bobin engeller (Vo geride). Rezonansta X_L = X_C olur, ikisi birbirini götürür: Vo ≈ Vi ve faz 0°.' },
    rlc_lp: { kind: 'Seri RLC alçak geçiren (çıkış C üzerinde)', target: { ph: -90 }, charName: 'rezonans frekansı f₀ (φ = −90°, çıkışta tepe)',
      simple: 'Direnç ve bobin seri, çıkış toprağa inen kondansatörün üstünden. Rezonans civarında çıkış girişten BÜYÜK olabilir.',
      why: 'Düşük frekansta Vo ≈ Vi. Rezonansta L ve C enerjiyi birbirine aktarır, kondansatör gerilimi yükselir (Q kadar) ve faz tam −90°. Yüksek frekansta çıkış hızla düşer (−180°\'ye gider).' },
    tank: { kind: 'Paralel LC tank (band geçiren)', target: { ph: 0 }, charName: 'rezonans frekansı f₀ (φ = 0°, kazanç ≈ 1)',
      simple: 'Bir direnç, sonra toprağa inen paralel bobin ve kondansatör. Rezonansta paralel LC çok büyük direnç gösterir, çıkış girişe eşit olur.',
      why: 'Düşük frekansta bobin, yüksek frekansta kondansatör çıkışı toprağa çeker. Rezonansta ikisinin akımları birbirini götürür; tank açık devre gibi olur ve Vo ≈ Vi.' },
    rc2_lp: { kind: 'İki kademeli RC alçak geçiren', target: { ph: -90 }, charName: 'φ = −90° olan frekans',
      simple: 'Arka arkaya iki RC alçak geçiren kademe. Her kademe faz geciktirir; toplamda −180°\'ye kadar gider.',
      why: 'Tek kademe en fazla −90° geciktirir; iki kademe en fazla −180°. İkinci kademe birinciyi yükler, bu yüzden hesap tek kademenin iki katı değildir.' },
    cr2_hp: { kind: 'İki kademeli CR yüksek geçiren', target: { ph: 90 }, charName: 'φ = +90° olan frekans',
      simple: 'Arka arkaya iki CR yüksek geçiren kademe. Girişteki Rs direnci akımı ölçebilmek için konuldu; teorik hesaplar onu da içerir.',
      why: 'Her kademe düşük frekansta Vo\'yu öne kaydırır; toplamda +180°\'ye kadar gider. Yüksek frekansta kondansatörler kısa devre olur ve faz 0°\'ye iner.' },
    lag: { kind: 'Gecikme (lag) ağı', target: { minph: true }, charName: 'en büyük gecikmenin olduğu frekans',
      simple: 'Seri bir direnç, sonra toprağa inen (direnç + kondansatör) kolu. Belirli bir aralıkta Vo\'yu geciktirir ama yüksek frekansta tekrar sıfıra döner.',
      why: 'Düşük frekansta C açık devre: Vo ≈ Vi. Yüksek frekansta C kısa devre olur ama R2 kalır, devre basit bir R bölücüye döner: faz yine 0°. Arada faz negatif olur ve bir yerde en büyük gecikmeye ulaşır.' },
    lead: { kind: 'Öncelik (lead) ağı', target: { maxph: true }, charName: 'en büyük önceliğin olduğu frekans',
      simple: 'Paralel R1∥C1 seri kolu ve toprağa inen R2. Belirli bir aralıkta Vo\'yu öne alır.',
      why: 'Düşük frekansta C1 açık devre: devre R1–R2 bölücüsü (faz 0°). Yüksek frekansta C1 R1\'i kısa devre eder: Vo ≈ Vi (faz 0°). Arada C1 üzerinden önden giden akım Vo\'yu öne kaydırır.' },
    twint: { kind: 'Twin-T çentik (notch) filtresi', target: { mingain: true }, charName: 'çentik frekansı (çıkış neredeyse sıfır)',
      simple: 'İki T devresi paralel: biri R–R (ortasında toprağa C), diğeri C–C (ortasında toprağa R). Tek bir frekansı neredeyse tamamen yok eder.',
      why: 'Çentik frekansında iki yoldan gelen sinyaller eşit büyüklükte ve ters fazda olur, birbirini götürür: Vo ≈ 0. Bu frekansın iki yanında faz aniden +90° ile −90° arasında atlar.' },
    diff: { kind: 'Op-amp türev alıcı (differentiator)', target: { gain: 1 }, charName: 'kazancın 1 olduğu frekans f = 1/(2πR1C1)',
      simple: 'Girişte bir kondansatör (C1), op-amp\'ın − ucu ile çıkışı arasında bir direnç (R1). + ucu toprakta. Çıkış, girişin <b>ne kadar hızlı değiştiğiyle</b> orantılıdır: v<sub>o</sub> = −R1·C1·dv<sub>i</sub>/dt.',
      why: 'Op-amp − ucunu + ucuyla aynı gerilimde (0 V, "sanal toprak") tutar. C1\'den geçen akım i = C1·dv<sub>i</sub>/dt olur ve bu akımın tamamı R1\'den geçer: v<sub>o</sub> = −R1·i. Sinüste kazanç ωR1C1 olur (frekansla artar), Vo Vi\'den 90° geride. Üçgende eğim sabit olduğu için çıkış <b>kare dalga</b> olur. Op-amp beslemeden (±15 V) büyük gerilim veremez: hesaplanan çıkış ±13 V\'u geçerse dalga kırpılır (doyum).' },
    rc_loaded: { kind: 'Yüklü RC alçak geçiren', target: { ph: -45 }, charName: 'kesim frekansı (φ = −45°)',
      simple: 'Alçak geçiren RC filtrenin çıkışına bir yük direnci (R2) bağlanmış. Yük, kazancı ve kesim frekansını değiştirir.',
      why: 'Düşük frekansta C açık devre: devre R1–R2 bölücüsü, kazanç R2/(R1+R2). Kesim frekansı R1∥R2 ile belirlenir: f_c = 1/(2π (R1∥R2) C).' },
  };

  /* ---------------- devre tanımları ---------------- */
  const L = (def) => def;   // okunurluk
  const wien = (R1, C1, R2, C2) => ({ type: 'wien', ladder: [{ ser: E('R', R1) }, { ser: E('C', C1) }, { sh: E('C', C2) }, { sh: E('R', R2) }], labels: ['Vi', 'A', 'Vo'], sense: 'R1' });
  const rc_lp = (R, C) => ({ type: 'rc_lp', ladder: [{ ser: E('R', R) }, { sh: E('C', C) }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const cr_hp = (C, R) => ({ type: 'cr_hp', ladder: [{ ser: E('C', C) }, { sh: E('R', R) }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const rl_hp = (R, Lv) => ({ type: 'rl_hp', ladder: [{ ser: E('R', R) }, { sh: E('L', Lv) }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const lr_lp = (Lv, R) => ({ type: 'lr_lp', ladder: [{ ser: E('L', Lv) }, { sh: E('R', R) }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const rlc_bp = (Lv, C, R) => ({ type: 'rlc_bp', ladder: [{ ser: E('L', Lv) }, { ser: E('C', C) }, { sh: E('R', R) }], labels: ['Vi', 'A', 'Vo'], sense: 'R1' });
  const rlc_lp = (R, Lv, C) => ({ type: 'rlc_lp', ladder: [{ ser: E('R', R) }, { ser: E('L', Lv) }, { sh: E('C', C) }], labels: ['Vi', 'A', 'Vo'], sense: 'R1' });
  const tank = (R, Lv, C) => ({ type: 'tank', ladder: [{ ser: E('R', R) }, { sh: E('L', Lv) }, { sh: E('C', C) }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const rc2_lp = (R1, C1, R2, C2) => ({ type: 'rc2_lp', ladder: [{ ser: E('R', R1) }, { sh: E('C', C1) }, { ser: E('R', R2) }, { sh: E('C', C2) }], labels: ['Vi', 'A', 'Vo'], sense: 'R1' });
  const cr2_hp = (Rs, C1, R1, C2, R2) => ({ type: 'cr2_hp', ladder: [{ ser: E('R', Rs, 'Rs') }, { ser: E('C', C1) }, { sh: E('R', R1) }, { ser: E('C', C2) }, { sh: E('R', R2) }], labels: ['Vi', 'A', 'B', 'Vo'], sense: 'Rs' });
  const lag = (R1, R2, C) => ({ type: 'lag', ladder: [{ ser: E('R', R1) }, { sh: [E('R', R2), E('C', C)] }], labels: ['Vi', 'Vo'], sense: 'R1' });
  const lead = (R1, C1, R2) => ({ type: 'lead', ladder: [{ ser: { par: [E('R', R1), E('C', C1)] } }, { sh: E('R', R2) }], labels: ['Vi', 'Vo'], sense: 'R2' });
  const twint = (Rs, R, C, R3, C3) => ({ type: 'twint', custom: 'twint', vals: { Rs, R, C, R3, C3 }, labels: [], sense: 'Rs' });
  const rc_loaded = (R1, R2, C) => ({ type: 'rc_loaded', ladder: [{ ser: E('R', R1) }, { sh: E('R', R2) }, { sh: E('C', C) }], labels: ['Vi', 'Vo'], sense: 'R1' });

  const diff = (R, C) => ({ type: 'diff', custom: 'diff', vals: { R, C }, labels: [], sense: null });

  const SW_LOW = [20, 50, 100, 200, 500, 1000, 3000];
  const DEFS = [
    L({ id: 'wien', group: 'lab', title: 'Lab 1 — Wien RC ağı', preset: 'wien', f: 50, vpp: 4, sweep: [10, 30, 50, 100, 300, 1000, 3000], ...wien(1000, 1e-6, 1000, 1e-6) }),
    // Prelab 02: LM741 (±15 V) ile türev alıcı. Tablo 1: 1 kHz sinüs; Tablo 2: üçgen dalga taraması (kazanç Vo,pp/Vi,pp)
    L({ id: 'lab2', group: 'lab', isNew: true, title: 'Lab 2 — Op-amp türev alıcı', f: 1000, vpp: 8, vChips: [8, 10, 12], sweep: [100, 250, 500, 600, 750, 900, 1000], ...diff(1000, 1e-6) }),

    L({ id: 'l_rclp', group: 'learn', title: 'RC alçak geçiren', f: 100, vpp: 4, sweep: [20, 50, 100, 159.2, 300, 1000, 3000], ...rc_lp(1000, 1e-6) }),
    L({ id: 'l_crhp', group: 'learn', title: 'CR yüksek geçiren', f: 100, vpp: 4, sweep: [20, 50, 100, 159.2, 300, 1000, 3000], ...cr_hp(1e-6, 1000) }),
    L({ id: 'l_rlhp', group: 'learn', title: 'RL yüksek geçiren', f: 1000, vpp: 4, sweep: [200, 500, 1000, 1592, 3000, 6000, 15000], ...rl_hp(100, 10e-3) }),
    L({ id: 'l_lrlp', group: 'learn', title: 'LR alçak geçiren', f: 1000, vpp: 4, sweep: [200, 500, 1000, 1592, 3000, 6000, 15000], ...lr_lp(10e-3, 100) }),
    L({ id: 'l_rlcbp', group: 'learn', title: 'Seri RLC band geçiren', f: 1000, vpp: 4, sweep: [300, 600, 1000, 1592, 2500, 4000, 8000], ...rlc_bp(10e-3, 1e-6, 100) }),
    L({ id: 'l_rlclp', group: 'learn', title: 'Seri RLC — çıkış C üzerinde', f: 1000, vpp: 4, sweep: [300, 600, 1000, 1592, 2500, 4000, 8000], ...rlc_lp(100, 10e-3, 1e-6) }),
    L({ id: 'l_tank', group: 'learn', title: 'Paralel LC tank', f: 1000, vpp: 4, sweep: [300, 600, 1000, 1592, 2500, 4000, 8000], ...tank(1000, 10e-3, 1e-6) }),
    L({ id: 'l_rc2', group: 'learn', title: 'İki kademeli RC', f: 100, vpp: 4, sweep: [20, 50, 100, 159.2, 300, 500, 1000], ...rc2_lp(1000, 1e-6, 1000, 1e-6) }),
    L({ id: 'l_cr2', group: 'learn', title: 'İki kademeli CR', f: 100, vpp: 4, sweep: [30, 50, 100, 200, 500, 1000, 3000], ...cr2_hp(1000, 1e-6, 1000, 1e-6, 1000) }),
    L({ id: 'l_lag', group: 'learn', title: 'Gecikme (lag) ağı', f: 200, vpp: 4, sweep: SW_LOW, ...lag(1000, 220, 1e-6) }),
    L({ id: 'l_lead', group: 'learn', title: 'Öncelik (lead) ağı', f: 200, vpp: 4, sweep: SW_LOW, ...lead(10e3, 100e-9, 1000) }),
    L({ id: 'l_twint', group: 'learn', title: 'Twin-T çentik filtresi', f: 100, vpp: 4, sweep: [20, 50, 100, 159.2, 300, 1000, 3000], ...twint(1000, 1000, 1e-6, 500, 2e-6) }),
    L({ id: 'l_rcload', group: 'learn', title: 'Yüklü RC alçak geçiren', f: 100, vpp: 4, sweep: [20, 50, 100, 318, 500, 1000, 3000], ...rc_loaded(1000, 1000, 1e-6) }),

    L({ id: 't01', group: 'test', title: 'Test 1 — RC alçak geçiren', f: 200, vpp: 8, sweep: SW_LOW, ...rc_lp(2200, 0.47e-6) }),
    L({ id: 't02', group: 'test', title: 'Test 2 — CR yüksek geçiren', f: 300, vpp: 4, sweep: [50, 100, 200, 300, 500, 1000, 3000], ...cr_hp(0.1e-6, 4700) }),
    L({ id: 't03', group: 'test', title: 'Test 3 — Wien ağı (farklı değerler)', f: 500, vpp: 8, sweep: [50, 100, 300, 500, 1000, 3000, 10000], ...wien(2200, 0.1e-6, 2200, 0.1e-6) }),
    L({ id: 't04', group: 'test', title: 'Test 4 — RL yüksek geçiren', f: 1000, vpp: 4, sweep: [200, 500, 1000, 2000, 3000, 6000, 15000], ...rl_hp(220, 22e-3) }),
    L({ id: 't05', group: 'test', title: 'Test 5 — LR alçak geçiren', f: 2000, vpp: 4, sweep: [200, 500, 1000, 2000, 3000, 6000, 15000], ...lr_lp(47e-3, 470) }),
    L({ id: 't06', group: 'test', title: 'Test 6 — Seri RLC (yüksek Q)', f: 2000, vpp: 4, sweep: [500, 1000, 1500, 2000, 2300, 3000, 5000], ...rlc_bp(10e-3, 0.47e-6, 47) }),
    L({ id: 't07', group: 'test', title: 'Test 7 — İki kademeli RC', f: 200, vpp: 8, sweep: SW_LOW, ...rc2_lp(4700, 0.1e-6, 4700, 0.1e-6) }),
    L({ id: 't08', group: 'test', title: 'Test 8 — Gecikme ağı', f: 300, vpp: 4, sweep: [20, 50, 100, 300, 1000, 3000, 10000], ...lag(2200, 470, 0.47e-6) }),
    L({ id: 't09', group: 'test', title: 'Test 9 — Öncelik ağı', f: 400, vpp: 4, sweep: [20, 50, 100, 400, 1000, 3000, 10000], ...lead(22e3, 47e-9, 2200) }),
    L({ id: 't10', group: 'test', title: 'Test 10 — Twin-T çentik', f: 100, vpp: 4, sweep: [20, 50, 100, 150, 300, 1000, 3000], ...twint(4700, 10e3, 0.1e-6, 5000, 0.2e-6) }),
    L({ id: 't11', group: 'test', title: 'Test 11 — RLC, çıkış C üzerinde', f: 1500, vpp: 4, sweep: [300, 600, 1000, 1500, 2200, 4000, 8000], ...rlc_lp(220, 22e-3, 0.22e-6) }),
    L({ id: 't12', group: 'test', title: 'Test 12 — Paralel LC tank', f: 2000, vpp: 4, sweep: [500, 1000, 1500, 2000, 2500, 4000, 8000], ...tank(2200, 47e-3, 0.1e-6) }),
    L({ id: 't13', group: 'test', title: 'Test 13 — İki kademeli CR', f: 500, vpp: 8, sweep: [100, 200, 300, 500, 1000, 3000, 10000], ...cr2_hp(4700, 22e-9, 10e3, 22e-9, 10e3) }),
    L({ id: 't14', group: 'test', title: 'Test 14 — Eşit olmayan Wien', f: 100, vpp: 4, sweep: SW_LOW, ...wien(1000, 1e-6, 2200, 0.47e-6) }),
    L({ id: 't15', group: 'test', title: 'Test 15 — Yüklü RC', f: 300, vpp: 8, sweep: [50, 100, 300, 500, 1000, 3000, 10000], ...rc_loaded(2200, 4700, 0.22e-6) }),
    L({ id: 't16', group: 'test', title: 'Test 16 — −45° frekansını bul', f: 1000, vpp: 4, sweep: [100, 300, 600, 1000, 2000, 5000, 10000], ...rc_lp(3300, 47e-9) }),
  ];
  const get = (id) => DEFS.find(d => d.id === id);
  const info = (d) => TYPES[d.type];

  /* ---------------- tezgâha çizim ---------------- */
  const RAIL = 110, GNDY = 360;
  function build(id) {
    const d = get(id); if (!d) return false;
    if (d.preset) { B.preset(d.preset); return true; }
    B.clear();
    B.add('COMP', 70, 400);
    const P = B.model.probes;
    P[0].x10 = P[1].x10 = true;
    const fg = B.add('FG', 140, 230, 0, { wave: 'sine', freq: d.f, vpp: d.vpp, offset: 0 });
    const g0 = B.add('GND', 140, GNDY);
    B.connect({ c: fg.id, p: 1 }, { c: g0.id, p: 0 });
    if (d.custom === 'twint') return buildTwinT(d, fg, g0);
    if (d.custom === 'diff') return buildDiff(d, fg, g0);
    const add = (e, x, y, rot) => B.add(e.t, x, y, rot, e.name ? { value: e.v, name: e.name } : { value: e.v });
    const W = (a, pa, b, pb) => B.connect({ c: a.id, p: pa }, { c: b.id, p: pb });
    let x = 240, node = { c: fg.id, p: 0 }, first = true, k = 0;
    let lastShunt = null;
    const label = (ref) => { const nm = d.labels[k]; if (nm) B.model.netNames[ref.c + ':' + ref.p] = nm; };
    for (const it of d.ladder) {
      if (it.ser) {
        if (it.ser.par) {
          const a = add(it.ser.par[0], x + 40, RAIL, 0), b = add(it.ser.par[1], x + 40, RAIL - 60, 0);
          W(a, 0, b, 0); W(a, 1, b, 1);
          if (first) { W(a, 0, fg, 0); label({ c: a.id, p: 0 }); } else W(B.byId(node.c), node.p, a, 0);
          node = { c: a.id, p: 1 };
        } else {
          const a = add(it.ser, x + 40, RAIL, 0);
          if (first) { W(a, 0, fg, 0); label({ c: a.id, p: 0 }); } else W(B.byId(node.c), node.p, a, 0);
          node = { c: a.id, p: 1 };
        }
        first = false; k++; label(node); x += 120;
      } else if (it.sh) {
        const xb = x;
        const chain = Array.isArray(it.sh) ? it.sh : [it.sh];
        let top, bot;
        if (chain.length === 1) { top = bot = add(chain[0], xb, 230, 1); }
        else { top = add(chain[0], xb, 230, 1); bot = add(chain[1], xb, 330, 1); W(top, 1, bot, 0); }
        W(B.byId(node.c), node.p, top, 0);
        const g = B.add('GND', xb, GNDY + (chain.length > 1 ? 40 : 0));
        W(bot, 1, g, 0);
        lastShunt = { top, g };
        x += 80;
      }
    }
    // problar: CH1 = Vi (ilk elemanın sol ucu), CH2 = Vo (son paralel kolun üstü)
    const viRef = Object.keys(B.model.netNames).find(k2 => B.model.netNames[k2] === 'Vi').split(':').map(Number);
    P[0].tip = { c: viRef[0], p: viRef[1] }; P[0].gnd = { c: g0.id, p: 0 };
    P[1].tip = { c: lastShunt.top.id, p: 0 }; P[1].gnd = { c: lastShunt.g.id, p: 0 };
    B.changed();
    return true;
  }
  function buildTwinT(d, fg, g0) {
    const v = d.vals, P = B.model.probes;
    const W = (a, pa, b, pb) => B.connect({ c: a.id, p: pa }, { c: b.id, p: pb });
    const rs = B.add('R', 240, 110, 0, { value: v.Rs, name: 'Rs' });
    const r1 = B.add('R', 360, 110, 0, { value: v.R, name: 'R1' });
    const r2 = B.add('R', 480, 110, 0, { value: v.R, name: 'R2' });
    const c3 = B.add('C', 420, 190, 1, { value: v.C3, name: 'C3' });
    const g3 = B.add('GND', 420, 260);
    const c1 = B.add('C', 340, 300, 0, { value: v.C, name: 'C1' });
    const c2 = B.add('C', 500, 300, 0, { value: v.C, name: 'C2' });
    const r3 = B.add('R', 420, 360, 1, { value: v.R3, name: 'R3' });
    const g4 = B.add('GND', 420, 430);
    W(rs, 0, fg, 0); W(rs, 1, r1, 0); W(r1, 1, r2, 0); W(r1, 1, c3, 0); W(c3, 1, g3, 0);
    W(rs, 1, c1, 0); W(c1, 1, c2, 0); W(c1, 1, r3, 0); W(r3, 1, g4, 0); W(r2, 1, c2, 1);
    Object.assign(B.model.netNames, { [rs.id + ':0']: 'Vi', [rs.id + ':1']: 'A', [r2.id + ':1']: 'Vo' });
    P[0].tip = { c: rs.id, p: 0 }; P[0].gnd = { c: g0.id, p: 0 };
    P[1].tip = { c: r2.id, p: 1 }; P[1].gnd = { c: g3.id, p: 0 };
    B.changed();
    return true;
  }

  function buildDiff(d, fg, g0) {
    const v = d.vals, P = B.model.probes;
    const W = (a, pa, b, pb) => B.connect({ c: a.id, p: pa }, { c: b.id, p: pb });
    const c1 = B.add('C', 300, 190, 0, { value: v.C, name: 'C1' });
    const u1 = B.add('OA', 460, 210, 0, { vsat: 13 });              // − (420,190), + (420,230), çıkış (500,210)
    const r1 = B.add('R', 460, 110, 0, { value: v.R, name: 'R1' });
    const g1 = B.add('GND', 420, 310), g2 = B.add('GND', 600, 310);
    W(c1, 0, fg, 0); W(c1, 1, u1, 0); W(u1, 0, r1, 0); W(r1, 1, u1, 2); W(u1, 1, g1, 0);
    Object.assign(B.model.netNames, { [c1.id + ':0']: 'Vi', [c1.id + ':1']: 'V−', [u1.id + ':2']: 'Vo' });
    P[0].tip = { c: c1.id, p: 0 }; P[0].gnd = { c: g0.id, p: 0 };
    P[1].tip = { c: u1.id, p: 2 }; P[1].gnd = { c: g2.id, p: 0 };
    B.changed();
    return true;
  }

  /* ---------------- AC (fazör) analiz ---------------- */
  // Karmaşık doğrusal sistem: tezgâhtaki netlist'ten, FG = 1∠0° V, diğer kaynaklar 0
  function acSolve(f) {
    const net = B.netlist({ compFreq: 1000 });
    const n = net.nNodes - 1; if (n < 1) return null;
    const w = 2 * Math.PI * f;
    const ar = new Float64Array(n * n), ai = new Float64Array(n * n), br = new Float64Array(n), bi = new Float64Array(n);
    const st = (a, b, gr, gi) => {
      if (a > 0) { ar[(a - 1) * n + a - 1] += gr; ai[(a - 1) * n + a - 1] += gi; }
      if (b > 0) { ar[(b - 1) * n + b - 1] += gr; ai[(b - 1) * n + b - 1] += gi; }
      if (a > 0 && b > 0) { ar[(a - 1) * n + b - 1] -= gr; ai[(a - 1) * n + b - 1] -= gi; ar[(b - 1) * n + a - 1] -= gr; ai[(b - 1) * n + a - 1] -= gi; }
    };
    for (let i = 0; i < n; i++) ar[i * n + i] += 1e-12;
    for (const e of net.elems) {
      switch (e.t) {
        case 'R': st(e.a, e.b, 1 / e.R, 0); break;
        case 'C': st(e.a, e.b, 0, w * e.C); break;
        case 'L': st(e.a, e.b, 0, -1 / (w * e.L)); break;
        case 'D': st(e.a, e.b, 1e-9, 0); break;
        case 'V': { st(e.a, e.b, 1 / e.R, 0); if (e.ac) { const I = 1 / e.R; if (e.a > 0) br[e.a - 1] += I; if (e.b > 0) br[e.b - 1] -= I; } break; }
        case 'OA': if (e.o > 0) { const o = e.o - 1; ar[o * n + o] += 1 / e.Ro; if (e.p > 0) ar[o * n + e.p - 1] -= e.A / e.Ro; if (e.n > 0) ar[o * n + e.n - 1] += e.A / e.Ro; } break;
      }
    }
    // kısmi pivotlu Gauss eliminasyonu (karmaşık)
    for (let k = 0; k < n; k++) {
      let p = k, mx = -1;
      for (let i = k; i < n; i++) { const m = Math.hypot(ar[i * n + k], ai[i * n + k]); if (m > mx) { mx = m; p = i; } }
      if (p !== k) {
        for (let j = 0; j < n; j++) { let t = ar[k * n + j]; ar[k * n + j] = ar[p * n + j]; ar[p * n + j] = t; t = ai[k * n + j]; ai[k * n + j] = ai[p * n + j]; ai[p * n + j] = t; }
        let t = br[k]; br[k] = br[p]; br[p] = t; t = bi[k]; bi[k] = bi[p]; bi[p] = t;
      }
      const dr = ar[k * n + k], di = ai[k * n + k], dd = dr * dr + di * di || 1e-300;
      for (let i = k + 1; i < n; i++) {
        const xr = ar[i * n + k], xi = ai[i * n + k];
        const fr = (xr * dr + xi * di) / dd, fi = (xi * dr - xr * di) / dd;
        if (!fr && !fi) continue;
        for (let j = k; j < n; j++) {
          const yr = ar[k * n + j], yi = ai[k * n + j];
          ar[i * n + j] -= fr * yr - fi * yi; ai[i * n + j] -= fr * yi + fi * yr;
        }
        br[i] -= fr * br[k] - fi * bi[k]; bi[i] -= fr * bi[k] + fi * br[k];
      }
    }
    const vr = new Float64Array(n + 1), vi = new Float64Array(n + 1);
    for (let i = n - 1; i >= 0; i--) {
      let sr = br[i], si = bi[i];
      for (let j = i + 1; j < n; j++) { const yr = ar[i * n + j], yi = ai[i * n + j]; sr -= yr * vr[j + 1] - yi * vi[j + 1]; si -= yr * vi[j + 1] + yi * vr[j + 1]; }
      const dr = ar[i * n + i], di = ai[i * n + i], dd = dr * dr + di * di || 1e-300;
      vr[i + 1] = (sr * dr + si * di) / dd; vi[i + 1] = (si * dr - sr * di) / dd;
    }
    return { net, vr, vi };
  }
  const cdiv = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const deg = (z) => Math.atan2(z[1], z[0]) * 180 / Math.PI;

  /** Akım ölçme direnci: { comp, hi, lo (null = toprak) } — hi tarafı Vi'ye yakın uç */
  function sense(d = curDef()) {
    if (!d) return null;
    const c = B.model.comps.find(k => k.name === d.sense && k.type === 'R'); if (!c) return null;
    const list = B.nodes();
    const n0 = B.nodeOf({ c: c.id, p: 0 }, list), n1 = B.nodeOf({ c: c.id, p: 1 }, list);
    if (!n0 || !n1) return null;
    let hi = n0, lo = n1;
    if (n0.gnd || n1.name === 'Vi') { hi = n1; lo = n0; }
    return { comp: c, hi: hi.name, lo: lo.gnd ? null : lo.name, hiPin: hi.pins[0], loPin: lo.gnd ? null : lo.pins[0] };
  }

  /** Teorik yanıt (Vi düğümüne göre). Dönüş: { H, ph, Irel (A/V), iph, vrRel } */
  let cache = { key: '', map: new Map() };
  function response(f) {
    const key = B.model.version + '|' + curId;
    if (cache.key !== key) cache = { key, map: new Map() };
    if (cache.map.has(f)) return cache.map.get(f);
    let out = null;
    const r = acSolve(f);
    if (r) {
      const list = B.nodes();
      const V = (name) => { const g = list.find(x => x.name === name); if (!g) return null; if (g.gnd) return [0, 0]; const k = r.net.pin(g.pins[0].c, g.pins[0].p); return [r.vr[k], r.vi[k]]; };
      const vi = V('Vi'), vo = V('Vo');
      if (vi && vo && Math.hypot(vi[0], vi[1]) > 1e-12) {
        const H = cdiv(vo, vi);
        out = { H: Math.hypot(H[0], H[1]), ph: deg(H) };
        const s = sense();
        if (s) {
          const a = V(s.hi), b = s.lo ? V(s.lo) : [0, 0];
          if (a && b) { const dv = cdiv([a[0] - b[0], a[1] - b[1]], vi); out.vrRel = Math.hypot(dv[0], dv[1]); out.Irel = out.vrRel / s.comp.value; out.iph = deg(dv); }
        }
      }
    }
    cache.map.set(f, out);
    return out;
  }

  /** Karakteristik frekans: tipe göre faz hedefi / en büyük-en küçük faz / en küçük kazanç */
  function charFreq(d = curDef()) {
    if (!d) return null;
    const t = info(d).target, pts = [];
    for (let e = 0; e <= 500; e++) { const f = Math.pow(10, 0.5 + e * 4.5 / 500); const r = response(f); if (r) pts.push([f, r]); }
    if (!pts.length) return null;
    if (t.gain !== undefined) {
      for (let i = 1; i < pts.length; i++) {
        if ((pts[i - 1][1].H - t.gain) * (pts[i][1].H - t.gain) > 0) continue;
        let lo = pts[i - 1][0], hi = pts[i][0];
        const up = pts[i][1].H > pts[i - 1][1].H;
        for (let k = 0; k < 40; k++) { const m = Math.sqrt(lo * hi); if ((response(m).H < t.gain) === up) lo = m; else hi = m; }
        return Math.sqrt(lo * hi);
      }
      return null;
    }
    if (t.ph !== undefined) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1][1].ph - t.ph, b = pts[i][1].ph - t.ph;
        if (a === 0) return pts[i - 1][0];
        if (a * b < 0 && Math.abs(a - b) < 90) { let lo = pts[i - 1][0], hi = pts[i][0]; for (let k = 0; k < 40; k++) { const m = Math.sqrt(lo * hi); const v = response(m).ph - t.ph; if ((v < 0) === (a < 0)) lo = m; else hi = m; } return Math.sqrt(lo * hi); }
      }
      return null;
    }
    let best = pts[0];
    for (const p of pts) {
      if (t.minph && p[1].ph < best[1].ph) best = p;
      if (t.maxph && p[1].ph > best[1].ph) best = p;
      if (t.mingain && p[1].H < best[1].H) best = p;
    }
    return best[0];
  }

  /** Şema metni (kılavuzda gösterilir) — tezgâhtaki güncel değerlerle */
  function diagram(d = curDef()) {
    const v = (n) => { const c = B.model.comps.find(k => k.name === n); return c ? fmt(c.value, c.type === 'R' ? 'Ω' : c.type === 'C' ? 'F' : 'H') : '?'; };
    switch (d.type) {
      case 'wien': return `Vi ─ R1(${v('R1')}) ─ A ─ C1(${v('C1')}) ─ Vo ─┬─ C2(${v('C2')}) ─ GND<br>└─ R2(${v('R2')}) ─ GND`;
      case 'rc_lp': return `Vi ─ R1(${v('R1')}) ─ Vo ─ C1(${v('C1')}) ─ GND`;
      case 'cr_hp': return `Vi ─ C1(${v('C1')}) ─ Vo ─ R1(${v('R1')}) ─ GND`;
      case 'rl_hp': return `Vi ─ R1(${v('R1')}) ─ Vo ─ L1(${v('L1')}) ─ GND`;
      case 'lr_lp': return `Vi ─ L1(${v('L1')}) ─ Vo ─ R1(${v('R1')}) ─ GND`;
      case 'rlc_bp': return `Vi ─ L1(${v('L1')}) ─ A ─ C1(${v('C1')}) ─ Vo ─ R1(${v('R1')}) ─ GND`;
      case 'rlc_lp': return `Vi ─ R1(${v('R1')}) ─ A ─ L1(${v('L1')}) ─ Vo ─ C1(${v('C1')}) ─ GND`;
      case 'tank': return `Vi ─ R1(${v('R1')}) ─ Vo ─┬─ L1(${v('L1')}) ─ GND<br>└─ C1(${v('C1')}) ─ GND`;
      case 'rc2_lp': return `Vi ─ R1(${v('R1')}) ─ A ─ R2(${v('R2')}) ─ Vo<br>A ─ C1(${v('C1')}) ─ GND · Vo ─ C2(${v('C2')}) ─ GND`;
      case 'cr2_hp': return `Vi ─ Rs(${v('Rs')}) ─ A ─ C1(${v('C1')}) ─ B ─ C2(${v('C2')}) ─ Vo<br>B ─ R1(${v('R1')}) ─ GND · Vo ─ R2(${v('R2')}) ─ GND`;
      case 'lag': return `Vi ─ R1(${v('R1')}) ─ Vo ─ R2(${v('R2')}) ─ C1(${v('C1')}) ─ GND`;
      case 'lead': return `Vi ─ [R1(${v('R1')}) ∥ C1(${v('C1')})] ─ Vo ─ R2(${v('R2')}) ─ GND`;
      case 'twint': return `Vi ─ Rs(${v('Rs')}) ─ A ─ R1(${v('R1')}) ─ M1 ─ R2(${v('R2')}) ─ Vo ; M1 ─ C3(${v('C3')}) ─ GND<br>A ─ C1(${v('C1')}) ─ M2 ─ C2(${v('C2')}) ─ Vo ; M2 ─ R3(${v('R3')}) ─ GND`;
      case 'diff': return `Vi ─ C1(${v('C1')}) ─ V− (op-amp − ucu) ─ R1(${v('R1')}) ─ Vo (op-amp çıkışı)<br>op-amp + ucu ─ GND · LM741, ±15 V besleme (çıkış en fazla ±13 V)`;
      case 'rc_loaded': return `Vi ─ R1(${v('R1')}) ─ Vo ─┬─ R2(${v('R2')}) ─ GND<br>└─ C1(${v('C1')}) ─ GND`;
    }
    return '';
  }

  let curId = 'wien';
  function curDef() { return get(curId); }
  function setCurrent(id) { curId = id; }

  return { DEFS, TYPES, get, info, build, response, sense, charFreq, diagram, acSolve, setCurrent, get cur() { return curDef(); }, get curId() { return curId; } };
})();
