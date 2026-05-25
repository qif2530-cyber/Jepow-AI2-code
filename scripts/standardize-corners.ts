import fs from 'fs';
import path from 'path';

function standardizeCorners(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      standardizeCorners(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const original = content;
      content = content.replace(/rounded-\[14px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[16px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[24px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[32px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[40px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[48px\]/g, 'rounded-md');
      content = content.replace(/rounded-\[56px\]/g, 'rounded-md');
      content = content.replace(/rounded-3xl/g, 'rounded-md');
      content = content.replace(/rounded-2xl/g, 'rounded-md');
      content = content.replace(/rounded-xl/g, 'rounded-md');

      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log('Fixed corners in', fullPath);
      }
    }
  }
}

standardizeCorners('./src');
