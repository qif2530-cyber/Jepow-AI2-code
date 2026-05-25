import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf8');
content = content.replace(/bg-white shadow-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 hover:text-black/g, 'bg-transparent text-neutral-400 hover:bg-white/5 hover:text-white');
fs.writeFileSync('src/App.tsx', content);
console.log('Fixed button styles');
