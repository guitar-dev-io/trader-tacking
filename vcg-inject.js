// Node entry (Electron main, unit tests). Source: src/vcg-inject.mjs → gen/vcg-inject.js (scripts/build-core.mjs).
const m = require('./gen/vcg-inject.js');
module.exports = m.default || m;
