const fs = require('fs');
let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');
content = content.replace(/bg-neutral-900 text-neutral-900/g, 'bg-neutral-900 text-white');
content = content.replace(/bg-neutral-100 text-neutral-100/g, 'bg-neutral-100 text-neutral-900');
fs.writeFileSync('src/components/AdminPanel.tsx', content);
