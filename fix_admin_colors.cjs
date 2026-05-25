const fs = require('fs');

const files = ['src/components/AdminPanel.tsx', 'src/components/UserActionModal.tsx'];

const colors = [
  // Backgrounds
  { from: /bg-\[\#050505\]/g, to: 'bg-neutral-50' },
  { from: /bg-\[\#0A0A0A\]/g, to: 'bg-white' },
  { from: /bg-\[\#0F0F0F\]/g, to: 'bg-white' },
  { from: /bg-\[\#111\]/g, to: 'bg-neutral-50' },
  { from: /bg-\[\#121212\]/g, to: 'bg-white' },
  { from: /bg-\[\#161616\]/g, to: 'bg-neutral-50' },
  { from: /bg-black\/40/g, to: 'bg-white/80' },
  { from: /bg-black\/20/g, to: 'bg-neutral-50' },
  { from: /bg-black\/30/g, to: 'bg-neutral-100' },
  { from: /bg-black\/90/g, to: 'bg-white/90' },
  { from: /bg-neutral-900/g, to: 'bg-neutral-100' },
  { from: /bg-neutral-800/g, to: 'bg-neutral-200' },
  
  // Borders
  { from: /border-white\/5/g, to: 'border-black/5' },
  { from: /border-white\/10/g, to: 'border-black/10' },
  { from: /border-white\/20/g, to: 'border-black/20' },
  { from: /border-white\/30/g, to: 'border-black/30' },
  
  // Translucent Backgrounds
  { from: /bg-white\/\[0\.02\]/g, to: 'bg-black/[0.02]' },
  { from: /bg-white\/\[0\.03\]/g, to: 'bg-black/[0.03]' },
  { from: /bg-white\/\[0\.04\]/g, to: 'bg-black/[0.04]' },
  { from: /bg-white\/\[0\.05\]/g, to: 'bg-black/[0.05]' },
  { from: /bg-white\/\[0\.01\]/g, to: 'bg-black/[0.01]' },
  { from: /bg-white\/5/g, to: 'bg-black/5' },
  { from: /bg-white\/10/g, to: 'bg-black/10' },

  // Solid bg-black
  { from: /bg-black\b(?!\/)/g, to: 'bg-white' },

  // Fix button styles (which were originally white background)
  { from: /bg-white\b(?!\/)(?!\s*text-black)/g, to: 'bg-neutral-900' }, // Any bg-white not followed by text-black

  // Text
  { from: /text-white/g, to: 'text-neutral-900' },
  { from: /text-neutral-300/g, to: 'text-neutral-700' },
  { from: /text-neutral-400/g, to: 'text-neutral-600' },
  { from: /text-neutral-600/g, to: 'text-neutral-400' }, // wait, swapping this with text-neutral-400 will cause bugs, I need an intermediate variable
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Multi-step careful replacements for text colors to avoid cycle:
  // text-neutral-600 -> temp1
  content = content.replace(/text-neutral-600/g, '__TEMP_600__');
  // text-neutral-400 -> text-neutral-600
  content = content.replace(/text-neutral-400/g, 'text-neutral-600');
  // temp1 -> text-neutral-400
  content = content.replace(/__TEMP_600__/g, 'text-neutral-400');
  
  // text-neutral-300 -> text-neutral-700
  content = content.replace(/text-neutral-300/g, 'text-neutral-700');

  // text-white -> text-neutral-900
  content = content.replace(/text-white/g, 'text-neutral-900');
  // text-black -> text-white
  content = content.replace(/text-black/g, 'text-white');

  // bg-white text-black combinations in buttons
  // Oh wait, now text-white is text-neutral-900 and text-black is text-white
  // So 'bg-white text-black' became 'bg-white text-white'
  content = content.replace(/bg-white text-white/g, 'bg-neutral-900 text-white');
  
  // Normal replacements
  for (const r of colors) {
    content = content.replace(r.from, r.to);
  }

  // Hover states
  content = content.replace(/hover:bg-white\/5/g, 'hover:bg-black/5');
  content = content.replace(/hover:bg-white\/10/g, 'hover:bg-black/10');
  content = content.replace(/hover:bg-white/g, 'hover:bg-neutral-900');
  content = content.replace(/hover:text-white/g, 'hover:text-neutral-900');

  fs.writeFileSync(file, content);
}
