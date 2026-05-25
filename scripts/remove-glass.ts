import fs from 'fs';
import path from 'path';

function removeBackdropBlur(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      removeBackdropBlur(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('backdrop-blur')) {
        content = content.replace(/backdrop-blur-[a-zA-Z0-9-]*\s?/g, '');
        fs.writeFileSync(fullPath, content);
        console.log('Fixed', fullPath);
      }
    }
  }
}

removeBackdropBlur('./src');
