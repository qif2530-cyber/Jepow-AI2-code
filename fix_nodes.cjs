const fs = require('fs');
const files = [
  'src/components/TextNode.tsx', 
  'src/components/ImageShotNode.tsx', 
  'src/components/GroupNode.tsx', 
  'src/components/VideoShotNode.tsx', 
  'src/components/ScriptNode.tsx'
];
files.forEach(f => {
  let content = fs.readFileSync(f, 'utf8');
  content = content.replace(
    /Array\.from\(s\.nodeLookup\.values\(\)\)\.filter\([^\)]*\)\.length\s*===\s*1/g,
    '(s.nodeLookup ? Array.from(s.nodeLookup.values()) : (s.nodes || [])).filter(n => n.selected).length === 1'
  );
  fs.writeFileSync(f, content);
});
console.log('Fixed useStore calls');
