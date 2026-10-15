// Kaynak modülleri tek HTML dosyasında birleştirir:  node build.js   (ya da: npm run build)
// Çıktı: index.html (GitHub Pages bunu yayınlar) + sw.js içindeki sürüm etiketi güncellenir.
const fs = require('fs'), path = require('path');
const root = __dirname, dir = path.join(root, 'src');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

const parts = fs.readdirSync(dir).filter(f => /^\d\d_/.test(f)).sort();
let out = parts.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
out = out.replace(/__APP_VERSION__/g, version).replace(/__BUILD_TIME__/g, stamp);
fs.writeFileSync(path.join(root, 'index.html'), out);

// service worker: önbellek adı sürüme bağlı → yeni sürümde eski önbellek silinir
const swPath = path.join(root, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8').replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
fs.writeFileSync(swPath, sw);

console.log(`index.html v${version} (${(out.length / 1024).toFixed(0)} KB) ← ${parts.join(' ')}`);
