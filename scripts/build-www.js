// Builds the web/Android renderer into www/ (Vite, --mode web). Kept as a script so older callers keep working.
const path = require('path');
module.exports = import('vite').then(({ build }) => build({ configFile: path.join(__dirname, '..', 'vite.config.mjs'), mode: 'web', logLevel: 'warn' }))
  .then(() => console.log('www/ built'))
  .catch((e) => { console.error(e); process.exit(1); });
