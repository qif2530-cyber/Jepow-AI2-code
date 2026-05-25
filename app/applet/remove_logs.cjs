const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');
code = code.replace(/fs\.appendFileSync\([^;]+;/g, '');
fs.writeFileSync('server.ts', code);
console.log('Removed all appendFileSync calls');
