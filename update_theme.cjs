const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? 
      walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const filesToProcess = [];
walkDir('src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    filesToProcess.push(filePath);
  }
});

filesToProcess.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Backgrounds: Dark to Light
  content = content.replace(/bg-\[#141414\]/g, 'bg-white');
  content = content.replace(/bg-\[#0a0a0a\]/gi, 'bg-[#F9FAFB]');
  content = content.replace(/bg-\[#0D0D0F\]\/90/gi, 'bg-white/90');
  content = content.replace(/bg-\[#0D0D0F\]\/80/gi, 'bg-white/80');
  content = content.replace(/bg-\[#0D0D0F\]\/50/gi, 'bg-[#F9FAFB]/50');
  content = content.replace(/bg-\[#0D0D0F\]/gi, 'bg-white');
  content = content.replace(/bg-\[#0A0A0B\]\/98/gi, 'bg-white/98');
  content = content.replace(/bg-\[#0A0A0B\]\/80/gi, 'bg-white/80');
  content = content.replace(/bg-\[#0A0A0B\]\/60/gi, 'bg-white/60');
  content = content.replace(/bg-\[#1A1A1A\]/gi, 'bg-white');
  content = content.replace(/bg-\[#1A1A1C\]/gi, 'bg-white');
  content = content.replace(/bg-\[#1E1E1E\]/gi, 'bg-white');
  content = content.replace(/bg-\[#111111\]/gi, 'bg-white');
  content = content.replace(/bg-\[#111\]/gi, 'bg-white');
  content = content.replace(/bg-black\/95/g, 'bg-white/95');
  content = content.replace(/bg-black\/90/g, 'bg-white/90');
  content = content.replace(/bg-black\/80/g, 'bg-white/80');
  content = content.replace(/bg-black\/60/g, 'bg-white/60');
  content = content.replace(/bg-black\/40/g, 'bg-black/5');
  content = content.replace(/bg-black\/20/g, 'bg-white/60');
  content = content.replace(/bg-black\/80/g, 'bg-white/80');
  content = content.replace(/bg-black/g, 'bg-white');
  content = content.replace(/bg-neutral-900/g, 'bg-white');
  content = content.replace(/bg-neutral-800/g, 'bg-neutral-100');
  content = content.replace(/bg-neutral-950/g, 'bg-white');
  content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-black/[0.02]');
  content = content.replace(/bg-white\/\[0\.01\]/g, 'bg-black/[0.01]');
  content = content.replace(/bg-white\/5/g, 'bg-black/5');
  content = content.replace(/bg-white\/10/g, 'bg-black/10');
  content = content.replace(/bg-white\/20/g, 'bg-black/20');
  content = content.replace(/hover:bg-white\/5/g, 'hover:bg-black/5');
  content = content.replace(/hover:bg-white\/10/g, 'hover:bg-black/10');
  content = content.replace(/hover:bg-white\/20/g, 'hover:bg-black/20');

  // Text Colors
  content = content.replace(/text-neutral-100/g, 'text-neutral-900');
  content = content.replace(/text-neutral-300/g, 'text-neutral-700');
  content = content.replace(/text-neutral-400/g, 'text-neutral-600');
  content = content.replace(/text-neutral-500/g, 'text-neutral-500');
  content = content.replace(/text-white/g, 'text-neutral-900');
  content = content.replace(/hover:text-white/g, 'hover:text-black');

  // Borders
  content = content.replace(/border-white\/5/g, 'border-black/5');
  content = content.replace(/border-white\/10/g, 'border-black/10');
  content = content.replace(/border-white\/20/g, 'border-black/20');
  content = content.replace(/border-white\/\[0\.05\]/g, 'border-black/[0.05]');
  content = content.replace(/border-white\/\[0\.08\]/g, 'border-black/[0.08]');
  content = content.replace(/ring-white\/5/g, 'ring-black/5');
  content = content.replace(/ring-white\/10/g, 'ring-black/10');
  content = content.replace(/ring-white\/\[0\.05\]/g, 'ring-black/[0.05]');
  content = content.replace(/border-neutral-800/g, 'border-neutral-200');
  content = content.replace(/border-neutral-700/g, 'border-neutral-300');

  // Lingering dark theme artifacts
  content = content.replace(/border-white\/30/g, 'border-black/30');
  content = content.replace(/border-white\/40/g, 'border-black/40');
  content = content.replace(/border-white\/60/g, 'border-black/60');
  content = content.replace(/border-white\/80/g, 'border-black/80');
  // Some places used bg-white to contrast dark background, in light mode they should probably be bg-neutral-900 
  // if they were a button, or bg-white if they were a handle.
  
  // text-white -> text-neutral-900 was already run but let's do it again if needed? 
  // Wait, I only added text-white -> text-neutral-900, but there might be bg-white text-black. We should probably keep bg-white...
  fs.writeFileSync(file, content, 'utf8');
});

console.log('Complete update theme on all components');
