// Static website for GitHub Pages: download page (site/) at the root + the web app (www/) at /app/.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, '_site');
require('./build-www.js');
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'site'), out, { recursive: true });
fs.cpSync(path.join(root, 'www'), path.join(out, 'app'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('_site/ built');
