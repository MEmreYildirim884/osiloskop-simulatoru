/* =====================================================================
 * Tests — kabul kriterleri (istem §4). "Doğruluk testlerini çalıştır" düğmesiyle veya
 * konsoldan Tests.run() ile çalışır. Kullanıcının ayarları ve tezgâhı test sonunda geri yüklenir.
 * ===================================================================== */
const Tests = (() => {
  const run = (n) => { for (let i = 0; i < n; i++) Acq.tick(1 / 60); };
  const val = (name, s1, s2 = 'CH2') => Measure.value({ name, s1, s2 });
  const txt = (name, s1, s2) => Measure.format(val(name, s1, s2));
  const setV = (c, v) => { const S = State.S; S.ch[c].vdivIdx = State.VDIV.findIndex(x => Math.abs(x * S.ch[c].atten - v) < v * 1e-6); S.ch[c].pos = 0; };
  const fg = () => Bench.model.comps.find(c => c.type === 'FG');

  function snapshot() { return { S: JSON.stringify(State.S), B: Bench.snapshot(), run: State.R.run }; }
  function restore(s) {
    State.set(JSON.parse(s.S));
    Bench.restore(s.B); Circuits.setCurrent(Guide.circuit);
    State.R.run = s.run; State.R.single = false; State.R.persistClear = true;
    Sim.rebuild(); Sim.refilterTrig(); Acq.resetArm();
  }

  function all() {
    const out = [];
    const add = (name, expect, got, pass) => out.push({ name, expect, got, pass });
    const snap = snapshot();
    try {
      // 1) Prob kompanzasyon + Autoset
      App.loadPreset('comp'); run(40);
      const pp = val('Pk-Pk', 'CH1'), fr = val('Frequency', 'CH1');
      add('1. Prob kompanzasyon çıkışı, Autoset sonrası', 'Pk-Pk 2.00 V, Frequency 1.000 kHz',
        `Pk-Pk ${txt('Pk-Pk', 'CH1')}, Frequency ${txt('Frequency', 'CH1')} (${Units.fmt(State.vdiv(0), 'V')}/div, ${Units.fmt(State.tdiv(), 's')}/div)`,
        pp && fr && Math.abs(pp.v - 2) < 0.02 && Math.abs(fr.v - 1000) < 1);

      // 2) RC alçak geçiren @ 159 Hz
      App.loadPreset('rc'); run(10);
      setV(0, 0.5); setV(1, 0.5); State.S.trig.level = 0; run(40);
      const a1 = val('Pk-Pk', 'CH1'), a2 = val('Pk-Pk', 'CH2'), r1 = val('Cycle RMS', 'CH1'), r2 = val('Cycle RMS', 'CH2'), ph = val('Phase', 'CH1', 'CH2');
      const ratio = a2 && a1 ? a2.v / a1.v : NaN, ratioR = r2 && r1 ? r2.v / r1.v : NaN;
      add('2. RC filtre (1 kΩ, 1 µF) f = 159.15 Hz', 'CH2/CH1 = 0.707 ± %2, faz −45° ± 2°',
        `CH1 ${txt('Pk-Pk', 'CH1')}, CH2 ${txt('Pk-Pk', 'CH2')} → oran ${ratio.toFixed(4)} (Cycle RMS oranı ${ratioR.toFixed(4)}), Phase ${txt('Phase', 'CH1', 'CH2')}`,
        Math.abs(ratio / Math.SQRT1_2 - 1) <= 0.02 && ph && Math.abs(ph.v + 45) <= 2);
      // Math CH1−CH2 = direnç gerilimi (bilgi amaçlı)
      State.S.math.on = true; State.S.math.kind = 'dual'; State.S.math.op = '−'; run(3);
      const vr = val('Pk-Pk', 'Math');
      add('2b. Math CH1 − CH2 (direnç gerilimi)', '≈ 0.707 × CH1 (≈ 2.76 Vpp)', `Math Pk-Pk ${txt('Pk-Pk', 'Math')}`, vr && Math.abs(vr.v / a1.v - Math.SQRT1_2) < 0.03);
      State.S.math.on = false;

      // 3) Seri RLC frekans taraması
      App.loadPreset('rlc'); run(5);
      const sweep = [1000, 1250, 1591.5, 2000, 2500], rows = [];
      for (const f of sweep) {
        fg().freq = f; Bench.changed(); run(2); Acq.autoset();
        setV(0, 1); setV(1, 0.5); State.S.trig.level = 0; run(30);
        rows.push({ f, amp: val('Cycle RMS', 'CH2'), ph: val('Phase', 'CH1', 'CH2') });
      }
      const best = rows.reduce((b, r) => (r.amp && (!b.amp || r.amp.v > b.amp.v)) ? r : b, rows[0]);
      const at0 = rows.find(r => r.f === 1591.5);
      add('3. Seri RLC (100 Ω, 10 mH, 1 µF) taraması', 'Rezonansta (1.59 kHz) CH2 genliği en büyük, faz ≈ 0°',
        rows.map(r => `${Units.fmt(r.f, 'Hz', 4)}: ${Measure.format(r.amp)} rms, ${Measure.format(r.ph)}`).join(' · '),
        best.f === 1591.5 && at0.ph && Math.abs(at0.ph.v) < 3);

      // 4) Prob uyuşmazlığı
      App.loadPreset('comp'); run(30);
      const ok = val('Pk-Pk', 'CH1');
      Bench.model.probes[0].x10 = false; Bench.changed(); run(40);
      const bad = val('Pk-Pk', 'CH1');
      const clipped = !bad;
      if (clipped) { Acq.autoset(); run(40); }
      const bad2 = val('Pk-Pk', 'CH1');
      add('4. Menü ×10, fiziksel prob ×1', 'Değerler 10 kat büyük (≈ 20 V)',
        `Eşleşik: ${Measure.format(ok)} → uyuşmaz: ${clipped ? '? (ekrandan taşıyor) → Autoset sonrası ' : ''}${Measure.format(bad2)}`,
        ok && bad2 && Math.abs(bad2.v / ok.v - 10) < 0.2);
      Bench.model.probes[0].x10 = true; Bench.changed();

      // 5) Tetik seviyesi sinyalin dışında
      App.loadPreset('comp'); run(30);
      State.S.trig.level = 3.0; State.S.trig.mode = 'Auto'; run(30);
      const edges = [];
      for (let i = 0; i < 6; i++) { run(1); const a = State.R.rec.ch[0]; let k = 1; while (k < a.length && !(a[k - 1] < 1 && a[k] >= 1)) k++; edges.push(k); }
      const stAuto = State.R.status, moving = new Set(edges).size > 1;
      State.S.trig.mode = 'Normal'; run(20);
      const seq = State.R.recSeq; run(40);
      const frozen = seq === State.R.recSeq, stNorm = State.R.status;
      add('5. Tetik seviyesi (3 V) sinyalin dışında', 'Auto: "Auto" ve dalga kayar · Normal: ekran donar',
        `Auto: durum "${stAuto}", ilk kenar konumları [${edges.join(', ')}] → ${moving ? 'kayıyor' : 'sabit'} · Normal: durum "${stNorm}", kayıt ${frozen ? 'değişmedi (dondu)' : 'değişti'}`,
        stAuto === 'Auto' && moving && frozen && stNorm === 'Trig?');

      // 6) EE212 Lab 1 — Wien RC ağı @ 50 Hz (teori: |H| = 0.2409, φ = +43.72°)
      App.loadPreset('wien'); run(40);
      const wi = val('Pk-Pk', 'CH1'), wo = val('Pk-Pk', 'CH2'), wr1 = val('Cycle RMS', 'CH1'), wr2 = val('Cycle RMS', 'CH2'), wph = val('Phase', 'CH1', 'CH2');
      const wg = wr1 && wr2 ? wr2.v / wr1.v : NaN;
      add('6. Lab 1 Wien RC ağı (1 kΩ, 1 µF) f = 50 Hz', 'Vo/Vi = 0.2409 ± %2, φ = +43.72° ± 1.5°',
        `CH1 ${txt('Pk-Pk', 'CH1')}, CH2 ${txt('Pk-Pk', 'CH2')} → oran ${wi && wo ? (wo.v / wi.v).toFixed(4) : '?'} (Cycle RMS oranı ${wg.toFixed(4)}), Phase ${txt('Phase', 'CH1', 'CH2')}`,
        Math.abs(wg / 0.24091 - 1) <= 0.02 && wph && Math.abs(wph.v - 43.72) <= 1.5);
    } catch (e) {
      add('HATA', '', String(e && e.stack || e), false);
    }
    restore(snap);
    return out;
  }

  /** Testleri çalıştırıp sonuç tablosunu gösterir */
  function runUi() {
    const modal = document.getElementById('modal'), box = document.getElementById('modalBox');
    box.innerHTML = '<h3>Doğruluk testleri çalışıyor…</h3><p>Devre çözücüsü ve osiloskop motoru her test için birkaç yüz kare koşturuluyor.</p>';
    modal.style.display = 'flex';
    setTimeout(() => {
      const t0 = performance.now();
      const res = all();
      const ms = performance.now() - t0;
      console.table(res);
      box.innerHTML = `<h3>Doğruluk testleri (${(ms / 1000).toFixed(1)} s)</h3>
        <table><tr><th>Test</th><th>Beklenen</th><th>Ölçülen</th><th>Sonuç</th></tr>
        ${res.map(r => `<tr><td>${r.name}</td><td>${r.expect}</td><td>${r.got}</td><td class="${r.pass ? 'pass' : 'fail'}">${r.pass ? 'GEÇTİ' : 'KALDI'}</td></tr>`).join('')}</table>
        <p style="color:#9aa3ad">Ayarlarınız ve tezgâh test sonrası geri yüklendi.</p>
        <button class="ui" onclick="document.getElementById('modal').style.display='none'">Kapat</button>`;
    }, 50);
  }
  return { all, run: all, runUi };
})();
