// Tüm kütüphane devrelerini DOM'suz simüle edip ölçülen kazanç/fazı AC teoriyle karşılaştırır.
// Kullanım: node tools/check-circuits.js            (hepsi, ~4-5 dk)
//           node tools/check-circuits.js l_rclp     (tek devre)
// "<<<" işaretli satırlar sapma demek (20 Hz civarında Autoset'in çalışmaması beklenen bir durumdur;
// lab2'de 1 kHz'de op-amp ±13 V'ta doyar, AC teori doyumu içermez — o satır da beklenen).
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'src');
const files = ['01_units_mna.js', '02_bench_model.js', '02_circuits.js', '03_state.js', '04_sim.js', '05_acq.js', '06_measure.js', '07_math.js'];
let code = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
code += `
const App = { showLevel(){}, levelShowUntil:0 };
function run(n){ for(let i=0;i<n;i++) Acq.tick(1/60); }
const val=(name,s1,s2='CH2')=>Measure.value({name,s1,s2});
const only = process.argv[2];
let bad = 0;
for (const d of Circuits.DEFS) {
  if (only && d.id !== only) continue;
  Circuits.setCurrent(d.id); Circuits.build(d.id);
  const S=State.S; S.ch[0].on=true; S.ch[1].on=true; S.ch[0].atten=S.ch[1].atten=10;
  const out=[];
  for (const f of [d.f, d.sweep[0], d.sweep[d.sweep.length-1]]) {
    const fg=Bench.model.comps.find(c=>c.type==='FG'); fg.freq=f; Bench.changed();
    const ok=Acq.autoset(); run(40);
    const r1=val('Cycle RMS','CH1'), r2=val('Cycle RMS','CH2'), ph=val('Phase','CH1','CH2');
    const th=Circuits.response(f), g = r1&&r2? r2.v/r1.v : NaN;
    const eg = Math.abs(g/th.H-1)*100, ep = ph? Math.abs(((ph.v-th.ph+540)%360)-180) : NaN;
    const flag = (!(eg<4) || !(ep<3)) ? ' <<<' : ''; if (flag) bad++;
    out.push(f+'Hz autoset='+(ok?1:0)+' g='+g.toFixed(4)+'/'+th.H.toFixed(4)+' ph='+(ph?ph.v.toFixed(1):'?')+'/'+th.ph.toFixed(1)+flag);
  }
  const s=Circuits.sense();
  console.log(d.id.padEnd(9), d.type.padEnd(9), 'fchar='+(Circuits.charFreq()||0).toFixed(1), 'sense='+(s?s.comp.name+':'+s.hi+'->'+(s.lo||'GND'):'none'), '|', out.join(' | '));
}
console.log('işaretli satır:', bad);
`;
eval(code);
