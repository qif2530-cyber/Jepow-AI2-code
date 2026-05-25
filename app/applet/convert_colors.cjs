const fs = require('fs');

let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// The goal is to change the dark theme (blacks, dark grays) into light theme (whites, light grays).
// And change text from white to dark gray.

// Map exact classes to their light theme counterparts.
const conversions = [
  ['bg-[#050505]', 'bg-neutral-100'],
  ['bg-[#0A0A0A]/90', 'bg-white/90'],
  ['bg-[#0A0A0A]', 'bg-neutral-50'],
  ['bg-[#0F0F0F]', 'bg-neutral-100'],
  ['bg-[#111]', 'bg-neutral-100'],
  ['bg-black/90', 'bg-white/90'],
  ['bg-black/60', 'bg-white/60'],
  ['bg-black/40', 'bg-white/40'],
  ['bg-black/20', 'bg-white/20'],
  ['bg-black', 'bg-white'],
  ['bg-transparent', 'bg-transparent'],
  ['bg-neutral-900', 'bg-neutral-100'],
  ['bg-neutral-800', 'bg-neutral-200'],

  ['text-white', 'text-neutral-900'],
  ['text-neutral-400', 'text-neutral-600'],
  ['text-neutral-500', 'text-neutral-500'],
  ['hover:text-white', 'hover:text-neutral-900'],

  ['border-white/5', 'border-neutral-200'],
  ['border-white/10', 'border-neutral-200'],
  ['border-white/20', 'border-neutral-300'],
  ['border-white/30', 'border-neutral-300'],
  ['border-white', 'border-neutral-900'],
  
  ['hover:bg-white/5', 'hover:bg-neutral-200'],
  ['hover:bg-white/10', 'hover:bg-neutral-300'],
  ['hover:bg-white/[0.02]', 'hover:bg-neutral-100'],
  ['hover:bg-white/[0.04]', 'hover:bg-neutral-200'],
  
  ['bg-white/5', 'bg-neutral-200'],
  ['bg-white/10', 'bg-neutral-300'],
  ['bg-white', 'bg-neutral-900'], // Note: need to handle bg-white properly if it was an active text state
  ['text-black', 'text-white'], // if text was black on white, now it's white on dark
  
  ['shadow-black/50', 'shadow-neutral-200'],
];

// Special care for "bg-white text-black" which is usually an active state or button.
// We should replace "bg-white" with "bg-neutral-900" and "text-black" with "text-white"
content = content.replace(/bg-white text-black/g, '__ACTIVE_BTN__');
content = content.replace(/text-black/g, 'text-white');
content = content.replace(/__ACTIVE_BTN__/g, 'bg-neutral-900 text-white');

for (const [from, to] of conversions) {
  content = content.split(from).join(to);
}

// Special fixes after generic replacement
// "border-black" => maybe we don't have it.
content = content.replace(/shadow-\[0_0_15px_rgba\(255,255,255,0\.3\)\]/g, 'shadow-[0_0_15px_rgba(0,0,0,0.1)]');
content = content.replace(/border-neutral-900\/5/g, 'border-neutral-200'); // if any compound hit
content = content.replace(/bg-neutral-900\/5/g, 'bg-neutral-200'); 

fs.writeFileSync('src/components/AdminPanel.tsx', content);
console.log("conversion completed");
