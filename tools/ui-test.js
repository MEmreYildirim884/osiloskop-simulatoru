// Arayüz duman testi: index.html'i başsız (headless) Chrome'da açar, test betiğini enjekte eder,
// sonuçları ve JavaScript hatalarını yazdırır.
// Kullanım: node build.js && node tools/ui-test.js            (varsayılan: tools/ui-smoke.js)
//           node tools/ui-test.js tools/benim-testim.js
// Test betiği sonucu document.getElementById('out').textContent içine yazmalı.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const testFile = path.resolve(process.argv[2] || path.join(__dirname, 'ui-smoke.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'osc-ui-'));
fs.copyFileSync(testFile, path.join(tmp, 't.js'));
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const inj = '<script>window.__err=[];addEventListener("error",e=>__err.push(e.message+" @"+e.lineno));console.error=(...a)=>__err.push(a.map(x=>x&&x.stack||String(x)).join(" "));</script>';
html = html.replace('<head>', '<head>' + inj).replace('</body>', '<pre id="out"></pre><script src="t.js"></script></body>');
fs.writeFileSync(path.join(tmp, 'index.html'), html);
const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--window-size=1920,1080', '--allow-file-access-from-files', '--virtual-time-budget=600000', '--dump-dom', 'file:///' + path.join(tmp, 'index.html').split(path.sep).join('/')], { encoding: 'utf8', maxBuffer: 64 << 20, timeout: 900000 });
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
console.log(m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : '(çıktı yok — test betiği çalışmadı ya da süre doldu)');
