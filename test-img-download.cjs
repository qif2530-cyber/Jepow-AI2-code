const fs = require('fs');
const http = require('http');
const path = require('path');
const os = require('os');
const PersistentDataDir = path.join(os.homedir(), '.jepow-data');
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_PATH || path.join(PersistentDataDir, 'uploads'));

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const testFile = path.join(UPLOADS_DIR, 'test_image.txt');
fs.writeFileSync(testFile, 'dummy data');

http.get('http://localhost:3000/api/image?f=test_image.txt', (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Data:', data));
});
