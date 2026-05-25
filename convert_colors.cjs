const fs = require('fs');

let content = fs.readFileSync('src/components/AdminPanel.tsx', 'utf8');

// Map exact classes to their light theme counterparts.
const conversions = [
  ['bg-[#050505]', 'bg-neutral-50'],
  ['bg-[#0A0A0A]/90', 'bg-white/90'],
  ['bg-[#0A0A0A]', 'bg-white'],
  ['bg-[#0F0F0F]', 'bg-neutral-50'],
  ['bg-[#111]', 'bg-neutral-100'],
  ['bg-black/90', 'bg-white/90'],
  ['bg-black/60', 'bg-white/60'],
  ['bg-black/40', 'bg-white/40'],
  ['bg-black/20', 'bg-neutral-100'],
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
  
  ['hover:bg-white/5', 'hover:bg-neutral-100'],
  ['hover:bg-white/10', 'hover:bg-neutral-200'],
  ['hover:bg-white/[0.02]', 'hover:bg-neutral-50'],
  ['hover:bg-white/[0.04]', 'hover:bg-neutral-100'],
  
  ['bg-white/5', 'bg-neutral-100'],
  ['bg-white/10', 'bg-neutral-200'],
];

// Special care for "bg-white text-black" which is usually an active state or button.
content = content.replace(/bg-white text-black/g, '__ACTIVE_BTN__');
content = content.replace(/text-black/g, 'text-white');
content = content.replace(/__ACTIVE_BTN__/g, 'bg-neutral-900 text-white');

for (const [from, to] of conversions) {
  content = content.split(from).join(to);
}

// And then replace remaining bg-white if they conflict, but we mapped bg-black to bg-white.
// Oh wait, bg-white already existed for some buttons, maybe? 
// Let's replace 'shadow-[0_0_15px_rgba(255,255,255,0.3)]' -> shadow-[0_0_15px_rgba(0,0,0,0.1)]
content = content.replace(/shadow-\[0_0_15px_rgba\(255,255,255,0\.3\)\]/g, 'shadow-[0_0_15px_rgba(0,0,0,0.1)]');
content = content.replace(/shadow-black\/50/g, 'shadow-neutral-200/50');
content = content.replace(/shadow-inner/g, 'shadow-sm'); // shadow-inner on dark looks different on light

fs.writeFileSync('src/components/AdminPanel.tsx', content);
console.log("conversion completed");
