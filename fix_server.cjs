const fs = require('fs');
let content = fs.readFileSync('server.ts', 'utf8');
content = content.replace(/req\.params\?\.provider/g, "(req.params as any)?.provider");
fs.writeFileSync('server.ts', content, 'utf8');
