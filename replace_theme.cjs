const fs = require('fs');

const files = [
  'src/components/LandingPage.tsx',
  'src/components/NavigationItems.tsx',
  'src/components/CommunityPostCard.tsx',
  'src/components/InfoBanner.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Apply visual theme transformations
  
  // Backgrounds: Dark to Light
  content = content.replace(/bg-\[#141414\]/g, 'bg-white');
  content = content.replace(/bg-\[#0D0D0F\]\/90/g, 'bg-white/90');
  content = content.replace(/bg-\[#0D0D0F\]\/80/g, 'bg-white/80');
  content = content.replace(/bg-\[#0D0D0F\]\/50/g, 'bg-[#F9FAFB]/50');
  content = content.replace(/bg-\[#0D0D0F\]/g, 'bg-white');
  content = content.replace(/bg-\[#0A0A0A\]/g, 'bg-[#F3F4F6]');
  content = content.replace(/bg-\[#0A0A0B\]\/98/g, 'bg-white/98');
  content = content.replace(/bg-\[#0A0A0B\]\/80/g, 'bg-white/80');
  content = content.replace(/bg-\[#0A0A0B\]\/60/g, 'bg-white/60');
  content = content.replace(/bg-\[#1A1A1A\]/g, 'bg-white');
  content = content.replace(/bg-\[#1A1A1C\]/g, 'bg-white');
  content = content.replace(/bg-\[#1E1E1E\]/g, 'bg-white');
  content = content.replace(/bg-black\/95/g, 'bg-white/95');
  content = content.replace(/bg-black\/90/g, 'bg-white/90');
  content = content.replace(/bg-black\/80/g, 'bg-white/80');
  content = content.replace(/bg-black\/60/g, 'bg-white/60');
  content = content.replace(/bg-black\/40/g, 'bg-black/5');
  content = content.replace(/bg-black\/20/g, 'bg-white/60');
  content = content.replace(/bg-neutral-900/g, 'bg-neutral-100');
  content = content.replace(/bg-white\/\[0\.02\]/g, 'bg-black/[0.02]');
  content = content.replace(/bg-white\/\[0\.01\]/g, 'bg-black/[0.01]');
  content = content.replace(/bg-white\/5/g, 'bg-black/5');
  content = content.replace(/bg-white\/10/g, 'bg-black/10');
  content = content.replace(/bg-white\/20/g, 'bg-black/20');
  
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
  content = content.replace(/ring-white\/\[0\.05\]/g, 'ring-black/[0.05]');
  
  // Shadows (lighten up drop shadows)
  content = content.replace(/shadow-\[0_100px_200px_rgba\(0,0,0,1\)\]/g, 'shadow-[0_40px_100px_rgba(0,0,0,0.1)]');
  content = content.replace(/shadow-\[0_40px_120px_rgba\(0,0,0,0\.9\)\]/g, 'shadow-[0_20px_60px_rgba(0,0,0,0.1)]');
  content = content.replace(/shadow-\[0_40px_80px_rgba\(0,0,0,0\.6\)\]/g, 'shadow-xl');
  content = content.replace(/shadow-\[0_20px_60px_rgba\(0,0,0,0\.6\)\]/g, 'shadow-lg');
  content = content.replace(/shadow-\[0_20px_40px_rgba\(0,0,0,0\.4\)\]/g, 'shadow-md');
  content = content.replace(/shadow-\[0_20px_40px_rgba\(0,0,0,0\.5\)\]/g, 'shadow-lg');
  content = content.replace(/shadow-\[0_15px_30px_rgba\(0,0,0,0\.3\)\]/g, 'shadow-md');
  content = content.replace(/shadow-\[0_10px_25px_rgba\(255,255,255,0\.2\)\]/g, 'shadow-sm');
  content = content.replace(/shadow-2xl/g, 'shadow-xl');
  
  // Exceptions/Fixes
  // Active buttons that became bg-black/5 text-black might need text-white on pure black backgrounds
  // We'll see after one pass
  
  fs.writeFileSync(file, content, 'utf8');
});

console.log('Complete!');
